import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const uri = process.env.STARLIMS_ACCEPTANCE_RESOURCES_URI;
const language = process.env.STARLIMS_ACCEPTANCE_RESOURCES_LANGUAGE;
if (!uri?.includes('/HTMLForms/Resources/') || !language || process.env.STARLIMS_ACCEPTANCE_CONFIRM !== 'I_UNDERSTAND_THIS_CHECKS_IN_THE_TEST_FORM') throw new Error('Explicit test form URI, language and check-in confirmation are required.');
const c = new Client({ name: 'verified-checkin-acceptance', version: '1' });
async function call(name, args) {
  const r = await c.callTool({ name, arguments: args });
  assert.ok(!r.isError, JSON.stringify(r.content));
  return r.structuredContent;
}
try {
  await c.connect(new StreamableHTTPClientTransport(new URL(process.env.STARLIMS_DEVTOOLS_MCP_URL || 'http://127.0.0.1:3102/mcp')));
  const targetUri = uri.replace('/Resources/', '/XML/');
  const info = await call('search_by_name', { query: uri.slice(uri.lastIndexOf('/') + 1), exactMatch: true });
  const target = info.items.find((item) => item.uri === targetUri);
  assert.ok(target?.guid);
  assert.equal(target.isCheckedOut, false, 'Never check in a pre-existing user checkout during this test.');
  const before = await call('get_form_resources', { uri, language });
  assert.ok(before.resources.length);
  await call('checkout_item', { uri, language });
  const checkedOut = await call('get_form_resources', { uri, language });
  assert.deepEqual(checkedOut.resources, before.resources);
  const entry = checkedOut.resources.find((entry) => entry.resourceId === 'Query') || checkedOut.resources[0];
  await call('set_form_resource', { uri, language, resourceId: entry.resourceId, resourceValue: entry.resourceValue, expectedVersion: checkedOut.version });
  const result = await call('checkin_item', { uri, language, reason: 'Verify repaired checkin_item: preserve test form resources and confirm checkout release.' });
  assert.equal(result.checkedIn, true);
  assert.equal(result.verified, true);
  assert.equal(result.targetUri, targetUri);
  assert.equal(result.guid, target.guid);
  const after = await call('get_form_resources', { uri, language });
  assert.deepEqual(after.resources, before.resources);
  const pending = await call('list_checked_out_items', {});
  assert.ok(!pending.items.some((item) => item.guid === target.guid));
  const repeated = await c.callTool({ name: 'checkin_item', arguments: { uri, language, reason: 'Verify already released items do not report a new successful check-in.' } });
  assert.equal(repeated.isError, true);
  console.log(JSON.stringify({ ok: true, tool: 'checkin_item', targetUri, language, verified: true, resourceCount: after.totalItems, resourcesUnchanged: true, repeatedCheckinRejected: true }));
} finally { await c.close(); }
