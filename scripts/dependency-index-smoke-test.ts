import assert from 'node:assert/strict';
import type { AgentWorkspaceFile } from '../src/types/agent';
import { buildDependencyIndex, dependencyContextForPrompt } from '../src/services/starlimsDependencyIndex';

const files: AgentWorkspaceFile[] = [
  {
    uri: '/Applications/Audit/AUDIT/ClientScripts/FORM_A', name: 'FORM_A', type: 'ClientScript', content: [
      ':PROCEDURE START;',
      '#include "AUDIT.HTML_EnterpriseAudit"',
      'DoProc("Enterprise_Server.DataSetSupport.DSFromString", {});',
      'lims.GetData("AUDIT.DS_A", {});',
      'OpenForm("MISSING_FORM");',
      ':ENDPROC;'
    ].join('\n')
  },
  { uri: '/Applications/Audit/AUDIT/ClientScripts/AUDIT.HTML_EnterpriseAudit', name: 'AUDIT.HTML_EnterpriseAudit', type: 'ClientScript', content: '' },
  { uri: '/Applications/Audit/AUDIT/ServerScripts/Enterprise_Server.DataSetSupport', name: 'Enterprise_Server.DataSetSupport', type: 'ServerScript', content: '' },
  { uri: '/Applications/Audit/AUDIT/DataSources/AUDIT.DS_A', name: 'AUDIT.DS_A', type: 'DataSource', content: '' }
];

const index = buildDependencyIndex(files);
assert.equal(index.nodes.length, 4);
assert.equal(index.edges.length, 4);
assert.equal(index.edges.find((edge) => edge.kind === 'include')?.line, 2);
assert.ok(index.edges.find((edge) => edge.kind === 'include')?.targetId);
assert.ok(index.edges.find((edge) => edge.kind === 'server-script')?.targetId);
assert.ok(index.edges.find((edge) => edge.kind === 'data-source')?.targetId);
assert.equal(index.edges.find((edge) => edge.kind === 'form')?.targetId, undefined);

const context = dependencyContextForPrompt(index, [files[0].uri]);
assert.match(context, /FORM_A:2 --include--> AUDIT.HTML_EnterpriseAudit/);
assert.match(context, /MISSING_FORM \(unresolved\)/);
assert.doesNotMatch(context, /:PROCEDURE START/);

console.log('Dependency index smoke test passed.');
