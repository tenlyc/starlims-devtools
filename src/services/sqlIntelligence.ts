export const SQL_COMPLETION_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'ON', 'AND', 'OR', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION', 'DISTINCT',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'AS', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'CAST', 'CONVERT'
] as const;

const RESERVED_ALIAS_WORDS = new Set([
  'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'ON', 'GROUP',
  'ORDER', 'HAVING', 'UNION', 'LIMIT', 'OFFSET', 'SET', 'VALUES'
]);

export function sqlTableAliases(sql: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const pattern = /\b(?:FROM|JOIN|UPDATE|INTO)\s+([A-Za-z_][\w$#]*)(?:\s+(?:AS\s+)?([A-Za-z_][\w$#]*))?/gi;
  for (const match of sql.matchAll(pattern)) {
    const table = match[1];
    const candidate = match[2];
    aliases.set(table.toUpperCase(), table);
    if (candidate && !RESERVED_ALIAS_WORDS.has(candidate.toUpperCase())) aliases.set(candidate.toUpperCase(), table);
  }
  return aliases;
}

export function sqlCompletionContext(sqlBeforeCursor: string, fullSql = sqlBeforeCursor): { kind: 'table' | 'column' | 'general'; prefix: string; table?: string } {
  const aliases = sqlTableAliases(fullSql);
  const qualified = sqlBeforeCursor.match(/([A-Za-z_][\w$#]*)\.([A-Za-z0-9_$#]*)$/);
  if (qualified) return { kind: 'column', prefix: qualified[2], table: aliases.get(qualified[1].toUpperCase()) || qualified[1] };

  const word = sqlBeforeCursor.match(/([A-Za-z0-9_$#]*)$/)?.[1] || '';
  if (/\b(?:FROM|JOIN|UPDATE|INTO)\s+[A-Za-z0-9_$#]*$/i.test(sqlBeforeCursor)) {
    return { kind: 'table', prefix: word };
  }
  if (aliases.size === 1) return { kind: 'column', prefix: word, table: [...aliases.values()][0] };
  return { kind: 'general', prefix: word };
}

export function tableDefinitionFields(definition: unknown): Array<{ name: string; detail?: string }> {
  const record = definition && typeof definition === 'object' && !Array.isArray(definition)
    ? definition as Record<string, unknown>
    : undefined;
  const payload = definition && typeof definition === 'object' && !Array.isArray(definition)
    ? (record?.items || record?.rows || record?.data || definition)
    : definition;
  if (!Array.isArray(payload)) return [];
  const fields = payload.map((row: unknown) => {
    if (Array.isArray(row)) return { name: String(row[0] || '').trim(), detail: [row[2], row[3], row[6]].filter(Boolean).join(' · ') };
    const field = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      name: String(field.FIELD_NAME || field.fieldName || field.name || '').trim(),
      detail: [field.DATA_TYPE || field.dataType, field.FIELD_SIZE || field.fieldSize, field.NOTES || field.notes].filter(Boolean).join(' · ')
    };
  }).filter((field) => field.name);
  return [...new Map(fields.map((field) => [field.name.toUpperCase(), field])).values()];
}
