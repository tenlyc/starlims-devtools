import { Token, TokenType, SSLLexer } from './lexer';
import {
  ProgramNode, ProcedureDeclNode, ClassDeclNode, IncludeStmtNode,
  ParamsDeclNode, ParamNode, DefaultDeclNode,
  IfStmtNode, ForStmtNode, WhileStmtNode,
  CaseStmtNode, CaseBranchNode, OtherwiseBranchNode,
  TryStmtNode, DeclareStmtNode, ReturnStmtNode, LoopStmtNode,
  AssignmentStmtNode, ExpressionStmtNode,
  BinaryExprNode, UnaryExprNode, IdentifierNode,
  MemberAccessNode, ArrayAccessNode, FunctionCallNode, QualifiedCallNode,
  ArrayLiteralNode, StringLiteralNode, NumberLiteralNode,
  BooleanLiteralNode, NilLiteralNode, SqlParameterNode,
  ErrorNode, ASTNode
} from './ast';

export class ParseError {
  message: string;
  line: number;
  column: number;

  constructor(message: string, line: number, column: number) {
    this.message = message;
    this.line = line;
    this.column = column;
  }
}

export class SSLParser {
  private tokens: Token[] = [];
  private pos = 0;
  private errors: ParseError[] = [];

  parse(source: string): { ast: ProgramNode; errors: ParseError[] } {
    const lexer = new SSLLexer(source);
    this.tokens = lexer.tokenize();
    this.pos = 0;
    this.errors = [];

    const body: ASTNode[] = [];

    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.isAtEnd()) break;
      const stmt = this.parseTopLevel();
      if (stmt) {
        body.push(stmt);
      }
    }

    const endPos = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : null;
    const ast: ProgramNode = {
      type: 'Program',
      body,
      startLine: 0,
      startCol: 0,
      endLine: endPos ? endPos.line : 0,
      endCol: endPos ? endPos.column + endPos.length : 0,
    };

    return { ast, errors: this.errors };
  }

  // ─── Top-level ────────────────────────────────────────────────────

  private parseTopLevel(): ASTNode | null {
    this.skipComments();
    if (this.check(TokenType.Class)) {
      return this.parseClassDecl();
    }
    if (this.check(TokenType.Procedure)) {
      return this.parseProcedureDecl();
    }
    if (this.check(TokenType.Include)) {
      return this.parseIncludeStmt();
    }
    // STARLIMS data sources have :PARAMETERS at the top level
    if (this.check(TokenType.Parameters)) {
      return this.parseParamsDecl();
    }
    return this.parseStatement();
  }

  // ─── Class declaration ────────────────────────────────────────────

  private parseClassDecl(): ClassDeclNode {
    const start = this.consume(TokenType.Class, 'Expected :CLASS');
    const nameNode = this.parseIdentifier('Expected class name');
    this.expectSemicolon();

    let inherit: string | undefined;
    if (this.check(TokenType.Inherit)) {
      this.advance();
      inherit = this.consumeIdentifier('Expected inherited class name');
      this.expectSemicolon();
    }

    const members: ASTNode[] = [];
    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.isAtEnd()) break;
      if (this.check(TokenType.Class)) break;
      if (this.check(TokenType.Procedure)) {
        members.push(this.parseProcedureDecl());
      } else if (this.check(TokenType.Access) || this.check(TokenType.Assign)) {
        members.push(this.parseAccessorDecl());
      } else if (this.check(TokenType.Declare)) {
        members.push(this.parseDeclareStmt());
      } else {
        this.error('Expected :PROCEDURE, :ACCESS, or :ASSIGN in class');
        this.advance();
      }
    }

    return {
      type: 'ClassDecl',
      name: nameNode.name,
      nameNode,
      inherit,
      members,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    };
  }

  private parseAccessorDecl(): ASTNode {
    const keyword = this.advance();
    const nameNode = this.parseIdentifier('Expected accessor name');
    this.expectSemicolon();
    return {
      type: 'ExpressionStmt',
      expression: {
        type: 'Identifier',
        name: nameNode.name,
        startLine: keyword.line,
        startCol: keyword.column,
        endLine: nameNode.endLine,
        endCol: nameNode.endCol,
      } as IdentifierNode,
      startLine: keyword.line,
      startCol: keyword.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    } as ExpressionStmtNode;
  }

  // ─── Procedure declaration ────────────────────────────────────────

  private parseProcedureDecl(): ProcedureDeclNode {
    const start = this.consume(TokenType.Procedure, 'Expected :PROCEDURE');
    const nameNode = this.parseIdentifier('Expected procedure name');
    this.expectSemicolon();

    let params: ParamsDeclNode | undefined;
    if (this.check(TokenType.Parameters)) {
      params = this.parseParamsDecl();
    }

    const defaults: DefaultDeclNode[] = [];
    while (this.check(TokenType.Default)) {
      defaults.push(this.parseDefaultDecl());
    }

    const body: ASTNode[] = [];
    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.check(TokenType.EndProc)) break;
      const stmt = this.parseStatement();
      if (stmt) {
        body.push(stmt);
      }
    }

    const endTok = this.check(TokenType.EndProc)
      ? this.consume(TokenType.EndProc, 'Expected :ENDPROC')
      : this.previous();

    this.expectSemicolon();

    return {
      type: 'ProcedureDecl',
      name: nameNode.name,
      nameNode,
      params,
      defaults,
      body,
      startLine: start.line,
      startCol: start.column,
      endLine: endTok.line,
      endCol: endTok.column + endTok.length,
    };
  }

  private parseParamsDecl(): ParamsDeclNode {
    const start = this.consume(TokenType.Parameters, 'Expected :PARAMETERS');
    const params: ParamNode[] = [];

    const nameNode = this.parseIdentifier('Expected parameter name');
    let defaultValue: ASTNode | undefined;
    if (this.check(TokenType.AssignOp)) {
      this.advance();
      defaultValue = this.parseExpression();
    }
    params.push({
      type: 'Identifier',
      name: nameNode.name,
      nameNode,
      defaultValue,
      startLine: nameNode.startLine,
      startCol: nameNode.startCol,
      endLine: defaultValue ? defaultValue.endLine : nameNode.endLine,
      endCol: defaultValue ? defaultValue.endCol : nameNode.endCol,
    } as ParamNode);

    while (this.check(TokenType.Comma)) {
      this.advance();
      const pn = this.parseIdentifier('Expected parameter name');
      let dv: ASTNode | undefined;
      if (this.check(TokenType.AssignOp)) {
        this.advance();
        dv = this.parseExpression();
      }
      params.push({
        type: 'Identifier',
        name: pn.name,
        nameNode: pn,
        defaultValue: dv,
        startLine: pn.startLine,
        startCol: pn.startCol,
        endLine: dv ? dv.endLine : pn.endLine,
        endCol: dv ? dv.endCol : pn.endCol,
      } as ParamNode);
    }

    this.expectSemicolon();

    return {
      type: 'ParamsDecl',
      params,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    };
  }

  private parseDefaultDecl(): DefaultDeclNode {
    const start = this.consume(TokenType.Default, 'Expected :DEFAULT');
    const nameNode = this.parseIdentifier('Expected parameter name');
    this.consume(TokenType.Comma, 'Expected comma');
    const value = this.parseExpression();
    this.expectSemicolon();

    return {
      type: 'DefaultDecl',
      name: nameNode.name,
      nameNode,
      value,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    };
  }

  // ─── Include statement ────────────────────────────────────────────

  private parseIncludeStmt(): IncludeStmtNode {
    const start = this.consume(TokenType.Include, 'Expected :INCLUDE');
    const isHashInclude = start.value.startsWith('#');
    let target: string;
    if (this.check(TokenType.String)) {
      const value = this.advance().value;
      target = value.length >= 2 ? value.slice(1, -1) : value;
    } else {
      target = this.consumeIdentifier('Expected include target');
      while (this.check(TokenType.Dot)) {
        this.advance();
        target += '.' + this.consumeIdentifier('Expected include target after dot');
      }
    }
    // #include references are line directives in STARLIMS client/HTML form
    // scripts and do not require a trailing semicolon. Accept one for
    // compatibility, while :INCLUDE continues to follow SSL statement rules.
    if (isHashInclude) {
      if (this.check(TokenType.Semicolon)) this.advance();
    } else {
      this.expectSemicolon();
    }

    return {
      type: 'IncludeStmt',
      target,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    };
  }

  // ─── Statements ───────────────────────────────────────────────────

  private parseStatement(): ASTNode | null {
    this.skipComments();
    if (this.check(TokenType.Include)) return this.parseIncludeStmt();
    if (this.check(TokenType.If)) return this.parseIfStmt();
    if (this.check(TokenType.For)) return this.parseForStmt();
    if (this.check(TokenType.While)) return this.parseWhileStmt();
    if (this.check(TokenType.BeginCase)) return this.parseCaseStmt();
    if (this.check(TokenType.Try)) return this.parseTryStmt();
    if (this.check(TokenType.Declare)) return this.parseDeclareStmt();
    if (this.check(TokenType.Return)) return this.parseReturnStmt();
    if (this.check(TokenType.Loop)) return this.parseLoopStmt();
    if (this.check(TokenType.Exit)) return this.parseSimpleKeywordStmt();
    if (this.check(TokenType.ExitFor)) return this.parseSimpleKeywordStmt();
    if (this.check(TokenType.ExitWhile)) return this.parseSimpleKeywordStmt();
    if (this.check(TokenType.ExitCase)) return this.parseSimpleKeywordStmt();
    if (this.check(TokenType.Error)) return this.parseSimpleKeywordStmt();
    if (this.check(TokenType.Resume)) return this.parseSimpleKeywordStmt();
    if (this.check(TokenType.Default)) return this.parseDefaultStmt();
    if (this.check(TokenType.Region)) return this.parseRegionStmt();
    if (this.check(TokenType.EndRegion)) return this.parseSimpleKeywordStmt();
    if (this.check(TokenType.BeginInlineCode)) return this.parseSimpleKeywordStmt();
    if (this.check(TokenType.EndInlineCode)) return this.parseSimpleKeywordStmt();
    return this.parseExpressionOrAssignment();
  }

  private parseIfStmt(): IfStmtNode {
    const start = this.consume(TokenType.If, 'Expected :IF');
    const condition = this.parseExpression();
    this.expectSemicolon();

    const thenBody: ASTNode[] = [];
    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.check(TokenType.EndIf) || this.check(TokenType.Else)) break;
      const stmt = this.parseStatement();
      if (stmt) thenBody.push(stmt);
    }

    let elseBody: ASTNode[] | undefined;
    if (this.check(TokenType.Else)) {
      this.advance();
      this.expectSemicolon();
      elseBody = [];
      while (!this.isAtEnd()) {
        this.skipComments();
        if (this.check(TokenType.EndIf)) break;
        const stmt = this.parseStatement();
        if (stmt) elseBody.push(stmt);
      }
    }

    const endTok = this.check(TokenType.EndIf)
      ? this.consume(TokenType.EndIf, 'Expected :ENDIF')
      : this.previous();
    this.expectSemicolon();

    return {
      type: 'IfStmt',
      condition,
      thenBody,
      elseBody,
      startLine: start.line,
      startCol: start.column,
      endLine: endTok.line,
      endCol: endTok.column + endTok.length,
    };
  }

  private parseForStmt(): ForStmtNode {
    const start = this.consume(TokenType.For, 'Expected :FOR');
    const init = this.parseAssignment();
    this.consume(TokenType.To, 'Expected :TO');
    const to = this.parseExpression();

    let step: ASTNode | undefined;
    if (this.check(TokenType.Step)) {
      this.advance();
      step = this.parseExpression();
    }

    this.expectSemicolon();

    const body: ASTNode[] = [];
    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.check(TokenType.Next)) break;
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }

    const endTok = this.check(TokenType.Next)
      ? this.consume(TokenType.Next, 'Expected :NEXT')
      : this.previous();
    this.expectSemicolon();

    return {
      type: 'ForStmt',
      init,
      to,
      step,
      body,
      startLine: start.line,
      startCol: start.column,
      endLine: endTok.line,
      endCol: endTok.column + endTok.length,
    };
  }

  private parseWhileStmt(): WhileStmtNode {
    const start = this.consume(TokenType.While, 'Expected :WHILE');
    const condition = this.parseExpression();
    this.expectSemicolon();

    const body: ASTNode[] = [];
    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.check(TokenType.EndWhile)) break;
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }

    const endTok = this.check(TokenType.EndWhile)
      ? this.consume(TokenType.EndWhile, 'Expected :ENDWHILE')
      : this.previous();
    this.expectSemicolon();

    return {
      type: 'WhileStmt',
      condition,
      body,
      startLine: start.line,
      startCol: start.column,
      endLine: endTok.line,
      endCol: endTok.column + endTok.length,
    };
  }

  private parseCaseStmt(): CaseStmtNode {
    const start = this.consume(TokenType.BeginCase, 'Expected :BEGINCASE');
    this.expectSemicolon();

    const branches: CaseBranchNode[] = [];
    let otherwise: OtherwiseBranchNode | undefined;

    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.check(TokenType.EndCase)) break;
      if (this.check(TokenType.Case)) {
        branches.push(this.parseCaseBranch());
      } else if (this.check(TokenType.Otherwise)) {
        otherwise = this.parseOtherwiseBranch();
      } else {
        this.error('Expected :CASE, :OTHERWISE, or :ENDCASE');
        this.advance();
      }
    }

    const endTok = this.check(TokenType.EndCase)
      ? this.consume(TokenType.EndCase, 'Expected :ENDCASE')
      : this.previous();
    this.expectSemicolon();

    return {
      type: 'CaseStmt',
      branches,
      otherwise,
      startLine: start.line,
      startCol: start.column,
      endLine: endTok.line,
      endCol: endTok.column + endTok.length,
    };
  }

  private parseCaseBranch(): CaseBranchNode {
    const start = this.consume(TokenType.Case, 'Expected :CASE');
    const condition = this.parseExpression();
    this.expectSemicolon();

    const body: ASTNode[] = [];
    let hasExitCase = false;
    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.check(TokenType.Case) || this.check(TokenType.Otherwise) || this.check(TokenType.EndCase)) break;
      if (this.check(TokenType.ExitCase)) {
        this.advance();
        this.expectSemicolon();
        hasExitCase = true;
        break;
      }
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }

    return {
      type: 'CaseBranch',
      condition,
      body,
      hasExitCase,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    };
  }

  private parseOtherwiseBranch(): OtherwiseBranchNode {
    const start = this.consume(TokenType.Otherwise, 'Expected :OTHERWISE');
    this.expectSemicolon();

    const body: ASTNode[] = [];
    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.check(TokenType.EndCase)) break;
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }

    return {
      type: 'OtherwiseBranch',
      body,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    };
  }

  private parseTryStmt(): TryStmtNode {
    const start = this.consume(TokenType.Try, 'Expected :TRY');
    this.expectSemicolon();

    const body: ASTNode[] = [];
    while (!this.isAtEnd()) {
      this.skipComments();
      if (this.check(TokenType.Catch) || this.check(TokenType.Finally) || this.check(TokenType.EndTry)) break;
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }

    let catchBody: ASTNode[] | undefined;
    if (this.check(TokenType.Catch)) {
      this.advance();
      this.expectSemicolon();
      catchBody = [];
      while (!this.isAtEnd()) {
        this.skipComments();
        if (this.check(TokenType.Finally) || this.check(TokenType.EndTry)) break;
        const stmt = this.parseStatement();
        if (stmt) catchBody.push(stmt);
      }
    }

    let finallyBody: ASTNode[] | undefined;
    if (this.check(TokenType.Finally)) {
      this.advance();
      this.expectSemicolon();
      finallyBody = [];
      while (!this.isAtEnd()) {
        this.skipComments();
        if (this.check(TokenType.EndTry)) break;
        const stmt = this.parseStatement();
        if (stmt) finallyBody.push(stmt);
      }
    }

    const endTok = this.check(TokenType.EndTry)
      ? this.consume(TokenType.EndTry, 'Expected :ENDTRY')
      : this.previous();
    this.expectSemicolon();

    return {
      type: 'TryStmt',
      body,
      catchBody,
      finallyBody,
      startLine: start.line,
      startCol: start.column,
      endLine: endTok.line,
      endCol: endTok.column + endTok.length,
    };
  }

  private parseDeclareStmt(): DeclareStmtNode {
    const start = this.consume(TokenType.Declare, 'Expected :DECLARE');
    const names: string[] = [];
    const nameNodes: IdentifierNode[] = [];

    const first = this.parseIdentifier('Expected variable name');
    names.push(first.name);
    nameNodes.push(first);

    while (this.check(TokenType.Comma)) {
      this.advance();
      const n = this.parseIdentifier('Expected variable name');
      names.push(n.name);
      nameNodes.push(n);
    }

    this.expectSemicolon();

    return {
      type: 'DeclareStmt',
      names,
      nameNodes,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    };
  }

  private parseReturnStmt(): ReturnStmtNode {
    const start = this.consume(TokenType.Return, 'Expected :RETURN');
    let value: ASTNode | undefined;
    if (!this.check(TokenType.Semicolon) && !this.isAtEnd()) {
      value = this.parseExpression();
    }
    this.expectSemicolon();

    return {
      type: 'ReturnStmt',
      value,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    };
  }

  private parseLoopStmt(): LoopStmtNode {
    const start = this.consume(TokenType.Loop, 'Expected :LOOP');
    this.expectSemicolon();

    return {
      type: 'LoopStmt',
      startLine: start.line,
      startCol: start.column,
      endLine: start.line,
      endCol: start.column + start.length,
    };
  }

  private parseSimpleKeywordStmt(): ASTNode {
    const tok = this.advance();
    this.expectSemicolon();
    return {
      type: 'ExpressionStmt',
      expression: {
        type: 'Identifier',
        name: tok.value,
        startLine: tok.line,
        startCol: tok.column,
        endLine: tok.line,
        endCol: tok.column + tok.length,
      } as IdentifierNode,
      startLine: tok.line,
      startCol: tok.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    } as ExpressionStmtNode;
  }

  private parseRegionStmt(): ASTNode {
    const start = this.advance(); // :REGION
    // Optional region name
    let name = '';
    if (this.check(TokenType.Identifier)) {
      name = this.advance().value;
    }
    this.expectSemicolon();
    return {
      type: 'ExpressionStmt',
      expression: {
        type: 'Identifier',
        name: start.value + (name ? ' ' + name : ''),
        startLine: start.line,
        startCol: start.column,
        endLine: start.line,
        endCol: start.column + start.length,
      } as IdentifierNode,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    } as ExpressionStmtNode;
  }

  private parseDefaultStmt(): ASTNode {
    const start = this.advance(); // :DEFAULT
    // Skip name, comma, and value
    if (this.check(TokenType.Identifier)) {
      this.advance();
    }
    if (this.check(TokenType.Comma)) {
      this.advance();
    }
    // Skip the default value expression
    if (!this.check(TokenType.Semicolon) && !this.isAtEnd()) {
      this.parseExpression();
    }
    this.expectSemicolon();
    return {
      type: 'ExpressionStmt',
      expression: {
        type: 'Identifier',
        name: start.value,
        startLine: start.line,
        startCol: start.column,
        endLine: start.line,
        endCol: start.column + start.length,
      } as IdentifierNode,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    } as ExpressionStmtNode;
  }

  // ─── Expression / Assignment ──────────────────────────────────────

  private parseExpressionOrAssignment(): ASTNode {
    const expr = this.parseExpression();

    if (this.check(TokenType.AssignOp)) {
      this.advance();
      const value = this.parseExpression();
      this.expectSemicolon();
      return {
        type: 'AssignmentStmt',
        target: expr,
        value,
        startLine: expr.startLine,
        startCol: expr.startCol,
        endLine: value.endLine,
        endCol: value.endCol,
      } as AssignmentStmtNode;
    }

    if (this.check(TokenType.PlusAssign) || this.check(TokenType.MinusAssign)) {
      this.advance();
      const value = this.parseExpression();
      this.expectSemicolon();
      return {
        type: 'AssignmentStmt',
        target: expr,
        value,
        startLine: expr.startLine,
        startCol: expr.startCol,
        endLine: value.endLine,
        endCol: value.endCol,
      } as AssignmentStmtNode;
    }

    this.expectSemicolon();
    return {
      type: 'ExpressionStmt',
      expression: expr,
      startLine: expr.startLine,
      startCol: expr.startCol,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    } as ExpressionStmtNode;
  }

  private parseAssignment(): AssignmentStmtNode {
    const target = this.parseIdentifier('Expected variable name');
    this.consume(TokenType.AssignOp, 'Expected :=');
    const value = this.parseExpression();

    return {
      type: 'AssignmentStmt',
      target,
      value,
      startLine: target.startLine,
      startCol: target.startCol,
      endLine: value.endLine,
      endCol: value.endCol,
    };
  }

  // ─── Expressions (precedence climbing) ────────────────────────────

  private parseExpression(): ASTNode {
    return this.parseLogicalOr();
  }

  private makeBinaryExpr(op: Token, left: ASTNode, right: ASTNode): BinaryExprNode {
    return {
      type: 'BinaryExpr',
      operator: op.value,
      left,
      right,
      startLine: left.startLine,
      startCol: left.startCol,
      endLine: right.endLine,
      endCol: right.endCol,
    };
  }

  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd();
    while (this.check(TokenType.DotOr)) {
      const op = this.advance();
      const right = this.parseLogicalAnd();
      left = this.makeBinaryExpr(op, left, right);
    }
    return left;
  }

  private parseLogicalAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.check(TokenType.DotAnd)) {
      const op = this.advance();
      const right = this.parseEquality();
      left = this.makeBinaryExpr(op, left, right);
    }
    return left;
  }

  private parseEquality(): ASTNode {
    let left = this.parseComparison();
    while (this.check(TokenType.Equals) || this.check(TokenType.NotEquals) ||
           this.check(TokenType.SingleEquals) || this.check(TokenType.StrictEquals)) {
      const op = this.advance();
      const right = this.parseComparison();
      left = this.makeBinaryExpr(op, left, right);
    }
    return left;
  }

  private parseComparison(): ASTNode {
    let left = this.parseAddition();
    while (this.check(TokenType.LessThan) || this.check(TokenType.GreaterThan) ||
           this.check(TokenType.LessEqual) || this.check(TokenType.GreaterEqual) ||
           this.check(TokenType.Dollar)) {
      const op = this.advance();
      const right = this.parseAddition();
      left = this.makeBinaryExpr(op, left, right);
    }
    return left;
  }

  private parseAddition(): ASTNode {
    let left = this.parseMultiplication();
    while (this.check(TokenType.Plus) || this.check(TokenType.Minus)) {
      const op = this.advance();
      const right = this.parseMultiplication();
      left = this.makeBinaryExpr(op, left, right);
    }
    return left;
  }

  private parseMultiplication(): ASTNode {
    let left = this.parseUnary();
    while (this.check(TokenType.Star) || this.check(TokenType.Slash)) {
      const op = this.advance();
      const right = this.parseUnary();
      left = this.makeBinaryExpr(op, left, right);
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.check(TokenType.Bang) || this.check(TokenType.DotNot) ||
        this.check(TokenType.Plus) || this.check(TokenType.Minus)) {
      const op = this.advance();
      const operand = this.parseUnary();
      return {
        type: 'UnaryExpr',
        operator: op.value,
        operand,
        startLine: op.line,
        startCol: op.column,
        endLine: operand.endLine,
        endCol: operand.endCol,
      } as UnaryExprNode;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    // Boolean literals
    if (this.check(TokenType.BooleanTrue)) {
      const tok = this.advance();
      return {
        type: 'BooleanLiteral',
        value: true,
        startLine: tok.line,
        startCol: tok.column,
        endLine: tok.line,
        endCol: tok.column + tok.length,
      } as BooleanLiteralNode;
    }
    if (this.check(TokenType.BooleanFalse)) {
      const tok = this.advance();
      return {
        type: 'BooleanLiteral',
        value: false,
        startLine: tok.line,
        startCol: tok.column,
        endLine: tok.line,
        endCol: tok.column + tok.length,
      } as BooleanLiteralNode;
    }

    // NIL
    if (this.check(TokenType.Nil)) {
      const tok = this.advance();
      return {
        type: 'NilLiteral',
        startLine: tok.line,
        startCol: tok.column,
        endLine: tok.line,
        endCol: tok.column + tok.length,
      };
    }

    // Number
    if (this.check(TokenType.Number) || this.check(TokenType.Float)) {
      const tok = this.advance();
      return {
        type: 'NumberLiteral',
        value: tok.value,
        isFloat: tok.type === TokenType.Float,
        startLine: tok.line,
        startCol: tok.column,
        endLine: tok.line,
        endCol: tok.column + tok.length,
      } as NumberLiteralNode;
    }

    // String
    if (this.check(TokenType.String)) {
      const tok = this.advance();
      const params: SqlParameterNode[] = [];
      // Extract SQL parameters from string content
      const inner = tok.value.slice(1, -1);
      const paramRegex = /\?(\w+)\?/g;
      let match;
      while ((match = paramRegex.exec(inner)) !== null) {
        params.push({
          type: 'SqlParameter',
          name: match[1],
          startLine: tok.line,
          startCol: tok.column + 1 + match.index,
          endLine: tok.line,
          endCol: tok.column + 1 + match.index + match[0].length,
        });
      }
      return {
        type: 'StringLiteral',
        value: tok.value,
        params,
        startLine: tok.line,
        startCol: tok.column,
        endLine: tok.line,
        endCol: tok.column + tok.length,
      } as StringLiteralNode;
    }

    // SQL parameter standalone ?name?
    if (this.check(TokenType.SqlParam)) {
      const tok = this.advance();
      const name = tok.value.slice(1, -1);
      return {
        type: 'SqlParameter',
        name,
        startLine: tok.line,
        startCol: tok.column,
        endLine: tok.line,
        endCol: tok.column + tok.length,
      } as SqlParameterNode;
    }

    // Array literal
    if (this.check(TokenType.LeftBrace)) {
      return this.parseArrayLiteral();
    }

    // Parenthesized expression
    if (this.check(TokenType.LeftParen)) {
      this.advance();
      const expr = this.parseExpression();
      // Assignment expressions inside parens: (i+=1), (i:=v), (i-=1)
      if (this.check(TokenType.AssignOp) || this.check(TokenType.PlusAssign) ||
          this.check(TokenType.MinusAssign)) {
        const op = this.advance();
        const value = this.parseExpression();
        this.consume(TokenType.RightParen, 'Expected )');
        return {
          type: 'AssignmentStmt',
          target: expr,
          value,
          startLine: expr.startLine,
          startCol: expr.startCol,
          endLine: this.previous().line,
          endCol: this.previous().column + this.previous().length,
        } as AssignmentStmtNode;
      }
      this.consume(TokenType.RightParen, 'Expected )');
      return expr;
    }

    // Identifier or function call or member access
    if (this.check(TokenType.Identifier)) {
      return this.parseIdentifierExpr();
    }

    // Error recovery
    this.error('Unexpected token in expression');
    this.advance();
    return {
      type: 'ErrorNode',
      message: 'Unexpected token',
      startLine: this.previous().line,
      startCol: this.previous().column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    } as ErrorNode;
  }

  private parseIdentifierExpr(): ASTNode {
    let expr: ASTNode = this.parseIdentifier('Expected identifier');

    while (!this.isAtEnd()) {
      // Member access: . or :
      if (this.check(TokenType.Dot) || this.check(TokenType.Colon)) {
        const accessTok = this.advance();
        const prop = this.parseIdentifier('Expected property name');

        if (this.check(TokenType.LeftParen)) {
          this.advance();
          const args = this.parseArgList();
          this.consume(TokenType.RightParen, 'Expected )');
          expr = {
            type: 'MemberAccess',
            object: expr,
            property: prop.name,
            propertyNode: prop,
            isMethodCall: true,
            args,
            startLine: expr.startLine,
            startCol: expr.startCol,
            endLine: this.previous().line,
            endCol: this.previous().column + this.previous().length,
          } as MemberAccessNode;
        } else {
          expr = {
            type: 'MemberAccess',
            object: expr,
            property: prop.name,
            propertyNode: prop,
            isMethodCall: false,
            startLine: expr.startLine,
            startCol: expr.startCol,
            endLine: prop.endLine,
            endCol: prop.endCol,
          } as MemberAccessNode;
        }
        continue;
      }

      // Array access
      if (this.check(TokenType.LeftBracket)) {
        this.advance();
        const index = this.parseExpression();
        let index2: ASTNode | undefined;
        if (this.check(TokenType.Comma)) {
          this.advance();
          index2 = this.parseExpression();
        }
        this.consume(TokenType.RightBracket, 'Expected ]');
        expr = {
          type: 'ArrayAccess',
          object: expr,
          index,
          index2,
          startLine: expr.startLine,
          startCol: expr.startCol,
          endLine: this.previous().line,
          endCol: this.previous().column + this.previous().length,
        } as ArrayAccessNode;
        continue;
      }

      // Function call (if expr is an identifier and next is '(')
      if (expr.type === 'Identifier' && this.check(TokenType.LeftParen)) {
        this.advance();
        const args = this.parseArgList();
        this.consume(TokenType.RightParen, 'Expected )');
        expr = {
          type: 'FunctionCall',
          name: (expr as IdentifierNode).name,
          nameNode: expr as IdentifierNode,
          args,
          startLine: expr.startLine,
          startCol: expr.startCol,
          endLine: this.previous().line,
          endCol: this.previous().column + this.previous().length,
        } as FunctionCallNode;
        continue;
      }

      // Object instantiation: Identifier {}
      if (this.check(TokenType.LeftBrace)) {
        this.advance(); // consume {
        const ctorArgs: ASTNode[] = [];
        if (!this.check(TokenType.RightBrace)) {
          ctorArgs.push(this.parseExpression());
          while (this.check(TokenType.Comma)) {
            this.advance();
            if (this.check(TokenType.RightBrace)) break;
            ctorArgs.push(this.parseExpression());
          }
        }
        this.consume(TokenType.RightBrace, 'Expected }');
        expr = {
          type: 'FunctionCall',
          name: expr.type === 'Identifier' ? (expr as IdentifierNode).name : 'constructor',
          nameNode: expr.type === 'Identifier' ? expr as IdentifierNode : (expr as MemberAccessNode).propertyNode,
          args: ctorArgs,
          startLine: expr.startLine,
          startCol: expr.startCol,
          endLine: this.previous().line,
          endCol: this.previous().column + this.previous().length,
        } as FunctionCallNode;
        continue;
      }
      // Postfix increment/decrement: expr++ / expr--
      if (this.check(TokenType.Plus) && !this.isAtEnd() && this.tokens[this.pos + 1]?.type === TokenType.Plus) {
        this.advance();
        this.advance();
        break;
      }
      if (this.check(TokenType.Minus) && !this.isAtEnd() && this.tokens[this.pos + 1]?.type === TokenType.Minus) {
        this.advance();
        this.advance();
        break;
      }

      break;
    }

    return expr;
  }

  private parseArrayLiteral(): ArrayLiteralNode {
    const start = this.consume(TokenType.LeftBrace, 'Expected {');
    const elements: ASTNode[] = [];

    // STARLIMS block/lambda literal: {| params | body }
    if (this.check(TokenType.Pipe)) {
      this.advance(); // consume first |
      while (!this.check(TokenType.Pipe) && !this.isAtEnd()) {
        this.advance(); // skip params
      }
      if (this.check(TokenType.Pipe)) {
        this.advance(); // consume closing |
      }
      // Parse the body expressions
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        this.skipComments();
        if (this.check(TokenType.RightBrace)) break;
        if (this.check(TokenType.Semicolon)) {
          this.advance();
          continue;
        }
        elements.push(this.parseExpression());
        if (this.check(TokenType.Semicolon)) {
          this.advance();
        }
      }
      this.consume(TokenType.RightBrace, 'Expected }');
      return {
        type: 'ArrayLiteral',
        elements,
        startLine: start.line,
        startCol: start.column,
        endLine: this.previous().line,
        endCol: this.previous().column + this.previous().length,
      } as ArrayLiteralNode;
    }

    if (!this.check(TokenType.RightBrace)) {
      elements.push(this.parseExpression());
      while (this.check(TokenType.Comma)) {
        this.advance();
        if (this.check(TokenType.RightBrace)) break;
        if (this.check(TokenType.Comma)) {
          elements.push({
            type: 'NilLiteral',
            startLine: this.previous().line,
            startCol: this.previous().column + this.previous().length,
            endLine: this.previous().line,
            endCol: this.previous().column + this.previous().length,
          } as NilLiteralNode);
          continue;
        }
        elements.push(this.parseExpression());
      }
    }

    this.consume(TokenType.RightBrace, 'Expected }');

    return {
      type: 'ArrayLiteral',
      elements,
      startLine: start.line,
      startCol: start.column,
      endLine: this.previous().line,
      endCol: this.previous().column + this.previous().length,
    } as ArrayLiteralNode;
  }

  private parseArgList(): ASTNode[] {
    const args: ASTNode[] = [];
    if (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
      if (this.check(TokenType.Comma)) {
        args.push({
          type: 'NilLiteral',
          startLine: this.previous().line,
          startCol: this.previous().column + this.previous().length,
          endLine: this.previous().line,
          endCol: this.previous().column + this.previous().length,
        } as NilLiteralNode);
      } else {
        args.push(this.parseExpression());
      }
      while (this.check(TokenType.Comma)) {
        this.advance();
        if (this.check(TokenType.RightParen) || this.check(TokenType.Comma)) {
          // Empty argument — push nil placeholder
          args.push({
            type: 'NilLiteral',
            startLine: this.previous().line,
            startCol: this.previous().column + this.previous().length,
            endLine: this.previous().line,
            endCol: this.previous().column + this.previous().length,
          } as NilLiteralNode);
          if (this.check(TokenType.Comma)) continue;
          break;
        }
        args.push(this.parseExpression());
      }
    }
    return args;
  }

  private parseIdentifier(message: string): IdentifierNode {
    if (this.check(TokenType.Identifier)) {
      const tok = this.advance();
      return {
        type: 'Identifier',
        name: tok.value,
        startLine: tok.line,
        startCol: tok.column,
        endLine: tok.line,
        endCol: tok.column + tok.length,
      };
    }
    this.error(message);
    // Return a synthetic identifier for error recovery
    const prev = this.previous();
    return {
      type: 'Identifier',
      name: '',
      startLine: prev.line,
      startCol: prev.column,
      endLine: prev.line,
      endCol: prev.column,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.tokens[this.pos].type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.pos++;
    }
    return this.tokens[this.pos - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    this.error(message);
    return this.tokens[this.pos > 0 ? this.pos - 1 : 0];
  }

  private consumeIdentifier(message: string): string {
    if (this.check(TokenType.Identifier)) {
      return this.advance().value;
    }
    this.error(message);
    return '';
  }

  private expectSemicolon(): void {
    this.consume(TokenType.Semicolon, 'Expected ;');
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length || this.tokens[this.pos].type === TokenType.Eof;
  }

  private previous(): Token {
    return this.tokens[this.pos > 0 ? this.pos - 1 : 0];
  }

  private checkComment(): boolean {
    return !this.isAtEnd() && this.tokens[this.pos].type === TokenType.Comment;
  }

  private skipComments(): void {
    while (this.checkComment()) {
      this.advance();
    }
  }

  private error(message: string): void {
    const token = this.tokens[this.pos] || this.tokens[this.tokens.length - 1];
    this.errors.push(new ParseError(message, token.line, token.column));
  }
}
