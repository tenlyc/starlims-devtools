import assert from 'node:assert/strict';
import { resolveEditorLanguage } from '../src/services/editorLanguage';

assert.equal(resolveEditorLanguage('ServerScript'), 'ssl');
assert.equal(resolveEditorLanguage('AppServerScript'), 'ssl');
assert.equal(resolveEditorLanguage('ClientScript'), 'javascript');
assert.equal(resolveEditorLanguage('AppClientScript'), 'javascript');
assert.equal(resolveEditorLanguage('HTMLFORMCODE'), 'javascript');
assert.equal(resolveEditorLanguage('HTMLFORMGUIDE'), 'json');
assert.equal(resolveEditorLanguage('HTMLFORMRESOURCES'), 'xml');
assert.equal(resolveEditorLanguage('DataSourceScript', 'STARLIMS'), 'ssl');
assert.equal(resolveEditorLanguage('APPDS', 'SQL'), 'slsql');
assert.equal(resolveEditorLanguage('TABLE'), 'xml');

console.log('Editor language mapping smoke test passed.');
