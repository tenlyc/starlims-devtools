import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const listen = (server: ReturnType<typeof createServer>, port = 0) => new Promise<number>((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return reject(new Error('Unable to resolve test server port.'));
    resolve(address.port);
  });
});
const close = (server: ReturnType<typeof createServer>) => new Promise<void>((resolve) => server.close(() => resolve()));

async function main(): Promise<void> {
  const bridgeToken = 'shared-mcp-smoke-token';
  let invokedTool = '';
  let invokedArguments: Record<string, unknown> = {};
  const bridge = createServer(async (request, response) => {
  assert.equal(request.headers.authorization, `Bearer ${bridgeToken}`);
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { tool: string; arguments?: Record<string, unknown> };
  invokedTool = body.tool;
  invokedArguments = body.arguments || {};
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ result: [{ code: 'CHS', name: 'Chinese' }] }));
  });
  const bridgePort = await listen(bridge);
  const reservation = createServer();
  const mcpPort = await listen(reservation);
  await close(reservation);
  const runner = spawn(process.execPath, [join(process.cwd(), 'dist-electron/sharedMcpCli.js')], {
  env: {
    ...process.env,
    STARLIMS_DEVTOOLS_BRIDGE_URL: `http://127.0.0.1:${bridgePort}/invoke`,
    STARLIMS_DEVTOOLS_BRIDGE_TOKEN: bridgeToken,
    STARLIMS_DEVTOOLS_VERSION: 'smoke-test',
    STARLIMS_MCP_HOST: '127.0.0.1',
    STARLIMS_MCP_PORT: String(mcpPort)
  },
  stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  runner.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

try {
  let healthy = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${mcpPort}/health`);
      if (response.ok) { healthy = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(healthy, true, stderr || 'Shared MCP runner never became healthy.');
  const client = new Client({ name: 'devtools-shared-mcp-smoke', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/mcp`)));
  const capabilities = await client.callTool({ name: 'get_capabilities', arguments: {} });
  assert.equal(capabilities.isError, undefined);
  const languages = await client.callTool({ name: 'list_languages', arguments: {} });
  assert.equal(languages.isError, undefined);
  assert.equal(invokedTool, 'list_languages');
  const largeCode = `/* shared large save */\n${'x'.repeat(256 * 1024)}`;
  const saved = await client.callTool({ name: 'save_item', arguments: { uri: '/Applications/Test/HTMLForms/CodeBehind/LargeForm', language: 'ENG', code: largeCode } });
  assert.equal(saved.isError, undefined);
  assert.equal(invokedTool, 'save_item');
  assert.equal(invokedArguments.code, largeCode);
  await client.close();
  console.log('Shared MCP runtime smoke test passed.');
} finally {
  runner.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => runner.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000))
  ]);
  if (runner.exitCode === null) runner.kill('SIGKILL');
  await close(bridge);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
