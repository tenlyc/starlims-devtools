import { createDevtoolsProtocolServer } from './devtoolsProtocolServer';
import { randomUUID } from 'crypto';
import type { Server as HttpServer } from 'http';
import express, { type Request, type Response } from 'express';
import { localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  createStarlimsMcpServer,
  createStderrLogger,
  type StarlimsMcpAdapter
} from '@tenlyc/starlims-mcp';
import { DEVTOOLS_MCP_CAPABILITIES, DEVTOOLS_MCP_INSTRUCTIONS } from './mcpCapabilities';
import { MCP_JSON_BODY_LIMIT } from './mcpServer';

const bridgeUrl = String(process.env.STARLIMS_DEVTOOLS_BRIDGE_URL || '');
const bridgeToken = String(process.env.STARLIMS_DEVTOOLS_BRIDGE_TOKEN || '');
const host = String(process.env.STARLIMS_MCP_HOST || '127.0.0.1');
const port = Number(process.env.STARLIMS_MCP_PORT || 3102);
const version = String(process.env.STARLIMS_DEVTOOLS_VERSION || '0.0.0');
const logger = createStderrLogger({ debug: process.env.STARLIMS_MCP_DEBUG === '1', secrets: [bridgeToken] });

async function startSharedHttpTransport(createServer: () => McpServer): Promise<{ url: string; close(): Promise<void> }> {
  const app = express();
  app.use(express.json({ limit: MCP_JSON_BODY_LIMIT }));
  if (['127.0.0.1', 'localhost', '::1'].includes(host)) app.use(localhostHostValidation());
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();
  app.get('/health', (_request, response) => response.json({ ok: true, service: 'starlims-devtools-mcp' }));
  app.all('/mcp', async (request: Request, response: Response) => {
    const sessionId = request.header('mcp-session-id');
    let session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) {
      if (sessionId || !isInitializeRequest(request.body)) {
        response.status(sessionId ? 404 : 400).json({ jsonrpc: '2.0', error: { code: -32001, message: sessionId ? 'Unknown MCP session.' : 'Initialize an MCP session first.' }, id: null });
        return;
      }
      const server = createServer();
      let transport!: StreamableHTTPServerTransport;
      transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => { sessions.set(id, { server, transport }); },
        onsessionclosed: (id) => { sessions.delete(id); void server.close(); }
      });
      await server.connect(transport);
      session = { server, transport };
    }
    try {
      await session.transport.handleRequest(request, response, request.body);
    } catch (error) {
      logger.error('MCP HTTP request failed.', error);
      if (!response.headersSent) response.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal MCP server error.' }, id: null });
    }
  });
  const httpServer = await new Promise<HttpServer>((resolve, reject) => {
    const candidate = app.listen(port, host, () => resolve(candidate));
    candidate.once('error', reject);
  });
  const address = httpServer.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    url: `http://${host}:${actualPort}/mcp`,
    close: async () => {
      await Promise.allSettled([...sessions.values()].map(({ server }) => server.close()));
      sessions.clear();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  };
}

async function main(): Promise<void> {
  if (!bridgeUrl || !bridgeToken || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('The DevTools MCP bridge configuration is invalid.');
  }
  const adapter: StarlimsMcpAdapter = {
    id: 'starlims-devtools-bridge',
    capabilities: DEVTOOLS_MCP_CAPABILITIES,
    invoke: async (tool, arguments_) => {
      const response = await fetch(bridgeUrl, {
        method: 'POST',
        headers: { authorization: `Bearer ${bridgeToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ tool, arguments: arguments_ })
      });
      const payload = await response.json() as { result?: unknown; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || `DevTools bridge returned HTTP ${response.status}.`);
      return payload.result;
    },
    backendComponents: () => [{
      name: 'SCM_API', source: 'MrDoe/starlimsvscode + tenlyc/starlims-mcp', commit: '92b9014244eb09a56ed589db5155c3b7914b70a2'
    }]
  };
  const createServer = () => {
    const server = createDevtoolsProtocolServer({
      serverName: 'starlims-devtools', version, profile: 'devtools', adapter,
      instructions: DEVTOOLS_MCP_INSTRUCTIONS,
      onError: (tool, error) => logger.error(`STARLIMS MCP tool '${tool}' failed.`, error)
    });
    return server;
  };
  const handle = await startSharedHttpTransport(createServer);
  logger.info(`Shared STARLIMS MCP server listening at ${handle.url}`);
  const shutdown = async () => {
    await handle.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

void main().catch((error) => {
  logger.error('Shared STARLIMS MCP process failed to start.', error);
  process.exitCode = 2;
});
