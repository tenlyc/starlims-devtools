import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SharedMcpPackageRuntime } from '../electron/sharedMcpPackageRuntime';

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
  console.log('Shared MCP verified package cache and tamper fallback smoke test passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
