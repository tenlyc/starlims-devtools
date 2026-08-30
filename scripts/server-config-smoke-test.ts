import assert from 'node:assert/strict';
import { normalizeStarlimsUrl } from '../src/services/miscUtils';
import { buildAddEnterpriseItemPayload } from '../src/services/enterpriseService';

assert.equal(
  normalizeStarlimsUrl('https://starlims.example.test/LIMS/starthtml.lims'),
  'https://starlims.example.test/LIMS'
);
assert.equal(
  normalizeStarlimsUrl('https://example.test/STARLIMS/starthtml.lims?FormId=123#debug'),
  'https://example.test/STARLIMS'
);
assert.equal(
  normalizeStarlimsUrl('https://example.test/STARLIMS/'),
  'https://example.test/STARLIMS'
);

assert.deepEqual(
  buildAddEnterpriseItemPayload(
    '/Applications/RunCreateResultsEntryRunApprov/RUNBUILD_RESENT_APPROVE',
    'DEVTOOLS_MCP_ACCEPTANCE_20260830',
    'HTMLFORMXML',
    'ENG'
  ),
  {
    lid: '/Applications/RunCreateResultsEntryRunApprov/RUNBUILD_RESENT_APPROVE',
    name: 'DEVTOOLS_MCP_ACCEPTANCE_20260830',
    itemType: 'HTMLFORMXML',
    ItemName: 'DEVTOOLS_MCP_ACCEPTANCE_20260830',
    ItemType: 'HTMLFORMXML',
    Language: 'ENG',
    Category: 'RunCreateResultsEntryRunApprov',
    AppName: 'RUNBUILD_RESENT_APPROVE'
  }
);

assert.deepEqual(
  buildAddEnterpriseItemPayload('/ServerScripts/Acceptance', 'Probe', 'SS', 'CHS'),
  {
    lid: '/ServerScripts/Acceptance',
    name: 'Probe',
    itemType: 'SS',
    ItemName: 'Probe',
    ItemType: 'SS',
    Language: 'CHS',
    Category: 'Acceptance',
    AppName: ''
  }
);

console.log('Server configuration smoke test passed.');
