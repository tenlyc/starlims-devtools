import assert from 'node:assert/strict';
import { SSLParser } from '../src/lsp/ssl/parser';
import { computeStyleDiagnostics, DEFAULT_STYLE_RULE_CONFIG } from '../src/lsp/ssl/styleRules';
import { formatSSL } from '../src/lsp/ssl/formatter';
import { SymbolTable } from '../src/lsp/ssl/symbol-table';
import { getAllBuiltinNames, getBuiltinFunction } from '../src/lsp/ssl/builtins';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { findDefinition } from '../src/lsp/ssl/definition';
import { findReferences } from '../src/lsp/ssl/references';
import { computeCodeActions } from '../src/lsp/ssl/codeActions';
import { getCodeLenses, getDocumentHighlights, getInlayHints, getRenameEdits } from '../src/lsp/ssl/navigation';

const validSource = [
  ':PROCEDURE FormatName;',
  ':PARAMETERS sName;',
  ':DECLARE sResult;',
  'sResult := AllTrim(sName);',
  ':RETURN sResult;',
  ':ENDPROC;'
].join('\n');

const parsed = new SSLParser().parse(validSource);
assert.equal(parsed.errors.length, 0, parsed.errors.map((error) => error.message).join('\n'));

const includeSource = [
  '#include "AUDIT.HTML_EnterpriseAudit"',
  '#include "EmpowerInterface.HTML_GetResultsAuto"'
].join('\n');
const parsedIncludes = new SSLParser().parse(includeSource);
assert.equal(parsedIncludes.errors.length, 0, parsedIncludes.errors.map((error) => error.message).join('\n'));
assert.deepEqual(parsedIncludes.ast.body.map((node) => node.type === 'IncludeStmt' ? node.target : ''), [
  'AUDIT.HTML_EnterpriseAudit', 'EmpowerInterface.HTML_GetResultsAuto'
]);
assert.equal(formatSSL(includeSource), `${includeSource}\n`);
assert.equal(
  computeStyleDiagnostics(includeSource, parsedIncludes.ast, DEFAULT_STYLE_RULE_CONFIG)
    .some((diagnostic) => diagnostic.code === 'keyword_uppercase'),
  false
);

const symbols = new SymbolTable();
symbols.buildFromAST(parsed.ast);
assert.ok(symbols.lookup('FormatName'));

const document = TextDocument.create('file:///navigation.ssl', 'ssl', 1, validSource);
const parameterPosition = { line: 3, character: 21 };
const definition = findDefinition(document, parsed.ast, symbols, parameterPosition);
assert.ok(definition, 'parameter definition should resolve');
assert.equal(definition.range.start.line, 1);
assert.ok(findReferences(document, parsed.ast, symbols, parameterPosition).length >= 1);
assert.ok(getDocumentHighlights(document, parsed.ast, symbols, parameterPosition).length >= 1);
assert.ok(getRenameEdits(document, parsed.ast, symbols, parameterPosition, 'sDisplayName'));

const inlayHints = getInlayHints(document, parsed.ast, symbols, {
  start: { line: 0, character: 0 },
  end: { line: 5, character: 20 }
});
assert.ok(inlayHints.length >= 1, 'builtin call should expose parameter inlay hints');

const styleSource = ':if a <> b;\n:endif;\n';
const styleAst = new SSLParser().parse(styleSource).ast;
const diagnostics = computeStyleDiagnostics(styleSource, styleAst, DEFAULT_STYLE_RULE_CONFIG);
const ruleCodes = diagnostics.map((diagnostic) => diagnostic.code);
assert.ok(ruleCodes.includes('keyword_uppercase'));
assert.ok(ruleCodes.includes('not_preferred_operator'));
const styleDocument = TextDocument.create('file:///style.ssl', 'ssl', 1, styleSource);
const actions = computeCodeActions(styleDocument, styleAst, diagnostics, styleDocument.uri);
assert.ok(actions.some((action) => action.kind === 'quickfix' && action.edit), 'style diagnostics should offer quick fixes');

const callSource = [
  ':PROCEDURE Helper;',
  ':ENDPROC;',
  ':PROCEDURE Caller;',
  'Helper();',
  ':ENDPROC;'
].join('\n');
const callAst = new SSLParser().parse(callSource).ast;
const callSymbols = new SymbolTable();
callSymbols.buildFromAST(callAst);
assert.equal(getCodeLenses(callAst, callSymbols).length, 1);

assert.equal(
  formatSSL(':procedure p;\nx:=( a+b )*2\n:endproc;\n'),
  ':PROCEDURE p;\n\tx := (a + b) * 2;\n:ENDPROC;\n'
);

assert.ok(getAllBuiltinNames().length > 100);
assert.ok(getBuiltinFunction('SQLExecute'));

console.log(`SSL language smoke test passed (${diagnostics.length} diagnostics, ${actions.length} quick actions, ${getAllBuiltinNames().length} builtins).`);
