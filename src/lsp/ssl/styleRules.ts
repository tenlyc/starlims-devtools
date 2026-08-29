import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import { SSLLexer, TokenType, Token } from './lexer';
import {
  ProgramNode, ASTNode, ProcedureDeclNode, DeclareStmtNode, ParamsDeclNode,
  CaseStmtNode, IfStmtNode, ForStmtNode, WhileStmtNode, TryStmtNode,
  FunctionCallNode,
} from './ast';

export type RuleSeverity = 'off' | 'info' | 'warn' | 'error';

export interface StyleRuleMeta {
  description: string;
  default: Exclude<RuleSeverity, 'off'>;
}

export const STYLE_RULE_META: Record<string, StyleRuleMeta> = {
  keyword_uppercase: { description: 'SSL keywords must be written in UPPERCASE.', default: 'warn' },
  not_preferred_operator: { description: 'Use != instead of <> or # for inequality.', default: 'warn' },
  dot_property_access: { description: 'Prefer : over . for property access.', default: 'warn' },
  equals_vs_strict_equals: { description: 'Use == for exact string comparison instead of =.', default: 'info' },
  step_spacing: { description: 'Insert a space before :STEP.', default: 'info' },
  comment_termination: { description: 'Comments must end with ; (STARLIMS block comments are terminated by the first ;).', default: 'warn' },
  sql_injection: { description: 'Do not concatenate strings into SQL statements; use ?param? placeholders.', default: 'warn' },
  require_parameterized_queries: { description: 'SQL statements should use parameter placeholders instead of inline values.', default: 'warn' },
  placeholder_policy: { description: 'SQLExecute and GetDataSet expect named ?param? placeholders; RunSQL/LSearch/LSelect/GetDataSetEx expect positional ? markers.', default: 'info' },
  hungarian_notation: { description: 'Variables should follow Hungarian notation with an allowed prefix.', default: 'warn' },
  limit_block_depth: { description: 'Limit the nesting depth of control flow blocks.', default: 'warn' },
  max_params_per_procedure: { description: 'Limit the number of :PARAMETERS per procedure.', default: 'warn' },
  missing_otherwise: { description: ':BEGINCASE blocks should have an :OTHERWISE branch.', default: 'warn' },
  prefer_exitcase: { description: 'Use :EXITCASE at the end of each :CASE branch.', default: 'info' },
  redeclare_is_noop: { description: 'Re-declaring a variable in the same scope has no effect.', default: 'info' },
  parameters_first: { description: ':PARAMETERS must come directly after :PROCEDURE.', default: 'info' },
  default_after_parameters: { description: ':DEFAULT statements must follow :PARAMETERS.', default: 'info' },
  nested_iif: { description: 'Avoid nesting IIF() inside IIF(); use :IF/:ELSE/:ENDIF instead.', default: 'info' },
};

export interface StyleRuleConfig {
  rules: Record<string, RuleSeverity>;
  strict: boolean;
  globals: string[];
  hungarianPrefixes: string[];
  limitBlockDepth: number;
  maxParamsPerProcedure: number;
}

export const DEFAULT_STYLE_RULE_CONFIG: StyleRuleConfig = {
  rules: {},
  strict: false,
  globals: [],
  hungarianPrefixes: ['s', 'n', 'b', 'd', 'a', 'o', 'fn', 'v'],
  limitBlockDepth: 10,
  maxParamsPerProcedure: 30,
};

interface Finding {
  slug: string;
  line: number;
  column: number;
  endColumn: number;
  message: string;
}

const LOOP_COUNTER_EXCEPTIONS = new Set(['i', 'j', 'k', 'x', 'y', 'z']);
const SQL_INLINE_FUNCTIONS = new Set([
  'SQLEXECUTE', 'GETDATASET', 'GETDATASETEX', 'RUNSQL', 'LSEARCH', 'LSELECT',
  'LSELECT1', 'LSELECTC', 'GETNETDATASET', 'GETDATASETXMLFROMSELECT',
  'GETDATASETWITHSCHEMAFROMSELECT', 'GETSSLDATASET',
]);
const NAMED_PLACEHOLDER_FUNCTIONS = new Set([
  'SQLEXECUTE', 'GETDATASET', 'GETDATASETEX', 'GETNETDATASET',
  'GETDATASETXMLFROMSELECT', 'GETDATASETWITHSCHEMAFROMSELECT', 'GETSSLDATASET',
]);
const POSITIONAL_PLACEHOLDER_FUNCTIONS = new Set(['RUNSQL', 'LSEARCH', 'LSELECT', 'LSELECT1', 'LSELECTC']);
const BUILD_STRING_FUNCTIONS = new Set(['BUILDSTRING', 'BUILDSTRINGFORIN', 'BUILDSTRINGEX']);

