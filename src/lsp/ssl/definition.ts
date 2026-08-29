import { Location, Range, Position } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProgramNode, ASTNode, IdentifierNode, FunctionCallNode, DeclareStmtNode, ProcedureDeclNode } from './ast';
import { SymbolTable } from './symbol-table';
import { getNodeName } from './ast';

export function findDefinition(
  document: TextDocument,
  ast: ProgramNode,
  symbolTable: SymbolTable,
  position: Position
): Location | null {
  const offset = document.offsetAt(position);

  // Find the token at cursor position
  const node = findNodeAtOffset(document, ast, offset);
  if (!node) return null;

  const name = getNodeName(node);
  if (!name) return null;

  // Look up in symbol table
  const symbol = symbolTable.lookupAt(name, node);
  if (!symbol) return null;

  const declNode = symbol.declarationNode;
  const defRange: Range = {
    start: { line: declNode.startLine, character: declNode.startCol },
    end: { line: declNode.endLine, character: declNode.endCol },
  };

  return Location.create(document.uri, defRange);
}

function nodeOffsetStart(document: TextDocument, node: ASTNode): number {
  return document.offsetAt({ line: node.startLine, character: node.startCol });
}

function nodeOffsetEnd(document: TextDocument, node: ASTNode): number {
  return document.offsetAt({ line: node.endLine, character: node.endCol });
}

