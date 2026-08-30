import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  download,
  lspOutputPath,
  platformKey,
  projectRoot,
  readUpstreamLock,
  sha256,
  writeJsonAtomic
} from './upstreams/lib.mjs';

const lock = await readUpstreamLock();
const source = lock.sources['starlims-lsp'];
const key = platformKey();
const asset = source.assets[key];
if (!asset) throw new Error(`starlims-lsp ${source.tag} has no locked release binary for ${key}.`);

const releaseBase = `https://github.com/${source.repository}/releases/download/${source.tag}`;
const output = lspOutputPath(key);
const noticesOutput = resolve(projectRoot, 'resources', 'starlims-lsp', 'THIRD-PARTY-NOTICES.md');
const versionOutput = resolve(projectRoot, 'resources', 'starlims-lsp', 'VERSION.json');

async function writeVersion() {
  const vscodeSource = lock.sources.starlimsvscode;
  await writeJsonAtomic(versionOutput, {
    generatedFrom: 'upstreams/upstreams.lock.json',
    version: source.version,
    repository: `https://github.com/${source.repository}`,
    release: `https://github.com/${source.repository}/releases/tag/${source.tag}`,
    commit: source.commit,
    reviewedAt: source.reviewedAt,
    assets: source.assets,
    auditSources: {
      starlimsvscode: {
        repository: `https://github.com/${vscodeSource.repository}`,
        commit: vscodeSource.commit,
        reviewedAt: vscodeSource.reviewedAt
      }
    }
  });
}

if (existsSync(output) && sha256(await readFile(output)) === asset.sha256) {
  if (process.platform !== 'win32') await chmod(output, 0o755);
  await writeVersion();
  if (!existsSync(noticesOutput)) {
    try { await writeFile(noticesOutput, await download(`${releaseBase}/THIRD-PARTY-NOTICES.md`, 60_000)); } catch { /* optional attribution bundle */ }
  }
  console.log(`starlims-lsp ${source.tag} already prepared for ${key}.`);
  process.exit(0);
}

await mkdir(dirname(output), { recursive: true });
const buffer = await download(`${releaseBase}/${asset.name}`);
const actualDigest = sha256(buffer);
if (actualDigest !== asset.sha256) throw new Error(`Checksum mismatch for ${asset.name}: ${actualDigest}`);
await writeFile(output, buffer, { mode: 0o755 });
if (process.platform !== 'win32') await chmod(output, 0o755);
await writeVersion();
try { await writeFile(noticesOutput, await download(`${releaseBase}/THIRD-PARTY-NOTICES.md`, 60_000)); } catch { /* optional attribution bundle */ }
console.log(`Prepared starlims-lsp ${source.tag} for ${key}.`);
