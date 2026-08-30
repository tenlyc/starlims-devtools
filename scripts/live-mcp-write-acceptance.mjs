import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const CONFIRMATION = 'I_UNDERSTAND_THIS_WRITES_TO_STARLIMS';
const endpoint = process.env.STARLIMS_DEVTOOLS_MCP_URL || 'http://127.0.0.1:3102/mcp';
const uri = String(process.env.STARLIMS_ACCEPTANCE_URI || '').trim();
const language = String(process.env.STARLIMS_ACCEPTANCE_LANGUAGE || '').trim() || undefined;
const resourcesUri = String(process.env.STARLIMS_ACCEPTANCE_RESOURCES_URI || '').trim();
const resourcesLanguage = String(process.env.STARLIMS_ACCEPTANCE_RESOURCES_LANGUAGE || '').trim();
const finalize = String(process.env.STARLIMS_ACCEPTANCE_FINALIZE || 'undo').trim().toLowerCase();

if (process.env.STARLIMS_ACCEPTANCE_CONFIRM !== CONFIRMATION) {
  throw new Error(`Refusing live writes. Set STARLIMS_ACCEPTANCE_CONFIRM=${CONFIRMATION} after selecting a disposable acceptance-test item.`);
}
if (!uri) throw new Error('STARLIMS_ACCEPTANCE_URI must identify a disposable STARLIMS acceptance-test item.');
if (!['undo', 'checkin'].includes(finalize)) throw new Error('STARLIMS_ACCEPTANCE_FINALIZE must be undo or checkin.');
if (resourcesUri && !resourcesLanguage) throw new Error('STARLIMS_ACCEPTANCE_RESOURCES_LANGUAGE is required when a Resources URI is provided.');

const client = new Client({ name: 'starlims-devtools-live-write-acceptance', version: '1.0.0' });
let checkoutAcquired = false;
let finalized = false;
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, `${name} failed: ${JSON.stringify(result.content)}`);
  return result.structuredContent || {};
};

try {
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  const tools = await client.listTools();
  for (const name of ['get_item_code', 'checkout_item', 'save_item', 'checkin_item', 'undo_checkout']) {
    assert.ok(tools.tools.some((tool) => tool.name === name), `Missing live MCP tool: ${name}`);
  }

  const baseline = await call('get_item_code', { uri, ...(language ? { language } : {}), maxCharacters: 1_000_000 });
  assert.equal(baseline.truncated, false, 'Acceptance item is too large to verify without truncation.');
  assert.equal(typeof baseline.code, 'string');
  assert.match(String(baseline.version || ''), /^[a-f0-9]{64}$/);

  await call('checkout_item', { uri, ...(language ? { language } : {}) });
  checkoutAcquired = true;
  const saved = await call('save_item', {
    uri,
    code: baseline.code,
    expectedVersion: baseline.version,
    ...(language ? { language } : {})
  });
  assert.equal(saved.saved, true);
  assert.match(String(saved.version || ''), /^[a-f0-9]{64}$/);

  const readBack = await call('get_item_code', { uri, ...(language ? { language } : {}), maxCharacters: 1_000_000 });
  assert.equal(readBack.code, baseline.code);
  assert.equal(readBack.version, saved.version);

  const stale = await client.callTool({ name: 'save_item', arguments: { uri, code: baseline.code, expectedVersion: '0'.repeat(64), ...(language ? { language } : {}) } });
  assert.equal(stale.isError, true, 'A stale expectedVersion was not blocked.');

  if (resourcesUri) {
    for (const name of ['get_form_resources', 'save_form_resources']) {
      assert.ok(tools.tools.some((tool) => tool.name === name), `Missing live MCP tool: ${name}`);
    }
    const resources = await call('get_form_resources', { uri: resourcesUri, language: resourcesLanguage, includeXml: true, maxCharacters: 1_000_000 });
    assert.equal(resources.truncated, false, 'Resources document is too large to verify without truncation.');
    const resourceSave = await call('save_form_resources', { uri: resourcesUri, language: resourcesLanguage, resourceXml: resources.resourceXml, expectedVersion: resources.version });
    assert.equal(resourceSave.saved, true);
    assert.match(String(resourceSave.version || ''), /^[a-f0-9]{64}$/);
  }

  if (finalize === 'checkin') {
    await call('checkin_item', { uri, reason: process.env.STARLIMS_ACCEPTANCE_CHECKIN_REASON || 'STARLIMS DevTools Beta write-path acceptance', ...(language ? { language } : {}) });
  } else {
    await call('undo_checkout', { uri });
  }
  finalized = true;

  console.log(JSON.stringify({
    ok: true, endpoint, uri, language: language || null,
    resources: resourcesUri ? { uri: resourcesUri, language: resourcesLanguage } : null,
    finalizedWith: finalize,
    checks: ['read-version', 'checkout', 'save', 'read-back', 'stale-version-blocked', ...(resourcesUri ? ['resources-read-save-verify'] : []), finalize]
  }, null, 2));
} finally {
  if (checkoutAcquired && !finalized) {
    try {
      await call('undo_checkout', { uri });
      console.warn(`Acceptance failed after checkout; automatically undid checkout for ${uri}.`);
    } catch (cleanupError) {
      console.error(`Acceptance cleanup could not undo checkout for ${uri}:`, cleanupError);
    }
  }
  await client.close();
}
