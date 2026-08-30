/**
 * Monarch Tokenizers for STARLIMS SSL and SLSQL languages
 * Based on VS Code Extension ssl.tmLanguage.json with enhancements for Monaco Editor
 */

import * as monaco from 'monaco-editor';

// Complete list of STARLIMS built-in functions (from ssl.tmLanguage.json)
const sslBuiltInFunctions = [
  // Database functions
  'DoProc', 'ExecFunction', 'ExecUdf', 'CreateUDObject', 'Branch',
  'BeginLimsTransaction', 'EndLimsTransaction', 'GetConnectionByName', 'GetConnectionStrings',
  'GetDataSet', 'GetDataSetEx', 'GetDataSetFromArray', 'GetDataSetFromArrayEx',
  'GetDataSetWithSchemaFromSelect', 'GetDataSetXMLFromArray', 'GetDataSetXMLFromSelect',
  'GetDBMSName', 'GetDBMSProviderName', 'GetDefaultConnection', 'GetLastSQLError',
  'GetNoLock', 'GetTables', 'GetTransactionsCount', 'IgnoreSqlErrors', 'IsDBConnected',
  'IsInTransaction', 'IsTable', 'IsTableFld', 'LimsRecordsAffected', 'LimsSetCounter',
  'LimsSqlConnect', 'LimsSqlDisconnect', 'LSearch', 'LSelect', 'LSelect1', 'LSelectC',
  'RetrieveLong', 'ReturnLastSQLError', 'RunSQL', 'SetDefaultConnection', 'SetSqlTimeout',
  'ShowSqlErrors', 'SQLExecute', 'SQLRemoveComments', 'TableFldLst', 'UpdLong',
  'GetDSParameters', 'GetSSLDataset', 'RunDS', 'DetectSqlInjections',
  // Array functions
  'aadd', 'aeval', 'aevala', 'afill', 'alen', 'arraycalc', 'arraynew', 'ascan', 'ascanexact',
  'buildarray', 'buildarray2', 'buildstring', 'buildstring2', 'BuildStringForIn', 'comparray',
  'delarray', 'extractcol', 'PrepareArrayForIn', 'SortArray', 'ArrayToTVP',
  // Date/Time functions
  'ClientEndOfDay', 'ClientStartOfDay', 'CMonth', 'CToD', 'DateAdd', 'DateDiff', 'DateDiffEx',
  'DateFormat', 'DateFromNumbers', 'DateFromString', 'DateToString', 'Day', 'DOW', 'DOY',
  'DToC', 'DToS', 'Hour', 'IsInvariantDate', 'JDay', 'LIMSDate', 'LimsGetDateFormat',
  'LimsTime', 'MakeDateInvariant', 'MakeDateLocal', 'Minute', 'Month', 'NoOfDays', 'Now',
  'Second', 'Seconds', 'ServerEndOfDay', 'ServerStartOfDay', 'ServerTimeZone', 'SetAmPm',
  'StringToDate', 'Time', 'Today', 'UserTimeZone', 'ValidateDate', 'Year',
  // String functions
  'AllTrim', 'Asc', 'At', 'Chr', 'Empty', 'Left', 'Len', 'LimsAt', 'LimsString',
  'LLower', 'Lower', 'LStr', 'LTransform', 'LTrim', 'MimeDecode', 'MimeEncode', 'Rat',
  'Replace', 'Replicate', 'Right', 'Seval', 'Str', 'StringAdd', 'StringClean',
  'StringCreate', 'StringGet', 'StringKill', 'StrSrch', 'StrTran', 'StrZero', 'SubStr',
  'Trim', 'Upper',
  // Math functions
  'GetDecimalSep', 'GetDecimalSeparator', 'GetGroupSeparator', 'Integer', 'IsNumeric',
  'LimsXOr', 'MatFunc', 'Max', 'Min', 'Rand', 'Round', 'RoundPoint5', 'Scient',
  'SetDecimalSeparator', 'SetGroupSeparator', 'SigFig', 'Sqrt', 'StdRound', 'ToNumeric',
  'ToScientific', 'Val', 'ValidateNumeric',
  // System functions
  'CreateGUID', 'GetAppBaseFolder', 'GetAppWorkPathFolder', 'GetByName', 'GetExecutionTrace',
  'GetFeaturesAndNumbers', 'GetFileVersion', 'GetForbiddenAppIDs', 'GetForbiddenDesignerAppIDs',
  'GetInstallationKey', 'GetLicenseInfoAsText', 'GetLogsFolder', 'GetNumberOfInstrumentConnections',
  'GetNumberOfNamedConcurrentUsers', 'GetNumberOfNamedUsers', 'GetPrinters', 'GetSetting',
  'GetSettings', 'GetSystemLayerId', 'GetWebFolder', 'InBatchProcess', 'IsDemoLicense',
  'IsFeatureAuthorized', 'IsFeatureBasedLicense', 'IsGuid', 'IsProductionModeOn', 'LCase',
  'LKill', 'NetFrameworkVersion', 'Nothing', 'ResetApplication', 'ResetFeatures', 'SetByName',
  'SqlTraceOff', 'SqlTraceOn', 'TryConnect', 'GetDecimalSep',
  // Communication functions
  'SendFromOutbox', 'SendLimsEmail', 'SendOutlookReminder', 'SendToOutbox',
  // File functions
  'CombineFiles', 'Directory', 'DosSupport', 'FileSupport', 'lDir', 'ReadBytesBase64',
  'ReadText', 'WriteBytesBase64', 'WriteText',
  // FTP functions
  'CheckOnFtp', 'CopyToFtp', 'DeleteDirOnFtp', 'DeleteFromFtp', 'GetDirFromFtp',
  'GetFromFtp', 'MakeDirOnFtp', 'MoveInFtp', 'ReadFromFtp', 'RenameOnFtp', 'SendToFtp',
  'WriteToFtp',
  // Compression functions
  'Break', 'Compress', 'CreateLocal', 'CreatePublic', 'CreateZip', 'Decompress',
  'ErrorMes', 'ExtractZip', 'MergeHtmlForm',
  // Network/.NET functions
  'endlimsoleconnect', 'getinlinecode', 'getregion', 'In64BitMode', 'Let',
  'LimsCleanup', 'LimsNETConnect', 'LimsNETTypeOf', 'limsoleconnect', 'MakeNETObject',
  'StationName', 'GetNETDataSet',
  // HTML/XML functions
  'FromXml', 'HtmlDecode', 'HtmlEncode', 'ToXml', 'XmlDomToUdObject',
  // JSON functions
  'FromJson', 'ToJson',
  // Application functions
  'AddToApplication', 'AddToSession', 'ClearLastSSLError', 'ClearSession',
  'GetFromApplication', 'GetFromSession', 'UrlDecode', 'UrlEncode',
  // Client script functions
  'GetAllClientScripts', 'MergeGlobalResources', 'PrepareForm', 'PrepareFormClientScript',
  'ProcessXfdFormForImport', 'SyncDesignResources', 'SyncProgramaticResourcesAddProperty',
  // Internal functions
  'ExecInternal', 'GetInternal', 'GetInternalC', 'HasProperty', 'SetInternal', 'SetInternalC',
  // Batch functions
  'LimsExec', 'lWait', 'PrmCount', 'RunApp', 'SubmitToBatch', 'SubmitToBatchEx',
  'TraceOff', 'TraceOn', 'UndeclaredVars', 'LPrint', 'SetLocationOracle', 'SetLocationSQLServer',
  'ConvertReport', 'ChkNewPassword', 'ChkPassword', 'DecryptData', 'EncryptData',
  'GetUserData', 'HashData', 'LDAPAuth', 'LDAPAuthEX', 'SearchLDAPUser', 'SetUserData',
  'SetUserPassword', 'VerifySignature', 'ValidateFieldData', 'ValidateData', 'ValidateDSParams',
  // lims namespace functions
  'lims.CallServer', 'lims.GetData', 'lims.SubmitToBatch', 'lims.GetForm', 'lims.OpenForm',
  // Common functions
  'iif', 'UsrMes', 'ErrorMes', 'InfoMes', 'bs',
  'GetLastSSLError', 'RaiseError', 'FormatErrorMessage', 'FormatSqlErrorMessage',
  'IsDefined', 'IsHex', 'LFromHex', 'LHex2Dec', 'LimsNETCast', 'LimsType', 'LimsTypeEx',
  'LToHex', 'DeleteInlineCode', 'GetInlineCode', 'GetClientScriptReferences', 'GetFormReferences',
  'MergeXfd', 'PrepareFormClientScript'
];

