import assert from 'node:assert/strict';
import type { McpStatus, StarlimsMcpHttpServer } from '../electron/mcpServer';
import { SharedMcpRuntime } from '../electron/sharedMcpRuntime';

async function main(): Promise<void> {
  let running = false;
  let starts = 0;
  const fallback = {
    getStatus: (): McpStatus => ({ enabled: true, running, host: '127.0.0.1', port: 31999, url: 'http://127.0.0.1:31999/mcp' }),
    start: async () => { starts += 1; running = true; },
    stop: async () => { running = false; }
  } as StarlimsMcpHttpServer;
  const runtime = new SharedMcpRuntime(
    async () => ({}), fallback, () => 'smoke-test', () => 31999, () => {},
    () => '/definitely/missing/starlims-shared-mcp.js'
  );
  await runtime.start();
  const status = runtime.getStatus();
  assert.equal(starts, 1);
  assert.equal(status.running, true);
  assert.equal(status.implementation, 'embedded-fallback');
  assert.match(status.error || '', /Shared Server unavailable/);
  await runtime.stop();
  assert.equal(fallback.getStatus().running, false);
  console.log('Shared MCP fallback smoke test passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
