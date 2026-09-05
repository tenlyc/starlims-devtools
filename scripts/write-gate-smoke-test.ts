import assert from 'node:assert/strict';
import { assertExpectedContentVersion, checkoutItemWithGate, contentVersion, contentVersionFingerprint, saveTableWithGate } from '../src/services/writeGateService';
import { getEnterpriseService } from '../src/services/enterpriseService';
import { tableDefinitionVersion } from '../src/services/tableDefinitionReadBack';
import { JSDOM } from 'jsdom';

async function main() {
  const base = await contentVersionFingerprint({ server: 'DEMO', user: 'DEMO_USER', uri: '/Applications/A', language: 'CHS', action: 'save', before: 'old', after: 'new' });
  const same = await contentVersionFingerprint({ server: 'DEMO', user: 'DEMO_USER', uri: '/Applications/A', language: 'CHS', action: 'save', before: 'old', after: 'new' });
  const changedContent = await contentVersionFingerprint({ server: 'DEMO', user: 'DEMO_USER', uri: '/Applications/A', language: 'CHS', action: 'save', before: 'old', after: 'newer' });
  const changedLanguage = await contentVersionFingerprint({ server: 'DEMO', user: 'DEMO_USER', uri: '/Applications/A', language: 'ENG', action: 'save', before: 'old', after: 'new' });
  const changedServer = await contentVersionFingerprint({ server: 'QA', user: 'DEMO_USER', uri: '/Applications/A', language: 'CHS', action: 'save', before: 'old', after: 'new' });
  assert.equal(base.length, 64);
  assert.equal(base, same);
  assert.notEqual(base, changedContent);
  assert.notEqual(base, changedLanguage);
  assert.notEqual(base, changedServer);
  const version = await contentVersion('same remote content');
  assert.equal(version, await contentVersion('same remote content'));
  assert.notEqual(version, await contentVersion('changed remote content'));
  assert.equal(await assertExpectedContentVersion(version, 'same remote content'), version);
  await assert.rejects(() => assertExpectedContentVersion('0'.repeat(64), 'same remote content'), /changed after it was read/);
  const dom = new JSDOM('', { url: 'http://localhost' });
  let requirePassedTests = false;
  Object.assign(globalThis, { DOMParser: dom.window.DOMParser, localStorage: dom.window.localStorage,
    window: { electronAPI: { storeGet: async () => ({ personal: { quality: { requirePassedTests } } }) } } });
  const service = getEnterpriseService();
  const original = { getTableDefinitionXml: service.getTableDefinitionXml, getCurrentServer: service.getCurrentServer,
    getCheckedOutItems: service.getCheckedOutItems, saveTableDefinition: service.saveTableDefinition, checkOut: service.checkOut };
  const uri = '/Tables/Database/TEST_TABLE';
  const beforeXml = '<TableDTO><Id>11111111-2222-4333-8444-555555555555</Id><Name>TEST_TABLE</Name><Description>before</Description></TableDTO>';
  const desired = beforeXml.replace('before', 'after');
  let remote = beforeXml;
  let writes = 0;
  let checkedOut = true;
  Object.assign(service, { getTableDefinitionXml: async () => remote, getCurrentServer: () => ({ name: 'TEST', user: 'TEST' }),
    getCheckedOutItems: async () => checkedOut ? [{ id: '11111111-2222-4333-8444-555555555555' }] : [],
    saveTableDefinition: async (_uri: string, xml: string) => { writes++; remote = xml; return { success: true }; } });
  try {
    const input = { source: 'agent' as const, action: 'save' as const, uri, approved: true, tableXml: desired,
      expectedVersion: await contentVersion(tableDefinitionVersion(beforeXml)) };
    await assert.rejects(() => saveTableWithGate({ ...input, approved: false }), /authorization/);
    await assert.rejects(() => saveTableWithGate({ ...input, expectedVersion: '' }), /expectedVersion/);
    remote = desired;
    await assert.rejects(() => saveTableWithGate(input), /changed after it was read/);
    remote = beforeXml;
    requirePassedTests = true;
    await assert.rejects(() => saveTableWithGate(input), /测试通过/);
    requirePassedTests = false;
    checkedOut = false;
    await assert.rejects(() => saveTableWithGate(input), /Check out/);
    assert.equal(writes, 0);
    checkedOut = true;
    const saved = await saveTableWithGate(input);
    assert.equal(writes, 1);
    assert.equal(saved.definition, desired);
    assert.equal(saved.version, await contentVersion(tableDefinitionVersion(desired)));
    assert.match(saved.fingerprint, /^[a-f0-9]{64}$/);
    let checkoutCalls = 0;
    const formUri = '/Applications/Test/TestApp/HTMLForms/Resources/TestForm';
    Object.assign(service, {
      getCheckedOutItems: async () => [{ id: formUri, uri: formUri, checkedOutBy: 'TEST', language: 'CHS' }],
      checkOut: async () => { checkoutCalls++; return { success: true }; }
    });
    const formContext = { source: 'agent' as const, action: 'checkout' as const, uri: formUri.replace('/Resources/', '/CodeBehind/'), approved: true };
    assert.equal((await checkoutItemWithGate(formContext)).alreadyCheckedOut, true);
    assert.equal((await checkoutItemWithGate({ ...formContext, language: 'CHS' })).checkoutLanguage, 'CHS');
    await assert.rejects(() => checkoutItemWithGate({ ...formContext, language: 'ENG' }), /no checkout was performed/);
    assert.equal(checkoutCalls, 0, 'Repeated family checkout must not replace CHS with session-default ENG.');
    service.getCheckedOutItems = async (_allUsers, strict) => {
      assert.equal(strict, true);
      throw new Error('Checkout status unavailable');
    };
    await assert.rejects(() => checkoutItemWithGate(formContext), /Checkout status unavailable/);
    assert.equal(checkoutCalls, 0, 'An unavailable checkout list must not allow a destructive re-checkout.');
  } finally { Object.assign(service, original); dom.window.close(); }
  console.log('Unified write gate fingerprint smoke test passed.');
}

void main();