// SSL (Starlims Scripting Language) Monarch tokenizer
export const sslLanguage: monaco.languages.IMonarchLanguage = {
  defaultToken: '',

  // Control keywords
  keywords: [
    ':BEGINCASE', ':CASE', ':ENDCASE', ':EXITCASE', ':OTHERWISE',
    ':IF', ':DEFAULT', ':REGION', ':ENDREGION', ':ENDIF', ':ELSE',
    ':LOOP', ':WHILE', ':ENDWHILE', ':FOR', ':NEXT', ':STEP',
    ':EXITFOR', ':RESUME', ':RETURN', ':TRY', ':CATCH', ':FINALLY', ':ENDTRY', ':TO'
  ],

  // Storage keywords
  storageKeywords: [
    ':PUBLIC', ':DECLARE', ':CLASS', ':INHERIT', ':INCLUDE',
    ':PARAMETERS', ':PROCEDURE', ':ENDPROC', ':BEGININLINECODE', ':ENDINLINECODE', ':ERROR'
  ],

  // Navigator/system variables
  systemVariables: [
    'MYUSERNAME', 'STARLIMSDEPT', 'MYUSERROLE', 'REQUEST', 'RESPONSE',
    'PUBLICCONSTS', 'PLATFORMA', 'STARLIMSSITECODE', 'MYTREEAUTH'
  ],

  // Operators
  operators: [
    '=', ':=', '>=', '<=', '>', '<', '==', '!=', '+', '-', '.AND.', '.OR.', '.NOT.', '.TRUE.', '.FALSE.'
  ],

  // Language constants
  constants: [
    '.T.', '.F.', '.t.', '.f.', '.NULL.'
  ],

  // Tokenizer rules
  tokenizer: {
    root: [
      // Comments /* ... */ (SSL comments end with semicolon)
      [/\/\*/, 'comment', '@comment'],

      // Language constants .t. .f. .T. .F.
      [/\.[TtFfNn][.A-Za-z]*/, 'constant.language'],

      // Control keywords starting with :
      [/:[A-Z][A-Z_]*/, {
        cases: {
          '@keywords': 'keyword.control',
          '@storageKeywords': 'keyword.storage',
          '@default': ''
        }
      }],

      // System variables
      [/\b(MYUSERNAME|STARLIMSDEPT|MYUSERROLE|REQUEST|RESPONSE|PUBLICCONSTS|PLATFORMA|STARLIMSSITECODE|MYTREEAUTH)\b/, 'variable.predefined'],

      // Built-in functions - complete list
      [/\b(DoProc|ExecFunction|ExecUdf|CreateUDObject|Branch|BeginLimsTransaction|EndLimsTransaction|GetConnectionStrings|GetDataSet|GetDataSetEx|RunSQL|LSearch|LSelect|SqlExecute|lims\.[A-Za-z]+|iif|UsrMes|ErrorMes|InfoMes|aadd|aeval|afill|alen|arraycalc|arraynew|ascan|buildarray|GetLastSSLError|RaiseError|FormatErrorMessage|FromJson|ToJson|FromXml|ToXml|UrlEncode|UrlDecode|CreateGUID|GetExecutionTrace|GetAppWorkPathFolder|GetInstallationKey|GetLicenseInfoAsText|GetNumberOfNamedUsers|GetSetting|GetSettings|GetSystemLayerId|GetWebFolder|IsDemoLicense|IsProductionModeOn|SendLimsEmail|SubmitToBatch|PrepareForm|GetFormReferences)\b/, 'support.function'],

      // Function calls with parentheses
      [/\b[a-zA-Z_][a-zA-Z0-9_]*\(/, 'entity.name.function'],

      // Identifiers
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'variable'],

      // Numbers
      [/-?[0-9]+(\.[0-9]*)?/, 'constant.numeric'],
      [/\.[0-9]+/, 'constant.numeric'],

      // Strings
      [/"([^"\\]|\\.)*"/, 'string.quoted.double'],
      [/'([^'\\]|\\.)*'/, 'string.quoted.single'],

      // Operators
      [/[=:]/, 'keyword.operator'],
      [/[+\-*/<>]=?/, 'operator'],
      [/\.(AND|OR|NOT)\./i, 'operator'],

      // Delimiters
      [/[{}()[\]]/, '@brackets'],
      [/[;,.]/, 'delimiter'],

      // Whitespace
      { include: '@whitespace' }
    ],

    comment: [
      [/\/\*/, 'comment', '@comment'],
      [/[^*;]+/, 'comment'],
      [/$/, 'comment'],
      [/;/, 'comment', '@pop'],
      [/./, 'comment']
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
    ],
  }
};

