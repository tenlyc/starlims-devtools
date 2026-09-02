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

type LineOperation = { type: 'equal' | 'add' | 'delete'; line: string };

function patienceLineDiff(oldLines: string[], newLines: string[]): LineOperation[] {
  const operations: LineOperation[] = [];
  const visit = (oldStart: number, oldEnd: number, newStart: number, newEnd: number): void => {
    while (oldStart < oldEnd && newStart < newEnd && oldLines[oldStart] === newLines[newStart]) {
      operations.push({ type: 'equal', line: oldLines[oldStart] });
      oldStart++;
      newStart++;
    }
    let suffix = 0;
    while (oldStart + suffix < oldEnd && newStart + suffix < newEnd && oldLines[oldEnd - 1 - suffix] === newLines[newEnd - 1 - suffix]) suffix++;
    const oldBodyEnd = oldEnd - suffix;
    const newBodyEnd = newEnd - suffix;

    if (oldStart === oldBodyEnd) {
      for (let index = newStart; index < newBodyEnd; index++) operations.push({ type: 'add', line: newLines[index] });
    } else if (newStart === newBodyEnd) {
      for (let index = oldStart; index < oldBodyEnd; index++) operations.push({ type: 'delete', line: oldLines[index] });
    } else {
      const oldOccurrences = new Map<string, { count: number; index: number }>();
      const newOccurrences = new Map<string, { count: number; index: number }>();
      for (let index = oldStart; index < oldBodyEnd; index++) {
        const current = oldOccurrences.get(oldLines[index]);
        oldOccurrences.set(oldLines[index], { count: (current?.count || 0) + 1, index });
      }
      for (let index = newStart; index < newBodyEnd; index++) {
        const current = newOccurrences.get(newLines[index]);
        newOccurrences.set(newLines[index], { count: (current?.count || 0) + 1, index });
      }
      const candidates = [...oldOccurrences.entries()].flatMap(([line, old]) => {
        const next = newOccurrences.get(line);
        return old.count === 1 && next?.count === 1 ? [{ oldIndex: old.index, newIndex: next.index }] : [];
      }).sort((left, right) => left.oldIndex - right.oldIndex);

      const tails: number[] = [];
      const previous = new Int32Array(candidates.length).fill(-1);
      for (let index = 0; index < candidates.length; index++) {
        let low = 0;
        let high = tails.length;
        while (low < high) {
          const middle = (low + high) >> 1;
          if (candidates[tails[middle]].newIndex < candidates[index].newIndex) low = middle + 1;
          else high = middle;
        }
        if (low > 0) previous[index] = tails[low - 1];
        tails[low] = index;
      }
      const anchors: typeof candidates = [];
      for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]) anchors.push(candidates[index]);
      anchors.reverse();

      if (!anchors.length) {
        for (let index = oldStart; index < oldBodyEnd; index++) operations.push({ type: 'delete', line: oldLines[index] });
        for (let index = newStart; index < newBodyEnd; index++) operations.push({ type: 'add', line: newLines[index] });
      } else {
        let previousOld = oldStart;
        let previousNew = newStart;
        for (const anchor of anchors) {
          visit(previousOld, anchor.oldIndex, previousNew, anchor.newIndex);
          operations.push({ type: 'equal', line: oldLines[anchor.oldIndex] });
          previousOld = anchor.oldIndex + 1;
          previousNew = anchor.newIndex + 1;
        }
        visit(previousOld, oldBodyEnd, previousNew, newBodyEnd);
      }
    }
    for (let index = suffix; index > 0; index--) operations.push({ type: 'equal', line: oldLines[oldEnd - index] });
  };
  visit(0, oldLines.length, 0, newLines.length);
  return operations;
}

export function createUnifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return '';
  const diffPath = path.replace(/^\/+/, '') || 'untitled';
  const operations = patienceLineDiff(before.split(/\r?\n/), after.split(/\r?\n/));
  const changed = operations.flatMap((operation, index) => operation.type === 'equal' ? [] : [index]);
  if (!changed.length) return '';
  const groups: Array<{ first: number; last: number }> = [];
  for (const index of changed) {
    const previous = groups.at(-1);
    if (previous && index - previous.last <= 6) previous.last = index;
    else groups.push({ first: index, last: index });
  }
  const oldPositions: number[] = [];
  const newPositions: number[] = [];
  let oldLine = 1;
  let newLine = 1;
  for (let index = 0; index < operations.length; index++) {
    oldPositions[index] = oldLine;
    newPositions[index] = newLine;
    if (operations[index].type !== 'add') oldLine++;
    if (operations[index].type !== 'delete') newLine++;
  }
  const hunks = groups.flatMap(({ first, last }) => {
    const start = Math.max(0, first - 3);
    const end = Math.min(operations.length, last + 4);
    const slice = operations.slice(start, end);
    const oldCount = slice.filter((operation) => operation.type !== 'add').length;
    const newCount = slice.filter((operation) => operation.type !== 'delete').length;
    return [
      `@@ -${oldPositions[start]},${oldCount} +${newPositions[start]},${newCount} @@`,
      ...slice.map((operation) => `${operation.type === 'add' ? '+' : operation.type === 'delete' ? '-' : ' '}${operation.line}`)
    ];
  });
  return [`diff --git a/${diffPath} b/${diffPath}`, `--- a/${diffPath}`, `+++ b/${diffPath}`, ...hunks].join('\n');
}
