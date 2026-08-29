import { Hover, MarkupContent, MarkupKind } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ProgramNode, ASTNode, IdentifierNode, FunctionCallNode, ProcedureDeclNode } from './ast';
import { SymbolTable } from './symbol-table';
import { getBuiltinFunction, BuiltinFunction } from './builtins';
import { formatSSLDoc } from './ssldocs';

export function getHover(
  document: TextDocument,
  ast: ProgramNode,
  symbolTable: SymbolTable,
  position: { line: number; character: number }
): Hover | null {
  const text = document.getText();
  const lines = text.split('\n');
  if (position.line >= lines.length) return null;

  const line = lines[position.line];
  // Find the word at cursor position
  const word = getWordAtPosition(line, position.character);
  if (!word) return null;

  // Check built-in functions first
  const builtins = getBuiltinFunction(word);
  if (builtins && builtins.length > 0) {
    return formatBuiltinHover(builtins);
  }

  // Check user-defined symbols
  const symbol = symbolTable.lookup(word);
  if (symbol) {
    return formatSymbolHover(symbol.name, symbol.declarationNode);
  }

  // Check SSL keywords
  const keywordDoc = getKeywordDocumentation(word);
  if (keywordDoc) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: keywordDoc,
      },
    };
  }

  return null;
}

function formatBuiltinHover(builtins: BuiltinFunction[]): Hover {
  const first = builtins[0];
  let md = `**${first.signature}**\n\n`;
  md += `*Library: ${first.library}*\n\n`;
  md += first.description;

  if (first.parameters.length > 0) {
    md += '\n\n**Parameters:**\n';
    for (const param of first.parameters) {
      md += `\n- \`${param.name}\` (\`${param.type}\`): ${param.description}`;
    }
  }

  md += `\n\n**Returns:** \`${first.returnType}\``;

  md += formatSSLDoc(first.name);

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: md,
    },
  };
}

function formatSymbolHover(name: string, node: ASTNode): Hover {
  let md = '';
  switch (node.type) {
    case 'ProcedureDecl': {
      const proc = node as ProcedureDeclNode;
      md = `**procedure** \`${proc.name}\``;
      if (proc.params && proc.params.params.length > 0) {
        md += '(';
        md += proc.params.params.map(p => p.name).join(', ');
        md += ')';
      } else {
        md += '()';
      }
      break;
    }
    case 'Identifier':
      md = `**variable** \`${name}\``;
      break;
    default:
      md = `**${node.type}** \`${name}\``;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: md,
    },
  };
}

function getWordAtPosition(line: string, character: number): string | null {
  if (character >= line.length) return null;

  let start = character;
  let end = character;

  // Include colon for keyword detection (:PROCEDURE, :IF, etc.)
  while (start > 0 && /[:a-zA-Z0-9_]/.test(line[start - 1])) {
    start--;
  }
  while (end < line.length && /[:a-zA-Z0-9_]/.test(line[end])) {
    end++;
  }

  const word = line.substring(start, end);
  return word.length > 0 ? word : null;
}

const KEYWORDS: Record<string, string> = {
  ':PROCEDURE': 'Declares a procedure.\n\n```ssl\n:PROCEDURE ProcName;\n:PARAMETERS p1, p2;\n:RETURN;\n:ENDPROC;\n```',
  ':ENDPROC': 'Ends a procedure declaration.',
  ':PARAMETERS': 'Declares procedure parameters.\n\n```ssl\n:PARAMETERS param1, param2 := defaultValue;\n```',
  ':DECLARE': 'Declares local variables.\n\n```ssl\n:DECLARE sName, nCount;\n```',
  ':IF': 'Conditional statement.\n\n```ssl\n:IF condition;\n  /* then branch */\n:ELSE;\n  /* else branch */\n:ENDIF;\n```',
  ':ELSE': 'Else branch of an if statement.',
  ':ENDIF': 'Ends an if statement.',
  ':FOR': 'For loop.\n\n```ssl\n:FOR i := 1 :TO 10;\n  /* body */\n:NEXT;\n```',
  ':NEXT': 'Ends a for loop.',
  ':WHILE': 'While loop.\n\n```ssl\n:WHILE condition;\n  /* body */\n:ENDWHILE;\n```',
  ':ENDWHILE': 'Ends a while loop.',
  ':EXITWHILE': 'Exits the current while loop.',
  ':BEGINCASE': 'Starts a case statement.\n\n```ssl\n:BEGINCASE;\n  :CASE expr1;\n    /* ... */\n  :EXITCASE;\n  :OTHERWISE;\n    /* ... */\n:ENDCASE;\n```',
  ':CASE': 'A branch in a case statement.',
  ':EXITCASE': 'Exits the current case branch.',
  ':OTHERWISE': 'Default branch in a case statement.',
  ':ENDCASE': 'Ends a case statement.',
  ':TRY': 'Starts error handling.\n\n```ssl\n:TRY;\n  /* code */\n:CATCH;\n  /* error handler */\n:FINALLY;\n  /* cleanup */\n:ENDTRY;\n```',
  ':CATCH': 'Error handler in a try block.',
  ':FINALLY': 'Finally block in error handling.',
  ':ENDTRY': 'Ends a try block.',
  ':RETURN': 'Returns from a procedure.\n\n```ssl\n:RETURN value;\n```',
  ':CLASS': 'Declares a class.\n\n```ssl\n:CLASS ClassName;\n:INHERIT BaseClass;\n:PROCEDURE Method;\n:ENDPROC;\n```',
  ':INCLUDE': 'Includes another file.\n\n```ssl\n:INCLUDE Module.Procedure;\n```',
  ':LOOP': 'Infinite loop (use with :EXIT).',
  ':DEFAULT': 'Sets default parameter values.',
  ':STEP': 'Step value in a for loop.',
  ':ACCESS': 'Declares a property accessor.',
  ':ASSIGN': 'Declares a property assignment accessor.',
};

function getKeywordDocumentation(word: string): string | null {
  const upper = word.toUpperCase();
  return KEYWORDS[upper] || null;
}