// SLSQL (STARLIMS SQL) Monarch tokenizer
export const slsqlLanguage: monaco.languages.IMonarchLanguage = {
  defaultToken: '',

  // SQL Keywords
  keywords: [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
    'IS', 'NULL', 'AS', 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL',
    'CROSS', 'NATURAL', 'USE', 'KEY', 'INDEX', 'DEFAULT', 'CONSTRAINT',
    'PRIMARY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'EXISTS',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX', 'PROCEDURE', 'FUNCTION',
    'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
    'UNION', 'ALL', 'DISTINCT', 'TOP', 'LIMIT', 'OFFSET',
    'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'CAST', 'CONVERT', 'COALESCE', 'NULLIF',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'FIRST', 'LAST'
  ],

  // Built-in functions
  builtInFunctions: [
    'GetDataSet', 'RunSQL', 'LSearch', 'LSelect', 'SqlExecute',
    'GetLastSQLError', 'GetDBMSName', 'GetDBMSProviderName',
    'GetDefaultConnection', 'SetDefaultConnection', 'GetNoLock'
  ],

  // Operators
  operators: [
    '=', '>', '<', '>=', '<=', '!=', '<>',
    '+', '-', '*', '/', '%',
    'AND', 'OR', 'NOT', 'BETWEEN', 'LIKE', 'IN', 'IS', 'EXISTS'
  ],

  // Tokenizer rules
  tokenizer: {
    root: [
      // Comments
      [/\/\*/, 'comment', '@comment'],
      [/--.*$/, 'comment'],

      // Strings
      [/"([^"\\]|\\.)*"/, 'string.quoted.double'],
      [/'([^'\\]|\\.)*'/, 'string.quoted.single'],

      // Parameters
      [/\?[a-zA-Z_][a-zA-Z0-9_]*\?/, 'variable.parameter'],
      [/@[a-zA-Z_][a-zA-Z0-9_]*/, 'variable.parameter'],

      // Keywords
      [/\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|AS|ON|JOIN|INNER|LEFT|RIGHT|OUTER|FULL|CROSS|NATURAL|UNIQUE|CHECK|EXISTS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|PROCEDURE|FUNCTION|GRANT|REVOKE|COMMIT|ROLLBACK|SAVEPOINT|UNION|ALL|DISTINCT|TOP|LIMIT|OFFSET|ORDER|BY|ASC|DESC|GROUP|HAVING|CASE|WHEN|THEN|ELSE|END|CAST|CONVERT|COALESCE|NULLIF|COUNT|SUM|AVG|MIN|MAX|FIRST|LAST|PRIMARY|FOREIGN|REFERENCES|USE|KEY|INDEX|DEFAULT|CONSTRAINT)\b/i, 'keyword'],

      // Built-in functions
      [/\b(GetDataSet|RunSQL|LSearch|LSelect|SqlExecute|GetLastSQLError|GetDBMSName|GetDBMSProviderName|GetDefaultConnection|SetDefaultConnection|GetNoLock)\b/i, 'support.function'],

      // Numbers
      [/-?[0-9]+(\.[0-9]*)?/, 'constant.numeric'],
      [/\.[0-9]+/, 'constant.numeric'],

      // Operators
      [/[=<>!]+/, 'operator'],
      [/[+\-*/%]/, 'operator'],
      [/\b(AND|OR|NOT|BETWEEN|LIKE|IN|IS|EXISTS)\b/i, 'operator'],

      // Identifiers
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'identifier'],

      // Delimiters
      [/[(){}[\]]/, '@brackets'],
      [/[;,.]/, 'delimiter'],

      // Whitespace
      { include: '@whitespace' }
    ],

    comment: [
      [/[^*/]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/./, 'comment']
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
    ],
  }
};

