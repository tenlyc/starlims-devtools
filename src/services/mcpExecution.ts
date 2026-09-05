import type { ExecutionOptions, ScriptResult } from './iEnterpriseService';

/** Validate before execution, including Generic Agent calls that bypass MCP schema validation. */
export function executionArguments(args: Record<string, unknown>, dataSource: boolean): ExecutionOptions & { parameters: unknown[]; maxCharacters: number } {
  if (args.parameters !== undefined && !Array.isArray(args.parameters)) throw new Error('parameters must be an array.');
  if (args.outputType !== undefined && !['ARRAY', 'JSON', 'XML'].includes(String(args.outputType))) throw new Error('Unsupported outputType.');
  if (args.entryPoint !== undefined && (dataSource || typeof args.entryPoint !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(args.entryPoint))) throw new Error('entryPoint must name one server procedure; it is not supported for data sources.');
  for (const key of ['maxRows', 'maxCharacters']) {
    const value = args[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)) throw new Error(`${key} must be a positive integer.`);
  }
  if (!dataSource && args.maxRows !== undefined) throw new Error('maxRows is only supported for data sources.');
  return { parameters: (args.parameters as unknown[]) || [], entryPoint: args.entryPoint as string | undefined,
    outputType: (args.outputType as ExecutionOptions['outputType']) || 'ARRAY',
    ...(dataSource ? { maxRows: Math.min(Number(args.maxRows || 100), 10000) } : {}),
    maxCharacters: Math.min(Number(args.maxCharacters || 50000), 1000000) };
}

/** Bound only returned content; limits do not limit server execution or database work. */
export function boundedExecutionResult(result: ScriptResult, maxCharacters: number): Record<string, unknown> {
  const output = result.output ?? null;
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  const truncated = text.length > maxCharacters;
  return { success: result.success, error: result.error, executionTime: result.executionTime, totalRows: result.totalRows, rowsTruncated: result.rowsTruncated, output: truncated ? text.slice(0, maxCharacters) : output,
    totalCharacters: text.length, truncated, outputEncoding: truncated ? 'text-fragment' : 'native' };
}
