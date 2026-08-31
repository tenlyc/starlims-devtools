import { STARLIMS_TOOL_CATALOG } from '@tenlyc/starlims-mcp';
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
  'datasource.execute'
] as const;

export const SHARED_MCP_PACKAGE = '@tenlyc/starlims-mcp';
export const SHARED_MCP_VERSION = '0.5.1';

export const DEVTOOLS_MCP_INSTRUCTIONS = `Use STARLIMS tools as the authoritative source for remote item lookup and code. ${MCP_EFFICIENCY_INSTRUCTIONS} For multilingual HTML/XFD resources, use get_form_resources and set_form_resource with the explicit language instead of editing an unspecified generic document. Check out an item before saving changes. Treat save, check-in, undo-checkout, and execution tools as write or execution operations requiring user intent.`;
