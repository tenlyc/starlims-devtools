import {
  DocumentHighlight,
  DocumentHighlightKind,
  WorkspaceEdit,
  TextEdit,
  Position,
  Range,
  InlayHint,
  InlayHintKind,
  CodeLens,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  SymbolKind,
} from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProgramNode, ASTNode, ProcedureDeclNode, FunctionCallNode, DeclareStmtNode } from './ast';
import { SymbolTable, SymbolInfo } from './symbol-table';
import { findIdentifierAtOffset } from './references';
import { getBuiltinFunction } from './builtins';

function nodeRange(node: ASTNode): Range {
  return {
    start: { line: node.startLine, character: node.startCol },
    end: { line: node.endLine, character: node.endCol },
  };
}

function collectWriteRanges(ast: ProgramNode): Set<string> {
  const writes = new Set<string>();
  const visit = (node: ASTNode): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (node.type === 'DeclareStmt') {
      for (const nameNode of (node as DeclareStmtNode).nameNodes) {
        writes.add(`${nameNode.startLine}:${nameNode.startCol}`);
      }
    }
    if (node.type === 'AssignmentStmt') {
      const target = (node as import('./ast').AssignmentStmtNode).target;
      collectIdentifiers(target, writes);
    }
    for (const key of Object.keys(node)) {
      const v = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && 'type' in item) {
            visit(item as ASTNode);
          }
        }
      } else if (v && typeof v === 'object' && 'type' in v) {
        visit(v as ASTNode);
      }
    }
  };
  visit(ast);
  return writes;
}

function collectIdentifiers(node: ASTNode, out: Set<string>): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (node.type === 'Identifier') {
    out.add(`${node.startLine}:${node.startCol}`);
    return;
  }
  if (node.type === 'ArrayAccess') {
    collectIdentifiers((node as import('./ast').ArrayAccessNode).object, out);
    return;
  }
  if (node.type === 'MemberAccess') {
    collectIdentifiers((node as import('./ast').MemberAccessNode).object, out);
    return;
  }
}

// ---------------------------------------------------------------------------
// Document highlights
// ---------------------------------------------------------------------------

export function getDocumentHighlights(
  document: TextDocument,
  ast: ProgramNode,
  symbolTable: SymbolTable,
  position: Position
): DocumentHighlight[] {
  const offset = document.offsetAt(position);
  const node = findIdentifierAtOffset(document, ast, offset);
  if (!node) {
    return [];
  }
  const name = node.name;
  const refs = symbolTable.getReferences(name);
  const writes = collectWriteRanges(ast);
  const highlights: DocumentHighlight[] = [];

  for (const ref of refs) {
    const key = `${ref.node.startLine}:${ref.node.startCol}`;
    highlights.push({
      range: nodeRange(ref.node),
      kind: writes.has(key) ? DocumentHighlightKind.Write : DocumentHighlightKind.Text,
    });
  }
  return highlights;
}

// ---------------------------------------------------------------------------
// Rename
// ---------------------------------------------------------------------------

export function getRenameEdits(
  document: TextDocument,
  ast: ProgramNode,
  symbolTable: SymbolTable,
  position: Position,
  newName: string
): WorkspaceEdit | null {
  const offset = document.offsetAt(position);
  const node = findIdentifierAtOffset(document, ast, offset);
  if (!node) {
    return null;
  }
  const name = node.name;
  const edits: TextEdit[] = [];

  const symbol = symbolTable.lookupAt(name, node);
  if (symbol) {
    edits.push(TextEdit.replace(nodeRange(symbol.declarationNode), newName));
  }
  for (const ref of symbolTable.getReferences(name)) {
    edits.push(TextEdit.replace(nodeRange(ref.node), newName));
  }
  if (edits.length === 0) {
    return null;
  }
  return {
    changes: {
      [document.uri]: edits,
    },
  };
}

// ---------------------------------------------------------------------------
// Inlay hints (parameter names at call sites)
// ---------------------------------------------------------------------------

