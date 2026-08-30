import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decodeFormResourcePayload, formResourceVersion, normalizeFormResourcesUri, parseFormResources, setFormResourceValue } from '../src/services/formResources';

const dom = new JSDOM('<!doctype html><html></html>');
Object.assign(globalThis, {
  DOMParser: dom.window.DOMParser,
  XMLSerializer: dom.window.XMLSerializer
});

const xml = '<?xml version="1.0"?><ResourcesDataset><ResourcesTable><Guid>g-1</Guid><ResourceId>TITLE</ResourceId><ResourceValue>Hello &amp; goodbye</ResourceValue></ResourcesTable><ResourcesTable><Guid>g-2</Guid><ResourceId>GUIDE</ResourceId><ResourceValue>[]</ResourceValue></ResourcesTable></ResourcesDataset>';

assert.equal(
  normalizeFormResourcesUri('/Applications/App/HTMLForms/XML/MainForm'),
  '/Applications/App/HTMLForms/Resources/MainForm'
);
assert.equal(
  normalizeFormResourcesUri('/Applications/App/HTMLForms/Resources/MainForm'),
  '/Applications/App/HTMLForms/Resources/MainForm'
);
assert.throws(() => normalizeFormResourcesUri('/Applications/App/ServerScripts/MainForm'));

const encoded = Buffer.from(xml, 'utf8').toString('base64');
assert.equal(decodeFormResourcePayload(encoded), xml);
assert.deepEqual(parseFormResources(encoded).resources, [
  { resourceId: 'TITLE', resourceValue: 'Hello & goodbye', guid: 'g-1' },
  { resourceId: 'GUIDE', resourceValue: '[]', guid: 'g-2' }
]);

const changed = setFormResourceValue(xml, 'TITLE', '你好 <STARLIMS>');
assert.equal(changed.created, false);
assert.equal(parseFormResources(changed.xml).resources.find((entry) => entry.resourceId === 'TITLE')?.resourceValue, '你好 <STARLIMS>');

const added = setFormResourceValue(changed.xml, 'SUBMIT', '保存');
assert.equal(added.created, true);
assert.equal(parseFormResources(added.xml).resources.find((entry) => entry.resourceId === 'SUBMIT')?.resourceValue, '保存');
void Promise.all([formResourceVersion(xml), formResourceVersion(added.xml)]).then(([before, after]) => {
  assert.notEqual(before, after);
  console.log('Multilingual Form Resources MCP smoke test passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
