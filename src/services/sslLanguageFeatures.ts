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
const modelListeners = new Map<string, Monaco.IDisposable>();
const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

function validate(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  if (model.isDisposed() || model.getLanguageId() !== 'ssl') return;
  try {
    const { ast, errors } = analyze(model);
    const diagnostics = [
      ...computeDiagnostics(errors),
      ...computeStyleDiagnostics(model.getValue(), ast, DEFAULT_STYLE_RULE_CONFIG)
    ];
    monaco.editor.setModelMarkers(model, OWNER, diagnostics.map((item) => ({
      severity: severity(monaco, item.severity),
      message: typeof item.message === 'string' ? item.message : item.message.value,
      source: item.source || OWNER,
      code: typeof item.code === 'string' || typeof item.code === 'number' ? String(item.code) : undefined,
      startLineNumber: item.range.start.line + 1,
      startColumn: item.range.start.character + 1,
      endLineNumber: item.range.end.line + 1,
      endColumn: Math.max(item.range.start.character + 2, item.range.end.character + 1)
    })));
  } catch (error) {
    monaco.editor.setModelMarkers(model, OWNER, [{
      severity: monaco.MarkerSeverity.Error,
      message: error instanceof Error ? error.message : String(error),
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
      source: OWNER
    }]);
  }
}

function scheduleValidation(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  const key = model.uri.toString();
  const previous = validationTimers.get(key);
  if (previous) clearTimeout(previous);
  validationTimers.set(key, setTimeout(() => {
    validationTimers.delete(key);
    validate(monaco, model);
  }, 250));
}

function attachModel(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  const key = model.uri.toString();
  modelListeners.get(key)?.dispose();
  if (model.getLanguageId() !== 'ssl') {
    monaco.editor.setModelMarkers(model, OWNER, []);
    modelListeners.delete(key);
    return;
  }
  modelListeners.set(key, model.onDidChangeContent(() => scheduleValidation(monaco, model)));
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
  });

  monaco.languages.registerDocumentFormattingEditProvider('ssl', {
    provideDocumentFormattingEdits: (model) => {
      const text = formatSSL(model.getValue(), DEFAULT_FORMAT_OPTIONS);
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
      if (!result) return null;
      return { contents: markdown(result.contents), range: result.range ? range(monaco, result.range) : undefined };
    }
  });

  monaco.languages.registerSignatureHelpProvider('ssl', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp: (model, position) => {
      const { symbols } = analyze(model);
      const result = getSignatureHelp(documentFor(model), symbols, { line: position.lineNumber - 1, character: position.column - 1 });
      if (!result) return null;
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
      const keywordItems = KEYWORDS.map((label) => ({ label, kind: monaco.languages.CompletionItemKind.Keyword, insertText: label, range: replaceRange }));
      const builtinItems = getAllBuiltinNames().map((label) => {
        const item = getBuiltinFunction(label)?.[0];
        return {
          label,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: label,
          detail: item ? `${item.library} — ${item.signature}` : 'SSL builtin',
          documentation: item?.description,
          range: replaceRange
        };
      });
      return { suggestions: [...keywordItems, ...builtinItems] };
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
    provideDefinition: (model, cursor) => {
      const { ast, symbols } = analyze(model);
      const result = findDefinition(documentFor(model), ast, symbols, position(cursor));
      return result ? { uri: monaco.Uri.parse(result.uri), range: range(monaco, result.range) } : null;
    }
  });

  monaco.languages.registerReferenceProvider('ssl', {
    provideReferences: (model, cursor) => {
      const { ast, symbols } = analyze(model);
      return findReferences(documentFor(model), ast, symbols, position(cursor)).map((item) => ({
        uri: monaco.Uri.parse(item.uri),
        range: range(monaco, item.range)
      }));
    }
  });

  monaco.languages.registerRenameProvider('ssl', {
    provideRenameEdits: (model, cursor, newName) => {
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
