export type ServerLogLevel = 'info' | 'warning' | 'error' | 'success';

export interface ServerLogEntry {
  id: string;
  timestamp: Date;
  level: ServerLogLevel;
  message: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function classifyServerLogEntry(message: string): ServerLogLevel {
  const normalized = message.toLowerCase();
  if (/\berror\b|exception|run-time error|server error|failed|failure/.test(normalized)) return 'error';
  if (/\bwarning\b|\bwarn\b/.test(normalized)) return 'warning';
  if (/\bsuccess\b|successful/.test(normalized)) return 'success';
  return 'info';
}

export function hasServerLogContent(content: string): boolean {
  const normalized = content.trim();
  if (!normalized) return false;
  return !/^there is no log file\b/i.test(normalized);
}

export function parseServerLog(content: string, user: string): ServerLogEntry[] {
  if (!hasServerLogContent(content)) return [];
  const userPattern = user.trim() ? escapeRegex(user.trim()) : '[^\\s/]+';
  const entryPattern = new RegExp(`${userPattern}\\s+\\/\\s+\\d{8}\\s+\\/\\s+\\d{2}:\\d{2}:\\d{2}`, 'gi');
  const matches = [...content.matchAll(entryPattern)];

  if (matches.length === 0) {
    return [{ id: 'server-log-0', timestamp: new Date(), level: classifyServerLogEntry(content), message: content.trim() }];
  }

  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index || content.length) : content.length;
    const message = content.slice(start, end).trim();
    const timestampMatch = message.match(/(\d{4})(\d{2})(\d{2})\s+\/\s+(\d{2}):(\d{2}):(\d{2})/);
    const timestamp = timestampMatch
      ? new Date(Number(timestampMatch[1]), Number(timestampMatch[2]) - 1, Number(timestampMatch[3]), Number(timestampMatch[4]), Number(timestampMatch[5]), Number(timestampMatch[6]))
      : new Date();
    return { entry: { id: `server-log-${index}-${start}`, timestamp, level: classifyServerLogEntry(message), message }, start };
  }).sort((left, right) => right.entry.timestamp.getTime() - left.entry.timestamp.getTime() || right.start - left.start)
    .map(({ entry }) => entry);
}
