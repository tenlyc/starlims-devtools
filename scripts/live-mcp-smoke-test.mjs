import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.STARLIMS_DEVTOOLS_MCP_URL || 'http://127.0.0.1:3102/mcp';
const client = new Client({ name: 'starlims-devtools-live-smoke-test', version: '1.0.0' });
const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

try {
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  const tools = await client.listTools();
  for (const name of ['get_capabilities', 'browse_tree', 'list_checked_out_items', 'get_form_resources', 'save_form_resources', 'validate_ssl', 'get_editor_diagnostics', 'get_devtools_output', 'create_item', 'create_table', 'edit_table', 'checkout_table', 'checkin_table']) {
    assert.ok(tools.tools.some((tool) => tool.name === name), `Missing live MCP tool: ${name}`);
  }

  const capabilities = await client.callTool({ name: 'get_capabilities', arguments: {} });
  assert.equal(capabilities.isError, undefined);
  const document = capabilities.structuredContent;
  assert.equal(document.profile, 'devtools');
  const listedNames = tools.tools.map(tool => tool.name).sort();
  assert.equal(new Set(listedNames).size, listedNames.length, 'Duplicate tool registrations');
  assert.deepEqual(listedNames, ['get_capabilities', ...document.tools.map(tool => tool.id)].sort(), 'tools/list and capabilities must match');
  assert.equal(document.adapter, 'starlims-devtools-bridge');
  assert.equal(document.version, packageVersion);
  assert.ok(document.tools.every((tool) => tool.origin === 'starlimsvscode' || tool.origin === 'starlims-mcp'));
  assert.ok(document.tools.every((tool) => Array.isArray(tool.profiles) && tool.profiles.length > 0));
  assert.equal(document.backend.filter((component) => component.name === 'SCM_API').length, 1);

  const tree = await client.callTool({ name: 'browse_tree', arguments: { uri: '/', maxItems: 8 } });
  assert.equal(tree.isError, undefined, `browse_tree failed: ${JSON.stringify(tree.content)}`);
  const checkedOut = await client.callTool({ name: 'list_checked_out_items', arguments: { includeAllUsers: false } });
  assert.equal(checkedOut.isError, undefined, `list_checked_out_items failed: ${JSON.stringify(checkedOut.content)}`);
  const checkedOutUser = checkedOut.structuredContent?.items?.find((item) => item.checkedOutBy)?.checkedOutBy;
  assert.ok(checkedOutUser, 'No current-user checked-out item is available for the history filter.');
  const today = new Date();
  const dateFrom = new Date(today);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - 30);
  const toDate = (date) => date.toISOString().slice(0, 10);
  const history = await client.callTool({
    name: 'query_checkin_history',
    arguments: { user: checkedOutUser, dateFrom: toDate(dateFrom), dateTo: toDate(today) }
  });
  assert.equal(history.isError, undefined, `query_checkin_history failed: ${JSON.stringify(history.content)}`);

  console.log(JSON.stringify({
    ok: true,
    endpoint,
    serverVersion: document.version,
    profile: document.profile,
    adapter: document.adapter,
    toolCount: tools.tools.length,
    origins: [...new Set(document.tools.map((tool) => tool.origin))],
    backend: document.backend,
    browseTreeItems: tree.structuredContent?.totalItems,
    checkedOutItems: checkedOut.structuredContent?.totalItems,
    checkInHistoryItems: history.structuredContent?.totalItems
  }, null, 2));
} finally {
  await client.close();
}