export const starlimsLogLanguage: monaco.languages.IMonarchLanguage = {
  defaultToken: 'log.text',
  tokenizer: {
    root: [
      [/\*{3,}(Error|Exception)\*{3,}/i, 'log.error'],
      [/\b(Server Error|Script not found|Exception|Error|Failed|Failure)\b/i, 'log.error'],
      [/\*{3,}User message\*{3,}/i, 'log.user'],
      [/\b\d{8}\b/, 'log.date'],
      [/\b\d{2}:\d{2}:\d{2}\b/, 'log.time'],
      [/\b\d+\.\d+\.\d+\b/, 'log.version'],
      [/\b(?:ServerScript|ClientScript|DataSource)\.[A-Za-z0-9_.$]+(?:\([^)]*\))?/i, 'log.script'],
      [/\bline:\s*\d+\b/i, 'log.line'],
      [/\bw3wp\([^)]*\)/i, 'log.process'],
      [/\b(?:WIN|LINUX)-[A-Za-z0-9_-]+\b/i, 'log.machine'],
      [/--.*$/, 'comment'],
      [/'(?:''|[^'])*'/, 'string.quoted.single'],
      [/\b(?:SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|OUTER|ON|AND|OR|AS|ORDER|BY|GROUP|HAVING|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CASE|WHEN|THEN|ELSE|END|UNION|ALL|DISTINCT|TOP)\b/i, 'keyword'],
      [/\b\d+(?:\.\d+)?\b/, 'constant.numeric'],
      [/\b[A-Z][A-Z0-9_]*(?=\s*=)/, 'variable.predefined']
    ]
  }
};

