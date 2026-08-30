import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SslLspRuntime } from '../electron/sslLspRuntime';

async function main(): Promise<void> {
 const root = mkdtempSync(join(tmpdir(), 'starlims-lsp-package-'));
 try {
  const resourceRoot = join(root, 'resources');
  const cacheRoot = join(root, 'cache');
  const platformKey = `${process.platform}-${process.arch}`;
  const binaryName = process.platform === 'win32' ? 'starlims-lsp.exe' : 'starlims-lsp';
  const bundled = join(resourceRoot, 'starlims-lsp', 'bin', platformKey, binaryName);
  mkdirSync(join(resourceRoot, 'starlims-lsp', 'bin', platformKey), { recursive: true });
  writeFileSync(bundled, process.platform === 'win32' ? 'bundled' : '#!/bin/sh\necho 1.0.0\n');
  if (process.platform !== 'win32') chmodSync(bundled, 0o755);
  const bundledDigest = createHash('sha256').update(readFileSync(bundled)).digest('hex');
  writeFileSync(join(resourceRoot, 'starlims-lsp', 'VERSION.json'), JSON.stringify({
    version: '1.0.0', repository: 'https://github.com/mahoskye/starlims-lsp', assets: { [platformKey]: { name: 'fixture', sha256: bundledDigest } }
  }));
  const runtime = new SslLspRuntime(resourceRoot, cacheRoot);
  assert.equal(runtime.version, '1.0.0');

  if (process.platform !== 'win32') {
    const releaseBinary = Buffer.from('#!/bin/sh\ncase "$1" in\n  --version) echo 9.9.9;;\n  --validate) echo \'[{"valid":true,"diagnostics":[]}]\';;\n  --format) cat;;\nesac\n');
    const releaseDigest = createHash('sha256').update(releaseBinary).digest('hex');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/releases/latest')) return new Response(JSON.stringify({
        tag_name: 'v9.9.9', html_url: 'https://github.com/mahoskye/starlims-lsp/releases/tag/v9.9.9',
        assets: [{ name: 'fixture', browser_download_url: 'https://example.test/fixture', digest: `sha256:${releaseDigest}` }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url === 'https://example.test/fixture') return new Response(releaseBinary, { status: 200 });
      throw new Error(`Unexpected test URL ${url}`);
    }) as typeof fetch;
    try {
      const release = await runtime.checkForUpdates();
      assert.equal(release.installable, true);
      assert.equal(release.verification, 'github-digest');
      assert.equal(await runtime.installLatest(), '9.9.9');
      assert.equal(runtime.version, '9.9.9');
    } finally { globalThis.fetch = originalFetch; }
  }

  const version = '9.9.9';
  const directory = join(cacheRoot, version, platformKey);
  const cached = join(directory, binaryName);
  mkdirSync(directory, { recursive: true });
  writeFileSync(cached, process.platform === 'win32' ? 'verified' : '#!/bin/sh\necho 9.9.9\n');
  if (process.platform !== 'win32') chmodSync(cached, 0o755);
  const digest = createHash('sha256').update(readFileSync(cached)).digest('hex');
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ version, sha256: digest }));
  assert.equal(runtime.selectVersion(version), true);
  assert.equal(runtime.executablePath(), cached);

  writeFileSync(cached, 'tampered');
  assert.equal(runtime.executablePath(), bundled);
  assert.equal(runtime.version, '1.0.0');
  assert.equal(runtime.selectVersion(version), false);
  console.log('starlims-lsp verified package cache and tamper fallback smoke test passed.');
 } finally {
   rmSync(root, { recursive: true, force: true });
 }
}

void main();
