export interface BuiltinFunction {
  name: string;
  library: string;
  signature: string;
  description: string;
  parameters: { name: string; type: string; description: string }[];
  returnType: string;
}

const BUILTINS: BuiltinFunction[] = [
  // ArrayLib
  { name: 'aadd', library: 'ArrayLib', signature: 'aadd(SSLArray target, SSLValue element)', description: 'Appends an element to the end of an array.', parameters: [{ name: 'target', type: 'SSLArray', description: 'The target array.' }, { name: 'element', type: 'SSLValue', description: 'The element to add.' }], returnType: 'SSLValue' },
  { name: 'aeval', library: 'ArrayLib', signature: 'aeval(SSLArray arr, SSLValue callback, SSLDouble start, SSLDouble count)', description: 'Evaluates a expression for each element of an array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'callback', type: 'SSLValue', description: 'Callback expression.' }, { name: 'start', type: 'SSLDouble', description: 'Start index.' }, { name: 'count', type: 'SSLDouble', description: 'Number of elements.' }], returnType: 'SSLArray' },
  { name: 'ascan', library: 'ArrayLib', signature: 'ascan(SSLArray arr, SSLValue value, SSLDouble start, SSLDouble count)', description: 'Scans an array for a value.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'value', type: 'SSLValue', description: 'Value to search for.' }], returnType: 'SSLDouble' },
  { name: 'ascanexact', library: 'ArrayLib', signature: 'ascanexact(SSLArray arr, SSLValue value, SSLDouble start, SSLDouble count)', description: 'Scans an array for an exact match.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'value', type: 'SSLValue', description: 'Value to search for.' }], returnType: 'SSLDouble' },
  { name: 'asize', library: 'ArrayLib', signature: 'asize(SSLArray arr, SSLDouble newSize)', description: 'Resizes an array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'newSize', type: 'SSLDouble', description: 'New size.' }], returnType: 'SSLArray' },
  { name: 'adiag', library: 'ArrayLib', signature: 'adiag(SSLArray arr)', description: 'Returns the diagonal elements of a 2D array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The 2D array.' }], returnType: 'SSLArray' },
  { name: 'acols', library: 'ArrayLib', signature: 'acols(SSLArray arr)', description: 'Returns the number of columns in a 2D array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The 2D array.' }], returnType: 'SSLDouble' },
  { name: 'arows', library: 'ArrayLib', signature: 'arows(SSLArray arr)', description: 'Returns the number of rows in a 2D array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The 2D array.' }], returnType: 'SSLDouble' },
  { name: 'acopy', library: 'ArrayLib', signature: 'acopy(SSLArray source, SSLArray target, SSLDouble start, SSLDouble count, SSLDouble targetStart)', description: 'Copies elements from one array to another.', parameters: [{ name: 'source', type: 'SSLArray', description: 'Source array.' }, { name: 'target', type: 'SSLArray', description: 'Target array.' }], returnType: 'SSLArray' },
  { name: 'adel', library: 'ArrayLib', signature: 'adel(SSLArray arr, SSLDouble index)', description: 'Deletes an element from an array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'index', type: 'SSLDouble', description: 'Index to delete.' }], returnType: 'SSLArray' },
  { name: 'ainsext', library: 'ArrayLib', signature: 'ainsext(SSLArray arr, SSLDouble index, SSLValue element)', description: 'Inserts an element into an array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'index', type: 'SSLDouble', description: 'Index at which to insert.' }, { name: 'element', type: 'SSLValue', description: 'Element to insert.' }], returnType: 'SSLArray' },
  { name: 'amsgs', library: 'ArrayLib', signature: 'amsgs(SSLArray arr)', description: 'Returns the array as a delimited string.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }], returnType: 'SSLString' },
  { name: 'buildarray', library: 'ArrayLib', signature: 'buildarray(SSLString str, SSLValue separator, SSLString delimiter)', description: 'Builds an array from a delimited string.', parameters: [{ name: 'str', type: 'SSLString', description: 'The string.' }, { name: 'separator', type: 'SSLValue', description: 'Separator.' }, { name: 'delimiter', type: 'SSLString', description: 'Delimiter.' }], returnType: 'SSLArray' },
  { name: 'buildstring', library: 'ArrayLib', signature: 'buildstring(SSLArray arr, SSLString separator)', description: 'Builds a string from an array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'separator', type: 'SSLString', description: 'Separator.' }], returnType: 'SSLString' },
  { name: 'buildstringforin', library: 'ArrayLib', signature: 'buildstringforin(SSLArray arr, SSLString separator)', description: 'Builds a string for IN clause from an array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'separator', type: 'SSLString', description: 'Separator.' }], returnType: 'SSLString' },
  { name: 'extractcol', library: 'ArrayLib', signature: 'extractcol(SSLArray arr, SSLDouble col)', description: 'Extracts a column from a 2D array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The 2D array.' }, { name: 'col', type: 'SSLDouble', description: 'Column index.' }], returnType: 'SSLArray' },
  { name: 'fillarray', library: 'ArrayLib', signature: 'fillarray(SSLArray arr, SSLValue value)', description: 'Fills an array with a value.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'value', type: 'SSLValue', description: 'Value to fill.' }], returnType: 'SSLArray' },
  { name: 'gettoken', library: 'ArrayLib', signature: 'gettoken(SSLString str, SSLString delimiter, SSLDouble tokenIndex)', description: 'Gets a token from a delimited string.', parameters: [{ name: 'str', type: 'SSLString', description: 'The string.' }, { name: 'delimiter', type: 'SSLString', description: 'Delimiter.' }, { name: 'tokenIndex', type: 'SSLDouble', description: 'Token index.' }], returnType: 'SSLString' },
  { name: 'implode', library: 'ArrayLib', signature: 'implode(SSLArray arr, SSLString separator)', description: 'Implodes an array into a string.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }, { name: 'separator', type: 'SSLString', description: 'Separator.' }], returnType: 'SSLString' },
  { name: 'tokenize', library: 'ArrayLib', signature: 'tokenize(SSLString str, SSLString delimiter)', description: 'Tokenizes a string into an array.', parameters: [{ name: 'str', type: 'SSLString', description: 'The string.' }, { name: 'delimiter', type: 'SSLString', description: 'Delimiter.' }], returnType: 'SSLArray' },
  { name: 'unique', library: 'ArrayLib', signature: 'unique(SSLArray arr)', description: 'Returns unique elements from an array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }], returnType: 'SSLArray' },

  // Builtin
  { name: 'cleardialog', library: 'Builtin', signature: 'cleardialog()', description: 'Clears the dialog box.', parameters: [], returnType: 'void' },
  { name: 'closeall', library: 'Builtin', signature: 'closeall()', description: 'Closes all open files.', parameters: [], returnType: 'void' },
  { name: 'closeconnection', library: 'Builtin', signature: 'closeconnection(SSLString connectionName)', description: 'Closes a database connection.', parameters: [{ name: 'connectionName', type: 'SSLString', description: 'Connection name.' }], returnType: 'void' },
  { name: 'createudobject', library: 'Builtin', signature: 'createudobject(SSLArray properties)', description: 'Creates a new UD object.', parameters: [{ name: 'properties', type: 'SSLArray', description: 'Array of {name, value} pairs.' }], returnType: 'SSLNetObject' },
  { name: 'createguid', library: 'Builtin', signature: 'createguid()', description: 'Creates a new GUID.', parameters: [], returnType: 'SSLString' },
  { name: 'dial', library: 'Builtin', signature: 'dial(SSLString message, SSLString title)', description: 'Displays a dialog box.', parameters: [{ name: 'message', type: 'SSLString', description: 'Message.' }, { name: 'title', type: 'SSLString', description: 'Title.' }], returnType: 'void' },
  { name: 'empty', library: 'Builtin', signature: 'empty(SSLValue value)', description: 'Checks if a value is empty.', parameters: [{ name: 'value', type: 'SSLValue', description: 'Value to check.' }], returnType: 'SSLBool' },
  { name: 'error', library: 'Builtin', signature: 'error(SSLString message)', description: 'Throws an error.', parameters: [{ name: 'message', type: 'SSLString', description: 'Error message.' }], returnType: 'void' },
  { name: 'execfunction', library: 'Builtin', signature: 'execfunction(SSLString functionName, SSLArray args)', description: 'Executes a function by name.', parameters: [{ name: 'functionName', type: 'SSLString', description: 'Function name.' }, { name: 'args', type: 'SSLArray', description: 'Arguments.' }], returnType: 'SSLValue' },
  { name: 'filesupport', library: 'Builtin', signature: 'filesupport(SSLString filePath, SSLString operation)', description: 'File operations (COPY, MOVE, DELETE).', parameters: [{ name: 'filePath', type: 'SSLString', description: 'File path.' }, { name: 'operation', type: 'SSLString', description: 'Operation type.' }], returnType: 'void' },
  { name: 'getarraysize', library: 'Builtin', signature: 'getarraysize(SSLArray arr)', description: 'Returns the size of an array.', parameters: [{ name: 'arr', type: 'SSLArray', description: 'The array.' }], returnType: 'SSLDouble' },
  { name: 'getenv', library: 'Builtin', signature: 'getenv(SSLString name)', description: 'Gets an environment variable.', parameters: [{ name: 'name', type: 'SSLString', description: 'Variable name.' }], returnType: 'SSLString' },
  { name: 'getlastsslerror', library: 'Builtin', signature: 'getlastsslerror()', description: 'Returns the last SSL error.', parameters: [], returnType: 'SSLNetObject' },
  { name: 'getpath', library: 'Builtin', signature: 'getpath()', description: 'Returns the current path.', parameters: [], returnType: 'SSLString' },
  { name: 'getsetting', library: 'Builtin', signature: 'getsetting(SSLString key)', description: 'Gets a setting value.', parameters: [{ name: 'key', type: 'SSLString', description: 'Setting key.' }], returnType: 'SSLString' },
  { name: 'iif', library: 'Builtin', signature: 'iif(SSLBool condition, SSLValue trueValue, SSLValue falseValue)', description: 'Immediate if - returns one of two values based on condition.', parameters: [{ name: 'condition', type: 'SSLBool', description: 'Condition.' }, { name: 'trueValue', type: 'SSLValue', description: 'Value if true.' }, { name: 'falseValue', type: 'SSLValue', description: 'Value if false.' }], returnType: 'SSLValue' },
  { name: 'limsnetconnect', library: 'Builtin', signature: 'limsnetconnect(SSLString assembly, SSLString typeName, SSLArray constructorArgs)', description: 'Connects to a .NET assembly and creates an instance.', parameters: [{ name: 'assembly', type: 'SSLString', description: 'Assembly name.' }, { name: 'typeName', type: 'SSLString', description: 'Type name.' }, { name: 'constructorArgs', type: 'SSLArray', description: 'Constructor arguments.' }], returnType: 'SSLNetObject' },
  { name: 'limsnetcast', library: 'Builtin', signature: 'limsnetcast(SSLValue value, SSLString typeName)', description: 'Casts a value to a .NET type.', parameters: [{ name: 'value', type: 'SSLValue', description: 'Value to cast.' }, { name: 'typeName', type: 'SSLString', description: 'Target type.' }], returnType: 'SSLNetObject' },
  { name: 'limsstring', library: 'Builtin', signature: 'limsstring(SSLString str)', description: 'Escapes a string for SQL.', parameters: [{ name: 'str', type: 'SSLString', description: 'String to escape.' }], returnType: 'SSLString' },
  { name: 'noproc', library: 'Builtin', signature: 'noproc()', description: 'Does nothing.', parameters: [], returnType: 'void' },
  { name: 'readtext', library: 'Builtin', signature: 'readtext(SSLString filePath)', description: 'Reads text from a file.', parameters: [{ name: 'filePath', type: 'SSLString', description: 'File path.' }], returnType: 'SSLString' },
  { name: 'setenv', library: 'Builtin', signature: 'setenv(SSLString name, SSLString value)', description: 'Sets an environment variable.', parameters: [{ name: 'name', type: 'SSLString', description: 'Variable name.' }, { name: 'value', type: 'SSLString', description: 'Value.' }], returnType: 'void' },
  { name: 'usrclose', library: 'Builtin', signature: 'usrclose()', description: 'Closes the user dialog.', parameters: [], returnType: 'void' },
  { name: 'usrmes', library: 'Builtin', signature: 'usrmes(SSLString message)', description: 'Displays a user message.', parameters: [{ name: 'message', type: 'SSLString', description: 'Message.' }], returnType: 'void' },
  { name: 'usrmesbox', library: 'Builtin', signature: 'usrmesbox(SSLString message, SSLString title, SSLString buttons)', description: 'Displays a user message box.', parameters: [{ name: 'message', type: 'SSLString', description: 'Message.' }, { name: 'title', type: 'SSLString', description: 'Title.' }, { name: 'buttons', type: 'SSLString', description: 'Buttons.' }], returnType: 'SSLString' },
  { name: 'usrinput', library: 'Builtin', signature: 'usrinput(SSLString message, SSLString title, SSLString default)', description: 'Gets user input.', parameters: [{ name: 'message', type: 'SSLString', description: 'Message.' }, { name: 'title', type: 'SSLString', description: 'Title.' }, { name: 'default', type: 'SSLString', description: 'Default value.' }], returnType: 'SSLString' },
  { name: 'writetext', library: 'Builtin', signature: 'writetext(SSLString filePath, SSLString content)', description: 'Writes text to a file.', parameters: [{ name: 'filePath', type: 'SSLString', description: 'File path.' }, { name: 'content', type: 'SSLString', description: 'Content.' }], returnType: 'void' },

  // DatabaseLib
  { name: 'getdataset', library: 'DatabaseLib', signature: 'getdataset(SSLString sql, SSLString connection)', description: 'Executes SQL and returns a dataset.', parameters: [{ name: 'sql', type: 'SSLString', description: 'SQL query.' }, { name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'SSLArray' },
  { name: 'getdatasetex', library: 'DatabaseLib', signature: 'getdatasetex(SSLString sql, SSLString connection, SSLArray params)', description: 'Executes parameterized SQL and returns a dataset.', parameters: [{ name: 'sql', type: 'SSLString', description: 'SQL query.' }, { name: 'connection', type: 'SSLString', description: 'Connection name.' }, { name: 'params', type: 'SSLArray', description: 'Parameters.' }], returnType: 'SSLArray' },
  { name: 'lsearch', library: 'DatabaseLib', signature: 'lsearch(SSLString sql, SSLString connection)', description: 'Searches using SQL and returns results.', parameters: [{ name: 'sql', type: 'SSLString', description: 'SQL query.' }, { name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'SSLArray' },
  { name: 'lselect', library: 'DatabaseLib', signature: 'lselect(SSLString sql, SSLString connection)', description: 'Selects data using SQL.', parameters: [{ name: 'sql', type: 'SSLString', description: 'SQL query.' }, { name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'SSLArray' },
  { name: 'lselect1', library: 'DatabaseLib', signature: 'lselect1(SSLString sql, SSLString connection)', description: 'Selects a single row using SQL.', parameters: [{ name: 'sql', type: 'SSLString', description: 'SQL query.' }, { name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'SSLArray' },
  { name: 'runsql', library: 'DatabaseLib', signature: 'runsql(SSLString sql, SSLString connection)', description: 'Executes SQL without returning results.', parameters: [{ name: 'sql', type: 'SSLString', description: 'SQL query.' }, { name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'void' },
  { name: 'runsqltransaction', library: 'DatabaseLib', signature: 'runsqltransaction(SSLArray statements, SSLString connection)', description: 'Executes multiple SQL statements in a transaction.', parameters: [{ name: 'statements', type: 'SSLArray', description: 'SQL statements.' }, { name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'void' },
  { name: 'sqlcanconnect', library: 'DatabaseLib', signature: 'sqlcanconnect(SSLString connection)', description: 'Checks if a database connection can be established.', parameters: [{ name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'SSLBool' },
  { name: 'sqlexecute', library: 'DatabaseLib', signature: 'sqlexecute(SSLString sql, SSLString connection)', description: 'Executes SQL and returns affected rows.', parameters: [{ name: 'sql', type: 'SSLString', description: 'SQL query.' }, { name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'SSLDouble' },
  { name: 'sqlgetconnectionstring', library: 'DatabaseLib', signature: 'sqlgetconnectionstring(SSLString connection)', description: 'Gets the connection string for a named connection.', parameters: [{ name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'SSLString' },
  { name: 'beginlimstransaction', library: 'DatabaseLib', signature: 'beginlimstransaction(SSLString connection)', description: 'Begins a STARLIMS transaction.', parameters: [{ name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'void' },
  { name: 'commitlimstransaction', library: 'DatabaseLib', signature: 'commitlimstransaction(SSLString connection)', description: 'Commits a STARLIMS transaction.', parameters: [{ name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'void' },
  { name: 'rollbacklimstransaction', library: 'DatabaseLib', signature: 'rollbacklimstransaction(SSLString connection)', description: 'Rolls back a STARLIMS transaction.', parameters: [{ name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'void' },

  // DataTypeLib
  { name: 'val', library: 'DataTypeLib', signature: 'val(SSLString str)', description: 'Converts a string to a number.', parameters: [{ name: 'str', type: 'SSLString', description: 'String to convert.' }], returnType: 'SSLDouble' },
  { name: 'str', library: 'DataTypeLib', signature: 'str(SSLDouble number, SSLDouble length, SSLDouble decimals)', description: 'Converts a number to a string.', parameters: [{ name: 'number', type: 'SSLDouble', description: 'Number.' }, { name: 'length', type: 'SSLDouble', description: 'Length.' }, { name: 'decimals', type: 'SSLDouble', description: 'Decimals.' }], returnType: 'SSLString' },
  { name: 'type', library: 'DataTypeLib', signature: 'type(SSLValue value)', description: 'Returns the type of a value.', parameters: [{ name: 'value', type: 'SSLValue', description: 'Value.' }], returnType: 'SSLString' },
  { name: 'empty', library: 'DataTypeLib', signature: 'empty(SSLValue value)', description: 'Checks if a value is empty.', parameters: [{ name: 'value', type: 'SSLValue', description: 'Value.' }], returnType: 'SSLBool' },
  { name: 'nullvalue', library: 'DataTypeLib', signature: 'nullvalue(SSLValue value, SSLValue替代)', description: 'Returns alternative if value is null.', parameters: [{ name: 'value', type: 'SSLValue', description: 'Value.' }, { name: '替代', type: 'SSLValue', description: 'Alternative.' }], returnType: 'SSLValue' },

  // DateLib
  { name: 'date', library: 'DateLib', signature: 'date()', description: 'Returns the current date.', parameters: [], returnType: 'SSLString' },
  { name: 'datetime', library: 'DateLib', signature: 'datetime()', description: 'Returns the current date and time.', parameters: [], returnType: 'SSLString' },
  { name: 'dateadd', library: 'DateLib', signature: 'dateadd(SSLString date, SSLDouble days)', description: 'Adds days to a date.', parameters: [{ name: 'date', type: 'SSLString', description: 'Date.' }, { name: 'days', type: 'SSLDouble', description: 'Days to add.' }], returnType: 'SSLString' },
  { name: 'datediff', library: 'DateLib', signature: 'datediff(SSLString date1, SSLString date2)', description: 'Returns the difference between two dates in days.', parameters: [{ name: 'date1', type: 'SSLString', description: 'First date.' }, { name: 'date2', type: 'SSLString', description: 'Second date.' }], returnType: 'SSLDouble' },
  { name: 'dateformat', library: 'DateLib', signature: 'dateformat(SSLString date, SSLString format)', description: 'Formats a date string.', parameters: [{ name: 'date', type: 'SSLString', description: 'Date.' }, { name: 'format', type: 'SSLString', description: 'Format.' }], returnType: 'SSLString' },
  { name: 'datename', library: 'DateLib', signature: 'datename(SSLString date, SSLString part)', description: 'Returns a part of a date as a string.', parameters: [{ name: 'date', type: 'SSLString', description: 'Date.' }, { name: 'part', type: 'SSLString', description: 'Part.' }], returnType: 'SSLString' },
  { name: 'datenumber', library: 'DateLib', signature: 'datenumber(SSLString date, SSLString part)', description: 'Returns a part of a date as a number.', parameters: [{ name: 'date', type: 'SSLString', description: 'Date.' }, { name: 'part', type: 'SSLString', description: 'Part.' }], returnType: 'SSLDouble' },
  { name: 'dateset', library: 'DateLib', signature: 'dateset(SSLString date, SSLString part, SSLDouble value)', description: 'Sets a part of a date.', parameters: [{ name: 'date', type: 'SSLString', description: 'Date.' }, { name: 'part', type: 'SSLString', description: 'Part.' }, { name: 'value', type: 'SSLDouble', description: 'Value.' }], returnType: 'SSLString' },
  { name: 'now', library: 'DateLib', signature: 'now()', description: 'Returns the current date and time.', parameters: [], returnType: 'SSLString' },
  { name: 'today', library: 'DateLib', signature: 'today()', description: 'Returns today\'s date.', parameters: [], returnType: 'SSLString' },

  // StringLib
  { name: 'at', library: 'StringLib', signature: 'at(SSLString search, SSLString string)', description: 'Returns the position of a substring.', parameters: [{ name: 'search', type: 'SSLString', description: 'Search string.' }, { name: 'string', type: 'SSLString', description: 'Source string.' }], returnType: 'SSLDouble' },
  { name: 'left', library: 'StringLib', signature: 'left(SSLString str, SSLDouble count)', description: 'Returns the leftmost characters.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }, { name: 'count', type: 'SSLDouble', description: 'Count.' }], returnType: 'SSLString' },
  { name: 'len', library: 'StringLib', signature: 'len(SSLString str)', description: 'Returns the length of a string.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }], returnType: 'SSLDouble' },
  { name: 'lower', library: 'StringLib', signature: 'lower(SSLString str)', description: 'Converts to lowercase.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }], returnType: 'SSLString' },
  { name: 'ltrim', library: 'StringLib', signature: 'ltrim(SSLString str)', description: 'Trims leading whitespace.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }], returnType: 'SSLString' },
  { name: 'padc', library: 'StringLib', signature: 'padc(SSLString str, SSLDouble length)', description: 'Centers a string.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }, { name: 'length', type: 'SSLDouble', description: 'Length.' }], returnType: 'SSLString' },
  { name: 'padl', library: 'StringLib', signature: 'padl(SSLString str, SSLDouble length)', description: 'Left pads a string.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }, { name: 'length', type: 'SSLDouble', description: 'Length.' }], returnType: 'SSLString' },
  { name: 'padr', library: 'StringLib', signature: 'padr(SSLString str, SSLDouble length)', description: 'Right pads a string.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }, { name: 'length', type: 'SSLDouble', description: 'Length.' }], returnType: 'SSLString' },
  { name: 'rat', library: 'StringLib', signature: 'rat(SSLString search, SSLString string)', description: 'Returns the rightmost position of a substring.', parameters: [{ name: 'search', type: 'SSLString', description: 'Search string.' }, { name: 'string', type: 'SSLString', description: 'Source string.' }], returnType: 'SSLDouble' },
  { name: 'replicate', library: 'StringLib', signature: 'replicate(SSLString str, SSLDouble count)', description: 'Repeats a string.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }, { name: 'count', type: 'SSLDouble', description: 'Count.' }], returnType: 'SSLString' },
  { name: 'right', library: 'StringLib', signature: 'right(SSLString str, SSLDouble count)', description: 'Returns the rightmost characters.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }, { name: 'count', type: 'SSLDouble', description: 'Count.' }], returnType: 'SSLString' },
  { name: 'rtrim', library: 'StringLib', signature: 'rtrim(SSLString str)', description: 'Trims trailing whitespace.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }], returnType: 'SSLString' },
  { name: 'space', library: 'StringLib', signature: 'space(SSLDouble count)', description: 'Returns a string of spaces.', parameters: [{ name: 'count', type: 'SSLDouble', description: 'Count.' }], returnType: 'SSLString' },
  { name: 'stuff', library: 'StringLib', signature: 'stuff(SSLString str, SSLDouble start, SSLDouble count, SSLString replacement)', description: 'Replaces characters in a string.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }, { name: 'start', type: 'SSLDouble', description: 'Start.' }, { name: 'count', type: 'SSLDouble', description: 'Count.' }, { name: 'replacement', type: 'SSLString', description: 'Replacement.' }], returnType: 'SSLString' },
  { name: 'substr', library: 'StringLib', signature: 'substr(SSLString str, SSLDouble start, SSLDouble count)', description: 'Returns a substring.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }, { name: 'start', type: 'SSLDouble', description: 'Start.' }, { name: 'count', type: 'SSLDouble', description: 'Count.' }], returnType: 'SSLString' },
  { name: 'trim', library: 'StringLib', signature: 'trim(SSLString str)', description: 'Trims whitespace from both ends.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }], returnType: 'SSLString' },
  { name: 'upper', library: 'StringLib', signature: 'upper(SSLString str)', description: 'Converts to uppercase.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }], returnType: 'SSLString' },
  { name: 'alltrim', library: 'StringLib', signature: 'alltrim(SSLString str)', description: 'Trims all whitespace.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }], returnType: 'SSLString' },
  { name: 'chr', library: 'StringLib', signature: 'chr(SSLDouble code)', description: 'Returns the character for a code.', parameters: [{ name: 'code', type: 'SSLDouble', description: 'Character code.' }], returnType: 'SSLString' },
  { name: 'occurs', library: 'StringLib', signature: 'occurs(SSLString search, SSLString string)', description: 'Counts occurrences of a substring.', parameters: [{ name: 'search', type: 'SSLString', description: 'Search string.' }, { name: 'string', type: 'SSLString', description: 'Source string.' }], returnType: 'SSLDouble' },
  { name: 'transform', library: 'StringLib', signature: 'transform(SSLValue value, SSLString format)', description: 'Formats a value using a picture string.', parameters: [{ name: 'value', type: 'SSLValue', description: 'Value.' }, { name: 'format', type: 'SSLString', description: 'Format.' }], returnType: 'SSLString' },

  // NumericLib
  { name: 'abs', library: 'NumericLib', signature: 'abs(SSLDouble number)', description: 'Returns the absolute value.', parameters: [{ name: 'number', type: 'SSLDouble', description: 'Number.' }], returnType: 'SSLDouble' },
  { name: 'int', library: 'NumericLib', signature: 'int(SSLDouble number)', description: 'Returns the integer part.', parameters: [{ name: 'number', type: 'SSLDouble', description: 'Number.' }], returnType: 'SSLDouble' },
  { name: 'max', library: 'NumericLib', signature: 'max(SSLDouble a, SSLDouble b)', description: 'Returns the maximum of two numbers.', parameters: [{ name: 'a', type: 'SSLDouble', description: 'First number.' }, { name: 'b', type: 'SSLDouble', description: 'Second number.' }], returnType: 'SSLDouble' },
  { name: 'min', library: 'NumericLib', signature: 'min(SSLDouble a, SSLDouble b)', description: 'Returns the minimum of two numbers.', parameters: [{ name: 'a', type: 'SSLDouble', description: 'First number.' }, { name: 'b', type: 'SSLDouble', description: 'Second number.' }], returnType: 'SSLDouble' },
  { name: 'mod', library: 'NumericLib', signature: 'mod(SSLDouble number, SSLDouble divisor)', description: 'Returns the modulo.', parameters: [{ name: 'number', type: 'SSLDouble', description: 'Number.' }, { name: 'divisor', type: 'SSLDouble', description: 'Divisor.' }], returnType: 'SSLDouble' },
  { name: 'round', library: 'NumericLib', signature: 'round(SSLDouble number, SSLDouble decimals)', description: 'Rounds a number.', parameters: [{ name: 'number', type: 'SSLDouble', description: 'Number.' }, { name: 'decimals', type: 'SSLDouble', description: 'Decimals.' }], returnType: 'SSLDouble' },
  { name: 'ceiling', library: 'NumericLib', signature: 'ceiling(SSLDouble number)', description: 'Returns the ceiling.', parameters: [{ name: 'number', type: 'SSLDouble', description: 'Number.' }], returnType: 'SSLDouble' },
  { name: 'floor', library: 'NumericLib', signature: 'floor(SSLDouble number)', description: 'Returns the floor.', parameters: [{ name: 'number', type: 'SSLDouble', description: 'Number.' }], returnType: 'SSLDouble' },
  { name: 'sign', library: 'NumericLib', signature: 'sign(SSLDouble number)', description: 'Returns the sign (-1, 0, 1).', parameters: [{ name: 'number', type: 'SSLDouble', description: 'Number.' }], returnType: 'SSLDouble' },
  { name: 'random', library: 'NumericLib', signature: 'random(SSLDouble max)', description: 'Returns a random number.', parameters: [{ name: 'max', type: 'SSLDouble', description: 'Maximum value.' }], returnType: 'SSLDouble' },
  { name: 'val', library: 'NumericLib', signature: 'val(SSLString str)', description: 'Converts string to number.', parameters: [{ name: 'str', type: 'SSLString', description: 'String.' }], returnType: 'SSLDouble' },

  // MiscLib
  { name: 'getsystemversion', library: 'MiscLib', signature: 'getsystemversion()', description: 'Returns the STARLIMS version.', parameters: [], returnType: 'SSLString' },
  { name: 'getsystemlayerid', library: 'MiscLib', signature: 'getsystemlayerid()', description: 'Returns the current layer ID.', parameters: [], returnType: 'SSLDouble' },
  { name: 'getusername', library: 'MiscLib', signature: 'getusername()', description: 'Returns the current username.', parameters: [], returnType: 'SSLString' },
  { name: 'myusername', library: 'MiscLib', signature: 'myusername()', description: 'Returns the current user name.', parameters: [], returnType: 'SSLString' },
  { name: 'sendlimsemail', library: 'MiscLib', signature: 'sendlimsemail(SSLString to, SSLString subject, SSLString body)', description: 'Sends an email via STARLIMS.', parameters: [{ name: 'to', type: 'SSLString', description: 'Recipient.' }, { name: 'subject', type: 'SSLString', description: 'Subject.' }, { name: 'body', type: 'SSLString', description: 'Body.' }], returnType: 'void' },
  { name: 'fromjson', library: 'MiscLib', signature: 'fromjson(SSLString json)', description: 'Parses a JSON string.', parameters: [{ name: 'json', type: 'SSLString', description: 'JSON string.' }], returnType: 'SSLNetObject' },
  { name: 'tojson', library: 'MiscLib', signature: 'tojson(SSLValue value)', description: 'Converts a value to JSON.', parameters: [{ name: 'value', type: 'SSLValue', description: 'Value.' }], returnType: 'SSLString' },
  { name: 'sleep', library: 'MiscLib', signature: 'sleep(SSLDouble milliseconds)', description: 'Pauses execution.', parameters: [{ name: 'milliseconds', type: 'SSLDouble', description: 'Milliseconds.' }], returnType: 'void' },
  { name: 'getproppath', library: 'MiscLib', signature: 'getproppath(SSLNetObject obj)', description: 'Returns the property path of an object.', parameters: [{ name: 'obj', type: 'SSLNetObject', description: 'Object.' }], returnType: 'SSLString' },
  { name: 'isnull', library: 'MiscLib', signature: 'isnull(SSLValue value)', description: 'Checks if a value is null.', parameters: [{ name: 'value', type: 'SSLValue', description: 'Value.' }], returnType: 'SSLBool' },

  // WebLib
  { name: 'getheader', library: 'WebLib', signature: 'getheader(SSLString name)', description: 'Gets an HTTP header.', parameters: [{ name: 'name', type: 'SSLString', description: 'Header name.' }], returnType: 'SSLString' },
  { name: 'getquerystring', library: 'WebLib', signature: 'getquerystring(SSLString name)', description: 'Gets a query string parameter.', parameters: [{ name: 'name', type: 'SSLString', description: 'Parameter name.' }], returnType: 'SSLString' },
  { name: 'setheader', library: 'WebLib', signature: 'setheader(SSLString name, SSLString value)', description: 'Sets an HTTP header.', parameters: [{ name: 'name', type: 'SSLString', description: 'Header name.' }, { name: 'value', type: 'SSLString', description: 'Value.' }], returnType: 'void' },
  { name: 'setstatuscode', library: 'WebLib', signature: 'setstatuscode(SSLDouble code)', description: 'Sets the HTTP status code.', parameters: [{ name: 'code', type: 'SSLDouble', description: 'Status code.' }], returnType: 'void' },
  { name: 'setcontenttype', library: 'WebLib', signature: 'setcontenttype(SSLString type)', description: 'Sets the content type.', parameters: [{ name: 'type', type: 'SSLString', description: 'Content type.' }], returnType: 'void' },
  { name: 'redirect', library: 'WebLib', signature: 'redirect(SSLString url)', description: 'Redirects to a URL.', parameters: [{ name: 'url', type: 'SSLString', description: 'URL.' }], returnType: 'void' },

  // FileLib
  { name: 'fileexists', library: 'FileLib', signature: 'fileexists(SSLString path)', description: 'Checks if a file exists.', parameters: [{ name: 'path', type: 'SSLString', description: 'File path.' }], returnType: 'SSLBool' },
  { name: 'copyfile', library: 'FileLib', signature: 'copyfile(SSLString source, SSLString target)', description: 'Copies a file.', parameters: [{ name: 'source', type: 'SSLString', description: 'Source path.' }, { name: 'target', type: 'SSLString', description: 'Target path.' }], returnType: 'void' },
  { name: 'movefile', library: 'FileLib', signature: 'movefile(SSLString source, SSLString target)', description: 'Moves a file.', parameters: [{ name: 'source', type: 'SSLString', description: 'Source path.' }, { name: 'target', type: 'SSLString', description: 'Target path.' }], returnType: 'void' },
  { name: 'deletefile', library: 'FileLib', signature: 'deletefile(SSLString path)', description: 'Deletes a file.', parameters: [{ name: 'path', type: 'SSLString', description: 'File path.' }], returnType: 'void' },
  { name: 'createdirectory', library: 'FileLib', signature: 'createdirectory(SSLString path)', description: 'Creates a directory.', parameters: [{ name: 'path', type: 'SSLString', description: 'Directory path.' }], returnType: 'void' },
  { name: 'getfilesize', library: 'FileLib', signature: 'getfilesize(SSLString path)', description: 'Returns the file size.', parameters: [{ name: 'path', type: 'SSLString', description: 'File path.' }], returnType: 'SSLDouble' },
  { name: 'readtext', library: 'FileLib', signature: 'readtext(SSLString path)', description: 'Reads text from a file.', parameters: [{ name: 'path', type: 'SSLString', description: 'File path.' }], returnType: 'SSLString' },
  { name: 'writetext', library: 'FileLib', signature: 'writetext(SSLString path, SSLString content)', description: 'Writes text to a file.', parameters: [{ name: 'path', type: 'SSLString', description: 'File path.' }, { name: 'content', type: 'SSLString', description: 'Content.' }], returnType: 'void' },
  { name: 'appendtext', library: 'FileLib', signature: 'appendtext(SSLString path, SSLString content)', description: 'Appends text to a file.', parameters: [{ name: 'path', type: 'SSLString', description: 'File path.' }, { name: 'content', type: 'SSLString', description: 'Content.' }], returnType: 'void' },

  // XmlLib
  { name: 'xmlparse', library: 'XmlLib', signature: 'xmlparse(SSLString xml)', description: 'Parses XML string.', parameters: [{ name: 'xml', type: 'SSLString', description: 'XML string.' }], returnType: 'SSLNetObject' },
  { name: 'xmlgetnode', library: 'XmlLib', signature: 'xmlgetnode(SSLNetObject doc, SSLString xpath)', description: 'Gets a node by XPath.', parameters: [{ name: 'doc', type: 'SSLNetObject', description: 'XML document.' }, { name: 'xpath', type: 'SSLString', description: 'XPath expression.' }], returnType: 'SSLNetObject' },
  { name: 'xmlgettext', library: 'XmlLib', signature: 'xmlgettext(SSLNetObject node)', description: 'Gets the text of a node.', parameters: [{ name: 'node', type: 'SSLNetObject', description: 'XML node.' }], returnType: 'SSLString' },
  { name: 'xmltostring', library: 'XmlLib', signature: 'xmltostring(SSLNetObject doc)', description: 'Converts XML to string.', parameters: [{ name: 'doc', type: 'SSLNetObject', description: 'XML document.' }], returnType: 'SSLString' },

  // GlobalSettings
  { name: 'getsetting', library: 'GlobalSettings', signature: 'getsetting(SSLString key)', description: 'Gets a global setting.', parameters: [{ name: 'key', type: 'SSLString', description: 'Setting key.' }], returnType: 'SSLString' },
  { name: 'setsetting', library: 'GlobalSettings', signature: 'setsetting(SSLString key, SSLString value)', description: 'Sets a global setting.', parameters: [{ name: 'key', type: 'SSLString', description: 'Setting key.' }, { name: 'value', type: 'SSLString', description: 'Value.' }], returnType: 'void' },

  // TransactionSettings
  { name: 'gettransactionconnection', library: 'TransactionSettings', signature: 'gettransactionconnection()', description: 'Gets the current transaction connection.', parameters: [], returnType: 'SSLString' },
  { name: 'settransactionconnection', library: 'TransactionSettings', signature: 'settransactionconnection(SSLString connection)', description: 'Sets the transaction connection.', parameters: [{ name: 'connection', type: 'SSLString', description: 'Connection name.' }], returnType: 'void' },

  // Interop / .NET
  { name: 'limsnetconnect', library: 'LateBinding', signature: 'limsnetconnect(SSLString assembly, SSLString typeName, SSLArray args)', description: 'Creates a .NET object instance.', parameters: [{ name: 'assembly', type: 'SSLString', description: 'Assembly name.' }, { name: 'typeName', type: 'SSLString', description: 'Type name.' }, { name: 'args', type: 'SSLArray', description: 'Constructor args.' }], returnType: 'SSLNetObject' },
  { name: 'limsnetcast', library: 'LateBinding', signature: 'limsnetcast(SSLValue value, SSLString typeName)', description: 'Casts to a .NET type.', parameters: [{ name: 'value', type: 'SSLValue', description: 'Value.' }, { name: 'typeName', type: 'SSLString', description: 'Type.' }], returnType: 'SSLNetObject' },

  // Sync
  { name: 'syncsend', library: 'Sync', signature: 'syncsend(SSLString channel, SSLValue data)', description: 'Sends data to a sync channel.', parameters: [{ name: 'channel', type: 'SSLString', description: 'Channel name.' }, { name: 'data', type: 'SSLValue', description: 'Data.' }], returnType: 'void' },
  { name: 'syncreceive', library: 'Sync', signature: 'syncreceive(SSLString channel, SSLDouble timeout)', description: 'Receives data from a sync channel.', parameters: [{ name: 'channel', type: 'SSLString', description: 'Channel name.' }, { name: 'timeout', type: 'SSLDouble', description: 'Timeout.' }], returnType: 'SSLValue' },

  // DoProc / ExecFunction (inter-process)
  { name: 'doproc', library: 'Builtin', signature: 'doproc(SSLString procedureName, SSLArray args)', description: 'Calls a server-side procedure by name.', parameters: [{ name: 'procedureName', type: 'SSLString', description: 'Procedure name (Provider.Method format).' }, { name: 'args', type: 'SSLArray', description: 'Arguments.' }], returnType: 'SSLValue' },
];

// Build lookup maps
const byName = new Map<string, BuiltinFunction[]>();
const allNames = new Set<string>();

for (const fn of BUILTINS) {
  const lower = fn.name.toLowerCase();
  if (!byName.has(lower)) {
    byName.set(lower, []);
  }
  byName.get(lower)!.push(fn);
  allNames.add(fn.name);
}

export function getBuiltinFunction(name: string): BuiltinFunction[] | undefined {
  return byName.get(name.toLowerCase());
}

export function getAllBuiltinNames(): string[] {
  return Array.from(allNames);
}

export function getAllBuiltins(): BuiltinFunction[] {
  return BUILTINS;
}

export function getBuiltinLibraries(): string[] {
  const libs = new Set<string>();
  for (const fn of BUILTINS) {
    libs.add(fn.library);
  }
  return Array.from(libs);
}