// Define custom dark theme for STARLIMS
export function defineThemes(editorMonaco?: typeof monaco) {
  const m = editorMonaco || monaco;
  console.log('defineThemes called, monaco:', !!m.editor);

  // VS Code Dark+ theme colors (default VS Code dark theme)
  m.editor.defineTheme('starlims-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: '569CD6' },
      { token: 'keyword.control', foreground: 'C586C0' },
      { token: 'keyword.storage', foreground: '569CD6' },
      { token: 'keyword.operator', foreground: 'D4D4D4' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'string.quoted.double', foreground: 'CE9178' },
      { token: 'string.quoted.single', foreground: 'CE9178' },
      { token: 'constant', foreground: 'B5CEA8' },
      { token: 'constant.language', foreground: '569CD6' },
      { token: 'constant.numeric', foreground: 'B5CEA8' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'variable.predefined', foreground: '4EC9B0' },
      { token: 'variable.parameter', foreground: '9CDCFE' },
      { token: 'entity.name.function', foreground: 'DCDCAA' },
      { token: 'support.function', foreground: 'DCDCAA' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'identifier', foreground: 'D4D4D4' },
      { token: 'delimiter', foreground: 'D4D4D4' },
      { token: 'delimiter.bracket', foreground: 'D4D4D4' },
      { token: 'log.text', foreground: 'D4D4D4' },
      { token: 'log.date', foreground: 'DCDCAA', fontStyle: 'bold' },
      { token: 'log.time', foreground: '6A9955' },
      { token: 'log.version', foreground: 'DCDCAA' },
      { token: 'log.script', foreground: 'DCDCAA' },
      { token: 'log.line', foreground: '4EC9B0' },
      { token: 'log.process', foreground: 'CE9178' },
      { token: 'log.machine', foreground: '9CDCFE' },
      { token: 'log.user', foreground: '6A9955', fontStyle: 'bold' },
      { token: 'log.error', foreground: 'F48771', fontStyle: 'bold' },
    ],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editor.lineHighlightBackground': '#2A2D2E',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3A3D41',
      'editorCursor.foreground': '#AEAFAD',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#C6C6C6',
      'editorIndentGuide.background1': '#404040',
      'editorIndentGuide.activeBackground1': '#707070',
      'editor.selectionHighlightBackground': '#ADD6FF26',
      'editorGutter.background': '#1E1E1E',
      'editorOverviewRuler.border': '#1E1E1E',
      'minimap.background': '#1E1E1E',
      'scrollbar.shadow': '#00000000',
    }
  });

  // VS Code Light+ theme colors (default VS Code light theme)
  m.editor.defineTheme('starlims-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
      { token: 'keyword', foreground: '0000FF' },
      { token: 'keyword.control', foreground: 'AF00DB' },
      { token: 'keyword.storage', foreground: '0000FF' },
      { token: 'keyword.operator', foreground: '000000' },
      { token: 'operator', foreground: '000000' },
      { token: 'string', foreground: 'A31515' },
      { token: 'string.quoted.double', foreground: 'A31515' },
      { token: 'string.quoted.single', foreground: 'A31515' },
      { token: 'constant', foreground: '098658' },
      { token: 'constant.language', foreground: '0000FF' },
      { token: 'constant.numeric', foreground: '098658' },
      { token: 'variable', foreground: '001188' },
      { token: 'variable.predefined', foreground: '16823A' },
      { token: 'variable.parameter', foreground: '001188' },
      { token: 'entity.name.function', foreground: '795E26' },
      { token: 'support.function', foreground: '795E26' },
      { token: 'type', foreground: '267F99' },
      { token: 'identifier', foreground: '001188' },
      { token: 'delimiter', foreground: '000000' },
      { token: 'delimiter.bracket', foreground: '000000' },
      { token: 'log.text', foreground: '1F1F1F' },
      { token: 'log.date', foreground: '795E26', fontStyle: 'bold' },
      { token: 'log.time', foreground: '008000' },
      { token: 'log.version', foreground: '795E26' },
      { token: 'log.script', foreground: '795E26' },
      { token: 'log.line', foreground: '267F99' },
      { token: 'log.process', foreground: 'A31515' },
      { token: 'log.machine', foreground: '001188' },
      { token: 'log.user', foreground: '008000', fontStyle: 'bold' },
      { token: 'log.error', foreground: 'CD3131', fontStyle: 'bold' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#000000',
      'editor.lineHighlightBackground': '#FFFF0033',
      'editor.selectionBackground': '#ADD6FF',
      'editor.inactiveSelectionBackground': '#E5EBF1',
      'editorCursor.foreground': '#000000',
      'editorLineNumber.foreground': '#237893',
      'editorLineNumber.activeForeground': '#0B216F',
      'editorIndentGuide.background': '#D3D3D3',
      'editorIndentGuide.activeBackground': '#939393',
      'editor.selectionHighlightBackground': '#ADD6FF40',
      // Editor widget (base for all overlays)
      'editorWidget.background': '#FFFFFF',
      'editorWidget.border': '#C4C4C4',
      'editorWidget.foreground': '#000000',
      // Suggest widget (dropdown) colors
      'editorSuggestWidget.background': '#FFFFFF',
      'editorSuggestWidget.border': '#C4C4C4',
      'editorSuggestWidget.foreground': '#000000',
      'editorSuggestWidget.selectedBackground': '#ADD6FF',
      'editorSuggestWidget.highlightForeground': '#000000',
      'editorSuggestWidget.selectedForeground': '#000000',
      // List colors inside suggest widget
      'list.hoverBackground': '#E5EBF1',
      'list.hoverForeground': '#000000',
      'list.activeSelectionBackground': '#ADD6FF',
      'list.activeSelectionForeground': '#000000',
      'list.focusBackground': '#ADD6FF',
      'list.focusForeground': '#000000',
      'list.highlightForeground': '#000000',
      // Inline suggest (ghost text) colors
      'editorInlineSuggest.foreground': '#000000',
      'editorInlineSuggest.background': '#F3F3F3',
      'editorInlineSuggest.border': '#C4C4C4',
      'editorInlineSuggest.shadow': '#00000020',
    }
  });

  console.log('starlims-dark and starlims-light themes defined');
}

