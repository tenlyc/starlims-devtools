import { SSLLexer, TokenType, Token } from './lexer';
import {
  formatSqlLiteral,
  looksLikeSql,
  SSLFormatSqlOptions,
  DEFAULT_SQL_FORMAT_OPTIONS,
} from './sqlFormatter';

export interface SSLFormatOptions {
  indentStyle: 'tab' | 'space';
  indentWidth: number;
  operatorSpacing: boolean;
  commaSpacing: boolean;
  builtinFunctionCase: 'PascalCase' | 'preserve';
  wrapLength: number;
  semicolonEnforcement: boolean;
  blankLinesBetweenProcs: number;
  trimTrailingWhitespace: boolean;
  maxConsecutiveBlankLines: number;
  sql: SSLFormatSqlOptions;
}

export const DEFAULT_FORMAT_OPTIONS: SSLFormatOptions = {
  indentStyle: 'tab',
  indentWidth: 4,
  operatorSpacing: true,
  commaSpacing: true,
  builtinFunctionCase: 'PascalCase',
  wrapLength: 90,
  semicolonEnforcement: true,
  blankLinesBetweenProcs: 1,
  trimTrailingWhitespace: true,
  maxConsecutiveBlankLines: 2,
  sql: { ...DEFAULT_SQL_FORMAT_OPTIONS },
};

// ---------------------------------------------------------------------------
// Builtin function casing
// ---------------------------------------------------------------------------

const ACRONYMS = new Set([
  'SQL', 'XML', 'HTML', 'HTTP', 'HTTPS', 'FTP', 'GUID', 'UD', 'NET', 'DB',
  'CSV', 'JSON', 'ID', 'URL', 'API', 'LIMS', 'TVP', 'PDF', 'XFD', 'DS', 'SS',
  'IP', 'UID', 'CI', 'OA', 'UDF', 'TV',
]);

