import { editorStore } from '../stores/editorStore';
import { useDiagnosticStore, type DiagnosticLevel } from './diagnosticStore';
import { useOutputLogStore, type LogChannel, type LogEntry } from './outputLogStore';

const clampLimit = (value: unknown, fallback: number, maximum = 200): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value))) : fallback;

export type AgentDiagnosticQuery = {
  uri?: string;
  scope?: 'current' | 'open' | 'all';
  levels?: DiagnosticLevel[];
  maxItems?: number;
};

export function agentDiagnostics(query: AgentDiagnosticQuery = {}) {
  const diagnosticsByUri = useDiagnosticStore.getState().diagnosticsByUri;
  const editor = editorStore.getState();
  const activeUri = query.uri || editor.activeFileUri || '';
  const openUris = new Set(editor.openFiles.map((file) => file.uri));
  const levels = query.levels?.length ? new Set(query.levels) : undefined;
  const scope = query.uri ? 'current' : (query.scope || 'current');
  const candidates = Object.entries(diagnosticsByUri).flatMap(([uri, diagnostics]) => diagnostics.map((diagnostic) => ({ ...diagnostic, uri })));
  const items = candidates.filter((diagnostic) => {
    if (levels && !levels.has(diagnostic.level)) return false;
    if (scope === 'current') return diagnostic.uri === activeUri;
    if (scope === 'open') return openUris.has(diagnostic.uri);
    return true;
  }).sort((left, right) => {
    const priority = { error: 0, warning: 1, info: 2 } as const;
    return priority[left.level] - priority[right.level] || left.uri.localeCompare(right.uri) || left.line - right.line || left.column - right.column;
  });
  const maxItems = clampLimit(query.maxItems, 80);
  return {
    scope,
    activeUri: editor.activeFileUri || undefined,
    totalItems: items.length,
    truncated: items.length > maxItems,
    items: items.slice(0, maxItems).map(({ id: _id, endLine: _endLine, endColumn: _endColumn, ...diagnostic }) => diagnostic)
  };
}

export type AgentOutputQuery = {
  channel?: LogChannel;
  levels?: LogEntry['level'][];
  maxItems?: number;
};

export function agentOutputLogs(query: AgentOutputQuery = {}) {
  const levels = query.levels?.length ? new Set(query.levels) : undefined;
  const matching = useOutputLogStore.getState().entries.filter((entry) =>
    (!query.channel || entry.channel === query.channel) && (!levels || levels.has(entry.level))
  ).reverse();
  const maxItems = clampLimit(query.maxItems, 50);
  return {
    totalItems: matching.length,
    truncated: matching.length > maxItems,
    newestFirst: true,
    items: matching.slice(0, maxItems).map((entry) => ({
      timestamp: entry.timestamp.toISOString(),
      channel: entry.channel,
      level: entry.level,
      source: entry.source,
      message: entry.message.slice(0, 4_000),
      ...(entry.queryResult ? {
        queryResult: {
          columns: entry.queryResult.columns,
          rowCount: entry.queryResult.rowCount,
          rows: entry.queryResult.rows.slice(0, 20)
        }
      } : {})
    }))
  };
}
