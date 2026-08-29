export interface SSLFormatSqlOptions {
  enabled: boolean;
  keywordCase: 'upper' | 'lower' | 'preserve';
  indentSpaces: number;
  style: 'standard' | 'canonicalCompact' | 'compact' | 'expanded';
}

export const DEFAULT_SQL_FORMAT_OPTIONS: SSLFormatSqlOptions = {
  enabled: true,
  keywordCase: 'upper',
  indentSpaces: 4,
  style: 'canonicalCompact',
};

enum SqlTokKind {
  Keyword,
  Identifier,
  String,
  Number,
  Placeholder,
  Operator,
  Comma,
  Paren,
  Dot,
  Star,
  Other,
}

interface SqlTok {
  kind: SqlTokKind;
  text: string;
}

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX',
  'VIEW', 'PROCEDURE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL',
  'CROSS', 'ON', 'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'UNION', 'ALL',
  'DISTINCT', 'TOP', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'EXISTS', 'IN',
  'BETWEEN', 'LIKE', 'IS', 'NULL', 'ASC', 'DESC', 'PRIMARY', 'KEY', 'FOREIGN',
  'REFERENCES', 'DEFAULT', 'WITH', 'NOLOCK', 'EXEC', 'DECLARE', 'BEGIN',
  'COMMIT', 'ROLLBACK', 'TRANSACTION', 'GO', 'USE', 'IF', 'ELSE', 'PRINT',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'CAST', 'CONVERT',
]);

const CLAUSE_BREAK_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'JOIN', 'INNER',
  'LEFT', 'RIGHT', 'FULL', 'CROSS', 'UNION', 'SET', 'VALUES', 'INSERT',
  'UPDATE', 'DELETE', 'ON',
]);

const INDENTED_CLAUSE_KEYWORDS = new Set([
  'AND', 'OR', 'WHEN', 'THEN', 'ON',
]);

function tokenizeSql(sql: string): SqlTok[] {
  const tokens: SqlTok[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n && sql[j] !== ch) {
        if (sql[j] === '\\') {
          j++;
        }
        j++;
      }
      if (j < n) {
        j++;
      }
      tokens.push({ kind: SqlTokKind.String, text: sql.substring(i, j) });
      i = j;
      continue;
    }
    if (ch === '[') {
      let j = i + 1;
      while (j < n && sql[j] !== ']') {
        j++;
      }
      if (j < n) {
        j++;
      }
      tokens.push({ kind: SqlTokKind.Identifier, text: sql.substring(i, j) });
      i = j;
      continue;
    }
    if (ch === '?') {
      let j = i + 1;
      while (j < n && sql[j] !== '?' && sql[j] !== ' ') {
        j++;
      }
      if (j < n && sql[j] === '?') {
        j++;
      }
      tokens.push({ kind: SqlTokKind.Placeholder, text: sql.substring(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9.]/.test(sql[j])) {
        j++;
      }
      tokens.push({ kind: SqlTokKind.Number, text: sql.substring(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_#@$]/.test(sql[j])) {
        j++;
      }
      const text = sql.substring(i, j);
      tokens.push({
        kind: SQL_KEYWORDS.has(text.toUpperCase()) ? SqlTokKind.Keyword : SqlTokKind.Identifier,
        text,
      });
      i = j;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ kind: SqlTokKind.Paren, text: ch });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: SqlTokKind.Comma, text: ch });
      i++;
      continue;
    }
    if (ch === '.') {
      tokens.push({ kind: SqlTokKind.Dot, text: ch });
      i++;
      continue;
    }
    if (ch === '*') {
      tokens.push({ kind: SqlTokKind.Star, text: ch });
      i++;
      continue;
    }
    if ('=<>!+-/%&|^'.indexOf(ch) >= 0) {
      let j = i + 1;
      while (j < n && '=<>!+-/%&|^'.indexOf(sql[j]) >= 0) {
        j++;
      }
      tokens.push({ kind: SqlTokKind.Operator, text: sql.substring(i, j) });
      i = j;
      continue;
    }
    tokens.push({ kind: SqlTokKind.Other, text: ch });
    i++;
  }
  return tokens;
}

function applyKeywordCase(text: string, options: SSLFormatSqlOptions): string {
  if (options.keywordCase === 'lower') {
    return text.toLowerCase();
  }
  if (options.keywordCase === 'preserve') {
    return text;
  }
  return text.toUpperCase();
}

function formatTokenText(tok: SqlTok, options: SSLFormatSqlOptions): string {
  if (tok.kind === SqlTokKind.Keyword) {
    return applyKeywordCase(tok.text, options);
  }
  if (tok.kind === SqlTokKind.Identifier) {
    return tok.text.toLowerCase();
  }
  return tok.text;
}

function needsSqlSpace(prev: SqlTok, curr: SqlTok): boolean {
  if (prev.kind === SqlTokKind.Keyword && curr.kind === SqlTokKind.Paren && curr.text === '(') {
    return true;
  }
  if (prev.kind === SqlTokKind.Paren && prev.text === '(') {
    return false;
  }
  if (curr.kind === SqlTokKind.Paren && curr.text === ')') {
    return false;
  }
  if (curr.kind === SqlTokKind.Comma) {
    return false;
  }
  if (prev.kind === SqlTokKind.Comma) {
    return true;
  }
  if (prev.kind === SqlTokKind.Dot || curr.kind === SqlTokKind.Dot) {
    return false;
  }
  if (prev.kind === SqlTokKind.Operator || curr.kind === SqlTokKind.Operator) {
    if ((prev.text === '-' || prev.text === '+') && curr.kind === SqlTokKind.Number) {
      return false;
    }
    return true;
  }
  const isAtom = (t: SqlTok) =>
    t.kind === SqlTokKind.Keyword ||
    t.kind === SqlTokKind.Identifier ||
    t.kind === SqlTokKind.Number ||
    t.kind === SqlTokKind.Placeholder ||
    t.kind === SqlTokKind.String;
  if (isAtom(prev) && isAtom(curr)) {
    return true;
  }
  if (prev.kind === SqlTokKind.Paren && prev.text === ')' && isAtom(curr)) {
    return true;
  }
  return false;
}

