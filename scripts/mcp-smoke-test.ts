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
assert.match(mcpServerSource, /MCP_JSON_BODY_LIMIT = '8mb'/);
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
  for (const name of ['get_menu_configuration','plan_menu_item','apply_menu_item']) assert.ok(tools.tools.some(tool=>tool.name===name));
  assert.ok(tools.tools.some((tool) => tool.name === 'get_item_code'));
  assert.ok(tools.tools.some((tool) => tool.name === 'save_item'));
  assert.ok(tools.tools.some((tool) => tool.name === 'get_form_resources'));
  assert.ok(tools.tools.some((tool) => tool.name === 'save_form_resources'));
  assert.ok(tools.tools.some((tool) => tool.name === 'set_form_resource'));
  assert.ok(tools.tools.some((tool) => tool.name === 'query_checkin_history'));
  assert.ok(tools.tools.some((tool) => tool.name === 'get_capabilities'));
  assert.ok(tools.tools.some((tool) => tool.name === 'validate_ssl'));
  assert.ok(tools.tools.some((tool) => tool.name === 'get_editor_diagnostics'));
  assert.ok(tools.tools.some((tool) => tool.name === 'get_devtools_output'));
  assert.ok(tools.tools.some((tool) => tool.name === 'create_item'));
  assert.ok(tools.tools.some((tool) => tool.name === 'create_table'));
  assert.ok(tools.tools.some((tool) => tool.name === 'edit_table'));
  assert.ok(tools.tools.some((tool) => tool.name === 'checkout_table'));
  assert.ok(tools.tools.some((tool) => tool.name === 'checkin_table'));

  const capabilities = await client.callTool({ name: 'get_capabilities', arguments: {} });
  const capabilityDocument = capabilities.structuredContent as {
    profile?: string;
    adapter?: string;
    tools?: Array<{ id?: string; origin?: string; risk?: string }>;
    backend?: Array<{ name?: string; source?: string }>;
  };
  assert.equal(capabilityDocument.profile, 'devtools');
  assert.equal(capabilityDocument.adapter, 'starlims-devtools');
  assert.ok(capabilityDocument.tools?.some((tool) => tool.id === 'save_item' && tool.origin === 'starlimsvscode' && tool.risk === 'write'));
  assert.ok(capabilityDocument.tools?.some((tool) => tool.id === 'get_form_resources' && tool.origin === 'starlims-mcp' && tool.risk === 'read'));
  assert.ok(capabilityDocument.tools?.some((tool) => tool.id === 'query_checkin_history' && tool.origin === 'starlims-mcp'));
  assert.ok(capabilityDocument.backend?.some((component) => component.name === 'SCM_API' && component.source?.includes('MrDoe/starlimsvscode') && component.source?.includes('tenlyc/starlims-mcp')));
  assert.equal(capabilityDocument.backend?.filter((component) => component.name === 'SCM_API').length, 1);

  assert.ok(capabilityDocument.tools?.some(tool => tool.id === 'capture_form_screenshot'));
  assert.ok(tools.tools.some(tool => tool.name === 'open_form_preview'));
  assert.equal(capabilityDocument.tools?.length, tools.tools.length - 1);

  const result = await client.callTool({ name: 'browse_tree', arguments: { uri: '/Applications', maxItems: 10 } });
  assert.equal(result.isError, undefined);
  assert.equal(calls[0]?.tool, 'browse_tree');
  assert.deepEqual(calls[0]?.arguments_, { uri: '/Applications', maxItems: 10 });

  const created = await client.callTool({
    name: 'create_item',
    arguments: { itemName: 'AI_Test', itemType: 'APP', language: 'ENG', categoryName: 'TestApp', appName: 'AI_Test' }
  });
  assert.equal(created.isError, undefined);
  assert.equal(calls.at(-1)?.tool, 'create_item');
  assert.deepEqual(calls.at(-1)?.arguments_, {
    itemName: 'AI_Test', itemType: 'APP', language: 'ENG', categoryName: 'TestApp', appName: 'AI_Test'
  });

  const validation = await client.callTool({
    name: 'validate_ssl', arguments: { code: ':RETURN 1;', dataSource: false }
  });
  assert.equal(validation.isError, undefined);
  assert.equal(calls.at(-1)?.tool, 'validate_ssl');
  assert.deepEqual(calls.at(-1)?.arguments_, { code: ':RETURN 1;', dataSource: false });

  await client.callTool({ name: 'get_editor_diagnostics', arguments: { scope: 'current', levels: ['error', 'warning'] } });
  assert.equal(calls.at(-1)?.tool, 'get_editor_diagnostics');
  await client.callTool({ name: 'get_devtools_output', arguments: { channel: 'ssl-language', maxItems: 20 } });
  assert.equal(calls.at(-1)?.tool, 'get_devtools_output');

  const largeCode = `/* large HTML Form code */\n${'x'.repeat(256 * 1024)}`;
  const saveResult = await client.callTool({
    name: 'save_item',
    arguments: { uri: '/Applications/Test/HTMLForms/CodeBehind/LargeForm', language: 'ENG', code: largeCode }
  });
  assert.equal(saveResult.isError, undefined);
  assert.equal(calls.at(-1)?.tool, 'save_item');
  assert.equal(calls.at(-1)?.arguments_.code, largeCode);

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