export function getInlayHints(
  document: TextDocument,
  ast: ProgramNode,
  symbolTable: SymbolTable,
  range: Range
): InlayHint[] {
  const hints: InlayHint[] = [];
  const visit = (node: ASTNode): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (node.type === 'FunctionCall') {
      const call = node as FunctionCallNode;
      const params = resolveParamNames(call.name, symbolTable);
      for (let i = 0; i < call.args.length && i < params.length; i++) {
        const arg = call.args[i];
        if (arg.startLine < range.start.line || arg.startLine > range.end.line) {
          continue;
        }
        hints.push({
          position: { line: arg.startLine, character: arg.startCol },
          label: params[i] + ':',
          kind: InlayHintKind.Parameter,
          paddingLeft: true,
        });
      }
    }
    if (node.type === 'MemberAccess') {
      const ma = node as import('./ast').MemberAccessNode;
      if (ma.isMethodCall && ma.args) {
        const params = resolveParamNames(ma.property, symbolTable);
        for (let i = 0; i < ma.args.length && i < params.length; i++) {
          const arg = ma.args[i];
          if (arg.startLine < range.start.line || arg.startLine > range.end.line) {
            continue;
          }
          hints.push({
            position: { line: arg.startLine, character: arg.startCol },
            label: params[i] + ':',
            kind: InlayHintKind.Parameter,
            paddingLeft: true,
          });
        }
      }
    }
    for (const key of Object.keys(node)) {
      const v = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && 'type' in item) {
            visit(item as ASTNode);
          }
        }
      } else if (v && typeof v === 'object' && 'type' in v) {
        visit(v as ASTNode);
      }
    }
  };
  visit(ast);
  return hints;
}

function resolveParamNames(name: string, symbolTable: SymbolTable): string[] {
  const builtins = getBuiltinFunction(name);
  if (builtins && builtins.length > 0) {
    return builtins[0].parameters.map((p) => p.name);
  }
  const symbol = symbolTable.lookup(name);
  if (symbol && symbol.kind === 'procedure') {
    const decl = symbol.declarationNode as ProcedureDeclNode;
    return decl.params ? decl.params.params.map((p) => p.name) : [];
  }
  return [];
}

// ---------------------------------------------------------------------------
// CodeLens (reference counts above procedures)
// ---------------------------------------------------------------------------

export function getCodeLenses(ast: ProgramNode, symbolTable: SymbolTable): CodeLens[] {
  const lenses: CodeLens[] = [];
  const visit = (node: ASTNode): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (node.type === 'ProcedureDecl') {
      const proc = node as ProcedureDeclNode;
      const count = symbolTable.getReferences(proc.name).length;
      if (count > 0) {
        lenses.push({
          range: nodeRange(proc.nameNode),
          command: {
            title: `${count} reference${count === 1 ? '' : 's'}`,
            command: 'starlimsSslLsp.noop',
          },
        });
      }
    }
    for (const key of Object.keys(node)) {
      const v = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && 'type' in item) {
            visit(item as ASTNode);
          }
        }
      } else if (v && typeof v === 'object' && 'type' in v) {
        visit(v as ASTNode);
      }
    }
  };
  visit(ast);
  return lenses;
}

// ---------------------------------------------------------------------------
// Call hierarchy
// ---------------------------------------------------------------------------

function procedureItem(proc: ProcedureDeclNode, uri: string): CallHierarchyItem {
  return {
    name: proc.name,
    kind: SymbolKind.Function,
    uri,
    range: nodeRange(proc),
    selectionRange: nodeRange(proc.nameNode),
  };
}

