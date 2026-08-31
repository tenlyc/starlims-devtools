import type { AgentFileChange } from '../types/agent';

export type AgentDiffFileSummary = AgentFileChange & {
  additions: number;
  deletions: number;
};

export type AgentDiffSummary = {
  files: AgentDiffFileSummary[];
  additions: number;
  deletions: number;
};

function cleanDiffPath(value: string): string {
  const trimmed = value.trim().replace(/^"|"$/g, '');
  if (trimmed === '/dev/null') return '';
  return trimmed.replace(/^[ab]\//, '');
}

function countDiffLines(diff: string): Pick<AgentDiffFileSummary, 'additions' | 'deletions'> {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

function normalizeKind(value: unknown): AgentFileChange['kind'] {
  const raw = typeof value === 'string' ? value : (value as { type?: unknown } | undefined)?.type;
  return raw === 'add' || raw === 'delete' || raw === 'move' ? raw : 'update';
}

export function normalizeStructuredFileChanges(value: unknown): AgentFileChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const change = candidate as { path?: unknown; diff?: unknown; kind?: unknown; oldPath?: unknown; origin?: unknown; uri?: unknown; language?: unknown };
    if (typeof change.path !== 'string' || typeof change.diff !== 'string') return [];
    const kindObject = change.kind && typeof change.kind === 'object' ? change.kind as { move_path?: unknown } : undefined;
    const oldPath = typeof change.oldPath === 'string'
      ? change.oldPath
      : typeof kindObject?.move_path === 'string' ? kindObject.move_path : undefined;
    return [{
      path: cleanDiffPath(change.path) || change.path,
      diff: change.diff,
      kind: normalizeKind(change.kind),
      ...(change.origin === 'remote' || change.origin === 'workspace' ? { origin: change.origin } : {}),
      ...(typeof change.uri === 'string' ? { uri: change.uri } : {}),
      ...(typeof change.language === 'string' ? { language: change.language } : {}),
      ...(oldPath ? { oldPath } : {})
    }];
  });
}

export function parseUnifiedDiff(diff: string): AgentFileChange[] {
  if (!diff.trim()) return [];
  const lines = diff.split(/\r?\n/);
  const starts: number[] = [];
  lines.forEach((line, index) => { if (line.startsWith('diff --git ')) starts.push(index); });

  if (starts.length === 0) {
    const oldLine = lines.find((line) => line.startsWith('--- '));
    const newLine = lines.find((line) => line.startsWith('+++ '));
    const oldPath = oldLine ? cleanDiffPath(oldLine.slice(4).split('\t')[0]) : '';
    const newPath = newLine ? cleanDiffPath(newLine.slice(4).split('\t')[0]) : oldPath;
    const path = newPath || oldPath;
    return path ? [{ path, oldPath: oldPath && oldPath !== path ? oldPath : undefined, kind: !oldPath ? 'add' : !newPath ? 'delete' : oldPath !== newPath ? 'move' : 'update', diff }] : [];
  }

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    const sectionLines = lines.slice(start, end);
    const headerMatch = sectionLines[0].match(/^diff --git (?:"?a\/(.+?)"?) (?:"?b\/(.+?)"?)$/);
    const oldLine = sectionLines.find((line) => line.startsWith('--- '));
    const newLine = sectionLines.find((line) => line.startsWith('+++ '));
    const oldPath = oldLine ? cleanDiffPath(oldLine.slice(4).split('\t')[0]) : cleanDiffPath(headerMatch?.[1] || '');
    const newPath = newLine ? cleanDiffPath(newLine.slice(4).split('\t')[0]) : cleanDiffPath(headerMatch?.[2] || '');
    const path = newPath || oldPath || `file-${index + 1}`;
    const kind: AgentFileChange['kind'] = !oldPath ? 'add' : !newPath ? 'delete' : oldPath !== newPath ? 'move' : 'update';
    return { path, oldPath: oldPath && oldPath !== path ? oldPath : undefined, kind, diff: sectionLines.join('\n') };
  });
}

export function summarizeAgentDiff(files: AgentFileChange[] | undefined, rawDiff?: string): AgentDiffSummary {
  let normalized = normalizeStructuredFileChanges(files);
  if (normalized.length === 0 && rawDiff) {
    try { normalized = normalizeStructuredFileChanges(JSON.parse(rawDiff)); } catch { normalized = parseUnifiedDiff(rawDiff); }
  }
  const summaries = normalized.map((file) => ({ ...file, ...countDiffLines(file.diff) }));
  return {
    files: summaries,
    additions: summaries.reduce((total, file) => total + file.additions, 0),
    deletions: summaries.reduce((total, file) => total + file.deletions, 0)
  };
}

export function diffLineTone(line: string): 'header' | 'hunk' | 'add' | 'delete' | 'context' {
  if (line.startsWith('diff --git ') || line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) return 'header';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'delete';
  return 'context';
}

export function createUnifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return '';
  const diffPath = path.replace(/^\/+/, '') || 'untitled';
  const oldLines = before.split(/\r?\n/);
  const newLines = after.split(/\r?\n/);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix++;
  const contextStart = Math.max(0, prefix - 3);
  const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + 3);
  const newEnd = Math.min(newLines.length, newLines.length - suffix + 3);
  const oldChunk = oldLines.slice(contextStart, oldEnd);
  const newChunk = newLines.slice(contextStart, newEnd);
  const sharedPrefix = prefix - contextStart;
  const oldChangedEnd = oldLines.length - suffix - contextStart;
  const newChangedEnd = newLines.length - suffix - contextStart;
  const body = [
    ...oldChunk.slice(0, sharedPrefix).map((line) => ` ${line}`),
    ...oldChunk.slice(sharedPrefix, oldChangedEnd).map((line) => `-${line}`),
    ...newChunk.slice(sharedPrefix, newChangedEnd).map((line) => `+${line}`),
    ...newChunk.slice(newChangedEnd).map((line) => ` ${line}`)
  ];
  return [
    `diff --git a/${diffPath} b/${diffPath}`,
    `--- a/${diffPath}`,
    `+++ b/${diffPath}`,
    `@@ -${contextStart + 1},${oldChunk.length} +${contextStart + 1},${newChunk.length} @@`,
    ...body
  ].join('\n');
}