const GRAMMAR_BUILTIN_NAMES = [
  'DoProc', 'ExecFunction', 'ExecUdf', 'CreateUDObject', 'Branch', 'aadd',
  'aeval', 'aevala', 'afill', 'alen', 'arraycalc', 'arraynew', 'ascan',
  'ascanexact', 'buildarray', 'buildarray2', 'buildstring', 'buildstring2',
  'BuildStringForIn', 'comparray', 'delarray', 'extractcol', 'PrepareArrayForIn',
  'SortArray', 'ArrayToTVP', 'deleteinlinecode', 'endlimsoleconnect',
  'getinlinecode', 'getregion', 'In64BitMode', 'Let', 'LimsCleanup',
  'LimsNETConnect', 'LimsNETTypeOf', 'limsoleconnect', 'MakeNETObject',
  'StationName', 'BeginLimsTransaction', 'DetectSqlInjections',
  'EndLimsTransaction', 'GetConnectionByName', 'GetConnectionStrings',
  'GetDataSet', 'GetDataSetEx', 'GetDataSetFromArray', 'GetDataSetFromArrayEx',
  'GetDataSetWithSchemaFromSelect', 'GetDataSetXMLFromArray',
  'GetDataSetXMLFromSelect', 'GetDBMSName', 'GetDBMSProviderName',
  'GetDefaultConnection', 'GetLastSQLError', 'GetNETDataSet', 'GetNoLock',
  'GetTables', 'GetTransactionsCount', 'IgnoreSqlErrors', 'IsDBConnected',
  'IsInTransaction', 'IsTable', 'IsTableFld', 'LimsRecordsAffected',
  'LimsSetCounter', 'LimsSqlConnect', 'LimsSqlDisconnect', 'LSearch', 'LSelect',
  'LSelect1', 'LSelectC', 'RetrieveLong', 'ReturnLastSQLError', 'RunSQL',
  'SetDefaultConnection', 'SetSqlTimeout', 'ShowSqlErrors', 'SQLExecute',
  'SQLRemoveComments', 'TableFldLst', 'UpdLong', 'GetDSParameters',
  'GetSSLDataset', 'RunDS', 'IsDefined', 'IsHex', 'LFromHex', 'LHex2Dec',
  'LimsNETCast', 'LimsType', 'LimsTypeEx', 'LToHex', 'ClientEndOfDay',
  'ClientStartOfDay', 'CMonth', 'CToD', 'DateAdd', 'DateDiff', 'DateDiffEx',
  'DateFormat', 'DateFromNumbers', 'DateFromString', 'DateToString', 'Day',
  'DOW', 'DOY', 'DToC', 'DToS', 'Hour', 'IsInvariantDate', 'JDay', 'LIMSDate',
  'LimsGetDateFormat', 'LimsTime', 'MakeDateInvariant', 'MakeDateLocal',
  'Minute', 'Month', 'NoOfDays', 'Now', 'Second', 'Seconds', 'ServerEndOfDay',
  'ServerStartOfDay', 'ServerTimeZone', 'SetAmPm', 'StringToDate', 'Time',
  'Today', 'UserTimeZone', 'ValidateDate', 'Year', 'SendFromOutbox',
  'SendLimsEmail', 'SendOutlookReminder', 'SendToOutbox', 'ClearLastSSLError',
  'FormatErrorMessage', 'FormatSqlErrorMessage', 'GetLastSSLError', 'RaiseError',
  'CombineFiles', 'Directory', 'DosSupport', 'FileSupport', 'lDir',
  'ReadBytesBase64', 'ReadText', 'WriteBytesBase64', 'WriteText', 'CheckOnFtp',
  'CopyToFtp', 'DeleteDirOnFtp', 'DeleteFromFtp', 'GetDirFromFtp', 'GetFromFtp',
  'MakeDirOnFtp', 'MoveInFtp', 'ReadFromFtp', 'RenameOnFtp', 'SendToFtp',
  'WriteToFtp', 'MergeHtmlForm', 'Break', 'Compress', 'CreateGUID',
  'CreateLocal', 'CreatePublic', 'CreateZip', 'Decompress', 'ErrorMes',
  'ExtractZip', 'GetAppBaseFolder', 'GetAppWorkPathFolder', 'GetByName',
  'GetExecutionTrace', 'GetFeaturesAndNumbers', 'GetFileVersion',
  'GetForbiddenAppIDs', 'GetForbiddenDesignerAppIDs', 'GetInstallationKey',
  'GetLicenseInfoAsText', 'GetLogsFolder', 'GetNumberOfInstrumentConnections',
  'GetNumberOfNamedConcurrentUsers', 'GetNumberOfNamedUsers', 'GetPrinters',
  'GetSetting', 'GetSettings', 'GetSystemLayerId', 'GetWebFolder',
  'InBatchProcess', 'InfoMes', 'IsDemoLicense', 'IsFeatureAuthorized',
  'IsFeatureBasedLicense', 'IsGuid', 'IsProductionModeOn', 'LCase', 'LKill',
  'NetFrameworkVersion', 'Nothing', 'ResetApplication', 'ResetFeatures',
  'SetByName', 'SqlTraceOff', 'SqlTraceOn', 'TryConnect', 'usrmes', 'bs',
  'GetDecimalSep', 'GetDecimalSeparator', 'GetGroupSeparator', 'Integer',
  'IsNumeric', 'LimsXOr', 'MatFunc', 'Max', 'Min', 'Rand', 'Round',
  'RoundPoint5', 'Scient', 'SetDecimalSeparator', 'SetGroupSeparator', 'SigFig',
  'Sqrt', 'StdRound', 'ToNumeric', 'ToScientific', 'Val', 'ValidateNumeric',
  'LimsExec', 'lWait', 'PrmCount', 'RunApp', 'SubmitToBatch', 'SubmitToBatchEx',
  'TraceOff', 'TraceOn', 'UndeclaredVars', 'LPrint', 'SetLocationOracle',
  'SetLocationSQLServer', 'ConvertReport', 'ChkNewPassword', 'ChkPassword',
  'DecryptData', 'EncryptData', 'GetUserData', 'HashData', 'LDAPAuth',
  'LDAPAuthEX', 'SearchLDAPUser', 'SetUserData', 'SetUserPassword',
  'VerifySignature', 'ValidateFieldData', 'ValidateData', 'ValidateDSParams',
  'AllTrim', 'Asc', 'At', 'Chr', 'Empty', 'Left', 'Len', 'LimsAt', 'LimsString',
  'LLower', 'Lower', 'LStr', 'LTransform', 'LTrim', 'MimeDecode', 'MimeEncode',
  'Rat', 'Replace', 'Replicate', 'Right', 'Seval', 'Str', 'StringAdd',
  'StringClean', 'StringCreate', 'StringGet', 'StringKill', 'StrSrch',
  'StrTran', 'StrZero', 'SubStr', 'Trim', 'Upper', 'GetAllClientScripts',
  'MergeGlobalResources', 'PrepareForm', 'PrepareFormClientScript',
  'ProcessXfdFormForImport', 'SyncDesignResources',
  'SyncProgramaticResourcesAddProperty', 'ExecInternal', 'GetInternal',
  'GetInternalC', 'HasProperty', 'SetInternal', 'SetInternalC',
  'AddToApplication', 'AddToSession', 'ClearSession', 'FromJson',
  'GetFromApplication', 'GetFromSession', 'ToJson', 'UrlDecode', 'UrlEncode',
  'GetClientScriptReferences', 'GetFormReferences', 'MergeXfd', 'FromXml',
  'HtmlDecode', 'HtmlEncode', 'ToXml', 'XmlDomToUdObject',
];