function isKeywordToken(t: Token): boolean {
  switch (t.type) {
    case TokenType.Procedure:
    case TokenType.EndProc:
    case TokenType.Parameters:
    case TokenType.Declare:
    case TokenType.Default:
    case TokenType.Return:
    case TokenType.If:
    case TokenType.Else:
    case TokenType.EndIf:
    case TokenType.BeginCase:
    case TokenType.Case:
    case TokenType.ExitCase:
    case TokenType.Otherwise:
    case TokenType.EndCase:
    case TokenType.For:
    case TokenType.Next:
    case TokenType.While:
    case TokenType.EndWhile:
    case TokenType.Loop:
    case TokenType.Exit:
    case TokenType.Try:
    case TokenType.Catch:
    case TokenType.Finally:
    case TokenType.EndTry:
    case TokenType.Class:
    case TokenType.Inherit:
    case TokenType.Include:
    case TokenType.Dsn:
    case TokenType.Access:
    case TokenType.Assign:
    case TokenType.To:
    case TokenType.Step:
    case TokenType.Public:
    case TokenType.Error:
    case TokenType.Region:
    case TokenType.EndRegion:
    case TokenType.BeginInlineCode:
    case TokenType.EndInlineCode:
    case TokenType.Resume:
    case TokenType.ExitFor:
    case TokenType.ExitWhile:
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Token-level rules
// ---------------------------------------------------------------------------

function tokenRules(tokens: Token[], text: string, findings: Finding[]): void {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : undefined;
    const next = i + 1 < tokens.length ? tokens[i + 1] : undefined;

    if (isKeywordToken(t) && !t.value.startsWith('#') && t.value !== t.value.toUpperCase()) {
      findings.push({
        slug: 'keyword_uppercase',
        line: t.line,
        column: t.column,
        endColumn: t.column + t.length,
        message: `Keyword '${t.value}' should be written in UPPERCASE (${t.value.toUpperCase()}).`,
      });
    }

    if (t.type === TokenType.NotEquals && t.value === '<>') {
      findings.push({
        slug: 'not_preferred_operator',
        line: t.line,
        column: t.column,
        endColumn: t.column + 2,
        message: 'Use != instead of <> for inequality.',
      });
    }
    if (t.type === TokenType.ErrorToken && t.value === '#') {
      findings.push({
        slug: 'not_preferred_operator',
        line: t.line,
        column: t.column,
        endColumn: t.column + 1,
        message: 'Use != instead of # for inequality.',
      });
    }

    if (t.type === TokenType.Dot && prev && next &&
        (prev.type === TokenType.Identifier || prev.type === TokenType.RightBracket ||
         prev.type === TokenType.RightParen) &&
        next.type === TokenType.Identifier) {
      findings.push({
        slug: 'dot_property_access',
        line: t.line,
        column: t.column,
        endColumn: t.column + 1,
        message: 'Prefer : over . for property access.',
      });
    }

    if (t.type === TokenType.SingleEquals && prev && next &&
        (prev.type === TokenType.String || next.type === TokenType.String)) {
      findings.push({
        slug: 'equals_vs_strict_equals',
        line: t.line,
        column: t.column,
        endColumn: t.column + 1,
        message: 'Use == for exact string comparison instead of =.',
      });
    }

    if (t.type === TokenType.Step && prev) {
      const gap = t.offset - (prev.offset + prev.length);
      if (gap <= 0 && (prev.type === TokenType.Number || prev.type === TokenType.Float ||
          prev.type === TokenType.Identifier || prev.type === TokenType.RightParen)) {
        findings.push({
          slug: 'step_spacing',
          line: t.line,
          column: t.column,
          endColumn: t.column + 5,
          message: 'Insert a space before :STEP.',
        });
      }
    }

    if (t.type === TokenType.Comment && t.offset + t.length >= text.length - 1 && !/;\s*$/.test(t.value)) {
      findings.push({
        slug: 'comment_termination',
        line: t.line,
        column: t.column,
        endColumn: t.column + t.length,
        message: 'Comment must end with ; (STARLIMS block comments are terminated by the first ;).',
      });
    }

    if (t.type === TokenType.Identifier && SQL_INLINE_FUNCTIONS.has(t.value.toUpperCase()) &&
        next && next.type === TokenType.LeftParen) {
      checkSqlFunction(t, tokens, i, findings);
    }
  }
}

function checkSqlFunction(fnToken: Token, tokens: Token[], startIdx: number, findings: Finding[]): void {
  const fnName = fnToken.value.toUpperCase();
  let depth = 0;
  let hasConcatenation = false;
  let stringArgCount = 0;
  let sawPlaceholder = false;
  let sawBareQuestion = false;
  let sqlStringStart = -1;
  let usedBuildString = false;

  for (let j = startIdx + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.type === TokenType.LeftParen) {
      depth++;
      continue;
    }
    if (t.type === TokenType.RightParen) {
      depth--;
      if (depth === 0) {
        break;
      }
      continue;
    }
    if (depth <= 0) {
      break;
    }
    if (t.type === TokenType.Identifier && BUILD_STRING_FUNCTIONS.has(t.value.toUpperCase()) &&
        j + 1 < tokens.length && tokens[j + 1].type === TokenType.LeftParen) {
      usedBuildString = true;
    }
    if (t.type === TokenType.String && sqlStringStart === -1) {
      sqlStringStart = j;
      stringArgCount++;
      const value = t.value;
      sawPlaceholder = sawPlaceholder || /\?[^?\s]+\?/.test(value);
      sawBareQuestion = sawBareQuestion || value.replace(/\?[^?\s]+\?/g, '').includes('?');
    }
    if (t.type === TokenType.String) {
      const value = t.value;
      sawPlaceholder = sawPlaceholder || /\?[^?\s]+\?/.test(value);
      sawBareQuestion = sawBareQuestion || value.replace(/\?[^?\s]+\?/g, '').includes('?');
    }
    if (t.type === TokenType.Plus && j > 0) {
      const before = tokens[j - 1];
      if (before.type === TokenType.String || before.type === TokenType.Identifier) {
        hasConcatenation = true;
      }
    }
  }

  if (hasConcatenation && !usedBuildString) {
    findings.push({
      slug: 'sql_injection',
      line: fnToken.line,
      column: fnToken.column,
      endColumn: fnToken.column + fnToken.length,
      message: `Do not concatenate strings into the SQL statement passed to ${fnName}; use ?param? placeholders instead.`,
    });
  }

  if (stringArgCount > 0 && !sawPlaceholder && !sawBareQuestion) {
    findings.push({
      slug: 'require_parameterized_queries',
      line: fnToken.line,
      column: fnToken.column,
      endColumn: fnToken.column + fnToken.length,
      message: `${fnName} SQL statement should use parameter placeholders instead of inline values.`,
    });
  }

  if (stringArgCount > 0 && (sawPlaceholder || sawBareQuestion)) {
    const expectsNamed = NAMED_PLACEHOLDER_FUNCTIONS.has(fnName);
    const expectsPositional = POSITIONAL_PLACEHOLDER_FUNCTIONS.has(fnName);
    if (expectsNamed && sawBareQuestion && !sawPlaceholder) {
      findings.push({
        slug: 'placeholder_policy',
        line: fnToken.line,
        column: fnToken.column,
        endColumn: fnToken.column + fnToken.length,
        message: `${fnName} expects named ?param? placeholders, not positional ? markers.`,
      });
    }
    if (expectsPositional && sawPlaceholder && !sawBareQuestion) {
      findings.push({
        slug: 'placeholder_policy',
        line: fnToken.line,
        column: fnToken.column,
        endColumn: fnToken.column + fnToken.length,
        message: `${fnName} expects positional ? markers, not named ?param? placeholders.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// AST-level rules
// ---------------------------------------------------------------------------

function walk(node: ASTNode, fn: (n: ASTNode) => void): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  fn(node);
  for (const key of Object.keys(node)) {
    const v = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === 'object' && 'type' in item) {
          walk(item as ASTNode, fn);
        }
      }
    } else if (v && typeof v === 'object' && 'type' in v) {
      walk(v as ASTNode, fn);
    }
  }
}

function astRules(ast: ProgramNode, config: StyleRuleConfig, findings: Finding[]): void {
  const findingsFor = (slug: string) => findings.filter((f) => f.slug === slug);

  walk(ast, (node) => {
    if (node.type === 'DeclareStmt') {
      const decl = node as DeclareStmtNode;
      for (const nameNode of decl.nameNodes) {
        const name = nameNode.name;
        if (LOOP_COUNTER_EXCEPTIONS.has(name.toLowerCase())) {
          continue;
        }
        if (config.globals.includes(name)) {
          continue;
        }
        if (!startsWithAnyPrefix(name, config.hungarianPrefixes)) {
          findings.push({
            slug: 'hungarian_notation',
            line: nameNode.startLine,
            column: nameNode.startCol,
            endColumn: nameNode.endCol,
            message: `Variable '${name}' should start with one of the Hungarian notation prefixes: ${config.hungarianPrefixes.join(', ')}.`,
          });
        }
      }
    }

    if (node.type === 'ParamsDecl') {
      const params = (node as ParamsDeclNode).params;
      if (config.maxParamsPerProcedure > 0 && params.length > config.maxParamsPerProcedure) {
        findings.push({
          slug: 'max_params_per_procedure',
          line: node.startLine,
          column: node.startCol,
          endColumn: node.endCol,
          message: `Procedure declares ${params.length} parameters; the limit is ${config.maxParamsPerProcedure}.`,
        });
      }
      for (const p of params) {
        const name = p.nameNode.name;
        if (!startsWithAnyPrefix(name, config.hungarianPrefixes)) {
          findings.push({
            slug: 'hungarian_notation',
            line: p.nameNode.startLine,
            column: p.nameNode.startCol,
            endColumn: p.nameNode.endCol,
            message: `Parameter '${name}' should start with one of the Hungarian notation prefixes: ${config.hungarianPrefixes.join(', ')}.`,
          });
        }
      }
    }

    if (node.type === 'CaseStmt' && !(node as CaseStmtNode).otherwise) {
      findings.push({
        slug: 'missing_otherwise',
        line: node.startLine,
        column: node.startCol,
        endColumn: node.endCol,
        message: ':BEGINCASE block has no :OTHERWISE branch.',
      });
    }
  });

  walk(ast, (node) => {
    if (node.type === 'FunctionCall') {
      const call = node as FunctionCallNode;
      if (call.name.toLowerCase() === 'iif' && call.args.some(isNestedIif)) {
        findings.push({
          slug: 'nested_iif',
          line: node.startLine,
          column: node.startCol,
          endColumn: node.endCol,
          message: 'Avoid nesting IIF() inside IIF(); use :IF/:ELSE/:ENDIF instead.',
        });
      }
    }
  });

  // Block depth
  if (config.limitBlockDepth > 0) {
    checkBlockDepth(ast, config.limitBlockDepth, findings);
  }

  // Redeclare in same scope
  checkRedeclare(ast, findings);
}

function startsWithAnyPrefix(name: string, prefixes: string[]): boolean {
  return prefixes.some((p) => name.toLowerCase().startsWith(p.toLowerCase()));
}

function isNestedIif(arg: ASTNode): boolean {
  let found = false;
  walk(arg, (n) => {
    if (n.type === 'FunctionCall' && (n as FunctionCallNode).name.toLowerCase() === 'iif') {
      found = true;
    }
  });
  return found;
}

function checkBlockDepth(ast: ProgramNode, limit: number, findings: Finding[]): void {
  const visit = (node: ASTNode, depth: number): void => {
    const isBlock = node.type === 'IfStmt' || node.type === 'ForStmt' ||
      node.type === 'WhileStmt' || node.type === 'CaseStmt' || node.type === 'TryStmt';
    const current = isBlock ? depth + 1 : depth;
    if (isBlock && current > limit) {
      findings.push({
        slug: 'limit_block_depth',
        line: node.startLine,
        column: node.startCol,
        endColumn: node.endCol,
        message: `Block nesting depth ${current} exceeds the limit of ${limit}.`,
      });
    }
    for (const key of Object.keys(node)) {
      const v = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && 'type' in item) {
            visit(item as ASTNode, current);
          }
        }
      } else if (v && typeof v === 'object' && 'type' in v) {
        visit(v as ASTNode, current);
      }
    }
  };
  for (const stmt of ast.body) {
    visit(stmt, 0);
  }
}

function checkRedeclare(ast: ProgramNode, findings: Finding[]): void {
  const visitScope = (nodes: ASTNode[], declared: Set<string>): void => {
    for (const node of nodes) {
      if (node.type === 'DeclareStmt') {
        const decl = node as DeclareStmtNode;
        for (const nameNode of decl.nameNodes) {
          const key = nameNode.name.toLowerCase();
          if (declared.has(key)) {
            findings.push({
              slug: 'redeclare_is_noop',
              line: nameNode.startLine,
              column: nameNode.startCol,
              endColumn: nameNode.endCol,
              message: `Variable '${nameNode.name}' is already declared in this scope; the re-declaration has no effect.`,
            });
          } else {
            declared.add(key);
          }
        }
      }
      if (node.type === 'ProcedureDecl' || node.type === 'IfStmt' || node.type === 'ForStmt' ||
          node.type === 'WhileStmt' || node.type === 'CaseStmt' || node.type === 'TryStmt') {
        const body = extractBody(node);
        if (body.length > 0) {
          visitScope(body, new Set(declared));
        }
      }
    }
  };
  visitScope(ast.body, new Set());
}

function extractBody(node: ASTNode): ASTNode[] {
  switch (node.type) {
    case 'ProcedureDecl':
      return (node as ProcedureDeclNode).body;
    case 'IfStmt':
      return (node as IfStmtNode).thenBody;
    case 'ForStmt':
      return (node as ForStmtNode).body;
    case 'WhileStmt':
      return (node as WhileStmtNode).body;
    case 'CaseStmt':
      return (node as CaseStmtNode).branches;
    case 'TryStmt':
      return (node as TryStmtNode).body;
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Suppression comments
// ---------------------------------------------------------------------------

interface Suppression {
  slugs: Set<string>; // empty set means all (wildcard)
  startLine: number;
  endLine: number; // inclusive
}

const DISABLE_RE = /@ssl-disable\s+([^\r\n]+)/i;
const DISABLE_NEXT_RE = /@ssl-disable-next-line\s+([^\r\n]+)/i;

function parseSlugs(spec: string): Set<string> {
  const slugs = new Set<string>();
  for (const part of spec.replace(/;.*$/, '').split(/[\s,]+/)) {
    const slug = part.trim();
    if (slug) {
      slugs.add(slug);
    }
  }
  return slugs;
}

function collectSuppressions(tokens: Token[], lines: number): Suppression[] {
  const result: Suppression[] = [];
  for (const t of tokens) {
    if (t.type !== TokenType.Comment) {
      continue;
    }
    const value = t.value;
    let m = value.match(DISABLE_NEXT_RE);
    if (m) {
      result.push({ slugs: parseSlugs(m[1]), startLine: t.line + 1, endLine: t.line + 1 });
      continue;
    }
    m = value.match(DISABLE_RE);
    if (m) {
      result.push({ slugs: parseSlugs(m[1]), startLine: t.line, endLine: lines - 1 });
    }
  }
  return result;
}

function isSuppressed(suppressions: Suppression[], slug: string, line: number): boolean {
  return suppressions.some((s) => line >= s.startLine && line <= s.endLine &&
    (s.slugs.size === 0 || s.slugs.has(slug) || s.slugs.has('*')));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Computes style-guide diagnostics for an SSL document. Only rules whose
 * effective severity is not 'off' are reported. Findings can be suppressed
 * with the comment forms '@ssl-disable <slug>;' (rest of file) and
 * '@ssl-disable-next-line <slug>;' (next line).
 */
export function computeStyleDiagnostics(
  text: string,
  ast: ProgramNode,
  config: Partial<StyleRuleConfig> = {}
): Diagnostic[] {
  const cfg: StyleRuleConfig = { ...DEFAULT_STYLE_RULE_CONFIG, ...config };
  const lexer = new SSLLexer(text);
  const tokens = lexer.tokenize().filter((t) => t.type !== TokenType.Eof);

  const findings: Finding[] = [];
  tokenRules(tokens, text, findings);
  astRules(ast, cfg, findings);

  const lineCount = text.split(/\r?\n/).length;
  const suppressions = collectSuppressions(tokens, lineCount);

  const diagnostics: Diagnostic[] = [];
  for (const f of findings) {
    if (isSuppressed(suppressions, f.slug, f.line)) {
      continue;
    }
    const effective = effectiveSeverity(f.slug, cfg);
    if (effective === 'off') {
      continue;
    }
    diagnostics.push({
      severity: severityToLsp(effective),
      range: {
        start: { line: f.line, character: f.column },
        end: { line: f.line, character: Math.max(f.endColumn, f.column + 1) },
      },
      message: f.message,
      source: 'ssl-lsp',
      code: f.slug,
    });
  }
  return diagnostics;
}

export function effectiveSeverity(slug: string, config: StyleRuleConfig): RuleSeverity {
  const meta = STYLE_RULE_META[slug];
  if (!meta) {
    return 'off';
  }
  const override = config.rules[slug];
  const base: RuleSeverity = override ?? meta.default;
  if (config.strict && base === 'warn') {
    return 'error';
  }
  return base;
}

function severityToLsp(severity: Exclude<RuleSeverity, 'off'>): DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warn':
      return DiagnosticSeverity.Warning;
    default:
      return DiagnosticSeverity.Information;
  }
}