function findNodeAtOffset(document: TextDocument, node: ASTNode, offset: number): ASTNode | null {
  if (offset < nodeOffsetStart(document, node) || offset > nodeOffsetEnd(document, node)) {
    return null;
  }

  // Check children based on node type
  switch (node.type) {
    case 'Program': {
      const prog = node as ProgramNode;
      for (const child of prog.body) {
        const found = findNodeAtOffset(document, child, offset);
        if (found) return found;
      }
      break;
    }
    case 'ProcedureDecl': {
      const proc = node as ProcedureDeclNode;
      for (const stmt of proc.body) {
        const found = findNodeAtOffset(document, stmt, offset);
        if (found) return found;
      }
      return node;
    }
    case 'FunctionCall': {
      const fc = node as FunctionCallNode;
      for (const arg of fc.args) {
        const found = findNodeAtOffset(document, arg, offset);
        if (found) return found;
      }
      return node;
    }
    case 'BinaryExpr': {
      const bin = node as import('./ast').BinaryExprNode;
      const leftFound = findNodeAtOffset(document, bin.left, offset);
      if (leftFound) return leftFound;
      const rightFound = findNodeAtOffset(document, bin.right, offset);
      if (rightFound) return rightFound;
      break;
    }
    case 'UnaryExpr': {
      const unary = node as import('./ast').UnaryExprNode;
      return findNodeAtOffset(document, unary.operand, offset);
    }
    case 'IfStmt': {
      const ifStmt = node as import('./ast').IfStmtNode;
      const condFound = findNodeAtOffset(document, ifStmt.condition, offset);
      if (condFound) return condFound;
      for (const stmt of ifStmt.thenBody) {
        const found = findNodeAtOffset(document, stmt, offset);
        if (found) return found;
      }
      if (ifStmt.elseBody) {
        for (const stmt of ifStmt.elseBody) {
          const found = findNodeAtOffset(document, stmt, offset);
          if (found) return found;
        }
      }
      break;
    }
    case 'AssignmentStmt': {
      const assign = node as import('./ast').AssignmentStmtNode;
      const targetFound = findNodeAtOffset(document, assign.target, offset);
      if (targetFound) return targetFound;
      const valueFound = findNodeAtOffset(document, assign.value, offset);
      if (valueFound) return valueFound;
      break;
    }
    case 'ExpressionStmt': {
      const expr = node as import('./ast').ExpressionStmtNode;
      return findNodeAtOffset(document, expr.expression, offset);
    }
    case 'MemberAccess': {
      const ma = node as import('./ast').MemberAccessNode;
      return findNodeAtOffset(document, ma.object, offset);
    }
    case 'ArrayAccess': {
      const aa = node as import('./ast').ArrayAccessNode;
      const objFound = findNodeAtOffset(document, aa.object, offset);
      if (objFound) return objFound;
      return findNodeAtOffset(document, aa.index, offset);
    }
    case 'ForStmt': {
      const forNode = node as import('./ast').ForStmtNode;
      const initFound = findNodeAtOffset(document, forNode.init, offset);
      if (initFound) return initFound;
      const toFound = findNodeAtOffset(document, forNode.to, offset);
      if (toFound) return toFound;
      if (forNode.step) {
        const stepFound = findNodeAtOffset(document, forNode.step, offset);
        if (stepFound) return stepFound;
      }
      for (const stmt of forNode.body) {
        const found = findNodeAtOffset(document, stmt, offset);
        if (found) return found;
      }
      break;
    }
    case 'WhileStmt': {
      const whileNode = node as import('./ast').WhileStmtNode;
      const condFound = findNodeAtOffset(document, whileNode.condition, offset);
      if (condFound) return condFound;
      for (const stmt of whileNode.body) {
        const found = findNodeAtOffset(document, stmt, offset);
        if (found) return found;
      }
      break;
    }
    case 'CaseStmt': {
      const caseNode = node as import('./ast').CaseStmtNode;
      for (const branch of caseNode.branches) {
        const found = findNodeAtOffset(document, branch, offset);
        if (found) return found;
      }
      if (caseNode.otherwise) {
        const found = findNodeAtOffset(document, caseNode.otherwise, offset);
        if (found) return found;
      }
      break;
    }
    case 'CaseBranch': {
      const branch = node as import('./ast').CaseBranchNode;
      const condFound = findNodeAtOffset(document, branch.condition, offset);
      if (condFound) return condFound;
      for (const stmt of branch.body) {
        const found = findNodeAtOffset(document, stmt, offset);
        if (found) return found;
      }
      break;
    }
    case 'OtherwiseBranch': {
      const otherwise = node as import('./ast').OtherwiseBranchNode;
      for (const stmt of otherwise.body) {
        const found = findNodeAtOffset(document, stmt, offset);
        if (found) return found;
      }
      break;
    }
    case 'TryStmt': {
      const tryNode = node as import('./ast').TryStmtNode;
      for (const stmt of tryNode.body) {
        const found = findNodeAtOffset(document, stmt, offset);
        if (found) return found;
      }
      if (tryNode.catchBody) {
        for (const stmt of tryNode.catchBody) {
          const found = findNodeAtOffset(document, stmt, offset);
          if (found) return found;
        }
      }
      if (tryNode.finallyBody) {
        for (const stmt of tryNode.finallyBody) {
          const found = findNodeAtOffset(document, stmt, offset);
          if (found) return found;
        }
      }
      break;
    }
    case 'DeclareStmt': {
      const decl = node as DeclareStmtNode;
      for (const nameNode of decl.nameNodes) {
        const found = findNodeAtOffset(document, nameNode, offset);
        if (found) return found;
      }
      break;
    }
    case 'ReturnStmt': {
      const ret = node as import('./ast').ReturnStmtNode;
      if (ret.value) {
        return findNodeAtOffset(document, ret.value, offset);
      }
      break;
    }
    case 'ArrayLiteral': {
      const arr = node as import('./ast').ArrayLiteralNode;
      for (const el of arr.elements) {
        const found = findNodeAtOffset(document, el, offset);
        if (found) return found;
      }
      break;
    }
    case 'Identifier':
    case 'StringLiteral':
    case 'NumberLiteral':
    case 'BooleanLiteral':
    case 'NilLiteral':
    case 'SqlParameter':
    case 'LoopStmt':
      return node;
  }

  return node;
}