function isComplexSql(tokens: SqlTok[]): boolean {
  return tokens.some((t) => {
    if (t.kind !== SqlTokKind.Keyword) {
      return false;
    }
    const u = t.text.toUpperCase();
    return (
      u === 'FROM' || u === 'WHERE' || u === 'JOIN' || u === 'GROUP' ||
      u === 'ORDER' || u === 'UNION' || u === 'VALUES' || u === 'SET' ||
      (u === 'SELECT' && tokens.length > 5)
    );
  });
}

function formatSqlContent(tokens: SqlTok[], options: SSLFormatSqlOptions, baseIndent: string): string {
  const indent = ' '.repeat(options.indentSpaces || 4);
  const maxLineLength = 120;
  const compact = options.style === 'compact';
  const canonical = options.style === 'canonicalCompact' || options.style === 'expanded';
  const complex = isComplexSql(tokens);
  const lines: string[] = [];
  let current = '';
  let currentLen = baseIndent.length;
  let parenDepth = 0;
  let inSelectColumns = false;
  let currentClause = '';
  let isFirst = true;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : null;
    const u = tok.text.toUpperCase();

    if (tok.kind === SqlTokKind.Keyword) {
      if (u === 'SELECT') {
        currentClause = 'SELECT';
        inSelectColumns = true;
      } else if (u === 'FROM') {
        inSelectColumns = false;
        currentClause = 'FROM';
      } else if (u === 'WHERE') {
        currentClause = 'WHERE';
      } else if (u === 'SET') {
        currentClause = 'SET';
      } else if (u === 'VALUES') {
        currentClause = 'VALUES';
      } else if (u === 'GROUP' || u === 'ORDER' || u === 'UNION' || u === 'INSERT' || u === 'UPDATE' || u === 'DELETE') {
        currentClause = u;
      }
    }

    if (tok.kind === SqlTokKind.Paren) {
      if (tok.text === '(') {
        parenDepth++;
      } else {
        parenDepth = Math.max(0, parenDepth - 1);
      }
    }

    let needsBreak = false;
    let extraIndent = '';

    if (!isFirst && complex) {
      const prevU = prev ? prev.text.toUpperCase() : '';
      if (!compact && tok.kind === SqlTokKind.Keyword && CLAUSE_BREAK_KEYWORDS.has(u)) {
        if (u === 'JOIN' && prev && ['LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS'].indexOf(prevU) >= 0) {
          needsBreak = false;
        } else {
          needsBreak = true;
          if (u === 'ON' && canonical) {
            extraIndent = indent;
          }
        }
      }
      if (canonical && tok.kind === SqlTokKind.Keyword && INDENTED_CLAUSE_KEYWORDS.has(u)) {
        needsBreak = true;
        extraIndent = indent;
      }
      if (!compact && tok.kind === SqlTokKind.Keyword && u === 'SELECT' && prev && prev.text === '(') {
        needsBreak = true;
        extraIndent = indent;
      }
      if (!compact && prev && prevU === 'SET' && parenDepth === 0) {
        needsBreak = true;
        if (canonical) {
          extraIndent = indent;
        }
      }
      if (!compact && prev && prev.text === ',' && currentClause === 'SET' && parenDepth === 0) {
        needsBreak = true;
        if (canonical) {
          extraIndent = indent;
        }
      }
    }

    if (needsBreak) {
      const parenIndent = indent.repeat(parenDepth);
      lines.push(current);
      current = baseIndent + parenIndent + extraIndent;
      currentLen = baseIndent.length + parenIndent.length + extraIndent.length;
    } else if (prev && needsSqlSpace(prev, tok)) {
      current += ' ';
      currentLen += 1;
    }

    const text = formatTokenText(tok, options);
    current += text;
    currentLen += text.length;
    isFirst = false;
  }
  lines.push(current);
  return lines.filter((l) => l.trim().length > 0).join('\n');
}

/**
 * Formats the contents of an inline SQL string literal (e.g. the first argument
 * of SQLExecute / RunSQL / GetDataSet). Returns the reformatted string content
 * without surrounding quotes. Returns the original content when it does not look
 * like a complex SQL statement or SQL formatting is disabled.
 */
export function formatSqlLiteral(content: string, options: SSLFormatSqlOptions): string {
  if (!options.enabled) {
    return content;
  }
  const tokens = tokenizeSql(content);
  if (tokens.length === 0) {
    return content;
  }
  if (!isComplexSql(tokens)) {
    return content;
  }
  const baseIndent = ' '.repeat(0);
  const formatted = formatSqlContent(tokens, options, baseIndent);
  if (formatted.trim() === content.trim()) {
    return content;
  }
  return formatted;
}

/**
 * Checks whether a string argument looks like an inline SQL statement worth
 * reflowing (contains a SQL keyword outside of a trivial value).
 */
export function looksLikeSql(content: string): boolean {
  return /\b(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP|EXEC)\b/i.test(content);
}