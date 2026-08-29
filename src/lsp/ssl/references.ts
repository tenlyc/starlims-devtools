import { Location, Range, Position } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProgramNode, ASTNode, IdentifierNode, FunctionCallNode } from './ast';
import { SymbolTable } from './symbol-table';

export function findReferences(
  document: TextDocument,
  ast: ProgramNode,
  symbolTable: SymbolTable,
  position: Position
): Location[] {
  const offset = document.offsetAt(position);

  // Find the identifier at cursor
  const node = findIdentifierAtOffset(document, ast, offset);
  if (!node) return [];

  const name = node.name;
  if (!name) return [];

  // Get all references from symbol table
  const refs = symbolTable.getReferences(name);
  const locations: Location[] = [];

  for (const ref of refs) {
    const refNode = ref.node;
    const range: Range = {
      start: { line: refNode.startLine, character: refNode.startCol },
      end: { line: refNode.endLine, character: refNode.endCol },
    };
    locations.push(Location.create(document.uri, range));
  }

  return locations;
}

function nodeInRange(document: TextDocument, node: ASTNode, offset: number): boolean {
  const start = document.offsetAt({ line: node.startLine, character: node.startCol });
  const end = document.offsetAt({ line: node.endLine, character: node.endCol });
  return offset >= start && offset <= end;
}

