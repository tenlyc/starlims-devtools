/**
 * SSL/SLSQL Code Snippets for Monaco Editor
 * Based on VS Code Extension with enhanced snippets
 */

import * as monaco from 'monaco-editor';
import { getEnterpriseService } from './enterpriseService';
import { SQL_COMPLETION_KEYWORDS, sqlCompletionContext, tableDefinitionFields } from './sqlIntelligence';

// SSL Snippets
export const sslSnippets: Record<string, monaco.languages.CompletionItem> = {
  // Control Flow
  ':FOR loop': {
    label: ':FOR loop',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':FOR ${1:i}:=${2:1} :TO Len(${3:arr});',
      '\t${4:/* put loop instructions here */}',
      ':NEXT;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Simple counter loop to iterate over an array',
    range: null as any
  },
  ':FOR i=1 TO n': {
    label: ':FOR i=1 TO n',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':FOR ${1:i}:=1 :TO ${2:n};',
      '\t${3:/* code */}',
      ':NEXT;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Counter loop from 1 to n',
    range: null as any
  },
  ':WHILE loop': {
    label: ':WHILE loop',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':WHILE ${1:condition};',
      '\t${2:/* put loop instructions here */}',
      ':ENDWHILE;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Simple while loop',
    range: null as any
  },
  ':IF :ENDIF': {
    label: ':IF :ENDIF',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':IF ${1:condition};',
      '\t${2:/* true branch */}',
      ':ENDIF;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'If statement without else',
    range: null as any
  },
  ':IF :ELSE :ENDIF': {
    label: ':IF :ELSE :ENDIF',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':IF ${1:condition};',
      '\t${2:/* true branch */}',
      ':ELSE;',
      '\t${3:/* false branch */}',
      ':ENDIF;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'If-Else statement',
    range: null as any
  },
  ':BEGINCASE': {
    label: ':BEGINCASE :CASE',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':BEGINCASE;',
      ':CASE ${1:condition1};',
      '\t${2:/* code */}',
      ':CASE ${3:condition2};',
      '\t${4:/* code */}',
      ':OTHERWISE;',
      '\t${5:/* default code */}',
      ':ENDCASE;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Case statement (switch)',
    range: null as any
  },
  // Error Handling
  ':TRY :CATCH': {
    label: ':TRY :CATCH',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':TRY;',
      '\t${1:/* error checked statements here */}',
      ':CATCH;',
      '\t${2:/* error handling code here */}',
      '\tErrorMes(GetLastSSLError():FullDescription);',
      ':FINALLY;',
      '\t${3:/* clean-up statements here */}',
      ':ENDTRY;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: ':TRY :CATCH :FINALLY Block',
    range: null as any
  },
  // Transaction
  'BeginLimsTransaction': {
    label: 'BeginLimsTransaction',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':DECLARE bCommit;',
      'bCommit := .T.;',
      ':TRY;',
      '\tBeginLimsTransaction("DATABASE");',
      '\t${1:/* SQL statements */}',
      ':CATCH;',
      '\tbCommit := .F.;',
      '\tErrorMes(GetLastSSLError():FullDescription);',
      ':FINALLY;',
      '\tEndLimsTransaction("DATABASE", bCommit);',
      ':ENDTRY;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Database Transaction Block',
    range: null as any
  },
  // Class Definition
  ':CLASS': {
    label: ':CLASS',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':CLASS ${1:ClassName};',
      '\t:PUBLIC ',
      '\t\t${2:/* public methods and properties */}',
      '',
      '\t:PRIVATE ',
      '\t\t${3:/* private methods and properties */}',
      ':ENDCLASS;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Class definition',
    range: null as any
  },
  // Procedure
  ':PROCEDURE': {
    label: ':PROCEDURE',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      ':PROCEDURE ${1:procedureName};',
      '\t:PARAMETERS ${2:param1}, ${3:param2};',
      '\t${4:/* procedure body */}',
      ':ENDPROC;'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Define a procedure',
    range: null as any
  },
  // Include
  ':INCLUDE': {
    label: ':INCLUDE',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: ':INCLUDE "${1:scriptName}";',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Include another script',
    range: null as any
  },
  // Database
  'GetDataSet': {
    label: 'GetDataSet',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'GetDataSet("${1:SQL query}", "${2:DATABASE}")'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Execute SQL query and return dataset',
    range: null as any
  },
  'RunSQL': {
    label: 'RunSQL',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'RunSQL("${1:SQL statement}", "${2:DATABASE}", {})'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Execute SQL statement (INSERT/UPDATE/DELETE)',
    range: null as any
  },
  'LSearch': {
    label: 'LSearch',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'LSearch("${1:SQL query}", "${2:DATABASE}", "${3:field name}")'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Search for a single value in SQL query result',
    range: null as any
  },
  'LSelect': {
    label: 'LSelect',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'LSelect("${1:SQL query}", "${2:DATABASE}")'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Execute SQL and return array of arrays',
    range: null as any
  },
  // lims namespace
  'lims.CallServer': {
    label: 'lims.CallServer',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'lims.CallServer("${1:application}", "${2:procedure}", ${3:parameters})'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Call server script via lims namespace',
    range: null as any
  },
  'lims.GetData': {
    label: 'lims.GetData',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'lims.GetData("${1:datasource}", ${2:parameters})'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Get data from datasource via lims namespace',
    range: null as any
  },
  // Messages
  'UsrMes': {
    label: 'UsrMes',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: 'UsrMes("${1:INFO|ERROR|WARNING}", "${2:message}");',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Display user message',
    range: null as any
  },
  // Array functions
  'arraynew': {
    label: 'arraynew',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: 'arraynew(${1:rows}, ${2:cols})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Create a new array',
    range: null as any
  },
  'aadd': {
    label: 'aadd',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: 'aadd(${1:array}, ${2:value})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Add element to array',
    range: null as any
  },
  // Type conversion
  'CreateUDObject': {
    label: 'CreateUDObject',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: 'CreateUDObject("${1:className}")',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'Create a user-defined object instance',
    range: null as any
  }
};

