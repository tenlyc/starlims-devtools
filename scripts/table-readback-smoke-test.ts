import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { prepareTableCaptionXml, tableDefinitionVersion, tableFieldNames, waitForTableReadBack } from '../src/services/tableDefinitionReadBack';

const dom = new JSDOM('').window;
Object.assign(globalThis, { DOMParser: dom.DOMParser, XMLSerializer: dom.XMLSerializer });

const table = (...fields: string[]) => `<TableDTO xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><__array__Fields>${fields.map((field) =>
  `<item xsi:type="FieldDTO"><Name xsi:type="string">${field}</Name></item>`
).join('')}</__array__Fields></TableDTO>`;

async function main() {
  assert.deepEqual(tableFieldNames(table('ORIGREC', 'USERNAME')), ['ORIGREC', 'USERNAME']);

  const before = table('ORIGREC');
  const requested = table('ORIGREC', 'USERNAME');
  const committed = table('ORIGREC', 'USERNAME');
  const responses = [before, before, committed];
  const delays: number[] = [];
  const result = await waitForTableReadBack(
    async () => responses.shift() || committed,
    requested,
    before,
    {
      delays: [0, 10, 20],
      sleep: async (milliseconds) => { delays.push(milliseconds); }
    }
  );
  assert.equal(result, committed);
  assert.deepEqual(delays, [10, 20]);

  await assert.rejects(
    waitForTableReadBack(async () => before, requested, before, { delays: [0], sleep: async () => undefined }),
    /missing fields: USERNAME/
  );
  // A successful no-op is valid, but an unchanged schema is not a successful deletion.
  assert.equal(await waitForTableReadBack(async () => before, before, before, { delays: [0] }), before);
  await assert.rejects(waitForTableReadBack(async () => requested, before, requested, { delays: [0] }), /requested changes/);
  const full = readFileSync('src/scm_api/Tables/DICTIONARY/CONTROL_PROPERTIES.xml', 'utf8');
  for (const changed of [
    full.replace('<Length xsi:type="int">30</Length>', '<Length xsi:type="int">60</Length>'),
    full.replace('<Type xsi:type="string">VARCHAR</Type>', '<Type xsi:type="string">INTEGER</Type>'),
    full.replace('<IsNullable xsi:type="bool">true</IsNullable>', '<IsNullable xsi:type="bool">false</IsNullable>'),
    full.replace('<Sort xsi:type="string">ASC</Sort>', '<Sort xsi:type="string">DESC</Sort>')
  ]) {
    assert.notEqual(changed, full);
    await assert.rejects(waitForTableReadBack(async () => full, changed, full, { delays: [0] }), /requested changes/);
  }
  const canonicalized = full.replace(/<Id xsi:type="int">\d+<\/Id>/g, '<Id xsi:type="int">999</Id>')
    .replaceAll('<DdlState xsi:type="string"></DdlState>', '<DdlState xsi:type="string">Modified</DdlState>');
  assert.equal(tableDefinitionVersion(full), tableDefinitionVersion(canonicalized));
  const captions = table('ORIGREC').replace('</item>', '<SCaptions>ORIGREC,CHS,原始记录;ORIGREC,ENG,Record;</SCaptions><__array__Captions/></item>');
  const prepared = prepareTableCaptionXml(captions);
  assert.match(prepared, /FieldCaptionDTO/);
  assert.match(prepared, /<Caption[^>]*>原始记录<\/Caption>/);
  assert.equal(tableDefinitionVersion(prepared), tableDefinitionVersion(captions));
  assert.equal(prepareTableCaptionXml(prepared), prepared);
  assert.equal(tableDefinitionVersion(captions), tableDefinitionVersion(captions.replace('Record;', 'Record;ORIGREC,FR,;')));
  assert.notEqual(tableDefinitionVersion(captions), tableDefinitionVersion(captions.replace('原始记录', '不同标题')));
  assert.throws(() => prepareTableCaptionXml(captions.replace('ORIGREC,ENG,Record;', 'ORIGREC,CHS,Record;')), /duplicate/);
  assert.throws(() => tableDefinitionVersion('<TableDTO>'), /valid TableDTO/);
  console.log('Table semantic read-back retry smoke test passed.');
}

void main();
