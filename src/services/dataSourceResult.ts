import type { QueryResult } from './iEnterpriseService';

type QueryCell = string | number | null;

function normalizeCell(value: unknown): QueryCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizedColumnName(value: unknown, index: number): string {
  const name = String(value ?? '').trim();
  return name || `Column ${index + 1}`;
}

/** Convert SCM_API.RunScript's DataSource payload into the output table shape. */
export function normalizeDataSourceOutput(output: unknown): QueryResult {
  let value = output;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        // Keep non-JSON text as an empty tabular result; callers may show it.
      }
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as { columns?: unknown; rows?: unknown };
    if (Array.isArray(candidate.columns) && Array.isArray(candidate.rows)) {
      const columns = candidate.columns.map(normalizedColumnName);
      const rows = candidate.rows.map((row) => normalizeRow(row, columns));
      return { success: true, columns, rows, rowCount: rows.length };
    }
  }

  if (!Array.isArray(value) || value.length === 0) {
    return { success: true, columns: [], rows: [], rowCount: 0 };
  }

  const first = value[0];
  if (Array.isArray(first)) {
    const columns = first.map(normalizedColumnName);
    const rows = value.slice(1).map((row) => normalizeRow(row, columns));
    return { success: true, columns, rows, rowCount: rows.length };
  }

  if (first && typeof first === 'object') {
    const columns = Object.keys(first as Record<string, unknown>);
    const rows = value.map((row) => normalizeRow(row, columns));
    return { success: true, columns, rows, rowCount: rows.length };
  }

  return { success: true, columns: ['Value'], rows: value.map((cell) => ({ Value: normalizeCell(cell) })), rowCount: value.length };
}

function normalizeRow(row: unknown, columns: string[]): Record<string, QueryCell> {
  if (Array.isArray(row)) {
    return Object.fromEntries(columns.map((column, index) => [column, normalizeCell(row[index])]));
  }
  if (row && typeof row === 'object') {
    const record = row as Record<string, unknown>;
    return Object.fromEntries(columns.map((column) => [column, normalizeCell(record[column])]));
  }
  return Object.fromEntries(columns.map((column, index) => [column, index === 0 ? normalizeCell(row) : null]));
}
