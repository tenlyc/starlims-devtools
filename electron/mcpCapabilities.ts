import { menuSchemas, MENU_WORKFLOW_INSTRUCTIONS } from '../src/services/menuMcpSchema';
import { VISUAL_MCP_CAPABILITIES } from './visualMcpTools';
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

// The shared package already owns the host-neutral table contracts, but
// v0.5.1 predates the DevTools table adapter. Enable those contracts here
// until the next starlims-mcp release carries the devtools profile itself.
const DEVTOOLS_TABLE_TOOLS = new Set(['checkout_table', 'checkin_table', 'create_table', 'edit_table']);
for (const tool of STARLIMS_TOOL_CATALOG) {
  if (DEVTOOLS_TABLE_TOOLS.has(tool.id) && !tool.profiles.includes('devtools')) {
    (tool.profiles as string[]).push('devtools');
  }
  if (['get_form_resources', 'save_form_resources', 'set_form_resource'].includes(tool.id)) {
    tool.description += ' Resources XML has three distinct roles: ResourcesDataset/ResourcesTable is stored data; Resources/Resource/Id/Value is designer-paste data; Form/Resources/Data/KeyItem/TextItem is a loading binding and must never be submitted as resource data. Inspect formDiagnostics (binding status, GUID mismatch and missing column xtype) and runtimeVerified; a valid binding does not certify Designer or runtime compatibility. Build new Form XML from a Designer-generated same-control template and preserve typed column metadata.';
  }
  if (tool.id === 'edit_table') {
    if (!(tool.inputSchema instanceof z.ZodObject)) throw new Error('Unsupported shared edit_table schema.');
    tool.inputSchema = tool.inputSchema.extend({ expectedVersion: z.string().min(1).describe('Version from the complete get_table_definition read before editing.') });
  }
}

export const DEVTOOLS_MCP_CAPABILITIES = [
  ...VISUAL_MCP_CAPABILITIES,
  'menus.read',
  'menus.write',
  'items.browse',
  'items.search',
  'code.search',
  'languages.list',
  'code.read',
  'forms.resources.read',
  'checkout.list',
  'logs.read',
  'tables.read',
  'tables.checkout',
  'tables.checkin',
  'tables.create',
  'tables.write',
  'scm.history',
  'checkout.write',
  'code.write',
  'items.create',
  'forms.resources.write',
  'checkout.checkin',
  'checkout.undo',
  'scripts.execute',
  'datasource.execute',
  'ssl.validate',
  'diagnostics.read',
  'devtools.logs.read'
] as const;

export const DEVTOOLS_LOCAL_MCP_TOOLS = [...Object.entries(menuSchemas).map(([id, inputSchema]) => ({
  id, title: id, description: ({get_menu_configuration:'Read native HTML menu configuration and role IDs.',plan_menu_item:'Prepare a create-only menu plan for an existing group. No writes. '+MENU_WORKFLOW_INSTRUCTIONS,apply_menu_item:'Apply a user-confirmed menu plan and verify configuration. Grants menu access to specified roles. Uses the separate SCM_API.MenuManagement transaction; does not modify system designer methods. Runtime acceptance is separate.'} as Record<string,string>)[id],
  origin:'starlims-mcp', repository:'https://github.com/tenlyc/starlims-mcp', provenance:{repository:'https://github.com/tenlyc/starlims-mcp',owner:'tenlyc/starlims-mcp'}, risk: id === 'apply_menu_item' ? 'write' as const : 'read' as const, capability: id === 'apply_menu_item' ? 'menus.write' : 'menus.read',schemaVersion:'1.0',profiles:['devtools'] as const,inputSchema
})), {
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
  id: 'create_item',
  title: 'Create STARLIMS item',
  description: 'Create an isolated STARLIMS application, form, script, data source, or category through SCM_API.Add. Use existing category and application names exactly; creating an item does not check it in.',
  origin: 'starlimsvscode',
  repository: 'https://github.com/MrDoe/starlimsvscode',
  provenance: { repository: 'https://github.com/MrDoe/starlimsvscode', owner: 'MrDoe/starlimsvscode' },
  risk: 'write' as const,
  capability: 'items.create',
  schemaVersion: '1.0',
  profiles: ['devtools'] as const,
  inputSchema: z.object({
    itemName: z.string().min(1).describe('Name of the new item.'),
    itemType: z.string().min(1).describe('STARLIMS item type, for example APP, HTMLFORMXML, APPSS, APPDS, or APPCS.'),
    language: z.string().min(1).describe('Item language, for example ENG, SSL, SQL, or JS.'),
    categoryName: z.string().min(1).describe('Existing category name. For application items this is the application category under /Applications.'),
    appName: z.string().min(1).describe('Existing application name for application children, or the new application name when itemType is APP.')
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
      annotations: {
        readOnlyHint: tool.risk === 'read',
        destructiveHint: false,
        idempotentHint: tool.risk === 'read',
        openWorldHint: false
      }
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

export const DEVTOOLS_MCP_INSTRUCTIONS = `For page acceptance use open_form_preview, inspect_form_element, capture_form_screenshot and preview error tools. opened means navigation requested, not runtime success. Check status.surface, status.loading and actual page content; layout fallback is not runtime acceptance. Execution maxRows and maxCharacters bound returned output only, not database work or side effects; truncated output is not complete JSON/XML. Use STARLIMS tools as the authoritative source for remote item lookup and code. ${MCP_EFFICIENCY_INSTRUCTIONS} Use get_editor_diagnostics for current Problems and get_devtools_output for local Output logs; use read_log for remote STARLIMS user logs. Before saving Server Scripts, Data Sources, or other SSL code, call validate_ssl with the complete proposed code and fix error diagnostics. For multilingual HTML/XFD resources, use get_form_resources with an explicit language and prefer set_form_resource for one ResourceId. ResourceId matching is case-sensitive: derive each ID exactly from the form and preserve its casing. save_form_resources accepts a server ResourcesDataset for full replacement or designer-paste <Resources> XML for a non-destructive merge that preserves existing GUIDs and server-only entries such as GUIDE. HTML Resources saves also verify and repair the standard Form XML Resources loading binding with the enterprise GUID and explicit language; custom data sources require manual review. A successful Resources save updates and verifies the source-control working copy only: tell the user to close and reopen an already-open HTML Form Designer tab to refresh its cached Resources grid, and never claim runtime localization is active until the item is checked in and re-read or visually verified. Check out an item before saving changes. Treat save, check-in, undo-checkout, and execution tools as write or execution operations requiring user intent.`;