// Register the languages with Monaco
export function registerLanguages(editorMonaco?: typeof monaco) {
  const m = editorMonaco || monaco;
  console.log('=== registerLanguages called ===');

  // Register SSL language (Server Side Script)
  m.languages.register({
    id: 'ssl',
    extensions: ['.ssl', '.srvscr', '.ss'],
    aliases: ['SSL', 'STARLIMS Script', 'Server Script']
  });
  m.languages.setMonarchTokensProvider('ssl', sslLanguage);

  // Define SSL theme colors
  m.languages.setLanguageConfiguration('ssl', {
    comments: {
      lineComment: '/*',
      blockComment: ['/*', ';']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(:FOR|:WHILE|:PROCEDURE|:IF|:BEGINCASE|:CASE|:TRY|:CATCH|:FINALLY|:REGION|:ERROR|:CLASS|:BEGININLINECODE).*;?\s*$/,
      decreaseIndentPattern: /^\s*(:ENDCASE|:END|:NEXT|:ENDWHILE|:ENDPROC|:ENDIF|:ENDTRY|:ENDREGION|:ENDCLASS|:ENDINLINECODE).*;?\s*$/
    },
    folding: {
      offSide: false,
      markers: {
        start: /^\s*(\/\*\s?region).*$/,
        end: /^\s*(\/\*endregion;).*$/
      }
    }
  });

  // Register SSL formatter
  m.languages.registerDocumentFormattingEditProvider('ssl', {
    provideDocumentFormattingEdits: (document) => {
      console.log('=== SSL formatter CALLED ===');
      console.log('Document URI:', document.uri);
      console.log('Document value length:', document.getValue().length);
      const text = document.getValue();
      const formatted = formatSSL(text);
      console.log('Formatted result length:', formatted.length);
      console.log('First 200 chars of formatted:', formatted.substring(0, 200));
      return [{
        range: document.getFullModelRange(),
        text: formatted
      }];
    }
  });

  console.log('SSL formatter registration complete');

  // Register SSL document symbols provider for outline view
  m.languages.registerDocumentSymbolProvider('ssl', {
    provideDocumentSymbols: (model) => {
      const symbols: monaco.languages.DocumentSymbol[] = [];
      const lines = model.getLinesContent();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // :PROCEDURE
        const procMatch = line.match(/^:PROCEDURE\s+(\w+)/i);
        if (procMatch) {
          symbols.push({
            name: procMatch[1],
            detail: ':PROCEDURE',
            kind: monaco.languages.SymbolKind.Function,
            range: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            selectionRange: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            tags: []
          });
          continue;
        }

        // :FUNCTION
        const funcMatch = line.match(/^:FUNCTION\s+(\w+)/i);
        if (funcMatch) {
          symbols.push({
            name: funcMatch[1],
            detail: ':FUNCTION',
            kind: monaco.languages.SymbolKind.Function,
            range: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            selectionRange: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            tags: []
          });
          continue;
        }

        // :CLASS
        const classMatch = line.match(/^:CLASS\s+(\w+)/i);
        if (classMatch) {
          symbols.push({
            name: classMatch[1],
            detail: ':CLASS',
            kind: monaco.languages.SymbolKind.Class,
            range: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            selectionRange: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            tags: []
          });
          continue;
        }

        // :METHOD inside class
        const methodMatch = line.match(/^:METHOD\s+(\w+)/i);
        if (methodMatch) {
          symbols.push({
            name: methodMatch[1],
            detail: ':METHOD',
            kind: monaco.languages.SymbolKind.Method,
            range: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            selectionRange: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            tags: []
          });
        }
      }

      return symbols;
    }
  });

  // Register SLSQL language (STARLIMS SQL DataSource)
  m.languages.register({
    id: 'slsql',
    extensions: ['.slsql', '.ds'],
    aliases: ['SLSQL', 'STARLIMS SQL', 'DataSource']
  });
  m.languages.setMonarchTokensProvider('slsql', slsqlLanguage);

  m.languages.register({
    id: 'starlimslog',
    extensions: ['.log'],
    aliases: ['STARLIMS Log', 'Server Log']
  });
  m.languages.setMonarchTokensProvider('starlimslog', starlimsLogLanguage);

  // Define SLSQL theme colors
  m.languages.setLanguageConfiguration('slsql', {
    comments: {
      lineComment: '--',
      blockComment: ['/*', '*/']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(SELECT|FROM|WHERE|AND|OR|INSERT|UPDATE|DELETE|CREATE|ALTER|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS)\b.*$/i,
      decreaseIndentPattern: /^\s*(WHERE|AND|OR|ORDER|GROUP|HAVING|LIMIT|OFFSET)\b.*$/i
    }
  });

  // Register SLSQL formatter
  m.languages.registerDocumentFormattingEditProvider('slsql', {
    provideDocumentFormattingEdits: (document) => {
      console.log('=== SLSQL formatter CALLED ===');
      const text = document.getValue();
      const formatted = formatSLSQL(text);
      return [{
        range: document.getFullModelRange(),
        text: formatted
      }];
    }
  });

  console.log('SLSQL formatter registration complete');

  // Register SLSQL document symbols provider for outline view
  m.languages.registerDocumentSymbolProvider('slsql', {
    provideDocumentSymbols: (model) => {
      const symbols: monaco.languages.DocumentSymbol[] = [];
      const lines = model.getLinesContent();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Store procedure / function definitions
        const createMatch = line.match(/^CREATE\s+(PROCEDURE|FUNCTION)\s+(\w+)/i);
        if (createMatch) {
          symbols.push({
            name: createMatch[2],
            detail: createMatch[1],
            kind: monaco.languages.SymbolKind.Function,
            range: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            selectionRange: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
            tags: []
          });
        }

        // Table references
        const tableMatch = line.match(/^FROM\s+(\w+)/i) || line.match(/^JOIN\s+(\w+)/i);
        if (tableMatch && !line.startsWith('--')) {
          // Only add if not already added
          const existing = symbols.find(s => s.name === tableMatch[1]);
          if (!existing) {
            symbols.push({
              name: tableMatch[1],
              detail: 'Table',
              kind: monaco.languages.SymbolKind.Class,
              range: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
              selectionRange: { startLineNumber: i + 1, startColumn: 1, endLineNumber: i + 1, endColumn: model.getLineMaxColumn(i + 1) },
              tags: []
            });
          }
        }
      }

      return symbols;
    }
  });

  console.log('=== registerLanguages finished ===');
}

