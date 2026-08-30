import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.');
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const lock = readJson('upstreams/upstreams.lock.json');
const compatibility = readJson('upstreams/compatibility.json');
const generatedVersion = readJson('resources/starlims-lsp/VERSION.json');
const lsp = lock.sources?.['starlims-lsp'];
const vscode = lock.sources?.starlimsvscode;

assert.equal(lock.schemaVersion, 1);
assert.equal(lsp.type, 'github-release');
assert.equal(vscode.type, 'github-commit');
assert.match(lsp.version, /^\d+\.\d+\.\d+$/);
assert.equal(lsp.tag, `v${lsp.version}`);
assert.match(lsp.commit, /^[0-9a-f]{40}$/);
assert.match(vscode.commit, /^[0-9a-f]{40}$/);
assert.equal(generatedVersion.version, lsp.version);
assert.equal(generatedVersion.commit, lsp.commit);
assert.equal(compatibility['starlims-lsp'].version, lsp.version);
assert.equal(compatibility.starlimsvscode.commit, vscode.commit);

for (const key of ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64']) {
  assert.ok(lsp.assets[key], `Missing locked LSP asset for ${key}`);
  assert.match(lsp.assets[key].sha256, /^[0-9a-f]{64}$/);
}

for (const script of [
  'scripts/prepare-starlims-lsp.mjs',
  'scripts/upstreams/lib.mjs',
  'scripts/upstreams/check-updates.mjs',
  'scripts/upstreams/audit-starlimsvscode.mjs',
  'scripts/upstreams/accept-starlimsvscode.mjs',
  'scripts/upstreams/update-starlims-lsp.mjs'
]) {
  const syntax = spawnSync(process.execPath, ['--check', script], { cwd: root, encoding: 'utf8' });
  assert.equal(syntax.status, 0, `${script} syntax failed: ${syntax.stderr}`);
}

const prepareSource = readFileSync(resolve(root, 'scripts/prepare-starlims-lsp.mjs'), 'utf8');
assert.match(prepareSource, /readUpstreamLock/);
assert.doesNotMatch(prepareSource, /const VERSION\s*=/);
assert.match(readFileSync(resolve(root, 'upstreams/mappings/starlims-lsp.md'), 'utf8'), /Designer `#include`/);
assert.match(readFileSync(resolve(root, 'upstreams/mappings/starlimsvscode.md'), 'utf8'), /selectively ports/);

console.log(`Upstream management smoke test passed (LSP ${lsp.tag}, starlimsvscode ${vscode.commit.slice(0, 12)}).`);
