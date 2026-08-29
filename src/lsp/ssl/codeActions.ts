import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  Position,
  Range,
  TextEdit,
} from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SSLLexer, TokenType, Token } from './lexer';
import { ProgramNode, CaseStmtNode } from './ast';

function tokenAt(tokens: Token[], line: number, character: number): Token | undefined {
  return tokens.find(
    (t) => t.line === line && character >= t.column && character < t.column + t.length
  );
}

function lineStartOffset(text: string, line: number): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < line && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  return offset;
}

function lineTextAt(text: string, line: number): string {
  const lines = text.split(/\r?\n/);
  return lines[line] ?? '';
}

function eolOf(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function quickFixFor(slug: string, diag: Diagnostic, text: string, ast: ProgramNode, uri: string): CodeAction | undefined {
  const pos = diag.range.start;
  const lexer = new SSLLexer(text);
  const tokens = lexer.tokenize().filter((t) => t.type !== TokenType.Eof);
  const token = tokenAt(tokens, pos.line, pos.character);

  switch (slug) {
    case 'keyword_uppercase': {
      if (!token || !token.value.startsWith(':')) {
        return undefined;
      }
      return {
        title: `Uppercase keyword '${token.value}'`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [uri]: [TextEdit.replace(tokenRange(token), token.value.toUpperCase())],
          },
        },
      };
    }
    case 'not_preferred_operator':
      if (!token) {
        return undefined;
      }
      return {
        title: `Replace '${token.value}' with '!='`,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [uri]: [TextEdit.replace(tokenRange(token), '!=')],
          },
        },
      };
    case 'dot_property_access':
      if (!token || token.type !== TokenType.Dot) {
        return undefined;
      }
      return {
        title: "Replace '.' with ':' for property access",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [uri]: [TextEdit.replace(tokenRange(token), ':')],
          },
        },
      };
    case 'equals_vs_strict_equals':
      if (!token || token.type !== TokenType.SingleEquals) {
        return undefined;
      }
      return {
        title: "Replace '=' with '=='",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [uri]: [TextEdit.replace(tokenRange(token), '==')],
          },
        },
      };
    case 'step_spacing':
      if (!token) {
        return undefined;
      }
      return {
        title: "Insert a space before ':STEP'",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [uri]: [TextEdit.insert({ line: token.line, character: token.column }, ' ')],
          },
        },
      };
    case 'comment_termination': {
      if (!token || token.type !== TokenType.Comment) {
        return undefined;
      }
      const insertPos: Position = { line: token.line, character: token.column + token.length };
      return {
        title: "Append ';' to terminate the comment",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [uri]: [TextEdit.insert(insertPos, ';')],
          },
        },
      };
    }
    case 'redeclare_is_noop': {
      if (!token || token.type !== TokenType.Identifier) {
        return undefined;
      }
      const lineText = lineTextAt(text, pos.line);
      const onlyName = new RegExp(`^\\s*:DECLARE\\b[^;]*\\b${escapeRegExp(token.value)}\\b[^,;]*;\\s*$`, 'i');
      if (onlyName.test(lineText)) {
        return {
          title: `Remove redundant :DECLARE of '${token.value}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diag],
          edit: {
            changes: {
              [uri]: [TextEdit.del(Range.create(pos.line, 0, pos.line, lineText.length))],
            },
          },
        };
      }
      const commaBefore = tokens.find(
        (t) => t.line === pos.line && t.type === TokenType.Comma && t.column < token.column
      );
      const commaAfter = tokens.find(
        (t) => t.line === pos.line && t.type === TokenType.Comma && t.column > token.column
      );
      if (commaAfter) {
        const range = Range.create(token.line, token.column, token.line, commaAfter.column + 1);
        return {
          title: `Remove redundant declaration of '${token.value}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diag],
          edit: { changes: { [uri]: [TextEdit.del(range)] } },
        };
      }
      if (commaBefore) {
        const range = Range.create(token.line, commaBefore.column, token.line, token.column + token.length);
        return {
          title: `Remove redundant declaration of '${token.value}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diag],
          edit: { changes: { [uri]: [TextEdit.del(range)] } },
        };
      }
      return undefined;
    }
    case 'missing_otherwise': {
      const caseNode = findCaseNodeAt(ast, pos);
      if (!caseNode) {
        return undefined;
      }
      const endCaseLine = caseNode.endLine;
      const line = lineTextAt(text, endCaseLine);
      const indentMatch = line.match(/^\s*/);
      const indent = indentMatch ? indentMatch[0] : '';
      return {
        title: "Insert ':OTHERWISE;' before :ENDCASE",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [uri]: [
              TextEdit.insert(
                { line: endCaseLine, character: 0 },
                indent + ':OTHERWISE;' + eolOf(text)
              ),
            ],
          },
        },
      };
    }
    default:
      return undefined;
  }
}

function tokenRange(token: Token): Range {
  return Range.create(token.line, token.column, token.line, token.column + token.length);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findCaseNodeAt(ast: ProgramNode, pos: Position): CaseStmtNode | undefined {
  let found: CaseStmtNode | undefined;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const n = node as { type?: string; startLine?: number; endLine?: number };
    if (n.type === 'CaseStmt' && n.startLine !== undefined && n.endLine !== undefined &&
        pos.line >= n.startLine && pos.line <= n.endLine) {
      if (!found || n.endLine > found.endLine) {
        found = n as CaseStmtNode;
      }
    }
    for (const key of Object.keys(node)) {
      const v = (node as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        v.forEach(visit);
      } else if (v && typeof v === 'object') {
        visit(v);
      }
    }
  };
  visit(ast);
  return found;
}

function suppressActions(slug: string, diag: Diagnostic, text: string, uri: string): CodeAction[] {
  const actions: CodeAction[] = [];

  // /* @ssl-disable-next-line <slug>; on the line before the diagnostic */
  const insertOffset = lineStartOffset(text, diag.range.start.line);
  actions.push({
    title: `Suppress '${slug}' on this line`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit: {
      changes: {
        [uri]: [TextEdit.insert({ line: diag.range.start.line, character: 0 }, `/* @ssl-disable-next-line ${slug};${eolOf(text)}`)],
      },
    },
  });

  actions.push({
    title: `Suppress '${slug}' for this file`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit: {
      changes: {
        [uri]: [TextEdit.insert({ line: 0, character: 0 }, `/* @ssl-disable ${slug};${eolOf(text)}`)],
      },
    },
  });

  return actions;
}

export function computeCodeActions(
  document: TextDocument,
  ast: ProgramNode,
  diagnostics: Diagnostic[],
  uri: string
): CodeAction[] {
  const text = document.getText();
  const actions: CodeAction[] = [];
  for (const diag of diagnostics) {
    const slug = typeof diag.code === 'string' ? diag.code : undefined;
    if (!slug) {
      continue;
    }
    const fix = quickFixFor(slug, diag, text, ast, uri);
    if (fix) {
      actions.push(fix);
    }
    actions.push(...suppressActions(slug, diag, text, uri));
  }
  return actions;
}
