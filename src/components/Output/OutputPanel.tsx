import { useState, useEffect, useRef } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { useOutputLogStore, QueryResult, DiffEntry } from '../../services/outputLogStore';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success' | 'script';
  message: string;
  source?: string;
}

// Parse STARLIMS log content into entries
function parseLogContent(content: string): LogEntry[] {
  if (!content.trim()) return [];

  const entries: LogEntry[] = [];

  // Split by log entries (each starts with pattern "LIYC / YYYYMMDD / HH:MM:SS")
  // The pattern indicates start of a new log entry
  const logPattern = /LIYC\s+\/\s+\d{8}\s+\/\s+\d{2}:\d{2}:\d{2}/g;
  const lines = content.split('\n');

  let currentEntry = '';
  let lastIndex = 0;
  let match;

  // Find all log entry starts
  const matches: { start: number; end: number; text: string }[] = [];
  logPattern.lastIndex = 0;
  while ((match = logPattern.exec(content)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    });
  }

  // Extract each log entry as a whole
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const start = current.start;
    const end = i < matches.length - 1 ? matches[i + 1].start : content.length;

    const entryText = content.substring(start, end).trim();
    if (!entryText) continue;

    // Determine log level based on content
    let level: LogEntry['level'] = 'info';
    if (entryText.includes('Error') || entryText.includes('Exception')) {
      level = 'error';
    } else if (entryText.includes('Warning') || entryText.includes('warn')) {
      level = 'warning';
    } else if (entryText.includes('Success')) {
      level = 'success';
    }

    // Try to parse timestamp
    let timestamp = new Date();
    const dateMatch = entryText.match(/(\d{8}) \/ (\d{2}):(\d{2}):(\d{2})/);
    if (dateMatch) {
      const dateStr = dateMatch[1]; // YYYYMMDD
      const timeStr = `${dateMatch[2]}:${dateMatch[3]}:${dateMatch[4]}`;
      const fullDateStr = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)} ${timeStr}`;
      timestamp = new Date(fullDateStr);
    }

    entries.push({
      id: `${Date.now()}-${i}`,
      timestamp,
      level,
      message: entryText,
      source: 'ServerLog'
    });
  }

  // Fallback: if no matches, treat the whole content as one entry
  if (entries.length === 0 && content.trim()) {
    entries.push({
      id: `${Date.now()}`,
      timestamp: new Date(),
      level: 'info',
      message: content.trim(),
      source: 'ServerLog'
    });
  }

  return entries;
}

// Highlight different parts of STARLIMS log header
function highlightLogHeader(header: string): JSX.Element {
  if (!header) return <></>;

  // STARLIMS log format:
  // "LIYC / 20260412 / 00:00:30 / 12.6.2 / ServerScript.SCM_API.GetItemByGUID.main_ñ() line: 230 / w3wp(18156/16/75) on WIN-0J09JD85BPK / ****User message****"
  // Parts: application / date / time / version / script_info / process_info / message_type

  const parts = header.split(' / ');
  return (
    <>
      {parts.map((part, idx) => {
        // Application name
        if (idx === 0) return <span key={idx} className="text-purple-400 font-medium">{part}</span>;
        // Date
        if (idx === 1) return <span key={idx} className="text-yellow-300">{part}</span>;
        // Time
        if (idx === 2) return <span key={idx} className="text-cyan-300">{part}</span>;
        // Version
        if (idx === 3) return <span key={idx} className="text-slate-400">{part}</span>;
        // Script info (contains .sql or .main or function name)
        if (part.includes('.sql') || part.includes('.main') || part.includes('()') || part.includes('line:')) {
          return <span key={idx} className="text-blue-300">{part}</span>;
        }
        // Process info (w3wp, PID)
        if (part.includes('w3wp') || part.match(/^\d+\/\d+\/\d+$/)) {
          return <span key={idx} className="text-orange-300">{part}</span>;
        }
        // Computer name
        if (part.startsWith('on ') || part.match(/^WIN-|^LINUX-/i)) {
          return <span key={idx} className="text-slate-400">{part}</span>;
        }
        // Message type indicators
        if (part.includes('Error') || part.includes('Exception')) {
          return <span key={idx} className="text-red-400 font-bold">{part}</span>;
        }
        if (part.includes('User message')) {
          return <span key={idx} className="text-green-400 italic">{part}</span>;
        }
        return <span key={idx} className="text-slate-300">{part}</span>;
      }).reduce((acc: JSX.Element[], el, idx, arr) => {
        acc.push(el);
        if (idx < arr.length - 1) acc.push(<span key={`sep-${idx}`}> / </span>);
        return acc;
      }, [])}
    </>
  );
}

// SQL syntax highlighting function - simplified version
function highlightSQL(sql: string): JSX.Element {
  if (!sql.trim()) return <>{sql}</>;

  // SQL keywords to highlight
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
    'IS', 'NULL', 'AS', 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL',
    'CROSS', 'UNION', 'ALL', 'DISTINCT', 'TOP', 'ORDER', 'BY', 'ASC', 'DESC',
    'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO', 'VALUES', 'UPDATE',
    'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'VIEW', 'INDEX',
    'PRIMARY', 'FOREIGN', 'KEY', 'REFERENCES', 'UNIQUE', 'CHECK', 'EXISTS',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'CONVERT', 'COALESCE', 'NULLIF',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'GETDATE', 'DATEADD', 'DATEDIFF',
    'REPLACE', 'SUBSTRING', 'LEN', 'LTRIM', 'RTRIM', 'UPPER', 'LOWER',
    'JOIN', 'OUTER', 'APPLY', 'EXEC', 'EXECUTE', 'DECLARE', 'BEGIN', 'END',
    'TRANSACTION', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'OUTPUT', 'WITH'
  ];

  const parts: { text: string; type: string }[] = [];
  let remaining = sql;

  // Process the string character by character
  while (remaining.length > 0) {
    // Check for single-line comment
    if (remaining.startsWith('--')) {
      const endIdx = remaining.indexOf('\n');
      if (endIdx === -1) {
        parts.push({ text: remaining, type: 'comment' });
        remaining = '';
      } else {
        parts.push({ text: remaining.slice(0, endIdx + 1), type: 'comment' });
        remaining = remaining.slice(endIdx + 1);
      }
      continue;
    }

    // Check for string literal
    if (remaining.startsWith("'")) {
      let endIdx = 1;
      while (endIdx < remaining.length) {
        if (remaining[endIdx] === "'" && remaining[endIdx + 1] === "'") {
          endIdx += 2; // escaped quote
        } else if (remaining[endIdx] === "'") {
          endIdx++;
          break;
        } else {
          endIdx++;
        }
      }
      parts.push({ text: remaining.slice(0, endIdx), type: 'string' });
      remaining = remaining.slice(endIdx);
      continue;
    }

    // Check for number
    const numMatch = remaining.match(/^\d+(\.\d+)?/);
    if (numMatch) {
      parts.push({ text: numMatch[0], type: 'number' });
      remaining = remaining.slice(numMatch[0].length);
      continue;
    }

    // Check for keyword
    let foundKeyword = false;
    for (const kw of keywords) {
      const regex = new RegExp(`^${kw}\\b`, 'i');
      const match = remaining.match(regex);
      if (match) {
        parts.push({ text: match[0].toUpperCase(), type: 'keyword' });
        remaining = remaining.slice(match[0].length);
        foundKeyword = true;
        break;
      }
    }
    if (foundKeyword) continue;

    // Check for identifier (table names like a., s., t.)
    const idMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (idMatch) {
      parts.push({ text: idMatch[0], type: 'identifier' });
      remaining = remaining.slice(idMatch[0].length);
      continue;
    }

    // Default: single character
    parts.push({ text: remaining[0], type: 'text' });
    remaining = remaining.slice(1);
  }

  // Render with colors
  return (
    <>
      {parts.map((part, idx) => {
        switch (part.type) {
          case 'keyword':
            return <span key={idx} className="text-blue-400 font-medium">{part.text}</span>;
          case 'string':
            return <span key={idx} className="text-orange-400">{part.text}</span>;
          case 'number':
            return <span key={idx} className="text-green-400">{part.text}</span>;
          case 'comment':
            return <span key={idx} className="text-slate-500 italic">{part.text}</span>;
          case 'identifier':
            return <span key={idx} className="text-cyan-300">{part.text}</span>;
          default:
            return <span key={idx} className="text-slate-300">{part.text}</span>;
        }
      })}
    </>
  );
}

// Parse STARLIMS log line to extract header and SQL
function parseLogLine(message: string): { header: string; sql: string } | null {
  // STARLIMS log format: "header / ****User message****\nSQL" or "header /\nSQL"
  // Split by newlines (\n or \r\n)
  const parts = message.split(/\r?\n/);
  if (parts.length > 1) {
    // Multiple lines - first part is header, rest is SQL/content
    return {
      header: parts[0],
      sql: parts.slice(1).join('\n').trim()
    };
  }

  // Single line - try to split at the last " / " before SQL
  // Pattern: header ends with something like "on WIN-xxx /" then SQL starts
  const lastSlashMatch = message.match(/^(.+\/\s*)(.+)$/);
  if (lastSlashMatch && lastSlashMatch[2].length > 10) {
    // Looks like there's content after the last slash - likely SQL or message
    return {
      header: lastSlashMatch[1].trim(),
      sql: lastSlashMatch[2].trim()
    };
  }

  return null;
}

// SQL Result Table Component
function SQLResultTable({ result, maxRows = 100 }: { result: QueryResult; maxRows?: number }) {
  if (!result.columns.length || !result.rows.length) {
    return (
      <div className="text-slate-500 dark:text-slate-400 text-xs italic">No results</div>
    );
  }

  const displayRows = result.rows.slice(0, maxRows);
  const hasMore = result.rows.length > maxRows;

  return (
    <div className="mt-2 border border-slate-300 dark:border-slate-600 rounded overflow-hidden">
      <div className="bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-600 dark:text-slate-400">
        {result.rowCount} row{result.rowCount !== 1 ? 's' : ''} returned
        {hasMore && ` (showing first ${maxRows})`}
      </div>
      <div className="overflow-auto max-h-64">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-200 dark:bg-slate-700 sticky top-0">
            <tr>
              {result.columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-2 py-1 text-left text-slate-700 dark:text-slate-300 font-medium border-b border-slate-300 dark:border-slate-600 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={`hover:bg-slate-100 dark:hover:bg-slate-700/50 ${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800/50'}`}
              >
                {result.columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-2 py-1 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700/30 whitespace-nowrap"
                  >
                    {row[col] === null ? (
                      <span className="text-slate-400 dark:text-slate-500 italic">NULL</span>
                    ) : typeof row[col] === 'number' ? (
                      <span className="text-green-600 dark:text-green-400">{row[col]}</span>
                    ) : (
                      String(row[col])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Diff Viewer Component
function DiffViewer({ diff }: { diff: DiffEntry }) {
  const [showSideBySide, setShowSideBySide] = useState(true);

  // Simple line-by-line diff algorithm
  const computeDiff = () => {
    const remoteLines = diff.remoteContent.split('\n');
    const localLines = diff.localContent.split('\n');
    const result: { type: 'same' | 'remote' | 'local' | 'changed'; remoteLine?: string; localLine?: string; lineNum: number }[] = [];

    // Simple approach: compare line by line
    const maxLines = Math.max(remoteLines.length, localLines.length);
    for (let i = 0; i < maxLines; i++) {
      const remoteLine = remoteLines[i];
      const localLine = localLines[i];

      if (remoteLine === localLine) {
        result.push({ type: 'same', remoteLine, localLine, lineNum: i + 1 });
      } else if (remoteLine === undefined) {
        result.push({ type: 'local', localLine, lineNum: i + 1 });
      } else if (localLine === undefined) {
        result.push({ type: 'remote', remoteLine, lineNum: i + 1 });
      } else {
        result.push({ type: 'changed', remoteLine, localLine, lineNum: i + 1 });
      }
    }

    return result;
  };

  const diffLines = computeDiff();
  const addedCount = diffLines.filter(l => l.type === 'local' || l.type === 'changed').length;
  const removedCount = diffLines.filter(l => l.type === 'remote' || l.type === 'changed').length;

  return (
    <div className="mt-2 border border-slate-300 dark:border-slate-600 rounded overflow-hidden">
      {/* Header */}
      <div className="bg-slate-100 dark:bg-slate-800 px-2 py-1 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-600 dark:text-slate-400">Comparing: {diff.fileName}</span>
          <span className="text-red-600 dark:text-red-400">-{removedCount}</span>
          <span className="text-green-600 dark:text-green-400">+{addedCount}</span>
        </div>
        <div className="flex gap-1">
          <button
            className={`px-2 py-0.5 text-xs rounded ${showSideBySide ? 'bg-slate-600 dark:bg-slate-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
            onClick={() => setShowSideBySide(true)}
          >
            Side by Side
          </button>
          <button
            className={`px-2 py-0.5 text-xs rounded ${!showSideBySide ? 'bg-slate-600 dark:bg-slate-500 text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
            onClick={() => setShowSideBySide(false)}
          >
            Inline
          </button>
        </div>
      </div>

      {/* Diff Content */}
      <div className="overflow-auto max-h-80 text-xs font-mono">
        {showSideBySide ? (
          <div className="grid grid-cols-2 divide-x divide-slate-700">
            {/* Remote (server) version */}
            <div className="overflow-x-auto">
              <div className="bg-red-900/20 px-2 py-1 text-red-400 font-medium sticky top-0">
                Remote (Server)
              </div>
              {diffLines.map((line, idx) => (
                <div
                  key={idx}
                  className={`px-2 py-0.5 flex ${
                    line.type === 'remote' || line.type === 'changed' ? 'bg-red-900/30' : ''
                  }`}
                >
                  <span className="text-slate-500 w-8 text-right mr-2 select-none">{line.lineNum}</span>
                  <span className={line.type === 'remote' || line.type === 'changed' ? 'text-red-300' : 'text-slate-400'}>
                    {line.type === 'local' ? '' : (line.remoteLine || '')}
                  </span>
                </div>
              ))}
            </div>
            {/* Local version */}
            <div className="overflow-x-auto">
              <div className="bg-green-900/20 px-2 py-1 text-green-400 font-medium sticky top-0">
                Local
              </div>
              {diffLines.map((line, idx) => (
                <div
                  key={idx}
                  className={`px-2 py-0.5 flex ${
                    line.type === 'local' || line.type === 'changed' ? 'bg-green-900/30' : ''
                  }`}
                >
                  <span className="text-slate-500 w-8 text-right mr-2 select-none">{line.lineNum}</span>
                  <span className={line.type === 'local' || line.type === 'changed' ? 'text-green-300' : 'text-slate-400'}>
                    {line.type === 'remote' ? '' : (line.localLine || '')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-2 py-1">
            {diffLines.map((line, idx) => {
              if (line.type === 'same') {
                return (
                  <div key={idx} className="text-slate-400">
                    <span className="text-slate-600 mr-2">{line.lineNum}</span>
                    {line.localLine}
                  </div>
                );
              } else if (line.type === 'remote') {
                return (
                  <div key={idx} className="text-red-300 bg-red-900/30">
                    <span className="text-slate-600 mr-2">{line.lineNum}</span>
                    <span className="text-red-400">- </span>{line.remoteLine}
                  </div>
                );
              } else if (line.type === 'local') {
                return (
                  <div key={idx} className="text-green-300 bg-green-900/30">
                    <span className="text-slate-600 mr-2">{line.lineNum}</span>
                    <span className="text-green-400">+ </span>{line.localLine}
                  </div>
                );
              } else {
                return (
                  <div key={idx}>
                    <div className="text-red-300 bg-red-900/30">
                      <span className="text-slate-600 mr-2">{line.lineNum}</span>
                      <span className="text-red-400">- </span>{line.remoteLine}
                    </div>
                    <div className="text-green-300 bg-green-900/30">
                      <span className="text-slate-600 mr-2">{line.lineNum}</span>
                      <span className="text-green-400">+ </span>{line.localLine}
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function OutputPanel() {
  // Use global store for entries
  const entries = useOutputLogStore((state) => state.entries);
  const setEntries = useOutputLogStore((state) => state.setEntries);
  const clearEntries = useOutputLogStore((state) => state.clearEntries);
  const [filter, setFilter] = useState<'all' | 'info' | 'warning' | 'error' | 'script'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  // Add a log entry (to be used when connecting to STARLIMS services)
  const _addEntry = (level: LogEntry['level'], message: string, source?: string) => {
    useOutputLogStore.getState().addEntry({ level, message, source });
  };

  // Load server log
  const loadServerLog = async () => {
    try {
      const enterpriseService = getEnterpriseService();
      const logContent = await enterpriseService.getServerLog();
      if (logContent) {
        const parsedEntries = parseLogContent(logContent);
        setEntries(parsedEntries);
        console.log('Loaded server log entries:', parsedEntries.length);
      } else {
        console.log('No server log content');
      }
    } catch (err) {
      console.error('Failed to load server log:', err);
    }
  };

  // Filter entries
  const filteredEntries = filter === 'all'
    ? entries
    : entries.filter(e => e.level === filter);

  // Get color for log level
  const getLevelColor = (level: LogEntry['level']): string => {
    switch (level) {
      case 'info': return 'text-blue-400';
      case 'warning': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      case 'success': return 'text-green-400';
      default: return 'text-slate-400';
    }
  };

  // Get icon for log level
  const getLevelIcon = (level: LogEntry['level']): string => {
    switch (level) {
      case 'info': return 'ℹ️';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'success': return '✓';
      default: return '•';
    }
  };

  // Format timestamp - YYYY/MM/DD HH:MM:SS AM/PM
  const formatTime = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const timeStr = date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return `${year}/${month}/${day} ${timeStr}`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Output</span>

          {/* Filter buttons */}
          <div className="flex gap-1">
            {(['all', 'info', 'warning', 'error'] as const).map(level => (
              <button
                key={level}
                className={`px-2 py-0.5 text-xs rounded ${
                  filter === level
                    ? 'bg-slate-600 dark:bg-slate-500 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
                onClick={() => setFilter(level)}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Load Server Log button */}
          <button
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded"
            onClick={loadServerLog}
            title="Load Server Log"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          {/* Auto-scroll toggle */}
          <button
            className={`p-1 rounded ${autoScroll ? 'text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          {/* Clear button */}
          <button
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded"
            onClick={clearEntries}
            title="Clear output"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-2 font-mono text-xs"
        onScroll={handleScroll}
      >
        {filteredEntries.length === 0 ? (
          <div className="text-center text-slate-500 py-4">
            No output yet
          </div>
        ) : (
          filteredEntries.map(entry => {
            const parsed = parseLogLine(entry.message);
            return (
              <div
                key={entry.id}
                className={`flex flex-col gap-1 py-1 hover:bg-slate-750 rounded px-1 ${
                  getLevelColor(entry.level)
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-slate-500 shrink-0">
                    [{formatTime(entry.timestamp)}]
                  </span>
                  <span className="shrink-0">{getLevelIcon(entry.level)}</span>
                  {entry.source && (
                    <span className="text-blue-400 shrink-0">[{entry.source}]</span>
                  )}
                  <pre className="flex-1 whitespace-pre-wrap break-all font-mono text-xs">
                    {parsed ? highlightLogHeader(parsed.header) : entry.message}
                  </pre>
                </div>
                {parsed && parsed.sql && (
                  <pre className="ml-8 text-slate-300 whitespace-pre-wrap break-all">
                    {highlightSQL(parsed.sql)}
                  </pre>
                )}
                {entry.queryResult && (
                  <SQLResultTable result={entry.queryResult} />
                )}
                {entry.diff && (
                  <DiffViewer diff={entry.diff} />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
