/** Preserve STARLIMS Designer-style #include directives verbatim after the
 * upstream formatter canonicalizes them as hash-prefixed SSL statements. */
export function preserveDesignerIncludes(original: string, formatted: string): string {
  const originalIncludes = original.split(/\r?\n/).filter((line) => /^\s*#\s*include\b/i.test(line));
  if (originalIncludes.length === 0) return formatted;
  let index = 0;
  return formatted.split('\n').map((line) => {
    if (!/^\s*#\s*include\b/i.test(line) || index >= originalIncludes.length) return line;
    return originalIncludes[index++];
  }).join('\n');
}
