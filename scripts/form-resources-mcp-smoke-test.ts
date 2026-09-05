import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decodeFormResourcePayload, formResourceVersion, normalizeFormResourcesUri, parseFormResources, setFormResourceValue, toProgrammaticFormResources } from '../src/services/formResources';
import { ensureFormResourceBinding, inspectFormResourceBinding } from '../src/services/formResourceBinding';

const dom = new JSDOM('<!doctype html><html></html>');
Object.assign(globalThis, {
  DOMParser: dom.window.DOMParser,
  XMLSerializer: dom.window.XMLSerializer,
  document: dom.window.document
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

const designerXml = '<?xml version="1.0" encoding="utf-16"?><Resources><Resource><Id>TITLE</Id><Value>人员 &amp; 组织</Value></Resource></Resources>';
assert.equal(parseFormResources(designerXml).format, 'designer');
const converted = toProgrammaticFormResources(designerXml);
assert.equal(parseFormResources(converted).format, 'programmatic');
assert.deepEqual(parseFormResources(converted).resources.map(({ resourceId, resourceValue }) => ({ resourceId, resourceValue })), [
  { resourceId: 'TITLE', resourceValue: '人员 & 组织' }
]);
assert.match(converted, /ResourcesDataset xmlns="http:\/\/tempuri\.org\/ResourcesDataset\.xsd"/);
assert.doesNotMatch(converted, /xmlns=""/);
const merged = parseFormResources(toProgrammaticFormResources(designerXml, xml));
assert.deepEqual(merged.resources.map(({ resourceId }) => resourceId), ['TITLE', 'GUIDE']);
assert.equal(merged.resources.find(({ resourceId }) => resourceId === 'TITLE')?.guid, 'g-1');
assert.equal(merged.resources.find(({ resourceId }) => resourceId === 'GUIDE')?.resourceValue, '[]');
assert.throws(() => parseFormResources('<Resources><Resource><Value>missing id</Value></Resource></Resources>'), /without a valid ID/);
assert.throws(() => parseFormResources('<Resources><Resource><Id>OK</Id><Value>valid</Value></Resource><Resource><Value>missing id</Value></Resource></Resources>'), /without a valid ID/);
const cdata = '<Resources><Resource><Id>TITLE</Id><Value><![CDATA[A & B <tag>]]> &amp; C</Value></Resource></Resources>';
assert.equal(parseFormResources(toProgrammaticFormResources(cdata)).resources[0].resourceValue, 'A & B <tag> & C');
const formGuid = '11111111-2222-4333-8444-555555555555';
const form = '<Form xmlns="http://www.starlims.com/html"><Guid>aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee</Guid><Text>Fixture</Text></Form>';
const bound = ensureFormResourceBinding(form, formGuid, 'CHS');
assert.equal(bound.changed, true);
assert.match(bound.xml, new RegExp(`formID=${formGuid}&amp;languageID=CHS&amp;isProgramatic=Y`));
assert.doesNotMatch(bound.xml, /xmlns=""/);
assert.equal(ensureFormResourceBinding(bound.xml, formGuid, 'CHS').changed, false);
const fallback = bound.xml.replace('</Resources>', '<AlternativeData>base-layer-source</AlternativeData></Resources>');
const switched = ensureFormResourceBinding(fallback, formGuid, 'ENG');
assert.match(switched.xml, /languageID=ENG/);
assert.match(switched.xml, /<AlternativeData>base-layer-source<\/AlternativeData>/);
assert.throws(() => ensureFormResourceBinding('<Form><Resources><Data>Custom.GetResources.lims</Data></Resources></Form>', formGuid, 'CHS'), /custom Resources/);

assert.throws(() => parseFormResources('<Resources><Data>RUNTIME_SUPPORT.GetFormResources.lims</Data><KeyItem>ResourceId</KeyItem></Resources>'), /Expected resource data rows/);
assert.throws(() => parseFormResources('<ResourcesDataset><ResourcesTable><ResourceId>TITLE</ResourceId></ResourcesTable></ResourcesDataset>'), /include a value/);
assert.equal(parseFormResources('<ResourcesDataset/>').resources.length, 0);
assert.equal(parseFormResources('<Resources><Resource><Id>TITLE</Id><Value/></Resource></Resources>').resources[0].resourceValue, '');
const diagnosticGuid = '11111111-2222-4333-8444-555555555555';
const malformedColumns = '<Form><Guid>aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee</Guid><__array__Columns><item><Id>OrgName</Id></item></__array__Columns></Form>';
const diagnosis = inspectFormResourceBinding(malformedColumns, diagnosticGuid, 'ENG');
assert.equal(diagnosis.status, 'repair_required');
assert.deepEqual(diagnosis.missingColumnTypes, ['OrgName']);
assert.equal(diagnosis.runtimeVerified, false);
assert.equal(diagnosis.warnings.length, 2);
const correctColumns = ensureFormResourceBinding(malformedColumns.replace('<Id>OrgName</Id>', '<xtype>StarlimsTreeListColumn</xtype><Id>OrgName</Id>'), diagnosticGuid, 'ENG').xml;
assert.equal(inspectFormResourceBinding(correctColumns, diagnosticGuid, 'ENG').status, 'valid');
assert.deepEqual(inspectFormResourceBinding(correctColumns, diagnosticGuid, 'ENG').missingColumnTypes, []);
assert.equal(inspectFormResourceBinding('<Form><Resources><Data>Custom.Read.lims</Data></Resources></Form>', diagnosticGuid, 'ENG').status, 'unsupported');

void Promise.all([formResourceVersion(xml), formResourceVersion(added.xml)]).then(([before, after]) => {
  assert.notEqual(before, after);
  console.log('Multilingual Form Resources MCP smoke test passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
