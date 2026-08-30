import assert from 'node:assert/strict';
import { EnterpriseService } from '../src/services/enterpriseService';
import { buildCheckedOutTree, getCheckedOutDisplayLanguage, type CheckedOutItem } from '../src/components/Sidebar/CheckedOutTree';

const xml = `
<DataSet>
  <PendingCheckins>
    <CHILDID>form-guid</CHILDID>
    <CHILDNAME>BatchManager</CHILDNAME>
    <CHECKEDOUTBY>DEMO_USER</CHECKEDOUTBY>
    <CHILDTYPE>FORM</CHILDTYPE>
    <ParentName>BatchManager</ParentName>
    <PARENTTYPE>APP</PARENTTYPE>
    <APPCATNAME>ProductProcessApplications</APPCATNAME>
    <SCRIPTLANGUAGE>html</SCRIPTLANGUAGE>
    <LANGID>ENG</LANGID>
  </PendingCheckins>
</DataSet>`;

const service = new EnterpriseService();
const languageRequests: Array<{ endpoint: string; body?: string }> = [];
(service as unknown as {
  apiRequest: (endpoint: string, options?: { body?: string }) => Promise<unknown>;
}).apiRequest = async (endpoint, options) => {
  languageRequests.push({ endpoint, body: options?.body });
  return endpoint === 'SaveCode' ? { success: true } : { success: true, localPath: '/tmp/item' };
};

const languageVerification = service.checkOut('/Applications/App/Form', 'CHS')
  .then(() => service.saveItemCode('/Applications/App/Form', '<form />', 'CHS'))
  .then(() => service.checkIn('/Applications/App/Form', 'AI verified change', 'CHS'))
  .then(() => {
    assert.match(languageRequests[0].endpoint, /UserLang=CHS/);
    assert.equal(JSON.parse(languageRequests[1].body || '{}').UserLang, 'CHS');
    assert.match(languageRequests[2].endpoint, /UserLang=CHS/);
  });

const items = (service as unknown as {
  parseCheckedOutItemsXml: (source: string) => Array<{
    id: string;
    name: string;
    type: string;
    uri: string;
    displayPath?: string;
  }>;
}).parseCheckedOutItemsXml(xml);

assert.deepEqual(items.map(item => item.name), [
  'BatchManager [XML]',
  'BatchManager [Code Behind]',
  'BatchManager [Guide]',
  'BatchManager [Resources]'
]);
assert.deepEqual(items.map(item => item.type), [
  'HTMLFORMXML',
  'HTMLFORMCODE',
  'HTMLFORMGUIDE',
  'HTMLFORMRESOURCES'
]);
assert.deepEqual(items.map(item => item.uri), [
  '/Applications/ProductProcessApplications/BatchManager/HTMLForms/XML/BatchManager',
  '/Applications/ProductProcessApplications/BatchManager/HTMLForms/CodeBehind/BatchManager',
  '/Applications/ProductProcessApplications/BatchManager/HTMLForms/Guide/BatchManager',
  '/Applications/ProductProcessApplications/BatchManager/HTMLForms/Resources/BatchManager'
]);
assert.ok(items.every(item => item.displayPath === 'Applications / ProductProcessApplications / BatchManager / HTML Forms'));
assert.equal(new Set(items.map(item => item.id)).size, 4);

const shuffled = [items[1], items[3], items[2], items[0]].map((item): CheckedOutItem => ({
  ...item,
  user: 'DEMO_USER',
  date: '',
  path: item.displayPath
}));
const tree = buildCheckedOutTree(shuffled);
assert.deepEqual(shuffled.map(getCheckedOutDisplayLanguage), [
  undefined,
  'ENG',
  'ENG',
  'ENG'
]);
let level = tree;
for (const folder of ['Applications', 'ProductProcessApplications', 'BatchManager', 'HTML Forms']) {
  const node = level.find(candidate => candidate.label === folder);
  assert.ok(node, `Missing checked-out folder: ${folder}`);
  level = node.children;
}
assert.deepEqual(level.map(node => node.item?.type), [
  'HTMLFORMXML',
  'HTMLFORMCODE',
  'HTMLFORMGUIDE',
  'HTMLFORMRESOURCES'
]);

console.log('Checked-out HTML form expansion smoke test passed.');
void languageVerification.catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
