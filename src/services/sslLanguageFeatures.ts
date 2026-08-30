/* Monaco adapter for the MIT-licensed SSL language core from MrDoe/starlimsvscode. */
import type * as Monaco from 'monaco-editor';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  DiagnosticSeverity,
  DocumentHighlightKind as LspDocumentHighlightKind,
  MarkupContent,
  MarkedString,
  SymbolKind as LspSymbolKind,
  WorkspaceEdit as LspWorkspaceEdit
} from 'vscode-languageserver-types';
import { SSLParser } from '../lsp/ssl/parser';
import { SymbolTable } from '../lsp/ssl/symbol-table';
import { computeDiagnostics } from '../lsp/ssl/diagnostics';
import { computeStyleDiagnostics, DEFAULT_STYLE_RULE_CONFIG } from '../lsp/ssl/styleRules';
import { DEFAULT_FORMAT_OPTIONS, formatSSL, formatSSLRange } from '../lsp/ssl/formatter';
import { getHover } from '../lsp/ssl/hover';
import { getSignatureHelp } from '../lsp/ssl/signatureHelp';
import { getDocumentSymbols } from '../lsp/ssl/document-symbols';
import { getFoldingRanges } from '../lsp/ssl/folding';
import { getAllBuiltinNames, getBuiltinFunction } from '../lsp/ssl/builtins';
import { findDefinition } from '../lsp/ssl/definition';
import { findReferences } from '../lsp/ssl/references';
import { computeCodeActions } from '../lsp/ssl/codeActions';
import {
  getCodeLenses,
  getDocumentHighlights,
  getInlayHints,
  getRenameEdits
} from '../lsp/ssl/navigation';
import { DiagnosticLevel, useDiagnosticStore } from './diagnosticStore';
import { useOutputLogStore } from './outputLogStore';
import type { NativeSslDiagnostic, NativeSslFunction, NativeSslInventory } from '../types/sslLsp';
import { preserveDesignerIncludes } from './sslLspCompatibility';
import { editorStore } from '../stores/editorStore';
import { resolveEditorLanguage } from './editorLanguage';
import type { NativeLspLocation, NativeLspWorkspaceEdit } from '../types/sslLsp';

const OWNER = 'starlims-ssl-lsp';
const KEYWORDS = [
  ':PROCEDURE', ':ENDPROC', ':PARAMETERS', ':DECLARE', ':DEFAULT', ':RETURN',
  ':IF', ':ELSE', ':ENDIF', ':BEGINCASE', ':CASE', ':EXITCASE', ':OTHERWISE',
  ':ENDCASE', ':FOR', ':NEXT', ':WHILE', ':ENDWHILE', ':LOOP', ':EXIT', ':TRY',
  ':CATCH', ':FINALLY', ':ENDTRY', ':CLASS', ':INHERIT', ':INCLUDE', ':DSN',
  ':ACCESS', ':ASSIGN', ':TO', ':STEP', ':PUBLIC', ':ERROR', ':REGION',
  ':ENDREGION', ':BEGININLINECODE', ':ENDINLINECODE', ':RESUME', ':EXITFOR', ':EXITWHILE'
];

let registered = false;
let nativeInventory: NativeSslInventory | null = null;
const modelListeners = new Map<string, Monaco.IDisposable>();
const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();
const validationSummaries = new Map<string, string>();

async function ensureWorkspaceModel(monaco: typeof Monaco, uri: string, activate = false): Promise<Monaco.editor.ITextModel | null> {
  const parsedUri = monaco.Uri.parse(uri);
  const existing = monaco.editor.getModel(parsedUri);
  if (existing) return existing;
  const document = await window.electronAPI?.sslLspWorkspaceDocument?.(uri);
  if (!document) return null;
  const file = {
    uri: document.sourceUri,
    name: document.name,
    type: document.type,
    language: document.language,
    content: document.content,
    baselineContent: document.content,
    isDirty: false
  };
  const previousActive = editorStore.getState().activeFileUri;
  editorStore.getState().openFile(file);
  if (!activate && previousActive) editorStore.getState().setActiveFile(previousActive);
  const modelUri = monaco.Uri.parse(document.sourceUri);
  return monaco.editor.getModel(modelUri)
    || monaco.editor.createModel(document.content, resolveEditorLanguage(document.type, document.language), modelUri);
}

