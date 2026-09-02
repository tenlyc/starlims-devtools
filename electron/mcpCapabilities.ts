import { STARLIMS_TOOL_CATALOG } from '@tenlyc/starlims-mcp';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { MCP_EFFICIENCY_INSTRUCTIONS } from '../src/services/mcpEfficiency';

type LegacyTool = {
  origin: string;
  provenance: { repository: string; owner: string };
};

export function normalizeSharedMcpToolOwnership<T extends LegacyTool>(tool: T): T {
  if (tool.origin === 'starlims-devtools') {
    tool.origin = 'starlims-mcp';
    tool.provenance.repository = 'https://github.com/tenlyc/starlims-mcp';
    tool.provenance.owner = 'tenlyc/starlims-mcp';
  } else if (tool.origin === 'shared') {
    tool.origin = tool.provenance.repository.includes('starlims-mcp') ? 'starlims-mcp' : 'starlimsvscode';
  }
  return tool;
}

// v0.4.x compatibility: normalize the imported catalog before any embedded
// server is created. Newer shared packages already expose these two origins.
for (const tool of STARLIMS_TOOL_CATALOG as unknown as LegacyTool[]) normalizeSharedMcpToolOwnership(tool);

export const DEVTOOLS_MCP_CAPABILITIES = [
  'items.browse',
  'items.search',
  'code.search',
  'languages.list',
  'code.read',
  'forms.resources.read',
  'checkout.list',
  'logs.read',
  'tables.read',
  'scm.history',
  'checkout.write',
  'code.write',
  'forms.resources.write',
  'checkout.checkin',
  'checkout.undo',
  'scripts.execute',
  'datasource.execute',
  'ssl.validate',
  'diagnostics.read',
  'devtools.logs.read'
] as const;

export const DEVTOOLS_LOCAL_MCP_TOOLS = [{
  id: 'validate_ssl',
  title: 'Validate STARLIMS SSL',
  description: 'Validate STARLIMS Scripting Language code with the bundled starlims-lsp. Use before saving Server Scripts, Data Sources, and other SSL code.',
  origin: 'starlims-mcp',
  repository: 'https://github.com/tenlyc/starlims-mcp',
  provenance: { repository: 'https://github.com/tenlyc/starlims-mcp', owner: 'tenlyc/starlims-mcp' },
  risk: 'read' as const,
  capability: 'ssl.validate',
  schemaVersion: '1.0',
  profiles: ['devtools'] as const,
  inputSchema: z.object({
    code: z.string().min(1).describe('Complete STARLIMS SSL source code to validate.'),
    dataSource: z.boolean().optional().describe('Enable Data Source-specific syntax rules.'),
    includeInfo: z.boolean().optional().describe('Include informational diagnostics.'),
    hungarianTypes: z.boolean().optional().describe('Enable Hungarian variable type checks.')
  })
}, {
  id: 'get_editor_diagnostics',
  title: 'Get editor diagnostics',
  description: 'Read the Problems panel diagnostics for the current file, open files, or all indexed files. Use this when diagnosing or verifying an editor problem.',
  origin: 'starlims-mcp',
  repository: 'https://github.com/tenlyc/starlims-mcp',
  provenance: { repository: 'https://github.com/tenlyc/starlims-mcp', owner: 'tenlyc/starlims-mcp' },
  risk: 'read' as const,
  capability: 'diagnostics.read',
  schemaVersion: '1.0',
  profiles: ['devtools'] as const,
  inputSchema: z.object({
    uri: z.string().optional().describe('Exact editor URI. Defaults to the active editor.'),
    scope: z.enum(['current', 'open', 'all']).optional().describe('Diagnostic scope when uri is omitted.'),
    levels: z.array(z.enum(['error', 'warning', 'info'])).optional().describe('Optional severity filter.'),
    maxItems: z.number().int().min(1).max(200).optional().describe('Maximum diagnostics to return.')
  })
}, {
  id: 'get_devtools_output',
  title: 'Get DevTools output',
  description: 'Read recent entries from the DevTools Output panel, newest first. Use channel and level filters to keep troubleshooting focused.',
  origin: 'starlims-mcp',
  repository: 'https://github.com/tenlyc/starlims-mcp',
  provenance: { repository: 'https://github.com/tenlyc/starlims-mcp', owner: 'tenlyc/starlims-mcp' },
  risk: 'read' as const,
  capability: 'devtools.logs.read',
  schemaVersion: '1.0',
  profiles: ['devtools'] as const,
  inputSchema: z.object({
    channel: z.enum(['starlims-operation', 'starlims-api', 'ssl-language', 'mcp-server', 'mcp-tools', 'ai-runtime']).optional().describe('Optional Output channel filter.'),
    levels: z.array(z.enum(['info', 'warning', 'error', 'success', 'script'])).optional().describe('Optional log-level filter.'),
    maxItems: z.number().int().min(1).max(200).optional().describe('Maximum entries to return.')
  })
}];

export function registerDevtoolsLocalMcpTools(
  server: McpServer,
  invoke: (tool: string, arguments_: Record<string, unknown>) => Promise<unknown>,
  onError?: (tool: string, error: unknown) => void
): void {
  for (const tool of DEVTOOLS_LOCAL_MCP_TOOLS) {
    server.registerTool(tool.id, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async (rawArguments: unknown) => {
      try {
        const value = await invoke(tool.id, (rawArguments || {}) as Record<string, unknown>);
        const result = value && typeof value === 'object' && !Array.isArray(value)
          ? { ok: true, ...(value as Record<string, unknown>) }
          : { ok: true, data: value };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
      } catch (error) {
        onError?.(tool.id, error);
        return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] };
      }
    });
  }
}

export const SHARED_MCP_PACKAGE = '@tenlyc/starlims-mcp';
export const SHARED_MCP_VERSION = '0.5.1';

export const DEVTOOLS_MCP_INSTRUCTIONS = `Use STARLIMS tools as the authoritative source for remote item lookup and code. ${MCP_EFFICIENCY_INSTRUCTIONS} Use get_editor_diagnostics for current Problems and get_devtools_output for local Output logs; use read_log for remote STARLIMS user logs. Before saving Server Scripts, Data Sources, or other SSL code, call validate_ssl with the complete proposed code and fix error diagnostics. For multilingual HTML/XFD resources, use get_form_resources and set_form_resource with the explicit language instead of editing an unspecified generic document. Check out an item before saving changes. Treat save, check-in, undo-checkout, and execution tools as write or execution operations requiring user intent.`;
