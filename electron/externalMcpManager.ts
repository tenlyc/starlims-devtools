import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ExternalMcpServerConfig, ExternalMcpServers } from '../src/types/agent';

type ConnectedServer = { client: Client; transport: Transport };
type ToolRoute = { server: string; tool: string; readOnly: boolean };
export type ExternalMcpTool = { name: string; description?: string; inputSchema: Record<string, unknown>; readOnly: boolean };

function safeToolPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'mcp';
}

export class ExternalMcpManager {
  private configs: ExternalMcpServers = {};
  private readonly connected = new Map<string, ConnectedServer>();
  private readonly routes = new Map<string, ToolRoute>();

  setConfigs(configs: ExternalMcpServers): void {
    this.configs = configs;
    void this.close();
  }

  async listTools(): Promise<ExternalMcpTool[]> {
    this.routes.clear();
    const result: ExternalMcpTool[] = [];
    for (const [serverName, config] of Object.entries(this.configs)) {
      if (config.enabled === false) continue;
      try {
        const client = await this.clientFor(serverName, config);
        const listed = await client.listTools();
        for (const tool of listed.tools) {
          let functionName = `mcp_${safeToolPart(serverName)}_${safeToolPart(tool.name)}`.slice(0, 64);
          let suffix = 2;
          while (this.routes.has(functionName)) functionName = `${functionName.slice(0, 60)}_${suffix++}`;
          const readOnly = tool.annotations?.readOnlyHint === true;
          this.routes.set(functionName, { server: serverName, tool: tool.name, readOnly });
          result.push({ name: functionName, description: `[${serverName}] ${tool.description || tool.name}`, inputSchema: (tool.inputSchema || { type: 'object', properties: {} }) as Record<string, unknown>, readOnly });
        }
      } catch {
        // One unavailable optional server must not prevent the other MCP servers from loading.
      }
    }
    return result;
  }

  hasTool(name: string): boolean { return this.routes.has(name); }
  isToolReadOnly(name: string): boolean { return this.routes.get(name)?.readOnly === true; }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const route = this.routes.get(name);
    if (!route) throw new Error(`External MCP tool not found: ${name}`);
    const config = this.configs[route.server];
    const client = await this.clientFor(route.server, config);
    return client.callTool({ name: route.tool, arguments: args });
  }

  async close(): Promise<void> {
    const active = [...this.connected.values()];
    this.connected.clear();
    this.routes.clear();
    await Promise.allSettled(active.map(({ client }) => client.close()));
  }

  private async clientFor(name: string, config: ExternalMcpServerConfig): Promise<Client> {
    const existing = this.connected.get(name);
    if (existing) return existing.client;
    let transport: Transport;
    if (config.transport === 'stdio') {
      if (!config.command) throw new Error(`MCP server '${name}' requires a command.`);
      transport = new StdioClientTransport({ command: config.command, args: config.args || [], env: config.env, stderr: 'pipe' });
    } else {
      if (!config.url) throw new Error(`MCP server '${name}' requires a URL.`);
      const options = { requestInit: { headers: config.headers || {} } };
      transport = config.transport === 'sse'
        ? new SSEClientTransport(new URL(config.url), options)
        : new StreamableHTTPClientTransport(new URL(config.url), options);
    }
    const client = new Client({ name: 'starlims-devtools', version: '1.6.0' }, { capabilities: {} });
    await client.connect(transport);
    this.connected.set(name, { client, transport });
    return client;
  }
}
