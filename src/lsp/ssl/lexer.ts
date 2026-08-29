export enum TokenType {
  // Keywords
  Procedure = 'PROCEDURE',
  EndProc = 'ENDPROC',
  Parameters = 'PARAMETERS',
  Declare = 'DECLARE',
  Default = 'DEFAULT',
  Return = 'RETURN',
  If = 'IF',
  Else = 'ELSE',
  EndIf = 'ENDIF',
  BeginCase = 'BEGINCASE',
  Case = 'CASE',
  ExitCase = 'EXITCASE',
  Otherwise = 'OTHERWISE',
  EndCase = 'ENDCASE',
  For = 'FOR',
  Next = 'NEXT',
  While = 'WHILE',
  EndWhile = 'ENDWHILE',
  Loop = 'LOOP',
  Exit = 'EXIT',
  Try = 'TRY',
  Catch = 'CATCH',
  Finally = 'FINALLY',
  EndTry = 'ENDTRY',
  Class = 'CLASS',
  Inherit = 'INHERIT',
  Include = 'INCLUDE',
  Dsn = 'DSN',
  Access = 'ACCESS',
  Assign = 'ASSIGN',
  To = 'TO',
  Step = 'STEP',
  Public = 'PUBLIC',
  Error = 'ERROR',
  Region = 'REGION',
  EndRegion = 'ENDREGION',
  BeginInlineCode = 'BEGININLINECODE',
  EndInlineCode = 'ENDINLINECODE',
  Resume = 'RESUME',
  ExitFor = 'EXITFOR',
  ExitWhile = 'EXITWHILE',

  // Literals
  BooleanTrue = 'BOOLEAN_TRUE',
  BooleanFalse = 'BOOLEAN_FALSE',
  Nil = 'NIL',
  Number = 'NUMBER',
  Float = 'FLOAT',
  String = 'STRING',
  SqlParam = 'SQL_PARAM',

  // Operators
  AssignOp = 'ASSIGN_OP',   // :=
  Equals = 'EQUALS',        // ==
  NotEquals = 'NOT_EQUALS', // !=
  StrictEquals = 'STRICT_EQUALS', // :==
  PlusAssign = 'PLUS_ASSIGN', // +=
  MinusAssign = 'MINUS_ASSIGN', // -=
  LessThan = 'LESS_THAN',
  GreaterThan = 'GREATER_THAN',
  LessEqual = 'LESS_EQUAL',
  GreaterEqual = 'GREATER_EQUAL',
  SingleEquals = 'SINGLE_EQUALS', // =
  Plus = 'PLUS',
  Minus = 'MINUS',
  Star = 'STAR',
  Slash = 'SLASH',
  DotAnd = 'DOT_AND',      // .AND.
  DotOr = 'DOT_OR',        // .OR.
  DotNot = 'DOT_NOT',      // .NOT.
  Bang = 'BANG',            // !
  Dollar = 'DOLLAR',        // $
  Colon = 'COLON',          // :
  Pipe = 'PIPE',            // |

  // Delimiters
  Semicolon = 'SEMICOLON',
  Comma = 'COMMA',
  LeftParen = 'LEFT_PAREN',
  RightParen = 'RIGHT_PAREN',
  LeftBrace = 'LEFT_BRACE',
  RightBrace = 'RIGHT_BRACE',
  LeftBracket = 'LEFT_BRACKET',
  RightBracket = 'RIGHT_BRACKET',
  Dot = 'DOT',

  // Identifiers
  Identifier = 'IDENTIFIER',

  // Comments
  Comment = 'COMMENT',

  // Special
  Newline = 'NEWLINE',
  Eof = 'EOF',
  ErrorToken = 'ERROR_TOKEN',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

const KEYWORDS: Record<string, TokenType> = {
  ':PROCEDURE': TokenType.Procedure,
  ':ENDPROC': TokenType.EndProc,
  ':PARAMETERS': TokenType.Parameters,
  ':DECLARE': TokenType.Declare,
  ':DEFAULT': TokenType.Default,
  ':RETURN': TokenType.Return,
  ':IF': TokenType.If,
  ':ELSE': TokenType.Else,
  ':ENDIF': TokenType.EndIf,
  ':BEGINCASE': TokenType.BeginCase,
  ':CASE': TokenType.Case,
  ':EXITCASE': TokenType.ExitCase,
  ':OTHERWISE': TokenType.Otherwise,
  ':ENDCASE': TokenType.EndCase,
  ':FOR': TokenType.For,
  ':NEXT': TokenType.Next,
  ':WHILE': TokenType.While,
  ':ENDWHILE': TokenType.EndWhile,
  ':LOOP': TokenType.Loop,
  ':EXIT': TokenType.Exit,
  ':TRY': TokenType.Try,
  ':CATCH': TokenType.Catch,
  ':FINALLY': TokenType.Finally,
  ':ENDTRY': TokenType.EndTry,
  ':CLASS': TokenType.Class,
  ':INHERIT': TokenType.Inherit,
  ':INCLUDE': TokenType.Include,
  ':DSN': TokenType.Dsn,
  ':ACCESS': TokenType.Access,
  ':ASSIGN': TokenType.Assign,
  ':TO': TokenType.To,
  ':STEP': TokenType.Step,
  ':PUBLIC': TokenType.Public,
  ':ERROR': TokenType.Error,
  ':REGION': TokenType.Region,
  ':ENDREGION': TokenType.EndRegion,
  ':BEGININLINECODE': TokenType.BeginInlineCode,
  ':ENDINLINECODE': TokenType.EndInlineCode,
  ':RESUME': TokenType.Resume,
  ':EXITFOR': TokenType.ExitFor,
  ':EXITWHILE': TokenType.ExitWhile,
};

export class SSLLexer {
  private source: string;
  private pos = 0;
  private line = 0;
  private column = 0;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 0;
    this.column = 0;

    while (this.pos < this.source.length) {
      this.scanToken();
    }

    this.addToken(TokenType.Eof, '', this.line, this.column, this.pos, 0);
    return this.tokens;
  }

  private scanToken(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;

    const ch = this.source[this.pos];

    // Newlines
    if (ch === '\r') {
      this.advance();
      if (this.pos < this.source.length && this.source[this.pos] === '\n') {
        this.advance();
      }
      this.line++;
      this.column = 0;
      return;
    }
    if (ch === '\n') {
      this.advance();
      this.line++;
      this.column = 0;
      return;
    }

    // Whitespace
    if (ch === ' ' || ch === '\t') {
      this.advance();
      return;
    }

    // Comments: /* ... */
    if (ch === '/' && this.peek() === '*') {
      this.scanBlockComment();
      return;
    }

    // SQL parameters: ?identifier?
    if (ch === '?' && this.peek() !== '?' && this.peek() !== ';' && this.peek() !== ')') {
      this.scanSqlParameter();
      return;
    }

    // Strings
    if (ch === '"') {
      this.scanDoubleString();
      return;
    }
    if (ch === '\'') {
      this.scanSingleString();
      return;
    }

    // Client/HTML form script reference: #include "Module.Script"
    if (ch === '#') {
      this.scanHashDirective();
      return;
    }

    // Numbers
    if (this.isDigit(ch)) {
      this.scanNumber();
      return;
    }

    // Colon-prefixed keywords and operators
    if (ch === ':') {
      this.scanColon();
      return;
    }

    // Dot-prefixed operators (.AND., .OR., .NOT., .T., .F.)
    if (ch === '.') {
      this.scanDot();
      return;
    }

    // Multi-char operators
    if (ch === '=' && this.peek() === '=') {
      this.advance();
      this.advance();
      this.addToken(TokenType.Equals, '==', startLine, startCol, startOffset, 2);
      return;
    }
    if (ch === '!' && this.peek() === '=') {
      this.advance();
      this.advance();
      this.addToken(TokenType.NotEquals, '!=', startLine, startCol, startOffset, 2);
      return;
    }
    if (ch === '<' && this.peek() === '>') {
      this.advance();
      this.advance();
      this.addToken(TokenType.NotEquals, '<>', startLine, startCol, startOffset, 2);
      return;
    }
    if (ch === '+' && this.peek() === '=') {
      this.advance();
      this.advance();
      this.addToken(TokenType.PlusAssign, '+=', startLine, startCol, startOffset, 2);
      return;
    }
    if (ch === '-' && this.peek() === '=') {
      this.advance();
      this.advance();
      this.addToken(TokenType.MinusAssign, '-=', startLine, startCol, startOffset, 2);
      return;
    }
    if (ch === '<' && this.peek() === '=') {
      this.advance();
      this.advance();
      this.addToken(TokenType.LessEqual, '<=', startLine, startCol, startOffset, 2);
      return;
    }
    if (ch === '>' && this.peek() === '=') {
      this.advance();
      this.advance();
      this.addToken(TokenType.GreaterEqual, '>=', startLine, startCol, startOffset, 2);
      return;
    }

    // Single-char operators and delimiters
    switch (ch) {
      case '=':
        this.advance();
        this.addToken(TokenType.SingleEquals, '=', startLine, startCol, startOffset, 1);
        return;
      case '+':
        this.advance();
        this.addToken(TokenType.Plus, '+', startLine, startCol, startOffset, 1);
        return;
      case '-':
        this.advance();
        this.addToken(TokenType.Minus, '-', startLine, startCol, startOffset, 1);
        return;
      case '*':
        this.advance();
        this.addToken(TokenType.Star, '*', startLine, startCol, startOffset, 1);
        return;
      case '/':
        this.advance();
        this.addToken(TokenType.Slash, '/', startLine, startCol, startOffset, 1);
        return;
      case '<':
        this.advance();
        this.addToken(TokenType.LessThan, '<', startLine, startCol, startOffset, 1);
        return;
      case '>':
        this.advance();
        this.addToken(TokenType.GreaterThan, '>', startLine, startCol, startOffset, 1);
        return;
      case '!':
        this.advance();
        this.addToken(TokenType.Bang, '!', startLine, startCol, startOffset, 1);
        return;
      case '$':
        this.advance();
        this.addToken(TokenType.Dollar, '$', startLine, startCol, startOffset, 1);
        return;
      case '|':
        this.advance();
        this.addToken(TokenType.Pipe, '|', startLine, startCol, startOffset, 1);
        return;
      case ';':
        this.advance();
        this.addToken(TokenType.Semicolon, ';', startLine, startCol, startOffset, 1);
        return;
      case ',':
        this.advance();
        this.addToken(TokenType.Comma, ',', startLine, startCol, startOffset, 1);
        return;
      case '(':
        this.advance();
        this.addToken(TokenType.LeftParen, '(', startLine, startCol, startOffset, 1);
        return;
      case ')':
        this.advance();
        this.addToken(TokenType.RightParen, ')', startLine, startCol, startOffset, 1);
        return;
      case '{':
        this.advance();
        this.addToken(TokenType.LeftBrace, '{', startLine, startCol, startOffset, 1);
        return;
      case '}':
        this.advance();
        this.addToken(TokenType.RightBrace, '}', startLine, startCol, startOffset, 1);
        return;
      case '[':
        this.advance();
        this.addToken(TokenType.LeftBracket, '[', startLine, startCol, startOffset, 1);
        return;
      case ']':
        this.advance();
        this.addToken(TokenType.RightBracket, ']', startLine, startCol, startOffset, 1);
        return;
    }

    // Identifiers
    if (this.isAlpha(ch) || ch === '_') {
      this.scanIdentifier();
      return;
    }

    // Unknown character
    this.advance();
    this.addToken(TokenType.ErrorToken, ch, startLine, startCol, startOffset, 1);
  }

  private scanBlockComment(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;

    this.advance(); // /
    this.advance(); // *

    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      // STARLIMS comments end with ';' (confirmed by TextMate grammar and language config)
      if (ch === ';') {
        this.advance(); // ;
        this.addToken(TokenType.Comment, this.source.substring(startOffset, this.pos), startLine, startCol, startOffset, this.pos - startOffset);
        return;
      }
      if (ch === '\r') {
        this.advance();
        if (this.pos < this.source.length && this.source[this.pos] === '\n') {
          this.advance();
        }
        this.line++;
        this.column = 0;
      } else if (ch === '\n') {
        this.advance();
        this.line++;
        this.column = 0;
      } else {
        this.advance();
      }
    }

    // Unterminated comment
    this.addToken(TokenType.Comment, this.source.substring(startOffset, this.pos), startLine, startCol, startOffset, this.pos - startOffset);
  }

  private scanHashDirective(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    const match = this.source.slice(this.pos).match(/^#include\b/i);
    if (!match) {
      this.advance();
      this.addToken(TokenType.ErrorToken, '#', startLine, startCol, startOffset, 1);
      return;
    }
    for (let index = 0; index < match[0].length; index++) this.advance();
    this.addToken(TokenType.Include, match[0], startLine, startCol, startOffset, match[0].length);
  }

  private scanSqlParameter(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;

    this.advance(); // ?

    let name = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '?') {
      name += this.source[this.pos];
      this.advance();
    }

    if (this.pos < this.source.length) {
      this.advance(); // closing ?
    }

    this.addToken(TokenType.SqlParam, '?' + name + '?', startLine, startCol, startOffset, this.pos - startOffset);
  }

  private scanDoubleString(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;

    this.advance(); // opening "

    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      const ch = this.source[this.pos];
      if (ch === '\\') {
        const nextChar = this.pos + 1 < this.source.length ? this.source[this.pos + 1] : '\0';
        if (nextChar === '"') {
          let lookAhead = this.pos + 2;
          while (lookAhead < this.source.length && (this.source[lookAhead] === ' ' || this.source[lookAhead] === '\t')) {
            lookAhead++;
          }
          const following = lookAhead < this.source.length ? this.source[lookAhead] : '\0';
          if (following === ';' || following === '+' || following === ')' ||
              following === ',' || following === '\r' || following === '\n' ||
              following === '\0' || following === '.' || following === '<' ||
              following === '>') {
            value += ch;
            this.advance();
          } else {
            this.advance();
            value += '"';
            this.advance();
          }
        } else {
          value += ch;
          this.advance();
        }
      } else if (ch === '\r') {
        this.line++;
        this.column = 0;
        value += ch;
        this.advance();
        if (this.pos < this.source.length && this.source[this.pos] === '\n') {
          value += '\n';
          this.advance();
        }
      } else if (ch === '\n') {
        this.line++;
        this.column = 0;
        value += ch;
        this.advance();
      } else {
        value += ch;
        this.advance();
      }
    }

    if (this.pos < this.source.length) {
      this.advance(); // closing "
    }

    this.addToken(TokenType.String, '"' + value + '"', startLine, startCol, startOffset, this.pos - startOffset);
  }

  private scanSingleString(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;

    this.advance(); // opening '

    let value = '';
    while (this.pos < this.source.length && this.source[this.pos] !== '\'') {
      const ch = this.source[this.pos];
      if (ch === '\\') {
        const nextChar = this.pos + 1 < this.source.length ? this.source[this.pos + 1] : '\0';
        if (nextChar === '\'') {
          let lookAhead = this.pos + 2;
          while (lookAhead < this.source.length && (this.source[lookAhead] === ' ' || this.source[lookAhead] === '\t')) {
            lookAhead++;
          }
          const following = lookAhead < this.source.length ? this.source[lookAhead] : '\0';
          if (following === ';' || following === '+' || following === ')' ||
              following === ',' || following === '\r' || following === '\n' ||
              following === '\0' || following === '.' || following === '<' ||
              following === '>') {
            value += ch;
            this.advance();
          } else {
            this.advance();
            value += '\'';
            this.advance();
          }
        } else {
          value += ch;
          this.advance();
        }
      } else if (ch === '\r') {
        this.line++;
        this.column = 0;
        value += ch;
        this.advance();
        if (this.pos < this.source.length && this.source[this.pos] === '\n') {
          value += '\n';
          this.advance();
        }
      } else if (ch === '\n') {
        this.line++;
        this.column = 0;
        value += ch;
        this.advance();
      } else {
        value += ch;
        this.advance();
      }
    }

    if (this.pos < this.source.length) {
      this.advance(); // closing '
    }

    this.addToken(TokenType.String, "'" + value + "'", startLine, startCol, startOffset, this.pos - startOffset);
  }

  private scanNumber(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    let isFloat = false;

    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      this.advance();
    }

    if (this.pos < this.source.length && this.source[this.pos] === '.' && this.peekAt(1) !== '.') {
      isFloat = true;
      this.advance(); // .
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        this.advance();
      }
    }

    const value = this.source.substring(startOffset, this.pos);
    this.addToken(isFloat ? TokenType.Float : TokenType.Number, value, startLine, startCol, startOffset, this.pos - startOffset);
  }

  private scanColon(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;

    this.advance(); // :

    // Check for keyword (:PROCEDURE, :IF, etc.)
    let word = ':';
    const wordStart = this.pos;
    while (this.pos < this.source.length && this.isAlpha(this.source[this.pos])) {
      word += this.source[this.pos];
      this.advance();
    }

    const keywordType = KEYWORDS[word] || KEYWORDS[word.toUpperCase()];
    if (keywordType) {
      // Don't treat as keyword if previous token was an identifier (member access context,
      // e.g. oPayload:Parameters where :Parameters would match the :PARAMETERS keyword)
      const prevToken = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : null;
      if (prevToken && prevToken.type === TokenType.Identifier) {
        this.pos = wordStart;
        this.column = startCol + 1;
        this.addToken(TokenType.Colon, ':', startLine, startCol, startOffset, 1);
        return;
      }
      this.addToken(keywordType, word, startLine, startCol, startOffset, this.pos - startOffset);
      return;
    }

    // Not a keyword - check for := or :==
    if (this.pos < this.source.length && this.source[this.pos] === '=') {
      this.advance();
      if (this.pos < this.source.length && this.source[this.pos] === '=') {
        this.advance();
        this.addToken(TokenType.StrictEquals, ':==', startLine, startCol, startOffset, 3);
        return;
      }
      this.addToken(TokenType.AssignOp, ':=', startLine, startCol, startOffset, 2);
      return;
    }

    // Not a keyword, not := or :== - backtrack so the identifier after ':' is not lost
    this.pos = wordStart;
    this.column = startCol + 1;

    // Just a colon
    this.addToken(TokenType.Colon, ':', startLine, startCol, startOffset, 1);
  }

  private scanDot(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;

    this.advance(); // .

    // Check for .T., .F., .AND., .OR., .NOT.
    let word = '.';
    const wordStart = this.pos;
    while (this.pos < this.source.length && (this.isAlpha(this.source[this.pos]) || this.source[this.pos] === '.')) {
      word += this.source[this.pos];
      this.advance();
    }

    const upper = word.toUpperCase();
    if (upper === '.T.') {
      this.addToken(TokenType.BooleanTrue, word, startLine, startCol, startOffset, this.pos - startOffset);
    } else if (upper === '.F.') {
      this.addToken(TokenType.BooleanFalse, word, startLine, startCol, startOffset, this.pos - startOffset);
    } else if (upper === '.AND.') {
      this.addToken(TokenType.DotAnd, word, startLine, startCol, startOffset, this.pos - startOffset);
    } else if (upper === '.OR.') {
      this.addToken(TokenType.DotOr, word, startLine, startCol, startOffset, this.pos - startOffset);
    } else if (upper === '.NOT.') {
      this.addToken(TokenType.DotNot, word, startLine, startCol, startOffset, this.pos - startOffset);
    } else {
      // Unknown dot expression - backtrack and emit just the dot
      this.pos = wordStart;
      this.column = startCol + 1;
      this.addToken(TokenType.Dot, '.', startLine, startCol, startOffset, 1);
    }
  }

  private scanIdentifier(): void {
    const startOffset = this.pos;
    const startLine = this.line;
    const startCol = this.column;

    while (this.pos < this.source.length && (this.isAlphaNumeric(this.source[this.pos]) || this.source[this.pos] === '_')) {
      this.advance();
    }

    this.addToken(TokenType.Identifier, this.source.substring(startOffset, this.pos), startLine, startCol, startOffset, this.pos - startOffset);
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    this.column++;
    return ch;
  }

  private peek(): string {
    return this.peekAt(1);
  }

  private peekAt(offset: number): string {
    const idx = this.pos + offset;
    if (idx >= this.source.length) {
      return '\0';
    }
    return this.source[idx];
  }

  private addToken(type: TokenType, value: string, line: number, column: number, offset: number, length: number): void {
    this.tokens.push({ type, value, line, column, offset, length });
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch);
  }
}
