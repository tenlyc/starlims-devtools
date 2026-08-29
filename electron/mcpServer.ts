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
import * as z from 'zod/v4';

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

const uriSchema = z.object({ uri: z.string().min(1).describe('STARLIMS enterprise item URI.') });
const optionalLimit = z.number().int().positive().max(10000).optional();
const optionalCharacterLimit = z.number().int().positive().max(1_000_000).optional();

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
    const server = new McpServer(
      { name: 'starlims-devtools', version: this.getVersion() },
      {
        capabilities: { logging: {}, tools: {} },
        instructions: 'Use STARLIMS tools as the authoritative source for remote item lookup and code. Browse or search before reading. Check out an item before saving changes. Treat save, check-in, undo-checkout, and execution tools as write or execution operations requiring user intent.'
      }
    );

    this.register(server, 'browse_tree', 'Browse STARLIMS items below a folder URI or from the root.',
      z.object({ uri: z.string().optional(), maxItems: optionalLimit }), true);
    this.register(server, 'search_by_name', 'Search STARLIMS items by name.',
      z.object({ query: z.string().min(1), itemType: z.string().optional(), exactMatch: z.boolean().optional(), maxItems: optionalLimit }), true);
    this.register(server, 'global_code_search', 'Search for text across STARLIMS code items.',
      z.object({ searchString: z.string().min(1), itemTypes: z.array(z.string()).optional(), maxItems: optionalLimit }), true);
    this.register(server, 'list_languages', 'List available STARLIMS languages.', z.object({}), true);
    this.register(server, 'get_item_code', 'Read the authoritative code for a STARLIMS item.',
      z.object({ uri: z.string().min(1), language: z.string().optional(), maxCharacters: optionalCharacterLimit }), true);
    this.register(server, 'list_checked_out_items', 'List STARLIMS checked-out items.',
      z.object({ includeAllUsers: z.boolean().optional() }), true);
    this.register(server, 'read_log', 'Read the current STARLIMS server log.', z.object({}), true);
    this.register(server, 'get_table_definition', 'Read a STARLIMS table XML definition.', uriSchema, true);
    this.register(server, 'query_checkin_history', 'Query STARLIMS Source Control Manager by check-in user and inclusive date range.',
      z.object({
        user: z.string().min(1),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      }), true);

    this.register(server, 'checkout_item', 'Check out a STARLIMS item before editing it.',
      z.object({ uri: z.string().min(1), language: z.string().optional() }), false);
    this.register(server, 'save_item', 'Save code to a checked-out STARLIMS item.',
      z.object({ uri: z.string().min(1), code: z.string(), language: z.string().optional() }), false);
    this.register(server, 'checkin_item', 'Check in a STARLIMS item after edits are complete.',
      z.object({ uri: z.string().min(1), reason: z.string().min(1) }), false);
    this.register(server, 'undo_checkout', 'Undo checkout for a STARLIMS item.', uriSchema, false);
    this.register(server, 'execute_server_script', 'Execute a STARLIMS server script.',
      z.object({ uri: z.string().min(1), parameters: z.array(z.unknown()).optional() }), false);
    this.register(server, 'execute_data_source', 'Execute a STARLIMS data source.', uriSchema, false);

    return server;
  }

  private register(
    server: McpServer,
    name: string,
    description: string,
    inputSchema: z.ZodObject<any>,
    readOnly: boolean
  ): void {
    server.registerTool(
      name,
      { description, inputSchema, annotations: { readOnlyHint: readOnly } },
      async (arguments_: Record<string, unknown>) => {
        try {
          const data = await this.callRenderer(name, arguments_);
          const structured = this.toStructuredResult(data);
          return { content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { isError: true, content: [{ type: 'text' as const, text: message }] };
        }
      }
    );
  }

  private toStructuredResult(data: unknown): Record<string, unknown> {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return { ok: true, ...(data as Record<string, unknown>) };
    }
    return { ok: true, data };
  }

  private respondError(res: Response, status: number, code: number, message: string): void {
    res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
  }
}
