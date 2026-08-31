export const MCP_EFFICIENCY_INSTRUCTIONS = [
  'Use the smallest sufficient STARLIMS tool sequence and stop as soon as the request has enough evidence.',
  'Reuse scripts already attached to the prompt and files already present in the Agent workspace; do not rediscover or reread them unless current remote state is required.',
  'When an exact STARLIMS URI is known, call the matching read tool directly. Use search_by_name once for a name, browse_tree only for path navigation, global_code_search only for code-content discovery, and get_table_definition only when table fields are actually needed.',
  'Do not call get_capabilities unless the user asks about available MCP capabilities or a required tool appears unavailable.',
  'Do not repeat an identical read call in the same turn. Keep maxItems/maxCharacters narrow, broaden only when the first targeted query is insufficient, and avoid speculative table or log lookups.'
].join(' ');

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stableValue(item)]));
}

export function mcpReadCacheKey(tool: string, arguments_: Record<string, unknown>): string {
  return JSON.stringify([tool, stableValue(arguments_)]);
}
