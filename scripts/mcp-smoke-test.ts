import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { readFileSync } from 'node:fs';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StarlimsMcpHttpServer } from '../electron/mcpServer';

const port = 33102;
const electronMain = readFileSync('electron/main.ts', 'utf8');
const mcpServerSource = readFileSync('electron/mcpServer.ts', 'utf8');
assert.match(electronMain, /LEGACY_MCP_PORT = 3002/);
assert.match(electronMain, /DEFAULT_MCP_PORT = 3102/);
assert.match(electronMain, /store\.set\('mcpPort', DEFAULT_MCP_PORT\)/);
assert.match(mcpServerSource, /private port = 3102/);
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
  assert.ok(tools.tools.some((tool) => tool.name === 'get_form_resources'));
  assert.ok(tools.tools.some((tool) => tool.name === 'save_form_resources'));
  assert.ok(tools.tools.some((tool) => tool.name === 'set_form_resource'));
  assert.ok(tools.tools.some((tool) => tool.name === 'query_checkin_history'));
  assert.ok(tools.tools.some((tool) => tool.name === 'get_capabilities'));

  const capabilities = await client.callTool({ name: 'get_capabilities', arguments: {} });
  const capabilityDocument = capabilities.structuredContent as {
    profile?: string;
    adapter?: string;
    tools?: Array<{ id?: string; origin?: string; risk?: string }>;
    backend?: Array<{ name?: string; source?: string }>;
  };
  assert.equal(capabilityDocument.profile, 'devtools');
  assert.equal(capabilityDocument.adapter, 'starlims-devtools');
  assert.ok(capabilityDocument.tools?.some((tool) => tool.id === 'save_item' && tool.origin === 'shared' && tool.risk === 'write'));
  assert.ok(capabilityDocument.tools?.some((tool) => tool.id === 'get_form_resources' && tool.origin === 'shared' && tool.risk === 'read'));
  assert.ok(capabilityDocument.tools?.some((tool) => tool.id === 'query_checkin_history' && tool.origin === 'starlims-devtools'));
  assert.ok(capabilityDocument.backend?.some((component) => component.name === 'SCM_API' && component.source === 'MrDoe/starlimsvscode'));
  assert.ok(capabilityDocument.backend?.some((component) => component.name === 'STARLIMS_DEVTOOLS_API'));

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
