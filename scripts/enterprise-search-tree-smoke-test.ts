import assert from 'node:assert/strict';
import { buildEnterpriseSearchTree, collectSearchFolderIds } from '../src/services/enterpriseSearchTree';

const tree = buildEnterpriseSearchTree([
  {
    id: 'resources',
    label: '/Applications/ProductProcessApplications/BatchManager/HTMLForms/Resources/BatchManager.xml',
    type: 'HTMLFORMRESOURCES',
    uri: '/Applications/ProductProcessApplications/BatchManager/HTMLForms/Resources/BatchManager'
  },
  {
    id: 'xml',
    label: '/Applications/ProductProcessApplications/BatchManager/HTMLForms/XML/BatchManager.xml',
    type: 'HTMLFORMXML',
    uri: '/Applications/ProductProcessApplications/BatchManager/HTMLForms/XML/BatchManager'
  },
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
  },
  {
    id: 'code',
    label: '/Applications/ProductProcessApplications/BatchManager/HTMLForms/CodeBehind/BatchManager.js',
    type: 'HTMLFORMCODE',
    uri: '/Applications/ProductProcessApplications/BatchManager/HTMLForms/CodeBehind/BatchManager'
  },
  {
    id: 'xfd',
    label: '/Applications/ProductProcessApplications/BatchManager/XFDForms/XML/BatchManager.xml',
    type: 'XFDFORMXML',
    uri: '/Applications/ProductProcessApplications/BatchManager/XFDForms/XML/BatchManager'
  },
  {
    id: 'server',
    label: '/Applications/ProductProcessApplications/BatchManager/ServerScripts/Run.ssl',
    type: 'APPSERVERSCRIPT',
    uri: '/Applications/ProductProcessApplications/BatchManager/ServerScripts/Run'
  },
  {
    id: 'data',
    label: '/Applications/ProductProcessApplications/BatchManager/DataSources/Query.ssl',
    type: 'APPDATASOURCESCRIPT',
    uri: '/Applications/ProductProcessApplications/BatchManager/DataSources/Query'
  }
]);

assert.equal(tree[0].label, 'Applications');
assert.equal(tree[0].uri, '/Applications');
assert.equal(tree[0].children?.[0].label, 'ProductProcessApplications');
assert.equal(tree[0].children?.[0].children?.[0].label, 'BatchManager');
assert.equal(tree[0].children?.[0].children?.[0].type, 'APP');
assert.equal(tree[0].children?.[0].children?.[0].uri, '/Applications/ProductProcessApplications/BatchManager');
const appFolders = tree[0].children?.[0].children?.[0].children || [];
assert.deepEqual(appFolders.map(item => item.label), ['HTML Forms', 'XFD Forms', 'Server Scripts', 'Client Scripts', 'Data Sources']);
assert.deepEqual(appFolders[0].children?.map(item => item.label), [
  'BatchManager [XML]',
  'BatchManager [Code Behind]',
  'BatchManager [Guide]',
  'BatchManager [Resources]'
]);
assert.ok(!appFolders.flatMap(folder => folder.children || []).some(item => item.label.startsWith('/Applications/')));
assert.equal(collectSearchFolderIds(tree).length, 8);

console.log('Enterprise search tree smoke test passed.');
