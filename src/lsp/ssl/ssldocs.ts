/**
 * Hand-authored documentation for STARLIMS built-in functions: common
 * exceptions, caveats and usage guidance gathered from backend development
 * experience. Entries are keyed by lowercase function name and merged into
 * the builtin hover output.
 */
export interface SSLDocEntry {
  exceptions?: string[];
  caveats?: string[];
  guidance?: string[];
}

const DOCS: Record<string, SSLDocEntry> = {
  sqlexecute: {
    exceptions: [
      'Throws a runtime error when the SQL statement is invalid or references a missing table/column.',
    ],
    caveats: [
      'Returns NULL (NIL) for SELECT statements without a matching row; use ISNULL() in the SQL to provide defaults.',
      'Placeholders are named ?param? tokens; positional ? markers are not substituted.',
      'A numeric column comes back as a NUMBER, not a string - guard comparisons with Val(LimsString(...)) if the column may be numeric.',
    ],
    guidance: [
      'Always use named ?param? placeholders instead of string concatenation; the server detects SQL injection patterns.',
      'Pass the table name via tableName for UPDATE/INSERT statements that must refresh dependent lists.',
      'Wrap multi-statement transactions in BeginLimsTransaction / EndLimsTransaction.',
    ],
  },
  getdataset: {
    exceptions: ['Throws when the query fails or a ?param? placeholder is missing from the passed parameter array.'],
    caveats: [
      'The first argument is the SQL statement; additional arguments are the ?param? values in order.',
      'Numeric columns are returned as numbers, not strings.',
    ],
    guidance: ['Use GetDataSet for read-only SELECT statements that need ?param? substitution.'],
  },
  getdatasetex: {
    exceptions: ['Throws when a positional ? marker is missing from the arguments.'],
    caveats: [
      'Takes positional ? markers, not named ?param? tokens - pass values in the order the ? markers appear.',
    ],
    guidance: ['Prefer GetDataSetEx when the statement is built dynamically with positional markers.'],
  },
  runsql: {
    exceptions: ['Throws on SQL errors; inspect GetLastSQLError() in :CATCH for the server message.'],
    caveats: [
      'Expects positional ? markers with values passed as arguments.',
      'Returns the dataset or an affected-row indicator depending on the statement; check the return value for NIL on failure.',
    ],
    guidance: [
      'Set the friendlyName argument to make errors in the server log easier to trace.',
      'Use :TRY/:CATCH with GetLastSQLError() around RunSQL calls that can fail at runtime.',
    ],
  },
  lsearch: {
    exceptions: [
      "Throws when a ? marker has no matching argument: 'Argument cannot be null and it must be a string.'",
    ],
    caveats: [
      'Returns the first matching row as an array of arrays; empty result is an empty array, not NIL.',
      'Numeric columns are returned as numbers - Val() on such a value crashes with "Argument \'sNumber\' cannot be null and it must be a string."; use Val(LimsString(...)) instead.',
    ],
    guidance: ['Guard numeric lookups with ISNULL(column, default) in the SELECT to stay null-proof.'],
  },
  lselect: {
    caveats: [
      'Like LSearch but iterates all matches; a LSearch/LSelect call with no match returns an empty array.',
    ],
  },
  doproc: {
    exceptions: ['Throws when the procedure name is not registered on the server.'],
    caveats: [
      'The first argument is a string in "Module.Procedure" form; unqualified names are not resolved.',
      'Arguments are passed as an array; each argument maps positionally to the target :PARAMETERS.',
    ],
    guidance: [
      'Prefer direct calls for same-script procedures; DoProc is for cross-module dispatch.',
      'The string is resolved at runtime on the server - a typo is not caught by the parser.',
    ],
  },
  execfunction: {
    caveats: [
      'Resolves "Module.Function" at runtime; the parser cannot verify the target exists.',
      'Use :INCLUDE for compile-time access to procedures in other modules.',
    ],
  },
  createudobject: {
    caveats: [
      'Properties are passed as an array of {name, value} pairs; property access uses the colon operator (oObj:Prop).',
      'Values are copied - nested objects are not deep-copied.',
    ],
    guidance: ['Use {} object literals or build the array with aadd.'],
  },
  getsetting: {
    caveats: [
      'Reads the named setting from the system settings table; returns an empty string when the setting does not exist.',
      'The result is cached per server session; newly written settings may need a new session to appear.',
    ],
  },
  setbyname: {
    caveats: [
      'The first argument is the setting name, the second the value; missing settings are created.',
      'Setting writes require the calling user to have the corresponding permission.',
    ],
  },
  getlastsslerror: {
    guidance: [
      'Call inside :CATCH after a failed SQL call; the returned object exposes :FullDescription for user-facing messages.',
      'Returns NIL when no error is pending - always check for NIL before dereferencing :FullDescription.',
    ],
  },
  raiseerror: {
    exceptions: ['Raises a runtime error that terminates the current procedure chain.'],
    guidance: ['Use RaiseError for fatal conditions; use UsrMes for user-visible messages.'],
  },
  beginlimstransaction: {
    caveats: [
      'The connection name must be a configured DSN ("DATABASE" for the default dictionary).',
      'Nested transactions are not supported - always pair with EndLimsTransaction in :FINALLY.',
    ],
    guidance: [
      ':TRY;\n\tBeginLimsTransaction("DATABASE");\n\t/* work */\n:CATCH;\n\tbCommit := .F.;\n:FINALLY;\n\tEndLimsTransaction("DATABASE", bCommit);\n:ENDTRY;',
    ],
  },
  endlimstransaction: {
    caveats: [
      'The second argument decides commit (true) or rollback (false); it is required.',
    ],
  },
  sqlremovecomments: {
    caveats: [
      'Removes /* ... */ comment blocks from the statement before execution; useful when the statement contains comment text.',
    ],
  },
  getdsparameters: {
    caveats: ['Returns the parameter definitions of a data source, not the current values.'],
  },
  val: {
    exceptions: [
      'Throws "Argument \'sNumber\' cannot be null and it must be a string." when the argument is a number or NIL.',
    ],
    caveats: [
      'Takes a STRING - passing a numeric value (e.g. from a SQL numeric column) crashes; wrap with LimsString() first.',
    ],
    guidance: ['Use Val(LimsString(nValue)) when the value can be either a number or a string.'],
  },
  limsstring: {
    guidance: ['Converts any value (number, boolean, NIL) to a string safely; prefer over manual concatenation.'],
  },
  empty: {
    caveats: [
      'Empty(0) and Empty(0.0) return .F. - a numeric zero is NOT empty.',
      'Empty(NIL) and Empty("") return .T.',
    ],
    guidance: ['Guard optional parameters with Empty() before use.'],
  },
  iif: {
    caveats: [
      'Both branches are evaluated eagerly; side effects in the unused branch still run.',
      'Nested IIF calls are hard to read - use :IF/:ELSE/:ENDIF instead (style rule nested_iif).',
    ],
  },
  buildstringforin: {
    caveats: [
      'Builds a comma-separated string for SQL IN clauses; values are quoted as strings.',
      'The result can exceed the SQL text limit for large arrays - chunk large IN lists.',
    ],
    guidance: ['Escape single quotes in the source values before embedding (use Replace(value, "\'", "\'\'")).'],
  },
  preparearrayforin: {
    caveats: ['Prepares an array for IN-clause substitution with ?param? placeholders.'],
  },
  datetostring: {
    caveats: [
      'The picture string is case-sensitive (e.g. "DD/MM/YYYY"); wrong pictures return unexpected output or an error.',
      'Invariant dates are formatted in the server locale - use SetAmPm / ServerTimeZone for display decisions.',
    ],
  },
  stringtodate: {
    caveats: ['Throws when the input does not match the expected date picture.'],
  },
  tojson: {
    caveats: [
      'Dates are serialized as strings; round-tripping through FromJson may change types.',
      'Arrays with a single element and multi-dimensional arrays serialize differently - verify the shape after round-trip.',
    ],
  },
  fromjson: {
    caveats: [
      'JSON object keys become UDObject properties; use oObj:Prop access to read them.',
      'Malformed JSON returns NIL - validate before dereferencing.',
    ],
  },
  getconnectionbyname: {
    caveats: ['Returns the connection object for a configured DSN; returns NIL for unknown names.'],
  },
  isdefined: {
    guidance: ['Use to test whether a variable was declared before dereferencing it.'],
  },
  getregion: {
    caveats: ['Returns the contents of a :REGION block of inline code; regions are evaluated server-side.'],
  },
  usrmes: {
    caveats: [
      'The first argument is the title, the second the message text.',
      'Message text can include HTML-like markup in the Web client; escape user input to avoid rendering surprises.',
    ],
  },
};

export function getSSLDoc(name: string): SSLDocEntry | undefined {
  return DOCS[name.toLowerCase()];
}

export function formatSSLDoc(name: string): string {
  const entry = getSSLDoc(name);
  if (!entry) {
    return '';
  }
  let md = '';
  if (entry.exceptions && entry.exceptions.length > 0) {
    md += '\n\n**Known exceptions:**\n';
    for (const e of entry.exceptions) {
      md += `\n- ${e}`;
    }
  }
  if (entry.caveats && entry.caveats.length > 0) {
    md += '\n\n**Caveats:**\n';
    for (const c of entry.caveats) {
      md += `\n- ${c}`;
    }
  }
  if (entry.guidance && entry.guidance.length > 0) {
    md += '\n\n**Guidance:**\n';
    for (const g of entry.guidance) {
      md += `\n- ${g}`;
    }
  }
  return md;
}