function findProcedureAtPosition(
  ast: ProgramNode,
  position: Position
): ProcedureDeclNode | null {
  let found: ProcedureDeclNode | null = null;
  const visit = (node: ASTNode): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (node.type === 'ProcedureDecl') {
      const proc = node as ProcedureDeclNode;
      if (position.line >= proc.startLine && position.line <= proc.endLine) {
        if (!found || proc.startLine > found.startLine) {
          found = proc;
        }
      }
    }
    for (const key of Object.keys(node)) {
      const v = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && 'type' in item) {
            visit(item as ASTNode);
          }
        }
      } else if (v && typeof v === 'object' && 'type' in v) {
        visit(v as ASTNode);
      }
    }
  };
  visit(ast);
  return found;
}

function enclosingProcedure(ast: ProgramNode, node: ASTNode): ProcedureDeclNode | null {
  return findProcedureAtPosition(ast, { line: node.startLine, character: node.startCol });
}

function proceduresByName(ast: ProgramNode): Map<string, ProcedureDeclNode> {
  const map = new Map<string, ProcedureDeclNode>();
  const visit = (node: ASTNode): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (node.type === 'ProcedureDecl') {
      const proc = node as ProcedureDeclNode;
      map.set(proc.name.toLowerCase(), proc);
    }
    for (const key of Object.keys(node)) {
      const v = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && 'type' in item) {
            visit(item as ASTNode);
          }
        }
      } else if (v && typeof v === 'object' && 'type' in v) {
        visit(v as ASTNode);
      }
    }
  };
  visit(ast);
  return map;
}

export function prepareCallHierarchy(
  document: TextDocument,
  ast: ProgramNode,
  position: Position
): CallHierarchyItem[] | null {
  const proc = findProcedureAtPosition(ast, position);
  if (!proc) {
    return null;
  }
  return [procedureItem(proc, document.uri)];
}

export function getIncomingCalls(
  document: TextDocument,
  ast: ProgramNode,
  symbolTable: SymbolTable,
  item: CallHierarchyItem
): CallHierarchyIncomingCall[] {
  const calls: CallHierarchyIncomingCall[] = [];
  for (const ref of symbolTable.getReferences(item.name)) {
    const caller = enclosingProcedure(ast, ref.node);
    if (!caller || caller.name.toLowerCase() === item.name.toLowerCase()) {
      continue;
    }
    calls.push({
      from: procedureItem(caller, document.uri),
      fromRanges: [nodeRange(ref.node)],
    });
  }
  return calls;
}

export function getOutgoingCalls(
  document: TextDocument,
  ast: ProgramNode,
  symbolTable: SymbolTable,
  item: CallHierarchyItem
): CallHierarchyOutgoingCall[] {
  const proc = findProcedureAtPosition(ast, {
    line: item.selectionRange.start.line,
    character: item.selectionRange.start.character,
  });
  if (!proc) {
    return [];
  }
  const byName = proceduresByName(ast);
  const calls: CallHierarchyOutgoingCall[] = [];
  const seen = new Map<string, Range[]>();

  const visitBody = (node: ASTNode): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (node.type === 'FunctionCall') {
      const call = node as FunctionCallNode;
      const target = byName.get(call.name.toLowerCase());
      if (target && target.name.toLowerCase() !== proc.name.toLowerCase()) {
        const key = target.name.toLowerCase();
        const ranges = seen.get(key) || [];
        ranges.push(nodeRange(call.nameNode));
        seen.set(key, ranges);
      }
    }
    for (const key of Object.keys(node)) {
      const v = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && 'type' in item) {
            visitBody(item as ASTNode);
          }
        }
      } else if (v && typeof v === 'object' && 'type' in v) {
        visitBody(v as ASTNode);
      }
    }
  };
  for (const stmt of proc.body) {
    visitBody(stmt);
  }

  for (const [key, ranges] of seen) {
    const target = byName.get(key)!;
    calls.push({
      to: procedureItem(target, document.uri),
      fromRanges: ranges,
    });
  }
  return calls;
}

export function procedureSymbolInfo(
  symbolTable: SymbolTable,
  name: string
): SymbolInfo | undefined {
  return symbolTable.lookup(name);
}