async function prepareLocations(monaco: typeof Monaco, locations: NativeLspLocation[], activateFirst = false): Promise<Monaco.languages.Location[]> {
  const prepared: Monaco.languages.Location[] = [];
  for (const [index, location] of locations.entries()) {
    const model = await ensureWorkspaceModel(monaco, location.uri, activateFirst && index === 0);
    if (!model && !monaco.editor.getModel(monaco.Uri.parse(location.uri))) continue;
    prepared.push({ uri: monaco.Uri.parse(location.uri), range: range(monaco, location.range) });
  }
  return prepared;
}

async function prepareWorkspaceEdit(monaco: typeof Monaco, edit: NativeLspWorkspaceEdit | null): Promise<Monaco.languages.WorkspaceEdit | null> {
  if (!edit?.changes) return null;
  for (const uri of Object.keys(edit.changes)) await ensureWorkspaceModel(monaco, uri);
  return workspaceEdit(monaco, edit);
}

function documentFor(model: Monaco.editor.ITextModel): TextDocument {
  return TextDocument.create(model.uri.toString(), 'ssl', model.getVersionId(), model.getValue());
}

function analyze(model: Monaco.editor.ITextModel) {
  const parsed = new SSLParser().parse(model.getValue());
  const symbols = new SymbolTable();
  symbols.buildFromAST(parsed.ast);
  return { ...parsed, symbols };
}

function severity(monaco: typeof Monaco, value?: DiagnosticSeverity): Monaco.MarkerSeverity {
  switch (value) {
    case DiagnosticSeverity.Error: return monaco.MarkerSeverity.Error;
    case DiagnosticSeverity.Warning: return monaco.MarkerSeverity.Warning;
    case DiagnosticSeverity.Information: return monaco.MarkerSeverity.Info;
    default: return monaco.MarkerSeverity.Hint;
  }
}

function diagnosticLevel(value?: DiagnosticSeverity): DiagnosticLevel {
  if (value === DiagnosticSeverity.Error) return 'error';
  if (value === DiagnosticSeverity.Warning) return 'warning';
  return 'info';
}

function modelUri(model: Monaco.editor.ITextModel): string {
  return model.uri.path || model.uri.toString();
}

function supportsNativeSsl(model: Monaco.editor.ITextModel): boolean {
  return model.getLanguageId() === 'ssl' || model.getLanguageId() === 'slsql';
}

