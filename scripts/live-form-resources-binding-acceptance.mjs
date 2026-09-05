import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// This intentionally saves only the existing resource values of one explicit
// fixture. The repaired Form XML stays checked out; no business rows are touched.
const uri = process.env.STARLIMS_ACCEPTANCE_RESOURCES_URI;
const language = process.env.STARLIMS_ACCEPTANCE_RESOURCES_LANGUAGE;
if (!uri?.includes('/HTMLForms/Resources/') || !language
  || process.env.STARLIMS_ACCEPTANCE_CONFIRM !== 'I_UNDERSTAND_THIS_WRITES_TO_STARLIMS') {
  throw new Error('Set an explicit HTML Resources test URI, language, and STARLIMS_ACCEPTANCE_CONFIRM=I_UNDERSTAND_THIS_WRITES_TO_STARLIMS.');
}
const client = new Client({ name: 'form-resources-binding-acceptance', version: '1.0' });
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, `${name} failed: ${JSON.stringify(result.content)}`);
  return result.structuredContent;
};
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(process.env.STARLIMS_DEVTOOLS_MCP_URL || 'http://127.0.0.1:3102/mcp')));
  const before = await call('get_form_resources', { uri, language, includeXml: true, maxCharacters: 1000000 });
  assert.equal(before.truncated, false);
  assert.ok(before.totalItems > 0, 'Use a populated test fixture.');
  const saved = await call('save_form_resources', { uri, language, resourceXml: before.resourceXml, expectedVersion: before.version });
  assert.equal(saved.saved, true);
  assert.equal(saved.formBindingVerified, true);
  const after = await call('get_form_resources', { uri, language });
  assert.deepEqual(after.resources, before.resources, 'No existing resource value or GUID may change.');
  // Exercise the single-value interface with the existing value: the contract
  // promises preservation of the other entries and the original GUID.
  const selected = after.resources.find((entry) => entry.resourceId === 'Query') || after.resources[0];
  const single = await call('set_form_resource', { uri, language, resourceId: selected.resourceId,
    resourceValue: selected.resourceValue, expectedVersion: after.version });
  assert.equal(single.saved, true);
  assert.equal(single.created, false);
  assert.equal(single.formBindingVerified, true);
  const final = await call('get_form_resources', { uri, language });
  assert.deepEqual(final.resources, before.resources, 'All three interfaces must preserve values and GUIDs.');
  assert.notEqual(final.formDiagnostics.writableInRequestedLanguage, false);
  assert.equal(final.runtimeVerified, false);
  const xml = await call('get_item_code', { uri: uri.replace('/Resources/', '/XML/'), language, maxCharacters: 1000000 });
  assert.equal(xml.truncated, false);
  assert.match(xml.code, /RUNTIME_SUPPORT\.GetFormResources\.lims\?formID=/);
  console.log(JSON.stringify({ ok: true, testedTools: ['get_form_resources', 'save_form_resources', 'set_form_resource'], resourceCount: after.totalItems, resourcesUnchanged: true,
    formBindingVerified: saved.formBindingVerified, formBindingUpdated: saved.formBindingUpdated, checkedIn: false }));
} finally { await client.close(); }
