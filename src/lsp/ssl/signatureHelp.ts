import {
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  Position,
} from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SSLLexer, TokenType, Token } from './lexer';
import { SymbolTable, SymbolKind } from './symbol-table';
import { getBuiltinFunction } from './builtins';
import { ProcedureDeclNode } from './ast';

function tokenAt(tokens: Token[], line: number, character: number): Token | undefined {
  return tokens.find(
    (t) => t.line === line && character >= t.column && character < t.column + t.length
  );
}

function countCommasBetween(tokens: Token[], open: Token, cursor: Token): number {
  let depth = 0;
  let count = 0;
  for (const t of tokens) {
    if (t.offset < open.offset) {
      continue;
    }
    if (t.offset > cursor.offset) {
      break;
    }
    if (t.type === TokenType.LeftParen || t.type === TokenType.LeftBrace || t.type === TokenType.LeftBracket) {
      depth++;
    } else if (t.type === TokenType.RightParen || t.type === TokenType.RightBrace || t.type === TokenType.RightBracket) {
      depth = Math.max(0, depth - 1);
    } else if (t.type === TokenType.Comma && depth === 1) {
      count++;
    }
  }
  return count;
}

function findCallContext(
  tokens: Token[],
  position: Position
): { openParen: Token; fnName: string } | undefined {
  const cursor = tokenAt(tokens, position.line, position.character);
  const ref = cursor ?? tokens.find((t) => t.line >= position.line);
  if (!ref) {
    return undefined;
  }

  // Scan backwards for the enclosing ( that belongs to a function call
  let parenDepth = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.offset > ref.offset) {
      continue;
    }
    if (t.type === TokenType.RightParen) {
      parenDepth++;
      continue;
    }
    if (t.type === TokenType.LeftParen) {
      if (parenDepth > 0) {
        parenDepth--;
        continue;
      }
      // t is an open paren at depth 0 - find the name before it
      const prev = tokens[i - 1];
      if (!prev) {
        return undefined;
      }
      if (prev.type === TokenType.Identifier) {
        // member access? oObj:Method(
        const prevPrev = tokens[i - 2];
        if (prevPrev && prevPrev.type === TokenType.Colon) {
          return { openParen: t, fnName: prev.value };
        }
        return { openParen: t, fnName: prev.value };
      }
      return undefined;
    }
  }
  return undefined;
}

export function getSignatureHelp(
  document: TextDocument,
  symbolTable: SymbolTable,
  position: Position
): SignatureHelp | null {
  const text = document.getText();
  const lexer = new SSLLexer(text);
  const tokens = lexer.tokenize().filter((t) => t.type !== TokenType.Eof);

  const context = findCallContext(tokens, position);
  if (!context) {
    return null;
  }
  const { openParen, fnName } = context;
  const cursor = tokenAt(tokens, position.line, position.character);
  const activeParam = cursor ? countCommasBetween(tokens, openParen, cursor) : 0;

  const builtins = getBuiltinFunction(fnName);
  const signatures: SignatureInformation[] = [];

  if (builtins && builtins.length > 0) {
    for (const fn of builtins) {
      const params: ParameterInformation[] = fn.parameters.map((p) => ({
        label: `${p.type} ${p.name}`,
        documentation: p.description,
      }));
      signatures.push({
        label: fn.signature,
        documentation: fn.description,
        parameters: params,
      });
    }
  } else {
    const symbol = symbolTable.lookup(fnName);
    if (!symbol || symbol.kind !== SymbolKind.Procedure) {
      return null;
    }
    const decl = symbol.declarationNode as ProcedureDeclNode;
    const paramNames = decl.params ? decl.params.params.map((p) => p.name) : [];
    const params: ParameterInformation[] = paramNames.map((name) => ({ label: name }));
    signatures.push({
      label: `${fnName}(${paramNames.join(', ')})`,
      parameters: params,
    });
  }

  return {
    signatures,
    activeSignature: 0,
    activeParameter: Math.min(activeParam, signatures[0]?.parameters?.length ?? 0),
  };
}