function capitalizeFirst(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function toPascalCase(name: string): string {
  const parts = name
    .split(/_+/)
    .filter((p) => p.length > 0)
    .flatMap((part) => part.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/));
  return parts
    .map((p) => {
      if (ACRONYMS.has(p.toUpperCase()) && p === p.toUpperCase()) {
        return p.toUpperCase();
      }
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    })
    .join('');
}

/** Case-insensitive canonical builtin name map (all normalized to PascalCase). */
const CANONICAL_BUILTINS: Map<string, string> = new Map();
for (const name of GRAMMAR_BUILTIN_NAMES) {
  const canonical = name.includes('_') ? toPascalCase(name) : capitalizeFirst(name);
  CANONICAL_BUILTINS.set(name.toLowerCase(), canonical);
}

// ---------------------------------------------------------------------------
// Keyword classification
// ---------------------------------------------------------------------------

const BLOCK_START_KEYWORDS = new Set([
  'IF', 'WHILE', 'FOR', 'BEGINCASE', 'TRY', 'PROCEDURE', 'CLASS', 'REGION',
  'BEGININLINECODE',
]);
const BLOCK_END_KEYWORDS = new Set([
  'ENDIF', 'ENDWHILE', 'NEXT', 'ENDCASE', 'ENDTRY', 'ENDPROC', 'ENDCLASS',
  'ENDREGION', 'ENDINLINECODE',
]);
const BLOCK_MIDDLE_KEYWORDS = new Set(['ELSE', 'CATCH', 'FINALLY', 'CASE', 'OTHERWISE', 'EXITCASE']);
const PROCEDURE_LEVEL_KEYWORDS = new Set(['PARAMETERS', 'DEFAULT', 'DECLARE', 'PUBLIC']);
const NO_SEMICOLON_KEYWORDS = new Set(['TO', 'STEP']);

const SQL_FUNCTION_NAMES = new Set([
  'SQLEXECUTE', 'GETDATASET', 'GETDATASETEX', 'RUNSQL', 'LSEARCH', 'LSELECT',
  'LSELECT1', 'LSELECTC', 'GETNETDATASET', 'GETDATASETXMLFROMSELECT',
  'GETDATASETWITHSCHEMAFROMSELECT', 'GETDATASETFROMARRAY',
  'GETDATASETFROMARRAYEX', 'GETDATASETXMLFROMARRAY', 'GETSSLDATASET',
]);

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

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

