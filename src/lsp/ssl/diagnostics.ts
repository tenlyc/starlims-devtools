import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-types';
import { ParseError } from './parser';

export function computeDiagnostics(errors: ParseError[]): Diagnostic[] {
  return errors.map((err: ParseError) => {
    const range: Range = {
      start: { line: err.line, character: err.column },
      end: { line: err.line, character: err.column + 1 },
    };
    return {
      severity: DiagnosticSeverity.Error,
      range,
      message: err.message,
      source: 'ssl-lsp',
    };
  });
}
