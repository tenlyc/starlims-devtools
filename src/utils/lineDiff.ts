/**
 * Minimal line-based diff used by the Version History compare view.
 * Returns a unified sequence of lines tagged as same / added / removed.
 * Good enough for side-by-side code comparison without external deps.
 */

export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** Strip a shared prefix and suffix, then diff the remaining middle part. */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Shared prefix
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix++;
  }

  // Shared suffix
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const result: DiffLine[] = [];
  for (let i = 0; i < prefix; i++) {
    result.push({ type: 'same', text: oldLines[i] });
  }

  const oldMid = oldLines.slice(prefix, oldLines.length - suffix);
  const newMid = newLines.slice(prefix, newLines.length - suffix);
  const middle = diffMiddle(oldMid, newMid);
  result.push(...middle);

  for (let i = oldLines.length - suffix; i < oldLines.length; i++) {
    result.push({ type: 'same', text: oldLines[i] });
  }
  return result;
}

/** Diff the middle sections with a bounded LCS dynamic program. */
function diffMiddle(oldMid: string[], newMid: string[]): DiffLine[] {
  // For very large inputs fall back to a coarse "changed block" rendering.
  if (oldMid.length > 400 || newMid.length > 400) {
    const result: DiffLine[] = [];
    for (const line of oldMid) result.push({ type: 'del', text: line });
    for (const line of newMid) result.push({ type: 'add', text: line });
    return result;
  }

  const n = oldMid.length;
  const m = newMid.length;

  // LCS table (lcs[i][j] = LCS length of oldMid[i..] and newMid[j..])
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldMid[i] === newMid[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldMid[i] === newMid[j]) {
      result.push({ type: 'same', text: oldMid[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: 'del', text: oldMid[i] });
      i++;
    } else {
      result.push({ type: 'add', text: newMid[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: 'del', text: oldMid[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: 'add', text: newMid[j] });
    j++;
  }
  return result;
}