function isOperatorToken(t: Token): boolean {
  switch (t.type) {
    case TokenType.AssignOp:
    case TokenType.Equals:
    case TokenType.NotEquals:
    case TokenType.StrictEquals:
    case TokenType.PlusAssign:
    case TokenType.MinusAssign:
    case TokenType.LessThan:
    case TokenType.GreaterThan:
    case TokenType.LessEqual:
    case TokenType.GreaterEqual:
    case TokenType.SingleEquals:
    case TokenType.Plus:
    case TokenType.Minus:
    case TokenType.Star:
    case TokenType.Slash:
    case TokenType.DotAnd:
    case TokenType.DotOr:
    case TokenType.DotNot:
    case TokenType.Bang:
      return true;
    default:
      return false;
  }
}

function isOpenerOrSeparator(t: Token): boolean {
  switch (t.type) {
    case TokenType.LeftParen:
    case TokenType.LeftBrace:
    case TokenType.LeftBracket:
    case TokenType.Comma:
    case TokenType.Semicolon:
    case TokenType.Colon:
      return true;
    default:
      return false;
  }
}

function isWordToken(t: Token): boolean {
  if (isKeywordToken(t)) {
    return true;
  }
  switch (t.type) {
    case TokenType.Identifier:
    case TokenType.Number:
    case TokenType.Float:
    case TokenType.String:
    case TokenType.SqlParam:
    case TokenType.BooleanTrue:
    case TokenType.BooleanFalse:
    case TokenType.Nil:
    case TokenType.Comment:
      return true;
    default:
      return false;
  }
}