// SLSQL Snippets
export const slsqlSnippets: Record<string, monaco.languages.CompletionItem> = {
  'SELECT * FROM': {
    label: 'SELECT * FROM',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'SELECT ${1:*}',
      'FROM ${2:TableName}',
      'WHERE ${3:condition};'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'SELECT statement with WHERE clause',
    range: null as any
  },
  'SELECT with JOIN': {
    label: 'SELECT with JOIN',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'SELECT ${1:t1.column1}, ${2:t2.column2}',
      'FROM ${3:Table1} ${4:t1}',
      'INNER JOIN ${5:Table2} ${6:t2} ON ${7:t1.id = t2.foreign_id}',
      'WHERE ${8:condition};'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'SELECT with INNER JOIN',
    range: null as any
  },
  'INSERT INTO': {
    label: 'INSERT INTO',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'INSERT INTO ${1:TableName}',
      '(${2:Column1}, ${3:Column2})',
      'VALUES (${4:value1}, ${5:value2});'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'INSERT statement',
    range: null as any
  },
  'UPDATE SET': {
    label: 'UPDATE SET',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'UPDATE ${1:TableName}',
      'SET ${2:Column1} = ${3:value1}',
      'WHERE ${4:condition};'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'UPDATE statement',
    range: null as any
  },
  'DELETE FROM': {
    label: 'DELETE FROM',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'DELETE FROM ${1:TableName}',
      'WHERE ${2:condition};'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'DELETE statement',
    range: null as any
  },
  'SELECT CASE': {
    label: 'SELECT CASE',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'SELECT',
      '\t${1:column},',
      '\tCASE',
      '\t\tWHEN ${2:condition1} THEN ${3:value1}',
      '\t\tWHEN ${4:condition2} THEN ${5:value2}',
      '\t\tELSE ${6:default_value}',
      '\tEND AS ${7:alias_name}',
      'FROM ${8:TableName};'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'CASE expression in SELECT',
    range: null as any
  },
  'WHERE IN': {
    label: 'WHERE IN (...)',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'WHERE ${1:column} IN (${2:value1}, ${3:value2}, ${4:value3})'
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'WHERE IN clause',
    range: null as any
  },
  'WHERE LIKE': {
    label: 'WHERE LIKE',
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertText: [
      'WHERE ${1:column} LIKE \'${2:pattern}%\''
    ].join('\n'),
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'WHERE LIKE clause',
    range: null as any
  }
};

