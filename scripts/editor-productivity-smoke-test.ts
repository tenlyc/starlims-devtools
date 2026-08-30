import assert from 'node:assert/strict';
import { desktopPlatform, primaryShortcut } from '../src/services/platformShortcuts';
import { SQL_COMPLETION_KEYWORDS, sqlCompletionContext, sqlTableAliases, tableDefinitionFields } from '../src/services/sqlIntelligence';
import { readFileSync } from 'node:fs';
import { editorStore } from '../src/stores/editorStore';
import { normalizeDataSourceOutput } from '../src/services/dataSourceResult';

assert.equal(desktopPlatform('Mozilla/5.0 (Macintosh)', 'MacIntel'), 'mac');
assert.equal(desktopPlatform('Mozilla/5.0 (Windows NT 10.0)', 'Win32'), 'windows');
assert.equal(primaryShortcut('CtrlOrCmd+Shift+O', 'mac'), '⌘⇧O');
assert.equal(primaryShortcut('CtrlOrCmd+Shift+O', 'windows'), 'Ctrl+Shift+O');
assert.equal(primaryShortcut('Shift+Alt+F', 'mac'), '⇧⌥F');

assert.ok(SQL_COMPLETION_KEYWORDS.includes('SELECT'));
assert.deepEqual([...sqlTableAliases('SELECT b.ORIGREC FROM BATCHES AS b JOIN ORDERS o ON o.ID=b.ID')], [
  ['BATCHES', 'BATCHES'], ['B', 'BATCHES'], ['ORDERS', 'ORDERS'], ['O', 'ORDERS']
]);
assert.deepEqual(sqlCompletionContext('SELECT * FROM BAT'), { kind: 'table', prefix: 'BAT' });
assert.deepEqual(sqlCompletionContext('SELECT b.', 'SELECT b. FROM BATCHES b'), { kind: 'column', prefix: '', table: 'BATCHES' });
assert.deepEqual(tableDefinitionFields([
  ['ORIGREC', 'Record', 'VARCHAR', '20', 'NO', '', 'PK'],
  { FIELD_NAME: 'STATUS', DATA_TYPE: 'VARCHAR', FIELD_SIZE: '10' }
]), [
  { name: 'ORIGREC', detail: 'VARCHAR · 20 · PK' },
  { name: 'STATUS', detail: 'VARCHAR · 10' }
]);

assert.deepEqual(normalizeDataSourceOutput([
  ['ORIGREC', 'STATUS', 'COUNT'],
  ['1001', 'A', 2],
  ['1002', null, 0]
]), {
  success: true,
  columns: ['ORIGREC', 'STATUS', 'COUNT'],
  rows: [
    { ORIGREC: '1001', STATUS: 'A', COUNT: 2 },
    { ORIGREC: '1002', STATUS: null, COUNT: 0 }
  ],
  rowCount: 2
});

const editorSource = readFileSync('src/components/Editor/EditorPanel.tsx', 'utf8');
const mainSource = readFileSync('electron/main.ts', 'utf8');
assert.match(editorSource, /starlims\.saveRemoteItem/);
assert.match(editorSource, /hasPrimaryModifier\(e\)/);
assert.match(editorSource, /executeDataSourceWithGate/);
assert.doesNotMatch(editorSource, /executeQueryWithGate/);
assert.match(mainSource, /accelerator: 'CmdOrCtrl\+S'/);
assert.match(mainSource, /Refresh Enterprise Tree', accelerator: 'F6'/);

editorStore.getState().openFile({ uri: '/DataSources/TEST', name: 'TEST', type: 'DS', content: 'SELECT 1' });
editorStore.getState().updateFileContent('/DataSources/TEST', 'SELECT 2');
assert.equal(editorStore.getState().getActiveFile()?.isDirty, true);
editorStore.getState().updateFileContent('/DataSources/TEST', 'SELECT 1');
assert.equal(editorStore.getState().getActiveFile()?.isDirty, false);
editorStore.getState().closeFile('/DataSources/TEST');

console.log('Cross-platform editor shortcuts and SQL intelligence smoke test passed.');
