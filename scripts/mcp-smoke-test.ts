import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StarlimsMcpHttpServer } from '../electron/mcpServer';

const port = 33102;
const calls: Array<{ tool: string; arguments_: Record<string, unknown> }> = [];
const server = new StarlimsMcpHttpServer(
  async (tool, arguments_) => {
    calls.push({ tool, arguments_ });
    return { tool, arguments_ };
  },
  () => 'test',
  () => undefined,
  '127.0.0.1',
  port
);

async function main() {
try {
  await server.start();
  assert.equal(server.getStatus().running, true);

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.ok, true);

  const client = new Client({ name: 'starlims-devtools-smoke-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  await client.connect(transport);

  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'get_item_code'));
  assert.ok(tools.tools.some((tool) => tool.name === 'save_item'));

  const result = await client.callTool({ name: 'browse_tree', arguments: { uri: '/Applications', maxItems: 10 } });
  assert.equal(result.isError, undefined);
  assert.equal(calls[0]?.tool, 'browse_tree');
  assert.deepEqual(calls[0]?.arguments_, { uri: '/Applications', maxItems: 10 });

  await client.close();
  console.log(`MCP smoke test passed (${tools.tools.length} tools).`);
} finally {
  await server.stop();
}
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
