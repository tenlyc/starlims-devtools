import assert from 'node:assert/strict';
import { buildEnterpriseSearchTree, collectSearchFolderIds } from '../src/services/enterpriseSearchTree';

const tree = buildEnterpriseSearchTree([
  {
    id: 'guide',
    label: '/Applications/ProductProcessApplications/BatchManager/HTMLForms/Guide/BatchManager.json',
    type: 'HTMLFORMGUIDE',
    uri: '/Applications/ProductProcessApplications/BatchManager/HTMLForms/Guide/BatchManager'
  },
  {
    id: 'client',
    label: '/Applications/ProductProcessApplications/BatchManager/ClientScripts/BatchManagerView.js',
    type: 'APPCS',
    uri: '/Applications/ProductProcessApplications/BatchManager/ClientScripts/BatchManagerView'
  }
]);

assert.equal(tree[0].label, 'Applications');
assert.equal(tree[0].uri, '/Applications');
assert.equal(tree[0].children?.[0].label, 'ProductProcessApplications');
assert.equal(tree[0].children?.[0].children?.[0].label, 'BatchManager');
assert.equal(tree[0].children?.[0].children?.[0].type, 'APP');
assert.equal(tree[0].children?.[0].children?.[0].uri, '/Applications/ProductProcessApplications/BatchManager');
const appFolders = tree[0].children?.[0].children?.[0].children || [];
assert.deepEqual(appFolders.map(item => item.label), ['Client Scripts', 'HTML Forms']);
assert.equal(appFolders[1].children?.[0].label, 'BatchManager [Guide]');
assert.ok(!appFolders.flatMap(folder => folder.children || []).some(item => item.label.startsWith('/Applications/')));
assert.equal(collectSearchFolderIds(tree).length, 5);

console.log('Enterprise search tree smoke test passed.');
