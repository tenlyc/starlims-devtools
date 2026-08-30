import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editor = readFileSync('src/components/Editor/EditorPanel.tsx', 'utf8');
const checkedOut = readFileSync('src/components/Sidebar/CheckedOutTree.tsx', 'utf8');
const enterprise = readFileSync('src/components/Sidebar/EnterpriseTree.tsx', 'utf8');

const editorCommands = [
  'handleCut()', 'handleCopy()', 'handlePaste()', 'handleSelectAll()', 'handleFormat()',
  "getAction('editor.action.commentLine')", "getAction('editor.action.selectHighlights')",
  "getAction('editor.action.gotoLine')", "getAction('editor.action.quickOutline')",
  'handleReferenceForAi()', 'handleCompareWithRemote()', 'handleRunScript()',
  'handleDebugForm()', 'handleDesignForm()', "handleGoTo('auto')", "handleGoTo('server')",
  "handleGoTo('client')", "handleGoTo('datasource')", "handleGoTo('form')",
  'handleCheckOut()', 'handleCheckIn()', 'handleUndoCheckOut()'
];
for (const command of editorCommands) assert.ok(editor.includes(command), `Missing editor context-menu command: ${command}`);
assert.doesNotMatch(editor, /workbench\.action\.gotoSymbol/, 'Standalone Monaco must use quickOutline, not a VS Code workbench command');
assert.match(editor, /t\('context\.cut'\)/);
assert.match(editor, /t\('context\.compareRemote'\)/);
assert.doesNotMatch(editor, /剪切 \(Cut\)|与远程版本比较 \(Compare with Remote\)/, 'Context menu must not mix both languages');

assert.match(checkedOut, /checkInItemWithGate\(\{/s, 'Checked-out item Check In must execute through the write gate');
assert.match(checkedOut, /undoCheckoutWithGate\(\{/s, 'Checked-out item Undo must execute through the write gate');
assert.doesNotMatch(checkedOut, /checkInAllWithGate|exportPackage\(/, 'Bulk Check In and Export controls must stay removed');

for (const action of ['checkout', 'checkin', 'undocheckout', 'open', 'runscript', 'rundatasource', 'debugform', 'designform', 'goto-item']) {
  assert.match(enterprise, new RegExp(`case '${action}'`), `Enterprise context-menu action is not handled: ${action}`);
}
assert.match(enterprise, /label: t\('context\.checkOut'\)/);
assert.match(enterprise, /label: t\('context\.goToItem'\)/);

console.log('Context-menu localization and command wiring smoke test passed.');