// Simple SSL formatter for STARLIMS scripts
function formatSSL(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let indentLevel = 0;
  const indentStr = '  ';

  // Block keywords that increase indent for body
  const blockKeywords = [
    ':FOR', ':WHILE', ':IF', ':BEGINCASE', ':CASE',
    ':TRY', ':CATCH', ':FINALLY', ':REGION', ':CLASS',
    ':BEGININLINECODE', ':PROCEDURE'
  ];

  // End block keywords that decrease indent
  const endBlockKeywords = [
    ':ENDCASE', ':ENDFOR', ':ENDWHILE', ':ENDPROC', ':ENDIF',
    ':ENDTRY', ':ENDREGION', ':ENDCLASS', ':ENDINLINECODE'
  ];

  // Mid-block keywords (:ELSE, :OTHERWISE stay at same level as :IF)
  const midBlockKeywords = [':ELSE', ':OTHERWISE'];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      result.push('');
      continue;
    }

    // Check for mid-block keywords (:ELSE, :OTHERWISE)
    // These should be at same indent as :IF, not decreased
    let isMidBlock = false;
    for (const kw of midBlockKeywords) {
      if (trimmed.startsWith(kw)) {
        isMidBlock = true;
        break;
      }
    }

    // Check for end block keywords
    let isEndBlock = false;
    for (const kw of endBlockKeywords) {
      if (trimmed.startsWith(kw)) {
        isEndBlock = true;
        break;
      }
    }

    // Check for block keywords
    let isBlockStart = false;
    for (const kw of blockKeywords) {
      if (trimmed.startsWith(kw)) {
        isBlockStart = true;
        break;
      }
    }

    // Apply logic
    if (isEndBlock && indentLevel > 0) {
      indentLevel--;
    }

    result.push(indentStr.repeat(indentLevel) + trimmed);

    if (isMidBlock && indentLevel > 0) {
      indentLevel--;
    }

    if (isBlockStart) {
      indentLevel++;
    }
  }

  return result.join('\n');
}