export function findIdentifierAtOffset(document: TextDocument, node: ASTNode, offset: number): IdentifierNode | null {
  switch (node.type) {
    case 'Identifier': {
      if (nodeInRange(document, node, offset)) {
        return node as IdentifierNode;
      }
      return null;
    }
    case 'FunctionCall': {
      const fc = node as FunctionCallNode;
      if (nodeInRange(document, fc.nameNode, offset)) {
        return fc.nameNode;
      }
      for (const arg of fc.args) {
        const found = findIdentifierAtOffset(document, arg, offset);
        if (found) return found;
      }
      return null;
    }
    case 'Program': {
      const prog = node as ProgramNode;
      for (const child of prog.body) {
        const found = findIdentifierAtOffset(document, child, offset);
        if (found) return found;
      }
      return null;
    }
    case 'ProcedureDecl': {
      const proc = node as import('./ast').ProcedureDeclNode;
      if (nodeInRange(document, proc.nameNode, offset)) {
        return proc.nameNode;
      }
      for (const stmt of proc.body) {
        const found = findIdentifierAtOffset(document, stmt, offset);
        if (found) return found;
      }
      return null;
    }
    case 'BinaryExpr': {
      const bin = node as import('./ast').BinaryExprNode;
      const leftFound = findIdentifierAtOffset(document, bin.left, offset);
      if (leftFound) return leftFound;
      return findIdentifierAtOffset(document, bin.right, offset);
    }
    case 'UnaryExpr': {
      const unary = node as import('./ast').UnaryExprNode;
      return findIdentifierAtOffset(document, unary.operand, offset);
    }
    case 'MemberAccess': {
      const ma = node as import('./ast').MemberAccessNode;
      return findIdentifierAtOffset(document, ma.object, offset);
    }
    case 'AssignmentStmt': {
      const assign = node as import('./ast').AssignmentStmtNode;
      const targetFound = findIdentifierAtOffset(document, assign.target, offset);
      if (targetFound) return targetFound;
      return findIdentifierAtOffset(document, assign.value, offset);
    }
    case 'ExpressionStmt': {
      const expr = node as import('./ast').ExpressionStmtNode;
      return findIdentifierAtOffset(document, expr.expression, offset);
    }
    case 'IfStmt': {
      const ifNode = node as import('./ast').IfStmtNode;
      const condFound = findIdentifierAtOffset(document, ifNode.condition, offset);
      if (condFound) return condFound;
      for (const stmt of ifNode.thenBody) {
        const found = findIdentifierAtOffset(document, stmt, offset);
        if (found) return found;
      }
      if (ifNode.elseBody) {
        for (const stmt of ifNode.elseBody) {
          const found = findIdentifierAtOffset(document, stmt, offset);
          if (found) return found;
        }
      }
      return null;
    }
    case 'ForStmt': {
      const forNode = node as import('./ast').ForStmtNode;
      const initFound = findIdentifierAtOffset(document, forNode.init, offset);
      if (initFound) return initFound;
      const toFound = findIdentifierAtOffset(document, forNode.to, offset);
      if (toFound) return toFound;
      if (forNode.step) {
        const stepFound = findIdentifierAtOffset(document, forNode.step, offset);
        if (stepFound) return stepFound;
      }
      for (const stmt of forNode.body) {
        const found = findIdentifierAtOffset(document, stmt, offset);
        if (found) return found;
      }
      return null;
    }
    case 'WhileStmt': {
      const whileNode = node as import('./ast').WhileStmtNode;
      const condFound = findIdentifierAtOffset(document, whileNode.condition, offset);
      if (condFound) return condFound;
      for (const stmt of whileNode.body) {
        const found = findIdentifierAtOffset(document, stmt, offset);
        if (found) return found;
      }
      return null;
    }
    case 'CaseStmt': {
      const caseNode = node as import('./ast').CaseStmtNode;
      for (const branch of caseNode.branches) {
        const found = findIdentifierAtOffset(document, branch, offset);
        if (found) return found;
      }
      if (caseNode.otherwise) {
        const found = findIdentifierAtOffset(document, caseNode.otherwise, offset);
        if (found) return found;
      }
      return null;
    }
    case 'CaseBranch': {
      const branch = node as import('./ast').CaseBranchNode;
      const condFound = findIdentifierAtOffset(document, branch.condition, offset);
      if (condFound) return condFound;
      for (const stmt of branch.body) {
        const found = findIdentifierAtOffset(document, stmt, offset);
        if (found) return found;
      }
      return null;
    }
    case 'OtherwiseBranch': {
      const otherwise = node as import('./ast').OtherwiseBranchNode;
      for (const stmt of otherwise.body) {
        const found = findIdentifierAtOffset(document, stmt, offset);
        if (found) return found;
      }
      return null;
    }
    case 'TryStmt': {
      const tryNode = node as import('./ast').TryStmtNode;
      for (const stmt of tryNode.body) {
        const found = findIdentifierAtOffset(document, stmt, offset);
        if (found) return found;
      }
      if (tryNode.catchBody) {
        for (const stmt of tryNode.catchBody) {
          const found = findIdentifierAtOffset(document, stmt, offset);
          if (found) return found;
        }
      }
      if (tryNode.finallyBody) {
        for (const stmt of tryNode.finallyBody) {
          const found = findIdentifierAtOffset(document, stmt, offset);
          if (found) return found;
        }
      }
      return null;
    }
    case 'DeclareStmt': {
      const decl = node as import('./ast').DeclareStmtNode;
      for (const nameNode of decl.nameNodes) {
        const found = findIdentifierAtOffset(document, nameNode, offset);
        if (found) return found;
      }
      return null;
    }
    case 'ReturnStmt': {
      const ret = node as import('./ast').ReturnStmtNode;
      if (ret.value) {
        return findIdentifierAtOffset(document, ret.value, offset);
      }
      return null;
    }
    case 'ArrayAccess': {
      const aa = node as import('./ast').ArrayAccessNode;
      const objFound = findIdentifierAtOffset(document, aa.object, offset);
      if (objFound) return objFound;
      return findIdentifierAtOffset(document, aa.index, offset);
    }
    case 'ArrayLiteral': {
      const arr = node as import('./ast').ArrayLiteralNode;
      for (const el of arr.elements) {
        const found = findIdentifierAtOffset(document, el, offset);
        if (found) return found;
      }
      return null;
    }
    default:
      return null;
  }
}
