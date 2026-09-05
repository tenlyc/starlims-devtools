import { getProfileTools } from '@tenlyc/starlims-mcp';
export { STARLIMS_MCP_INSTRUCTIONS as DEVTOOLS_MCP_INSTRUCTIONS } from '@tenlyc/starlims-mcp';
// The adapter implements the shared DevTools profile; it does not add contracts.
export const DEVTOOLS_MCP_CAPABILITIES = [...new Set(getProfileTools('devtools').map(tool => tool.capability))];
export const SHARED_MCP_PACKAGE = '@tenlyc/starlims-mcp';
export const SHARED_MCP_VERSION = '0.5.2';
