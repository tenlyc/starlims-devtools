import { DocumentSymbol, SymbolKind, Range, Position } from 'vscode-languageserver-types';
import { ProgramNode, ProcedureDeclNode, ClassDeclNode, DeclareStmtNode, ASTNode, nodeToRange } from './ast';

export function getDocumentSymbols(ast: ProgramNode): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  for (const node of ast.body) {
    const sym = nodeToDocumentSymbol(node);
    if (sym) {
      symbols.push(sym);
    }
  }

  return symbols;
}

function nodeToDocumentSymbol(node: ASTNode): DocumentSymbol | null {
  switch (node.type) {
    case 'ProcedureDecl': {
      const proc = node as ProcedureDeclNode;
      const range = nodeToRange(proc);
      const selectionRange: Range = {
        start: { line: proc.nameNode.startLine, character: proc.nameNode.startCol },
        end: { line: proc.nameNode.endLine, character: proc.nameNode.endCol },
      };
      const children: DocumentSymbol[] = [];
      if (proc.params) {
        for (const param of proc.params.params) {
          children.push({
            name: param.name,
            kind: SymbolKind.Variable,
            range: nodeToRange(param),
            selectionRange: {
              start: { line: param.startLine, character: param.startCol },
              end: { line: param.endLine, character: param.endCol },
            },
          });
        }
      }
      for (const stmt of proc.body) {
        const child = nodeToDocumentSymbol(stmt);
        if (child) children.push(child);
      }
      return {
        name: proc.name,
        kind: SymbolKind.Function,
        range,
        selectionRange,
        children,
      };
    }
    case 'ClassDecl': {
      const cls = node as ClassDeclNode;
      const range = nodeToRange(cls);
      const selectionRange: Range = {
        start: { line: cls.nameNode.startLine, character: cls.nameNode.startCol },
        end: { line: cls.nameNode.endLine, character: cls.nameNode.endCol },
      };
      const children: DocumentSymbol[] = [];
      for (const member of cls.members) {
        const child = nodeToDocumentSymbol(member);
        if (child) children.push(child);
      }
      return {
        name: cls.name,
        kind: SymbolKind.Class,
        range,
        selectionRange,
        children,
      };
    }
    case 'DeclareStmt': {
      const decl = node as DeclareStmtNode;
      return {
        name: decl.names.join(', '),
        kind: SymbolKind.Variable,
        range: nodeToRange(decl),
        selectionRange: {
          start: { line: decl.startLine, character: decl.startCol },
          end: { line: decl.endLine, character: decl.endCol },
        },
      };
    }
    default:
      return null;
  }
}