function validateLocal(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  if (model.isDisposed() || model.getLanguageId() !== 'ssl') {
    if (!model.isDisposed()) {
      monaco.editor.setModelMarkers(model, OWNER, []);
      useDiagnosticStore.getState().clearDiagnostics(modelUri(model));
    }
    return;
  }
  try {
    const { ast, errors } = analyze(model);
    const diagnostics = [
      ...computeDiagnostics(errors),
      ...computeStyleDiagnostics(model.getValue(), ast, DEFAULT_STYLE_RULE_CONFIG)
    ];
    const markers = diagnostics.map((item) => ({
      severity: severity(monaco, item.severity),
      message: typeof item.message === 'string' ? item.message : item.message.value,
      source: item.source || OWNER,
      code: typeof item.code === 'string' || typeof item.code === 'number' ? String(item.code) : undefined,
      startLineNumber: item.range.start.line + 1,
      startColumn: item.range.start.character + 1,
      endLineNumber: item.range.end.line + 1,
      endColumn: Math.max(item.range.start.character + 2, item.range.end.character + 1)
    }));
    monaco.editor.setModelMarkers(model, OWNER, markers);
    const uri = modelUri(model);
    useDiagnosticStore.getState().setDiagnostics(uri, diagnostics.map((item, index) => ({
      id: `${uri}:${item.range.start.line}:${item.range.start.character}:${String(item.code || index)}`,
      uri,
      level: diagnosticLevel(item.severity),
      message: typeof item.message === 'string' ? item.message : item.message.value,
      source: item.source || OWNER,
      code: typeof item.code === 'string' || typeof item.code === 'number' ? String(item.code) : undefined,
      line: item.range.start.line + 1,
      column: item.range.start.character + 1,
      endLine: item.range.end.line + 1,
      endColumn: Math.max(item.range.start.character + 2, item.range.end.character + 1)
    })));
    const errorCount = diagnostics.filter((item) => item.severity === DiagnosticSeverity.Error).length;
    const warningCount = diagnostics.filter((item) => item.severity === DiagnosticSeverity.Warning).length;
    const infoCount = diagnostics.length - errorCount - warningCount;
    const summary = `${errorCount}:${warningCount}:${infoCount}`;
    if (validationSummaries.get(uri) !== summary) {
      validationSummaries.set(uri, summary);
      useOutputLogStore.getState().addEntry({
        channel: 'ssl-language',
        level: errorCount ? 'error' : warningCount ? 'warning' : 'info',
        source: 'SSL Language Server',
        message: `${uri}: ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} information message(s)`
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    monaco.editor.setModelMarkers(model, OWNER, [{
      severity: monaco.MarkerSeverity.Error,
      message,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
      source: OWNER
    }]);
    const uri = modelUri(model);
    useDiagnosticStore.getState().setDiagnostics(uri, [{
      id: `${uri}:1:1:parser`, uri, level: 'error', message, source: OWNER,
      line: 1, column: 1, endLine: 1, endColumn: 2
    }]);
    useOutputLogStore.getState().addEntry({
      channel: 'ssl-language', level: 'error', source: 'SSL Language Server',
      message: `${uri}: parser failed: ${message}`
    });
  }
}

function nativeSeverity(monaco: typeof Monaco, value: NativeSslDiagnostic['severity']): Monaco.MarkerSeverity {
  if (value === 'error') return monaco.MarkerSeverity.Error;
  if (value === 'warning') return monaco.MarkerSeverity.Warning;
  if (value === 'info') return monaco.MarkerSeverity.Info;
  return monaco.MarkerSeverity.Hint;
}

function nativeDiagnosticLevel(value: NativeSslDiagnostic['severity']): DiagnosticLevel {
  if (value === 'error') return 'error';
  if (value === 'warning') return 'warning';
  return 'info';
}

async function validate(monaco: typeof Monaco, model: Monaco.editor.ITextModel): Promise<void> {
  if (model.isDisposed() || !supportsNativeSsl(model)) return;
  const api = window.electronAPI;
  if (!api?.sslLspValidate) {
    validateLocal(monaco, model);
    return;
  }
  const version = model.getVersionId();
  const uri = modelUri(model);
  try {
    const result = await api.sslLspValidate(model.getValue(), {
      dataSource: model.getLanguageId() === 'slsql',
      hungarianTypes: true
    });
    if (model.isDisposed() || model.getVersionId() !== version) return;
    if (!result.available || result.error) {
      validateLocal(monaco, model);
      return;
    }
    // STARLIMS supports the Designer-style #include directive without a
    // trailing semicolon. Preserve that DevTools compatibility rule even
    // when consuming upstream diagnostics.
    const diagnostics = result.diagnostics.filter((item) => {
      const line = model.getLineContent(Math.max(1, Math.min(model.getLineCount(), item.line))).trim();
      return !(line.toLowerCase().startsWith('#include ') && /semicolon|unknown token|unknown keyword/i.test(`${item.code || ''} ${item.message}`));
    });
    monaco.editor.setModelMarkers(model, OWNER, diagnostics.map((item) => ({
      severity: nativeSeverity(monaco, item.severity),
      message: item.message,
      source: `starlims-lsp v${result.version || 'native'}`,
      code: item.code,
      startLineNumber: Math.max(1, item.line),
      startColumn: Math.max(1, item.column),
      endLineNumber: Math.max(1, item.line),
      endColumn: Math.max(2, item.column + 1)
    })));
    useDiagnosticStore.getState().setDiagnostics(uri, diagnostics.map((item, index) => ({
      id: `${uri}:${item.line}:${item.column}:${item.code || index}`,
      uri,
      level: nativeDiagnosticLevel(item.severity),
      message: item.message,
      source: `starlims-lsp v${result.version || 'native'}`,
      code: item.code,
      line: Math.max(1, item.line),
      column: Math.max(1, item.column),
      endLine: Math.max(1, item.line),
      endColumn: Math.max(2, item.column + 1)
    })));
    const errorCount = diagnostics.filter((item) => item.severity === 'error').length;
    const warningCount = diagnostics.filter((item) => item.severity === 'warning').length;
    const infoCount = diagnostics.length - errorCount - warningCount;
    const summary = `native:${errorCount}:${warningCount}:${infoCount}`;
    if (validationSummaries.get(uri) !== summary) {
      validationSummaries.set(uri, summary);
      useOutputLogStore.getState().addEntry({
        channel: 'ssl-language',
        level: errorCount ? 'error' : warningCount ? 'warning' : 'info',
        source: `starlims-lsp v${result.version || 'native'}`,
        message: `${uri}: ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} information message(s)`
      });
    }
  } catch {
    if (!model.isDisposed() && model.getVersionId() === version) validateLocal(monaco, model);
  }
}

function scheduleValidation(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  const key = model.uri.toString();
  const previous = validationTimers.get(key);
  if (previous) clearTimeout(previous);
  validationTimers.set(key, setTimeout(() => {
    validationTimers.delete(key);
    void validate(monaco, model);
  }, 250));
}

function attachModel(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  const key = model.uri.toString();
  modelListeners.get(key)?.dispose();
  if (!supportsNativeSsl(model)) {
    monaco.editor.setModelMarkers(model, OWNER, []);
    useDiagnosticStore.getState().clearDiagnostics(modelUri(model));
    modelListeners.delete(key);
    return;
  }
  const sync = () => {
    scheduleValidation(monaco, model);
    const openFile = editorStore.getState().openFiles.find((file) => file.uri === key);
    if (openFile && openFile.content !== model.getValue()) editorStore.getState().updateFileContent(key, model.getValue());
    void window.electronAPI?.sslLspDocumentSync?.({ uri: key, content: model.getValue(), version: model.getVersionId() }).catch(() => false);
  };
  modelListeners.set(key, model.onDidChangeContent(sync));
  void window.electronAPI?.sslLspDocumentSync?.({ uri: key, content: model.getValue(), version: model.getVersionId() }).catch(() => false);
  scheduleValidation(monaco, model);
}

function markdown(value: string | MarkupContent | MarkedString | MarkedString[]): Monaco.IMarkdownString[] {
  if (typeof value === 'string') return [{ value }];
  if (Array.isArray(value)) return value.flatMap(markdown);
  if ('kind' in value && 'value' in value) return [{ value: value.value }];
  if ('language' in value) return [{ value: `\`\`\`${value.language}\n${value.value}\n\`\`\`` }];
  return [];
}

function range(monaco: typeof Monaco, item: { start: { line: number; character: number }; end: { line: number; character: number } }): Monaco.Range {
  return new monaco.Range(item.start.line + 1, item.start.character + 1, item.end.line + 1, item.end.character + 1);
}

function symbolKind(monaco: typeof Monaco, kind: LspSymbolKind): Monaco.languages.SymbolKind {
  if (kind === LspSymbolKind.Function) return monaco.languages.SymbolKind.Function;
  if (kind === LspSymbolKind.Class) return monaco.languages.SymbolKind.Class;
  return monaco.languages.SymbolKind.Variable;
}

function position(item: Monaco.Position): { line: number; character: number } {
  return { line: item.lineNumber - 1, character: item.column - 1 };
}

function nativeFunctionLabel(item: NativeSslFunction): string {
  const parameters = (item.parameters || []).map((parameter) => parameter.required === false ? `[${parameter.name}]` : parameter.name).join(', ');
  return `${item.name}(${parameters})${item.return_type ? ` → ${item.return_type}` : ''}`;
}

function nativeFunctionAt(model: Monaco.editor.ITextModel, cursor: Monaco.Position): { item: NativeSslFunction; activeParameter: number } | null {
  const before = model.getValue().slice(0, model.getOffsetAt(cursor));
  const match = before.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)$/);
  if (!match) return null;
  const item = nativeInventory?.functions.find((candidate) => candidate.name.toLowerCase() === match[1].toLowerCase());
  return item ? { item, activeParameter: match[2].trim() ? match[2].split(',').length - 1 : 0 } : null;
}

function workspaceEdit(monaco: typeof Monaco, edit?: LspWorkspaceEdit | null): Monaco.languages.WorkspaceEdit {
  const edits: Monaco.languages.IWorkspaceTextEdit[] = [];
  for (const [uri, changes] of Object.entries(edit?.changes || {})) {
    for (const change of changes) {
      edits.push({
        resource: monaco.Uri.parse(uri),
        textEdit: { range: range(monaco, change.range), text: change.newText },
        versionId: undefined
      });
    }
  }
  return { edits };
}

export function registerSslLanguageFeatures(monaco: typeof Monaco): void {
  if (registered) return;
  registered = true;

  monaco.editor.getModels().forEach((model) => attachModel(monaco, model));
  monaco.editor.onDidCreateModel((model) => attachModel(monaco, model));
  monaco.editor.onDidChangeModelLanguage(({ model }) => attachModel(monaco, model));
  monaco.editor.onWillDisposeModel((model) => {
    const key = model.uri.toString();
    modelListeners.get(key)?.dispose();
    modelListeners.delete(key);
    const timer = validationTimers.get(key);
    if (timer) clearTimeout(timer);
    validationTimers.delete(key);
    useDiagnosticStore.getState().clearDiagnostics(modelUri(model));
    validationSummaries.delete(modelUri(model));
    void window.electronAPI?.sslLspDocumentClose?.(key).catch(() => false);
  });

  useOutputLogStore.getState().addEntry({
    channel: 'ssl-language', level: 'success', source: 'SSL Language Server',
    message: `SSL language features initialized (${getAllBuiltinNames().length} built-in functions)`
  });
  void window.electronAPI?.sslLspStatus?.().then((status) => {
    useOutputLogStore.getState().addEntry({
      channel: 'ssl-language',
      level: status.available ? 'success' : 'warning',
      source: 'SSL Language Server',
      message: status.available
        ? `Native starlims-lsp v${status.version} enabled; TypeScript language core retained as fallback.`
        : 'Native starlims-lsp is unavailable; using the TypeScript fallback language core.'
    });
    if (status.available) void window.electronAPI.sslLspInventory().then((inventory) => { nativeInventory = inventory; });
  });

  monaco.languages.registerDocumentFormattingEditProvider('ssl', {
    provideDocumentFormattingEdits: async (model) => {
      const result = await window.electronAPI?.sslLspFormat?.(model.getValue());
      const text = result?.available && !result.error && typeof result.content === 'string'
        ? preserveDesignerIncludes(model.getValue(), result.content)
        : formatSSL(model.getValue(), DEFAULT_FORMAT_OPTIONS);
      return text === model.getValue() ? [] : [{ range: model.getFullModelRange(), text }];
    }
  });

  monaco.languages.registerDocumentRangeFormattingEditProvider('ssl', {
    provideDocumentRangeFormattingEdits: (model, selectedRange) => {
      const text = formatSSLRange(model.getValue(), selectedRange.startLineNumber - 1, selectedRange.endLineNumber - 1, DEFAULT_FORMAT_OPTIONS);
      return text === model.getValue() ? [] : [{ range: model.getFullModelRange(), text }];
    }
  });

  monaco.languages.registerHoverProvider('ssl', {
    provideHover: (model, position) => {
      const { ast, symbols } = analyze(model);
      const result = getHover(documentFor(model), ast, symbols, { line: position.lineNumber - 1, character: position.column - 1 });
      if (result) return { contents: markdown(result.contents), range: result.range ? range(monaco, result.range) : undefined };
      const word = model.getWordAtPosition(position);
      const item = word && nativeInventory?.functions.find((candidate) => candidate.name.toLowerCase() === word.word.toLowerCase());
      if (!item || !word) return null;
      return {
        contents: [{ value: `**${nativeFunctionLabel(item)}**\n\n${item.description || ''}` }],
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      };
    }
  });

  monaco.languages.registerSignatureHelpProvider('ssl', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp: (model, position) => {
      const { symbols } = analyze(model);
      const result = getSignatureHelp(documentFor(model), symbols, { line: position.lineNumber - 1, character: position.column - 1 });
      if (!result) {
        const native = nativeFunctionAt(model, position);
        if (!native) return null;
        return {
          value: {
            activeSignature: 0,
            activeParameter: Math.min(native.activeParameter, Math.max(0, (native.item.parameters?.length || 1) - 1)),
            signatures: [{
              label: nativeFunctionLabel(native.item),
              documentation: native.item.description,
              parameters: (native.item.parameters || []).map((parameter) => ({ label: parameter.name, documentation: parameter.description }))
            }]
          },
          dispose: () => undefined
        };
      }
      return {
        value: {
          activeSignature: result.activeSignature || 0,
          activeParameter: result.activeParameter || 0,
          signatures: result.signatures.map((signature) => ({
            label: signature.label,
            documentation: typeof signature.documentation === 'string' ? signature.documentation : signature.documentation?.value,
            parameters: (signature.parameters || []).map((parameter) => ({
              label: typeof parameter.label === 'string'
                ? parameter.label
                : signature.label.slice(parameter.label[0], parameter.label[1]),
              documentation: typeof parameter.documentation === 'string' ? parameter.documentation : parameter.documentation?.value
            }))
          }))
        },
        dispose: () => undefined
      };
    }
  });

  monaco.languages.registerCompletionItemProvider('ssl', {
    triggerCharacters: [':', '.'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const replaceRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const nativeKeywords = (nativeInventory?.keywords || []).map((keyword) => keyword.startsWith(':') ? keyword : `:${keyword}`);
      const keywordItems = [...new Set([...KEYWORDS, ...nativeKeywords])].map((label) => ({ label, kind: monaco.languages.CompletionItemKind.Keyword, insertText: label, range: replaceRange }));
      const nativeFunctions = new Map((nativeInventory?.functions || []).map((item) => [item.name.toLowerCase(), item]));
      const builtinNames = [...new Set([...getAllBuiltinNames(), ...(nativeInventory?.functions || []).map((item) => item.name)])];
      const builtinItems = builtinNames.map((label) => {
        const item = getBuiltinFunction(label)?.[0];
        const native = nativeFunctions.get(label.toLowerCase());
        return {
          label,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: label,
          detail: native ? nativeFunctionLabel(native) : item ? `${item.library} — ${item.signature}` : 'SSL builtin',
          documentation: native?.description || item?.description,
          range: replaceRange
        };
      });
      const classItems = (nativeInventory?.classes || []).map((item) => ({
        label: item.name,
        kind: monaco.languages.CompletionItemKind.Class,
        insertText: item.name,
        detail: item.summary || 'SSL class',
        documentation: item.summary,
        range: replaceRange
      }));
      return { suggestions: [...keywordItems, ...builtinItems, ...classItems] };
    }
  });

  monaco.languages.registerDocumentSymbolProvider('ssl', {
    provideDocumentSymbols: (model) => getDocumentSymbols(analyze(model).ast).map(function convert(item): Monaco.languages.DocumentSymbol {
      return {
        name: item.name,
        detail: item.detail || '',
        kind: symbolKind(monaco, item.kind),
        range: range(monaco, item.range),
        selectionRange: range(monaco, item.selectionRange),
        tags: [],
        children: item.children?.map(convert)
      };
    })
  });

  monaco.languages.registerFoldingRangeProvider('ssl', {
    provideFoldingRanges: (model) => getFoldingRanges(analyze(model).ast).map((item) => ({
      start: item.startLine + 1,
      end: item.endLine + 1
    }))
  });

  monaco.languages.registerDefinitionProvider('ssl', {
    provideDefinition: async (model, cursor) => {
      try {
        const locations = await window.electronAPI?.sslLspDefinition?.(model.uri.toString(), position(cursor));
        if (locations?.length) return await prepareLocations(monaco, locations, true);
      } catch { /* TypeScript core remains the offline fallback. */ }
      const { ast, symbols } = analyze(model);
      const result = findDefinition(documentFor(model), ast, symbols, position(cursor));
      return result ? { uri: monaco.Uri.parse(result.uri), range: range(monaco, result.range) } : null;
    }
  });

  monaco.languages.registerReferenceProvider('ssl', {
    provideReferences: async (model, cursor) => {
      try {
        const locations = await window.electronAPI?.sslLspReferences?.(model.uri.toString(), position(cursor));
        if (locations?.length) return await prepareLocations(monaco, locations);
      } catch { /* TypeScript core remains the offline fallback. */ }
      const { ast, symbols } = analyze(model);
      return findReferences(documentFor(model), ast, symbols, position(cursor)).map((item) => ({
        uri: monaco.Uri.parse(item.uri),
        range: range(monaco, item.range)
      }));
    }
  });

  monaco.languages.registerRenameProvider('ssl', {
    provideRenameEdits: async (model, cursor, newName) => {
      try {
        const nativeEdit = await window.electronAPI?.sslLspRename?.(model.uri.toString(), position(cursor), newName);
        const prepared = await prepareWorkspaceEdit(monaco, nativeEdit || null);
        if (prepared?.edits.length) return prepared;
      } catch { /* TypeScript core remains the offline fallback. */ }
      const { ast, symbols } = analyze(model);
      const edit = getRenameEdits(documentFor(model), ast, symbols, position(cursor), newName);
      return edit ? workspaceEdit(monaco, edit) : { edits: [], rejectReason: 'No renameable SSL symbol at this position.' };
    }
  });

  monaco.languages.registerDocumentHighlightProvider('ssl', {
    provideDocumentHighlights: (model, cursor) => {
      const { ast, symbols } = analyze(model);
      return getDocumentHighlights(documentFor(model), ast, symbols, position(cursor)).map((item) => ({
        range: range(monaco, item.range),
        kind: item.kind === LspDocumentHighlightKind.Write
          ? monaco.languages.DocumentHighlightKind.Write
          : item.kind === LspDocumentHighlightKind.Read
            ? monaco.languages.DocumentHighlightKind.Read
            : monaco.languages.DocumentHighlightKind.Text
      }));
    }
  });

  monaco.languages.registerInlayHintsProvider('ssl', {
    displayName: 'STARLIMS SSL parameter hints',
    provideInlayHints: (model, selectedRange) => {
      const { ast, symbols } = analyze(model);
      const hints = getInlayHints(documentFor(model), ast, symbols, {
        start: { line: selectedRange.startLineNumber - 1, character: selectedRange.startColumn - 1 },
        end: { line: selectedRange.endLineNumber - 1, character: selectedRange.endColumn - 1 }
      }).map((item) => ({
        label: typeof item.label === 'string'
          ? item.label
          : item.label.map((part) => ({ label: part.value, tooltip: typeof part.tooltip === 'string' ? part.tooltip : part.tooltip?.value })),
        position: { lineNumber: item.position.line + 1, column: item.position.character + 1 },
        kind: item.kind === 2 ? monaco.languages.InlayHintKind.Parameter : monaco.languages.InlayHintKind.Type,
        paddingLeft: item.paddingLeft,
        paddingRight: item.paddingRight
      }));
      return { hints, dispose: () => undefined };
    }
  });

  monaco.languages.registerCodeLensProvider('ssl', {
    provideCodeLenses: (model) => {
      const { ast, symbols } = analyze(model);
      return {
        lenses: getCodeLenses(ast, symbols).map((item) => ({
          range: range(monaco, item.range),
          command: item.command ? {
            id: item.command.command,
            title: item.command.title,
            arguments: item.command.arguments
          } : undefined
        })),
        dispose: () => undefined
      };
    }
  });

  monaco.languages.registerCodeActionProvider('ssl', {
    provideCodeActions: (model) => {
      const document = documentFor(model);
      const { ast } = analyze(model);
      const diagnostics = computeStyleDiagnostics(model.getValue(), ast, DEFAULT_STYLE_RULE_CONFIG);
      const actions = computeCodeActions(document, ast, diagnostics, document.uri).map((item) => ({
        title: item.title,
        kind: item.kind,
        isPreferred: item.isPreferred,
        edit: item.edit ? workspaceEdit(monaco, item.edit) : undefined
      }));
      return { actions, dispose: () => undefined };
    }
  }, { providedCodeActionKinds: ['quickfix'] });
}
