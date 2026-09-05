import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildCapabilityDocument, getProfileTools, type StarlimsMcpAdapter } from '@tenlyc/starlims-mcp';
import * as z from 'zod/v4';
import { DEVTOOLS_LOCAL_MCP_TOOLS, registerDevtoolsLocalMcpTools } from './mcpCapabilities';
import { VISUAL_MCP_TOOL_INFO, registerLocalVisualMcpTools } from './visualMcpTools';

/** Register the shared catalog and host extensions from the same capability document. */
export function createDevtoolsProtocolServer(options: {
  serverName: string; version: string; profile: 'devtools'; adapter: StarlimsMcpAdapter;
  instructions: string; onError?: (tool: string, error: unknown) => void;
}): McpServer {
  const server = new McpServer({ name: options.serverName, version: options.version }, {
    capabilities: { logging: {}, tools: {} }, instructions: options.instructions
  });
  server.registerTool('get_capabilities', { inputSchema: z.object({}), description: 'Describe all currently registered STARLIMS tools and backend version evidence.' }, async () => {
    const base = await buildCapabilityDocument(options);
    const document = { ...base, tools: [...base.tools,
      ...DEVTOOLS_LOCAL_MCP_TOOLS.map(({ inputSchema: _schema, ...tool }) => tool), ...VISUAL_MCP_TOOL_INFO] };
    return { content: [{ type: 'text', text: JSON.stringify(document) }], structuredContent: document };
  });
  for (const tool of getProfileTools('devtools', options.adapter.capabilities)) {
    server.registerTool(tool.id, { title: tool.title, description: tool.description, inputSchema: tool.inputSchema,
      annotations: { readOnlyHint: tool.risk === 'read', destructiveHint: tool.risk === 'destructive', idempotentHint: tool.risk === 'read', openWorldHint: tool.risk === 'execute' }
    }, async (args: unknown) => {
      try {
        const value = await options.adapter.invoke(tool.adapterTool || tool.id, (args || {}) as Record<string, unknown>);
        const result = value && typeof value === 'object' && !Array.isArray(value) ? { ok: true, ...value } : { ok: true, data: value };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        options.onError?.(tool.id, error);
        return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] };
      }
    });
  }
  registerDevtoolsLocalMcpTools(server, options.adapter.invoke, options.onError);
  registerLocalVisualMcpTools(server, options.adapter.invoke, options.onError);
  return server;
}
