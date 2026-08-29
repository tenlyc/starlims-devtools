import assert from 'node:assert/strict';
import { classifyServerLogEntry, hasServerLogContent, parseServerLog } from '../src/services/serverLogParser';
import { useDiagnosticStore } from '../src/services/diagnosticStore';
import { inferLogChannel, useOutputLogStore } from '../src/services/outputLogStore';

const content = [
  'ALICE / 20260830 / 10:20:30 / 12.6.2 / ServerScript.Test.main() / ****User message****',
  'completed successfully',
  'ALICE / 20260830 / 10:21:30 / 12.6.2 / ServerScript.Test.main() / ****Warning****',
  'Warning: check this value',
  'ALICE / 20260830 / 10:22:30 / 12.6.2 / ServerScript.Test.main() / ****Error****',
  'Run-time error: invalid value'
].join('\n');

const entries = parseServerLog(content, 'ALICE');
assert.equal(entries.length, 3);
assert.deepEqual(entries.map((entry) => entry.level), ['success', 'warning', 'error']);
assert.equal(entries[0].timestamp.getFullYear(), 2026);
assert.equal(entries[0].timestamp.getMonth(), 7);
assert.equal(classifyServerLogEntry('Exception occurred'), 'error');
assert.equal(classifyServerLogEntry('normal user message'), 'info');
assert.equal(hasServerLogContent(content), true);
assert.equal(hasServerLogContent('There is no log file on 08/30/2026 for user GYF !'), false);
assert.deepEqual(parseServerLog('There is no log file on 08/30/2026 for user GYF !', 'GYF'), []);
assert.equal(inferLogChannel('STARLIMS API'), 'starlims-api');
assert.equal(inferLogChannel('SSL Language Server'), 'ssl-language');
assert.equal(inferLogChannel('MCP Tool'), 'mcp-tools');
useOutputLogStore.setState({ entries: [] });
useOutputLogStore.getState().addEntry({ level: 'info', source: 'MCP Server', message: 'started' });
useOutputLogStore.getState().addEntry({ level: 'success', channel: 'ai-runtime', source: 'Codex Agent', message: 'ready' });
assert.deepEqual(useOutputLogStore.getState().entries.map((entry) => entry.channel), ['mcp-server', 'ai-runtime']);
useOutputLogStore.getState().clearChannel('mcp-server');
assert.deepEqual(useOutputLogStore.getState().entries.map((entry) => entry.channel), ['ai-runtime']);

const uri = '/ServerScripts/SCM_API/Test';
useDiagnosticStore.getState().setDiagnostics(uri, [{
  id: 'test', uri, level: 'warning', message: 'test warning', source: 'ssl-lsp',
  line: 4, column: 2, endLine: 4, endColumn: 5
}]);
assert.equal(useDiagnosticStore.getState().diagnosticsByUri[uri].length, 1);
useDiagnosticStore.getState().clearDiagnostics(uri);
assert.equal(useDiagnosticStore.getState().diagnosticsByUri[uri], undefined);

console.log('Bottom panel diagnostics and multi-user STARLIMS log smoke test passed.');
