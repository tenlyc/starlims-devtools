import assert from 'node:assert/strict';
import { agentDiagnostics, agentOutputLogs } from '../src/services/agentObservability';
import { useDiagnosticStore } from '../src/services/diagnosticStore';
import { useOutputLogStore } from '../src/services/outputLogStore';
import { editorStore } from '../src/stores/editorStore';

const activeUri = '/Applications/Test/ServerScripts/Active';
const otherUri = '/Applications/Test/ServerScripts/Other';
editorStore.setState({
  openFiles: [
    { uri: activeUri, name: 'Active', type: 'SERVER_SCRIPT', content: ':RETURN;' },
    { uri: otherUri, name: 'Other', type: 'SERVER_SCRIPT', content: ':RETURN;' }
  ],
  activeFileUri: activeUri
});
useDiagnosticStore.setState({ diagnosticsByUri: {
  [activeUri]: [{ id: 'active-warning', uri: activeUri, level: 'warning', message: 'Active warning', source: 'starlims-lsp', code: 'demo', line: 3, column: 4, endLine: 3, endColumn: 8 }],
  [otherUri]: [{ id: 'other-error', uri: otherUri, level: 'error', message: 'Other error', source: 'starlims-lsp', line: 1, column: 1, endLine: 1, endColumn: 2 }]
} });
useOutputLogStore.setState({ entries: [
  { id: 'older', timestamp: new Date('2026-09-01T00:00:00Z'), level: 'warning', message: 'Older warning', source: 'SSL', channel: 'ssl-language' },
  { id: 'newer', timestamp: new Date('2026-09-01T00:01:00Z'), level: 'error', message: 'Newer error', source: 'STARLIMS API', channel: 'starlims-api' }
] });

const current = agentDiagnostics();
assert.equal(current.totalItems, 1);
assert.equal(current.items[0].message, 'Active warning');
const openErrors = agentDiagnostics({ scope: 'open', levels: ['error'] });
assert.equal(openErrors.totalItems, 1);
assert.equal(openErrors.items[0].uri, otherUri);

const allOutput = agentOutputLogs();
assert.equal(allOutput.newestFirst, true);
assert.equal(allOutput.items[0].message, 'Newer error');
const sslOutput = agentOutputLogs({ channel: 'ssl-language', maxItems: 1 });
assert.equal(sslOutput.totalItems, 1);
assert.equal(sslOutput.items[0].message, 'Older warning');

editorStore.setState({ openFiles: [], activeFileUri: null });
useDiagnosticStore.setState({ diagnosticsByUri: {} });
useOutputLogStore.setState({ entries: [] });
console.log('Agent Problems and Output observability smoke test passed.');
