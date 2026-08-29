import type { Range } from 'vscode-languageserver-types';

export type NodeType =
  | 'Program'
  | 'ProcedureDecl'
  | 'ClassDecl'
  | 'IncludeStmt'
  | 'ParamsDecl'
  | 'DefaultDecl'
  | 'IfStmt'
  | 'ForStmt'
  | 'WhileStmt'
  | 'CaseStmt'
  | 'CaseBranch'
  | 'OtherwiseBranch'
  | 'TryStmt'
  | 'DeclareStmt'
  | 'ReturnStmt'
  | 'LoopStmt'
  | 'AssignmentStmt'
  | 'ExpressionStmt'
  | 'BinaryExpr'
  | 'UnaryExpr'
  | 'Identifier'
  | 'MemberAccess'
  | 'ArrayAccess'
  | 'FunctionCall'
  | 'QualifiedCall'
  | 'ArrayLiteral'
  | 'StringLiteral'
  | 'NumberLiteral'
  | 'BooleanLiteral'
  | 'NilLiteral'
  | 'SqlParameter'
  | 'ErrorNode';

export interface ASTNode {
  type: NodeType;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface ProgramNode extends ASTNode {
  type: 'Program';
  body: ASTNode[];
}

export interface ProcedureDeclNode extends ASTNode {
  type: 'ProcedureDecl';
  name: string;
  nameNode: IdentifierNode;
  params?: ParamsDeclNode;
  defaults: DefaultDeclNode[];
  body: ASTNode[];
  endLine: number;
  endCol: number;
}

export interface ClassDeclNode extends ASTNode {
  type: 'ClassDecl';
  name: string;
  nameNode: IdentifierNode;
  inherit?: string;
  members: ASTNode[];
  endLine: number;
  endCol: number;
}

export interface IncludeStmtNode extends ASTNode {
  type: 'IncludeStmt';
  target: string;
}

export interface ParamsDeclNode extends ASTNode {
  type: 'ParamsDecl';
  params: ParamNode[];
}

export interface ParamNode extends ASTNode {
  name: string;
  nameNode: IdentifierNode;
  defaultValue?: ASTNode;
}

export interface DefaultDeclNode extends ASTNode {
  type: 'DefaultDecl';
  name: string;
  nameNode: IdentifierNode;
  value: ASTNode;
}

export interface IfStmtNode extends ASTNode {
  type: 'IfStmt';
  condition: ASTNode;
  thenBody: ASTNode[];
  elseBody?: ASTNode[];
  endLine: number;
  endCol: number;
}

export interface ForStmtNode extends ASTNode {
  type: 'ForStmt';
  init: AssignmentStmtNode;
  to: ASTNode;
  step?: ASTNode;
  body: ASTNode[];
  endLine: number;
  endCol: number;
}

export interface WhileStmtNode extends ASTNode {
  type: 'WhileStmt';
  condition: ASTNode;
  body: ASTNode[];
  endLine: number;
  endCol: number;
}

export interface CaseStmtNode extends ASTNode {
  type: 'CaseStmt';
  branches: CaseBranchNode[];
  otherwise?: OtherwiseBranchNode;
  endLine: number;
  endCol: number;
}

export interface CaseBranchNode extends ASTNode {
  type: 'CaseBranch';
  condition: ASTNode;
  body: ASTNode[];
  hasExitCase: boolean;
}

export interface OtherwiseBranchNode extends ASTNode {
  type: 'OtherwiseBranch';
  body: ASTNode[];
}

export interface TryStmtNode extends ASTNode {
  type: 'TryStmt';
  body: ASTNode[];
  catchBody?: ASTNode[];
  finallyBody?: ASTNode[];
  endLine: number;
  endCol: number;
}

export interface DeclareStmtNode extends ASTNode {
  type: 'DeclareStmt';
  names: string[];
  nameNodes: IdentifierNode[];
}

export interface ReturnStmtNode extends ASTNode {
  type: 'ReturnStmt';
  value?: ASTNode;
}

export interface LoopStmtNode extends ASTNode {
  type: 'LoopStmt';
}

export interface AssignmentStmtNode extends ASTNode {
  type: 'AssignmentStmt';
  target: ASTNode;
  value: ASTNode;
}

export interface ExpressionStmtNode extends ASTNode {
  type: 'ExpressionStmt';
  expression: ASTNode;
}

export interface BinaryExprNode extends ASTNode {
  type: 'BinaryExpr';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryExprNode extends ASTNode {
  type: 'UnaryExpr';
  operator: string;
  operand: ASTNode;
}

export interface IdentifierNode extends ASTNode {
  type: 'Identifier';
  name: string;
}

export interface MemberAccessNode extends ASTNode {
  type: 'MemberAccess';
  object: ASTNode;
  property: string;
  propertyNode: IdentifierNode;
  isMethodCall: boolean;
  args?: ASTNode[];
}

export interface ArrayAccessNode extends ASTNode {
  type: 'ArrayAccess';
  object: ASTNode;
  index: ASTNode;
  index2?: ASTNode;
}

export interface FunctionCallNode extends ASTNode {
  type: 'FunctionCall';
  name: string;
  nameNode: IdentifierNode;
  args: ASTNode[];
}

export interface QualifiedCallNode extends ASTNode {
  type: 'QualifiedCall';
  module: string;
  function: string;
  parts: string[];
  args: ASTNode[];
}

export interface ArrayLiteralNode extends ASTNode {
  type: 'ArrayLiteral';
  elements: ASTNode[];
}

export interface StringLiteralNode extends ASTNode {
  type: 'StringLiteral';
  value: string;
  params: SqlParameterNode[];
}

export interface NumberLiteralNode extends ASTNode {
  type: 'NumberLiteral';
  value: string;
  isFloat: boolean;
}

export interface BooleanLiteralNode extends ASTNode {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface NilLiteralNode extends ASTNode {
  type: 'NilLiteral';
}

export interface SqlParameterNode extends ASTNode {
  type: 'SqlParameter';
  name: string;
}

export interface ErrorNode extends ASTNode {
  type: 'ErrorNode';
  message: string;
}

export function nodeToRange(node: ASTNode): Range {
  return {
    start: { line: node.startLine, character: node.startCol },
    end: { line: node.endLine, character: node.endCol }
  };
}

export function getNodeName(node: ASTNode): string | undefined {
  switch (node.type) {
    case 'ProcedureDecl':
      return (node as ProcedureDeclNode).name;
    case 'ClassDecl':
      return (node as ClassDeclNode).name;
    case 'Identifier':
      return (node as IdentifierNode).name;
    case 'FunctionCall':
      return (node as FunctionCallNode).name;
    case 'DeclareStmt':
      return (node as DeclareStmtNode).names.join(', ');
    case 'MemberAccess':
      return (node as MemberAccessNode).property;
    default:
      return undefined;
  }
}
