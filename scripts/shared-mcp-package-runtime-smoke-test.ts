import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SharedMcpPackageRuntime } from '../electron/sharedMcpPackageRuntime';

async function main(): Promise<void> {
const root = mkdtempSync(join(tmpdir(), 'starlims-mcp-package-'));
try {
  const bundled = join(root, 'bundled.cjs');
  writeFileSync(bundled, 'console.log("bundled")');
  const runtime = new SharedMcpPackageRuntime(bundled, join(root, 'cache'));
  assert.equal(runtime.executablePath(), bundled);
  assert.equal(runtime.version, runtime.bundledVersion);

  const version = '9.9.9';
  const directory = join(root, 'cache', version);
  const server = join(directory, 'starlims-mcp-devtools-server.cjs');
  mkdirSync(directory, { recursive: true });
  writeFileSync(server, 'console.log("verified")');
  const digest = createHash('sha256').update(readFileSync(server)).digest('hex');
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ version, sha256: digest }));
  assert.equal(runtime.selectVersion(version), true);
  assert.equal(runtime.executablePath(), server);

  writeFileSync(server, 'tampered');
  assert.equal(runtime.executablePath(), bundled);
  assert.equal(runtime.version, runtime.bundledVersion);
  assert.equal(runtime.selectVersion(version), false);

  const releaseContent = Buffer.from('console.log("release")');
  const releaseDigest = createHash('sha256').update(releaseContent).digest('hex');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/releases/latest')) return new Response(JSON.stringify({
      tag_name: 'v10.0.0',
      html_url: 'https://github.com/tenlyc/starlims-mcp/releases/tag/v10.0.0',
      assets: [
        { name: 'starlims-mcp-devtools-server.cjs', browser_download_url: 'https://example.test/server' },
        { name: 'starlims-mcp-devtools-server.cjs.sha256', browser_download_url: 'https://example.test/digest' }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url === 'https://example.test/server') return new Response(releaseContent, { status: 200 });
    if (url === 'https://example.test/digest') return new Response(`${releaseDigest}  starlims-mcp-devtools-server.cjs\n`, { status: 200 });
    throw new Error(`Unexpected test URL ${url}`);
  }) as typeof fetch;
  try {
    const release = await runtime.checkForUpdates();
    assert.equal(release.installable, true);
    assert.equal(await runtime.installLatest(), '10.0.0');
    assert.equal(runtime.version, '10.0.0');

    const rejected = new SharedMcpPackageRuntime(bundled, join(root, 'rejected-cache'));
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/releases/latest')) return new Response(JSON.stringify({
        tag_name: 'v10.0.1', assets: [
          { name: 'starlims-mcp-devtools-server.cjs', browser_download_url: 'https://example.test/server' },
          { name: 'starlims-mcp-devtools-server.cjs.sha256', browser_download_url: 'https://example.test/bad-digest' }
        ]
      }), { status: 200 });
      if (url === 'https://example.test/server') return new Response(releaseContent, { status: 200 });
      if (url === 'https://example.test/bad-digest') return new Response(`${'0'.repeat(64)}  starlims-mcp-devtools-server.cjs\n`, { status: 200 });
      throw new Error(`Unexpected test URL ${url}`);
    }) as typeof fetch;
    await rejected.checkForUpdates();
    await assert.rejects(() => rejected.installLatest(), /SHA-256 verification failed/);
    assert.equal(rejected.version, rejected.bundledVersion);
  } finally { globalThis.fetch = originalFetch; }
  console.log('Shared MCP verified package cache and tamper fallback smoke test passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
}

void main();
