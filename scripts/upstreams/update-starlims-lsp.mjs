import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import {
  compatibilityPath,
  download,
  fetchGitHubJson,
  lockPath,
  lspOutputPath,
  platformKey,
  projectRoot,
  readJson,
  readUpstreamLock,
  sha256,
  writeJsonAtomic
} from './lib.mjs';

const requested = process.argv.slice(2).find((arg) => !arg.startsWith('-'));
if (!requested) throw new Error('Usage: npm run upstream:update:lsp -- v0.22.0');
const tag = requested.startsWith('v') ? requested : `v${requested}`;
const version = tag.slice(1);
const lock = await readUpstreamLock();
const current = lock.sources['starlims-lsp'];
const release = await fetchGitHubJson(`repos/${current.repository}/releases/tags/${encodeURIComponent(tag)}`);
const commit = await fetchGitHubJson(`repos/${current.repository}/commits/${encodeURIComponent(tag)}`);
const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'starlims-lsp-update-'));

const downloaded = new Map();
try {
  for (const [key, existingAsset] of Object.entries(current.assets)) {
    const releaseAsset = (release.assets || []).find((asset) => asset.name === existingAsset.name);
    if (!releaseAsset) {
      throw new Error(`${tag} does not contain expected ${key} asset ${existingAsset.name}. Review the upstream packaging change manually.`);
    }
    const buffer = await download(releaseAsset.browser_download_url);
    const temporaryPath = resolve(temporaryDirectory, `${key}-${existingAsset.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`);
    await writeFile(temporaryPath, buffer, { mode: 0o755 });
    if (!key.startsWith('win32-')) await chmod(temporaryPath, 0o755);
    downloaded.set(key, { name: existingAsset.name, sha256: sha256(buffer), buffer, temporaryPath });
    console.log(`Verified ${key}: ${existingAsset.name}`);
  }

  const localKey = platformKey();
  const localCandidate = downloaded.get(localKey);
  if (!localCandidate) throw new Error(`${tag} has no candidate for the current platform ${localKey}.`);
  const versionResult = spawnSync(localCandidate.temporaryPath, ['--version'], { encoding: 'utf8' });
  if (versionResult.status !== 0 || !`${versionResult.stdout}${versionResult.stderr}`.includes(version)) {
    throw new Error(`Candidate version check failed: ${versionResult.stderr || versionResult.stdout}`);
  }
  const validationResult = spawnSync(localCandidate.temporaryPath, ['--validate', '--stdin'], {
    input: '#include "AUDIT.HTML_EnterpriseAudit"\n:DECLARE sName;\nsName := "ok";\n',
    encoding: 'utf8'
  });
  if (validationResult.status !== 0) throw new Error(`Candidate validation contract failed: ${validationResult.stderr || validationResult.stdout}`);
  const validation = JSON.parse(validationResult.stdout);
  const messages = (validation[0]?.diagnostics || []).map((item) => item.message).join('\n');
  if (/include.*semicolon|unknown.*include/i.test(messages)) throw new Error(`Candidate rejects Designer include syntax: ${messages}`);
  const formatResult = spawnSync(localCandidate.temporaryPath, ['--format', '--stdin'], {
    input: ':DECLARE sName;\nsName:="ok";\n',
    encoding: 'utf8'
  });
  if (formatResult.status !== 0 || !formatResult.stdout.trim()) throw new Error(`Candidate formatting contract failed: ${formatResult.stderr}`);

  const oldLock = await readFile(lockPath);
  const versionPath = resolve(projectRoot, 'resources', 'starlims-lsp', 'VERSION.json');
  const oldVersion = existsSync(versionPath) ? await readFile(versionPath) : null;
  const outputPath = lspOutputPath(localKey);
  const oldBinary = existsSync(outputPath) ? await readFile(outputPath) : null;
  const newLock = structuredClone(lock);
  newLock.sources['starlims-lsp'] = {
    ...current,
    version,
    tag,
    commit: commit.sha,
    reviewedAt: new Date().toISOString().slice(0, 10),
    assets: Object.fromEntries([...downloaded.entries()].map(([key, asset]) => [key, { name: asset.name, sha256: asset.sha256 }]))
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, localCandidate.buffer, { mode: 0o755 });
  if (process.platform !== 'win32') await chmod(outputPath, 0o755);
  await writeJsonAtomic(lockPath, newLock);
  await writeJsonAtomic(versionPath, {
    generatedFrom: 'upstreams/upstreams.lock.json',
    version,
    repository: `https://github.com/${current.repository}`,
    release: release.html_url,
    commit: commit.sha
  });

  const smoke = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/starlims-lsp-upstream-smoke-test.ts'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit'
  });
  if (smoke.status !== 0) {
    await writeFile(lockPath, oldLock);
    if (oldVersion) await writeFile(versionPath, oldVersion);
    if (oldBinary) await writeFile(outputPath, oldBinary, { mode: 0o755 });
    else await rm(outputPath, { force: true });
    throw new Error(`Compatibility tests failed for ${tag}; restored ${current.tag}.`);
  }

  const compatibility = await readJson(compatibilityPath);
  compatibility['starlims-lsp'] = {
    ...compatibility['starlims-lsp'],
    version,
    validatedAt: new Date().toISOString().slice(0, 10),
    status: 'compatible'
  };
  await writeJsonAtomic(compatibilityPath, compatibility);

  const noticesAsset = (release.assets || []).find((asset) => asset.name === 'THIRD-PARTY-NOTICES.md');
  if (noticesAsset) {
    const notices = await download(noticesAsset.browser_download_url, 60_000);
    await writeFile(resolve(projectRoot, 'resources', 'starlims-lsp', 'THIRD-PARTY-NOTICES.md'), notices);
  }
  console.log(`Updated starlims-lsp from ${current.tag} to ${tag}. Review and commit the lock, compatibility record, and generated VERSION.json.`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
