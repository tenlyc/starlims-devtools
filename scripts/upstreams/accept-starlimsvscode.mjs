import { spawnSync } from 'node:child_process';
import {
  compatibilityPath,
  fetchGitHubJson,
  lockPath,
  projectRoot,
  readJson,
  readUpstreamLock,
  writeJsonAtomic
} from './lib.mjs';

const args = process.argv.slice(2);
const commitSha = args.find((arg) => !arg.startsWith('-'));
if (!commitSha || !/^[0-9a-f]{40}$/i.test(commitSha) || !args.includes('--confirm-reviewed')) {
  throw new Error('Usage: npm run upstream:accept:starlimsvscode -- <40-character-commit> --confirm-reviewed');
}

const lock = await readUpstreamLock();
const source = lock.sources.starlimsvscode;
const [commit, comparison] = await Promise.all([
  fetchGitHubJson(`repos/${source.repository}/commits/${commitSha}`),
  fetchGitHubJson(`repos/${source.repository}/compare/${source.commit}...${commitSha}`, 60_000)
]);
if (!['ahead', 'identical'].includes(comparison.status)) {
  throw new Error(`Refusing to move the reviewed baseline from ${source.commit} to a ${comparison.status} commit.`);
}

const contractTests = [
  'ssl-lsp-smoke-test.ts',
  'checkout-form-smoke-test.ts',
  'scm-export-smoke-test.ts',
  'server-config-smoke-test.ts'
];
for (const test of contractTests) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `scripts/${test}`], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit'
  });
  if (result.status !== 0) throw new Error(`Cannot accept ${commitSha}: ${test} failed.`);
}

const reviewedAt = new Date().toISOString().slice(0, 10);
lock.sources.starlimsvscode = {
  ...source,
  commit: commit.sha,
  reviewedAt
};
const compatibility = await readJson(compatibilityPath);
compatibility.starlimsvscode = {
  ...compatibility.starlimsvscode,
  commit: commit.sha,
  validatedAt: reviewedAt,
  status: 'selective-port'
};
await writeJsonAtomic(lockPath, lock);
await writeJsonAtomic(compatibilityPath, compatibility);
console.log(`Accepted reviewed starlimsvscode baseline ${commit.sha}.`);