// Simple SLSQL formatter
function formatSLSQL(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let indentLevel = 0;
  const indentStr = '  ';

  // SQL keywords that increase indent
  const increaseIndent = [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR',
    'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'OUTER JOIN', 'CROSS JOIN',
    'GROUP BY', 'HAVING', 'ORDER BY',
    'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
    'CREATE', 'ALTER', 'DROP',
    'UNION', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
  ];

  // Keywords that decrease indent
  const decreaseIndent = [
    'WHERE', 'AND', 'OR', 'GROUP BY', 'HAVING', 'ORDER BY',
    'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'OUTER JOIN', 'CROSS JOIN',
    'SELECT', 'FROM', 'VALUES', 'SET', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      result.push('');
      continue;
    }

    // Check for keywords that should decrease indent
    let shouldDecrease = false;
    for (const kw of decreaseIndent) {
      if (trimmed.toUpperCase().startsWith(kw) && trimmed.length > kw.length) {
        shouldDecrease = true;
        break;
      }
    }

    if (shouldDecrease && indentLevel > 0) {
      indentLevel--;
    }

    // Add the indented line
    result.push(indentStr.repeat(indentLevel) + trimmed);

    // Check for keywords that should increase indent
    let shouldIncrease = false;
    for (const kw of increaseIndent) {
      if (trimmed.toUpperCase().startsWith(kw) && trimmed.length > kw.length) {
        shouldIncrease = true;
        break;
      }
    }

    if (shouldIncrease) {
      indentLevel++;
    }
  }

  return result.join('\n');
}

export default { registerLanguages, sslLanguage, slsqlLanguage };