function keywordName(token: Token): string {
  return token.value.replace(/^[:#]/, '').toUpperCase();
}

function isStatementEndingToken(t: Token): boolean {
  switch (t.type) {
    case TokenType.Identifier:
    case TokenType.Number:
    case TokenType.Float:
    case TokenType.String:
    case TokenType.SqlParam:
    case TokenType.BooleanTrue:
    case TokenType.BooleanFalse:
    case TokenType.Nil:
    case TokenType.RightParen:
    case TokenType.RightBracket:
    case TokenType.RightBrace:
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Line model
// ---------------------------------------------------------------------------

interface LineModel {
  lineNo: number;
  raw: string;
  tokens: Token[];
}

interface TokenizedDoc {
  lines: LineModel[];
  /** token start line -> span info for tokens that span multiple lines */
  spans: Map<number, { kind: 'comment' | 'string'; startLine: number; endLine: number }>;
}

function lineAtOffset(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

function tokenizeDoc(text: string): TokenizedDoc {
  const sourceLines = text.split(/\r?\n/);
  const lineStarts: number[] = [];
  let acc = 0;
  for (const line of sourceLines) {
    lineStarts.push(acc);
    acc += line.length + 1;
  }

  const lexer = new SSLLexer(text);
  const allTokens = lexer.tokenize().filter((t) => t.type !== TokenType.Eof);

  const perLine: Token[][] = sourceLines.map(() => []);
  for (const t of allTokens) {
    perLine[t.line].push(t);
  }

  const spans = new Map<number, { kind: 'comment' | 'string'; startLine: number; endLine: number }>();
  for (const t of allTokens) {
    const endOffset = t.offset + t.length;
    const endLine = lineAtOffset(lineStarts, Math.max(endOffset - 1, t.offset));
    if (endLine > t.line) {
      spans.set(t.line, {
        kind: t.type === TokenType.Comment ? 'comment' : 'string',
        startLine: t.line,
        endLine,
      });
    }
  }

  const lines: LineModel[] = sourceLines.map((raw, i) => ({
    lineNo: i,
    raw,
    tokens: perLine[i],
  }));
  return { lines, spans };
}

// ---------------------------------------------------------------------------
// Spacing / token rewriting
// ---------------------------------------------------------------------------

function operatorSpacing(prev: Token, curr: Token, prePrev: Token | undefined): boolean {
  if (prev.type === TokenType.Bang) {
    return false;
  }
  if (curr.type === TokenType.Plus || curr.type === TokenType.Minus) {
    if (prev.type === TokenType.RightParen || prev.type === TokenType.RightBracket ||
        prev.type === TokenType.RightBrace || prev.type === TokenType.Number ||
        prev.type === TokenType.Float || prev.type === TokenType.Identifier) {
      return true;
    }
    if (isOpenerOrSeparator(prev) || isKeywordToken(prev)) {
      return false;
    }
    if (isOperatorToken(prev)) {
      return true;
    }
    return true;
  }
  if (prev.type === TokenType.Plus || prev.type === TokenType.Minus) {
    if (!prePrev || isOperatorToken(prePrev) || isKeywordToken(prePrev) || isOpenerOrSeparator(prePrev)) {
      return false;
    }
    return true;
  }
  return true;
}

function needsSpace(prev: Token, curr: Token, prePrev: Token | undefined, options: SSLFormatOptions): boolean {
  if (curr.type === TokenType.Semicolon) {
    return false;
  }
  if (prev.type === TokenType.Comma) {
    return options.commaSpacing;
  }
  if (prev.type === TokenType.Semicolon) {
    return true;
  }
  if (isOperatorToken(prev) || isOperatorToken(curr)) {
    if (!options.operatorSpacing) {
      return false;
    }
    return operatorSpacing(prev, curr, prePrev);
  }
  if (prev.type === TokenType.RightParen) {
    const noSpaceAfterParen = new Set<TokenType>([
      TokenType.Identifier, TokenType.RightParen, TokenType.Comma, TokenType.LeftBracket,
      TokenType.LeftParen, TokenType.RightBracket, TokenType.RightBrace, TokenType.LeftBrace,
      TokenType.Colon, TokenType.Dot, TokenType.Semicolon,
    ]);
    if (noSpaceAfterParen.has(curr.type)) {
      return false;
    }
    return true;
  }
  if (curr.type === TokenType.Comma || curr.type === TokenType.RightParen ||
      curr.type === TokenType.RightBracket || curr.type === TokenType.RightBrace) {
    return false;
  }
  if ((prev.type === TokenType.Identifier || prev.type === TokenType.RightBracket) && curr.type === TokenType.LeftParen) {
    return false;
  }
  if (isKeywordToken(prev) && curr.type === TokenType.LeftParen) {
    return true;
  }
  if (isKeywordToken(prev) && curr.type === TokenType.LeftBrace) {
    return true;
  }
  if (curr.type === TokenType.LeftBracket && isWordToken(prev)) {
    return false;
  }
  if (prev.type === TokenType.LeftBrace && curr.type === TokenType.Identifier) {
    return false;
  }
  if (prev.type === TokenType.Colon || curr.type === TokenType.Colon) {
    return false;
  }
  if (prev.type === TokenType.Dot || curr.type === TokenType.Dot) {
    return false;
  }
  if (prev.type === TokenType.LeftBracket || curr.type === TokenType.LeftBracket) {
    return false;
  }
  if (isWordToken(prev) && isWordToken(curr)) {
    return true;
  }
  return false;
}

function formatTokenValue(token: Token, options: SSLFormatOptions): string {
  if (isKeywordToken(token)) {
    return token.value.startsWith('#') ? token.value.toLowerCase() : token.value.toUpperCase();
  }
  switch (token.type) {
    case TokenType.Identifier:
      if (options.builtinFunctionCase === 'PascalCase') {
        const canonical = CANONICAL_BUILTINS.get(token.value.toLowerCase());
        if (canonical) {
          return canonical;
        }
      }
      return token.value;
    case TokenType.DotAnd:
    case TokenType.DotOr:
    case TokenType.DotNot:
      return token.value.toUpperCase();
    case TokenType.BooleanTrue:
      return '.T.';
    case TokenType.BooleanFalse:
      return '.F.';
    default:
      return token.value;
  }
}

interface RewriteContext {
  options: SSLFormatOptions;
  indentStr: string;
}

/** Rebuilds a single line from its tokens. */
function rewriteLine(tokens: Token[], ctx: RewriteContext): string {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : undefined;
    const prePrev = i > 1 ? tokens[i - 2] : undefined;
    if (prev) {
      const space = needsSpace(prev, tok, prePrev, ctx.options);
      if (space) {
        out += ' ';
      }
    }
    if (
      ctx.options.sql.enabled &&
      tok.type === TokenType.String &&
      isSqlStringArg(tokens, i) &&
      looksLikeSql(tok.value)
    ) {
      const quote = tok.value.charAt(0);
      const inner = tok.value.slice(1, -1);
      const formatted = formatSqlLiteral(inner, ctx.options.sql);
      out += quote + formatted + quote;
    } else {
      out += formatTokenValue(tok, ctx.options);
    }
  }
  return out.trimEnd();
}

/** True when tokens[i] is a string literal that is the first argument of a known SQL function. */
function isSqlStringArg(tokens: Token[], i: number): boolean {
  if (i < 2) {
    return false;
  }
  const paren = tokens[i - 1];
  const fn = tokens[i - 2];
  if (!paren || paren.type !== TokenType.LeftParen) {
    return false;
  }
  if (!fn || (fn.type !== TokenType.Identifier && !isKeywordToken(fn))) {
    return false;
  }
  return SQL_FUNCTION_NAMES.has(fn.value.replace(/^:/, '').toUpperCase());
}

function needsSemicolon(tokens: Token[], ctx: RewriteContext): boolean {
  if (!ctx.options.semicolonEnforcement) {
    return false;
  }
  const last = tokens[tokens.length - 1];
  if (tokens[0]?.type === TokenType.Include && tokens[0].value.startsWith('#')) {
    return false;
  }
  if (!last) {
    return false;
  }
  if (last.type === TokenType.Semicolon || last.type === TokenType.Comment) {
    return false;
  }
  if (isOpenerOrSeparator(last) || last.type === TokenType.Comma || last.type === TokenType.Colon ||
      last.type === TokenType.Dot || isOperatorToken(last)) {
    return false;
  }
  if (isKeywordToken(last)) {
    const kw = keywordName(last);
    if (NO_SEMICOLON_KEYWORDS.has(kw)) {
      return false;
    }
  }
  if (!isStatementEndingToken(last)) {
    return false;
  }
  return true;
}

/** Appends `;` unless the previous non-blank line continues the statement. */
function canAppendSemicolon(prevLineEndedOpen: boolean, tokens: Token[], ctx: RewriteContext): boolean {
  if (!needsSemicolon(tokens, ctx)) {
    return false;
  }
  return !prevLineEndedOpen;
}

function lineEndsOpen(tokens: Token[]): boolean {
  const last = tokens[tokens.length - 1];
  if (!last) {
    return false;
  }
  if (last.type === TokenType.Semicolon || last.type === TokenType.Comment) {
    return false;
  }
  return (
    isOpenerOrSeparator(last) || last.type === TokenType.Comma || last.type === TokenType.Colon ||
    last.type === TokenType.Dot || isOperatorToken(last) ||
    (isKeywordToken(last) && (keywordName(last) === 'TO' || keywordName(last) === 'STEP'))
  );
}

/** Wraps a long line at depth-0 commas. */
function wrapAtCommas(content: string, indentStr: string, indentLevel: number, wrapLength: number): string {
  const contIndent = indentStr.repeat(indentLevel + 1);
  let depth = 0;
  const segments: string[] = [];
  let current = '';
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '(' || ch === '{' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth = Math.max(0, depth - 1);
    }
    if (ch === ',' && depth === 0) {
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  segments.push(current);
  if (segments.length <= 1) {
    return content;
  }
  const first = segments.shift()!;
  const rest = segments
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(',\n' + contIndent);
  if (!rest) {
    return content;
  }
  const wrapped = first.trimEnd() + ',\n' + contIndent + rest;
  return wrapped;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function makeIndentStr(options: SSLFormatOptions): string {
  if (options.indentStyle === 'space') {
    return ' '.repeat(Math.max(1, options.indentWidth));
  }
  return '\t';
}

function isProcedureLine(content: string): boolean {
  return /^\s*:PROCEDURE\b/i.test(content);
}

/** Pushes a formatted line, splitting multi-line content (inline SQL) into continuation lines. */
function emitContent(
  emitted: string[],
  content: string,
  indentStr: string,
  lineIndent: number,
  contIndentLevel: number
): void {
  if (!content.includes('\n')) {
    emitted.push(indentStr.repeat(lineIndent) + content);
    return;
  }
  const parts = content.split('\n');
  const contIndent = indentStr.repeat(contIndentLevel);
  emitted.push(indentStr.repeat(lineIndent) + parts[0]);
  for (let i = 1; i < parts.length; i++) {
    emitted.push(contIndent + parts[i]);
  }
}

function applyBlankLinePolicy(
  emitted: string[],
  eol: string,
  options: SSLFormatOptions
): string[] {
  const maxBlank = options.maxConsecutiveBlankLines;
  const result: string[] = [];
  let blankRun = 0;
  let seenProcedure = false;

  const flushBlanks = (count: number) => {
    const capped = maxBlank > 0 ? Math.min(count, maxBlank) : count;
    for (let i = 0; i < capped; i++) {
      result.push('');
    }
  };

  for (const line of emitted) {
    if (line === '') {
      blankRun++;
      continue;
    }
    if (isProcedureLine(line)) {
      if (seenProcedure && options.blankLinesBetweenProcs > 0) {
        flushBlanks(blankRun);
        const needed = Math.max(0, options.blankLinesBetweenProcs - blankRun);
        for (let i = 0; i < needed; i++) {
          result.push('');
        }
      }
      seenProcedure = true;
      result.push(line);
      blankRun = 0;
      continue;
    }
    flushBlanks(blankRun);
    blankRun = 0;
    result.push(line);
  }
  return result;
}

/**
 * Formats a full SSL document.
 */
export function formatSSL(text: string, options: SSLFormatOptions = DEFAULT_FORMAT_OPTIONS): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const doc = tokenizeDoc(text);
  const ctx: RewriteContext = {
    options,
    indentStr: makeIndentStr(options),
  };

  const emitted: string[] = [];
  let depth = 0;
  let prevLineEndedOpen = false;

  for (let li = 0; li < doc.lines.length; li++) {
    const line = doc.lines[li];
    const span = doc.spans.get(line.lineNo);

    if (span) {
      if (span.kind === 'string') {
        for (let l = span.startLine; l <= span.endLine; l++) {
          emitted.push(doc.lines[l].raw.trimEnd());
        }
      } else {
        const indent = ctx.indentStr.repeat(depth);
        for (let l = span.startLine; l <= span.endLine; l++) {
          const trimmed = doc.lines[l].raw.trim();
          emitted.push(trimmed ? indent + trimmed : '');
        }
      }
      li = span.endLine;
      prevLineEndedOpen = false;
      continue;
    }

    const tokens = line.tokens;
    if (tokens.length === 0) {
      emitted.push('');
      prevLineEndedOpen = false;
      continue;
    }

    const first = tokens[0];
    let lineIndent = depth;
    const isCommentOnly = first.type === TokenType.Comment && tokens.length === 1;

    if (isKeywordToken(first)) {
      const kw = keywordName(first);
      if (BLOCK_END_KEYWORDS.has(kw)) {
        depth = Math.max(0, depth - 1);
        lineIndent = depth;
      }
    }

    let content: string;
    if (isCommentOnly) {
      content = first.value.trim();
    } else {
      content = rewriteLine(tokens, ctx);
      if (canAppendSemicolon(prevLineEndedOpen, tokens, ctx)) {
        content += ';';
      }
    }

    if (isKeywordToken(first)) {
      const kw = keywordName(first);
      if (PROCEDURE_LEVEL_KEYWORDS.has(kw)) {
        lineIndent = Math.max(0, lineIndent - 1);
      } else if (BLOCK_MIDDLE_KEYWORDS.has(kw)) {
        lineIndent = Math.max(0, lineIndent - 1);
      }
    }

    if (!isCommentOnly && ctx.options.wrapLength > 0 && content.length > ctx.options.wrapLength &&
        !content.includes('\n') &&
        !tokens.some((t) => t.type === TokenType.Comment) && !isKeywordToken(first)) {
      content = wrapAtCommas(content, ctx.indentStr, lineIndent, ctx.options.wrapLength);
    }

    emitContent(emitted, content, ctx.indentStr, lineIndent, lineIndent);
    prevLineEndedOpen = !isCommentOnly && lineEndsOpen(tokens);

    if (isKeywordToken(first)) {
      const kw = keywordName(first);
      if (BLOCK_START_KEYWORDS.has(kw)) {
        depth++;
      }
    }
  }

  let outLines = emitted;
  if (options.blankLinesBetweenProcs > 0 || options.maxConsecutiveBlankLines > 0) {
    outLines = applyBlankLinePolicy(emitted, eol, options);
  }

  let result = outLines.join(eol);
  if (options.trimTrailingWhitespace) {
    result = result
      .split(eol)
      .map((l) => l.replace(/[ \t]+$/, ''))
      .join(eol);
  }
  result = result.replace(new RegExp('(?:' + eol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')+$'), '') + eol;
  return result;
}

/**
 * Formats only the given line range (0-based, inclusive). Lines outside the
 * range are preserved verbatim. Indentation depth is computed by walking the
 * lines before the range.
 */
export function formatSSLRange(
  text: string,
  startLine: number,
  endLine: number,
  options: SSLFormatOptions = DEFAULT_FORMAT_OPTIONS
): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const doc = tokenizeDoc(text);
  const ctx: RewriteContext = {
    options,
    indentStr: makeIndentStr(options),
  };
  const start = Math.max(0, startLine);
  const end = Math.min(doc.lines.length - 1, endLine);
  if (start > end) {
    return text;
  }

  let depth = 0;
  let prevLineEndedOpen = false;

  const rewritten: string[] = [];
  let inRange = false;

  for (let i = 0; i < doc.lines.length; i++) {
    const line = doc.lines[i];
    if (i === start) {
      inRange = true;
    }
    const span = doc.spans.get(line.lineNo);

    if (span) {
      for (let l = span.startLine; l <= span.endLine; l++) {
        rewritten.push(doc.lines[l].raw.trimEnd());
      }
      i = span.endLine;
      prevLineEndedOpen = false;
      continue;
    }

    if (line.tokens.length === 0) {
      prevLineEndedOpen = false;
      rewritten.push(line.raw);
    } else {
      const tokens = line.tokens;
      const first = tokens[0];
      let lineIndent = depth;
      const isCommentOnly = first.type === TokenType.Comment && tokens.length === 1;

      if (isKeywordToken(first)) {
        const kw = keywordName(first);
        if (BLOCK_END_KEYWORDS.has(kw)) {
          depth = Math.max(0, depth - 1);
          lineIndent = depth;
        }
      }

      if (inRange) {
        let content: string;
        if (isCommentOnly) {
          content = first.value.trim();
        } else {
          content = rewriteLine(tokens, ctx);
          if (canAppendSemicolon(prevLineEndedOpen, tokens, ctx)) {
            content += ';';
          }
        }
        if (isKeywordToken(first)) {
          const kw = keywordName(first);
          if (PROCEDURE_LEVEL_KEYWORDS.has(kw) || BLOCK_MIDDLE_KEYWORDS.has(kw)) {
            lineIndent = Math.max(0, lineIndent - 1);
          }
        }
        if (!isCommentOnly && ctx.options.wrapLength > 0 && content.length > ctx.options.wrapLength &&
            !content.includes('\n') &&
            !tokens.some((t) => t.type === TokenType.Comment) && !isKeywordToken(first)) {
          content = wrapAtCommas(content, ctx.indentStr, lineIndent, ctx.options.wrapLength);
        }
        emitContent(rewritten, content, ctx.indentStr, lineIndent, lineIndent);
      } else {
        rewritten.push(line.raw);
      }

      prevLineEndedOpen = !isCommentOnly && lineEndsOpen(tokens);

      if (isKeywordToken(first)) {
        const kw = keywordName(first);
        if (BLOCK_START_KEYWORDS.has(kw)) {
          depth++;
        }
      }
    }

    if (i === end) {
      inRange = false;
    }
  }

  let result = rewritten.join(eol);
  if (options.trimTrailingWhitespace) {
    result = result
      .split(eol)
      .map((l) => l.replace(/[ \t]+$/, ''))
      .join(eol);
  }
  return result;
}
