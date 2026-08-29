import { FoldingRange } from 'vscode-languageserver-types';
import { ProgramNode, ASTNode, ProcedureDeclNode, ClassDeclNode, IfStmtNode, ForStmtNode, WhileStmtNode, CaseStmtNode, TryStmtNode } from './ast';

export function getFoldingRanges(ast: ProgramNode): FoldingRange[] {
  const ranges: FoldingRange[] = [];
  collectFoldingRanges(ast, ranges);
  return ranges;
}

function collectFoldingRanges(node: ASTNode, ranges: FoldingRange[]): void {
  switch (node.type) {
    case 'Program': {
      const prog = node as ProgramNode;
      for (const child of prog.body) {
        collectFoldingRanges(child, ranges);
      }
      break;
    }
    case 'ProcedureDecl': {
      const proc = node as ProcedureDeclNode;
      addRange(proc.startLine, proc.endLine, ranges);
      for (const stmt of proc.body) {
        collectFoldingRanges(stmt, ranges);
      }
      break;
    }
    case 'ClassDecl': {
      const cls = node as ClassDeclNode;
      addRange(cls.startLine, cls.endLine, ranges);
      for (const member of cls.members) {
        collectFoldingRanges(member, ranges);
      }
      break;
    }
    case 'IfStmt': {
      const ifStmt = node as IfStmtNode;
      addRange(ifStmt.startLine, ifStmt.endLine, ranges);
      for (const stmt of ifStmt.thenBody) {
        collectFoldingRanges(stmt, ranges);
      }
      if (ifStmt.elseBody) {
        for (const stmt of ifStmt.elseBody) {
          collectFoldingRanges(stmt, ranges);
        }
      }
      break;
    }
    case 'ForStmt': {
      const forStmt = node as ForStmtNode;
      addRange(forStmt.startLine, forStmt.endLine, ranges);
      for (const stmt of forStmt.body) {
        collectFoldingRanges(stmt, ranges);
      }
      break;
    }
    case 'WhileStmt': {
      const whileStmt = node as WhileStmtNode;
      addRange(whileStmt.startLine, whileStmt.endLine, ranges);
      for (const stmt of whileStmt.body) {
        collectFoldingRanges(stmt, ranges);
      }
      break;
    }
    case 'CaseStmt': {
      const caseStmt = node as CaseStmtNode;
      addRange(caseStmt.startLine, caseStmt.endLine, ranges);
      for (const branch of caseStmt.branches) {
        addRange(branch.startLine, branch.endLine, ranges);
        for (const stmt of branch.body) {
          collectFoldingRanges(stmt, ranges);
        }
      }
      if (caseStmt.otherwise) {
        addRange(caseStmt.otherwise.startLine, caseStmt.otherwise.endLine, ranges);
        for (const stmt of caseStmt.otherwise.body) {
          collectFoldingRanges(stmt, ranges);
        }
      }
      break;
    }
    case 'TryStmt': {
      const tryStmt = node as TryStmtNode;
      addRange(tryStmt.startLine, tryStmt.endLine, ranges);
      for (const stmt of tryStmt.body) {
        collectFoldingRanges(stmt, ranges);
      }
      if (tryStmt.catchBody) {
        for (const stmt of tryStmt.catchBody) {
          collectFoldingRanges(stmt, ranges);
        }
      }
      if (tryStmt.finallyBody) {
        for (const stmt of tryStmt.finallyBody) {
          collectFoldingRanges(stmt, ranges);
        }
      }
      break;
    }
  }
}

function addRange(startLine: number, endLine: number, ranges: FoldingRange[]): void {
  if (endLine > startLine) {
    ranges.push({
      startLine,
      endLine,
    });
  }
}