let snippetsRegistered = false;
const tableSearchCache = new Map<string, { expires: number; items: Array<{ name: string; uri?: string; guid?: string }> }>();
const tableFieldCache = new Map<string, { expires: number; fields: Array<{ name: string; detail?: string }> }>();

async function searchSqlTables(prefix: string): Promise<Array<{ name: string; uri?: string; guid?: string }>> {
  const key = prefix.trim().toUpperCase();
  if (!key) return [];
  const cached = tableSearchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.items;
  const result = await getEnterpriseService().search(prefix, 'TABLE', false);
  const items = result.items.slice(0, 100).map((item) => ({ name: item.name, uri: item.uri, guid: item.guid }));
  tableSearchCache.set(key, { expires: Date.now() + 30_000, items });
  return items;
}

async function loadSqlTableFields(tableName: string): Promise<Array<{ name: string; detail?: string }>> {
  const key = tableName.toUpperCase();
  const cached = tableFieldCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.fields;
  const result = await getEnterpriseService().search(tableName, 'TABLE', true);
  const table = result.items.find((item) => item.name.toUpperCase() === key) || result.items[0];
  if (!table) return [];
  const tableId = table.guid || table.uri;
  if (!tableId) return [];
  const definition = await getEnterpriseService().getTableDefinition(tableId);
  const fields = tableDefinitionFields(definition);
  tableFieldCache.set(key, { expires: Date.now() + 5 * 60_000, fields });
  return fields;
}

/**
 * Register snippets with Monaco Editor
 */
export function registerSnippets() {
  if (snippetsRegistered) return;
  snippetsRegistered = true;
  // Register SSL snippets
  monaco.languages.registerCompletionItemProvider('ssl', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const suggestions = Object.values(sslSnippets).map(snippet => ({
        ...snippet,
        range
      }));

      return { suggestions };
    }
  });

  // Register SLSQL snippets
  monaco.languages.registerCompletionItemProvider('slsql', {
    triggerCharacters: ['.', '?'],
    provideCompletionItems: async (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const beforeCursor = model.getValueInRange({
        startLineNumber: 1, startColumn: 1,
        endLineNumber: position.lineNumber, endColumn: position.column
      });
      const context = sqlCompletionContext(beforeCursor, model.getValue());
      const suggestions: monaco.languages.CompletionItem[] = Object.values(slsqlSnippets).map(snippet => ({
        ...snippet,
        range
      }));

      suggestions.push(...SQL_COMPLETION_KEYWORDS.map((keyword) => ({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        detail: 'SQL keyword',
        sortText: `2_${keyword}`,
        range
      })));
      suggestions.push({
        label: '?parameter?',
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: '?${1:parameter}?',
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: 'STARLIMS Data Source parameter',
        documentation: 'STARLIMS Data Source parameters use ?name? placeholders.',
        sortText: '0_parameter',
        range
      });

      try {
        if (context.kind === 'table' && context.prefix) {
          const tables = await searchSqlTables(context.prefix);
          suggestions.push(...tables.map((table) => ({
            label: table.name,
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: table.name,
            detail: 'STARLIMS table',
            documentation: table.uri || table.guid || table.name,
            sortText: `0_${table.name}`,
            range
          })));
        } else if (context.kind === 'column' && context.table) {
          const fields = await loadSqlTableFields(context.table);
          suggestions.push(...fields
            .filter((field) => !context.prefix || field.name.toUpperCase().startsWith(context.prefix.toUpperCase()))
            .map((field) => ({
              label: field.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: field.name,
              detail: field.detail || `Column in ${context.table}`,
              sortText: `0_${field.name}`,
              range
            })));
        }
      } catch (error) {
        console.warn('STARLIMS SQL metadata completion is unavailable:', error);
      }

      return { suggestions };
    }
  });
}

export default { registerSnippets, sslSnippets, slsqlSnippets };
