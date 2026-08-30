/*
 * STARLIMS MCP bridge for the Electron application.
 * The transport and tool naming follow MrDoe/starlimsvscode's MCP design.
 * Upstream project: https://github.com/MrDoe/starlimsvscode (MIT License)
 */
import { randomUUID, webcrypto } from 'crypto';
import type { Server as HttpServer } from 'http';
import type { Request, Response } from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createStarlimsMcpServer, type StarlimsMcpAdapter } from '@tenlyc/starlims-mcp';

// Electron 28's main process does not always expose Web Crypto as a global.
// The MCP SDK uses globalThis.crypto during protocol initialization.
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

export interface McpStatus {
  enabled: boolean;
  running: boolean;
  host: string;
  port: number;
  url: string;
  error?: string;
}

export type RendererToolCall = (tool: string, arguments_: Record<string, unknown>) => Promise<unknown>;

type Session = { server: McpServer; transport: StreamableHTTPServerTransport };

const DEVTOOLS_MCP_CAPABILITIES = [
  'items.browse',
  'items.search',
  'code.search',
  'languages.list',
  'code.read',
  'checkout.list',
  'logs.read',
  'tables.read',
  'scm.history',
  'checkout.write',
  'code.write',
  'checkout.checkin',
  'checkout.undo',
  'scripts.execute',
  'datasource.execute'
] as const;

export class StarlimsMcpHttpServer {
  private httpServer?: HttpServer;
  private readonly sessions = new Map<string, Session>();
  private lastError?: string;

  constructor(
    private readonly callRenderer: RendererToolCall,
    private readonly getVersion: () => string,
    private readonly log: (message: string, error?: unknown) => void,
    private readonly host = '127.0.0.1',
    private port = 3102
  ) {}

  getStatus(): McpStatus {
    return {
      enabled: true,
      running: Boolean(this.httpServer?.listening),
      host: this.host,
      port: this.port,
      url: `http://${this.host}:${this.port}/mcp`,
      ...(this.lastError ? { error: this.lastError } : {})
    };
  }

  async start(): Promise<void> {
    if (this.httpServer?.listening) return;

    const app = createMcpExpressApp({ host: this.host });
    app.get('/', (_req, res) => res.send('STARLIMS DevTools MCP Server'));
    app.get('/health', (_req, res) => res.json({ ok: true, service: 'starlims-devtools-mcp' }));
    app.all('/mcp', (req, res) => void this.handleRequest(req, res));

    try {
      await new Promise<void>((resolve, reject) => {
        const server = app.listen(this.port, this.host, resolve);
        server.once('error', reject);
        this.httpServer = server;
      });
      this.lastError = undefined;
      this.log(`STARLIMS MCP server listening at http://${this.host}:${this.port}/mcp`);
    } catch (error) {
      this.httpServer = undefined;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.log('Failed to start STARLIMS MCP server.', error);
    }
  }

  async stop(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(sessions.map(({ server }) => server.close()));
    if (!this.httpServer) return;
    const server = this.httpServer;
    this.httpServer = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handleRequest(req: Request, res: Response): Promise<void> {
    const sessionId = req.header('Mcp-Session-Id');
    let session = sessionId ? this.sessions.get(sessionId) : undefined;

    if (!session) {
      if (sessionId) {
        this.respondError(res, 404, -32001, `Unknown MCP session: ${sessionId}`);
        return;
      }
      if (!isInitializeRequest(req.body)) {
        this.respondError(res, 400, -32000, 'Initialize an MCP session first.');
        return;
      }
      session = await this.createSession();
    }

    try {
      await session.transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.log('STARLIMS MCP request failed.', error);
      if (!res.headersSent) this.respondError(res, 500, -32603, 'Internal MCP server error.');
    }
  }

  private async createSession(): Promise<Session> {
    const server = this.createProtocolServer();
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => this.sessions.set(id, { server, transport }),
      onsessionclosed: (id) => {
        this.sessions.delete(id);
        void server.close();
      }
    });
    await server.connect(transport);
    return { server, transport };
  }

  private createProtocolServer(): McpServer {
    const version = this.getVersion();
    const adapter: StarlimsMcpAdapter = {
      id: 'starlims-devtools',
      capabilities: DEVTOOLS_MCP_CAPABILITIES,
      invoke: (tool, arguments_) => this.callRenderer(tool, arguments_),
      backendComponents: () => [
        {
          name: 'SCM_API',
          source: 'MrDoe/starlimsvscode',
          commit: '92b9014244eb09a56ed589db5155c3b7914b70a2'
        },
        {
          name: 'STARLIMS_DEVTOOLS_API',
          version,
          source: 'tenlyc/starlims-devtools'
        }
      ]
    };

    return createStarlimsMcpServer({
      serverName: 'starlims-devtools',
      version,
      profile: 'devtools',
      adapter,
      instructions: 'Use STARLIMS tools as the authoritative source for remote item lookup and code. Browse or search before reading. Check out an item before saving changes. Treat save, check-in, undo-checkout, and execution tools as write or execution operations requiring user intent.',
      onError: (tool, error) => this.log(`STARLIMS MCP tool '${tool}' failed.`, error)
    });
  }

  private respondError(res: Response, status: number, code: number, message: string): void {
    res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
  }
}
