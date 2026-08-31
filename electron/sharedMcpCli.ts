import {
  createStarlimsMcpServer,
  createStderrLogger,
  startHttpTransport,
  type StarlimsMcpAdapter
} from '@tenlyc/starlims-mcp';
import { DEVTOOLS_MCP_CAPABILITIES, DEVTOOLS_MCP_INSTRUCTIONS } from './mcpCapabilities';

const bridgeUrl = String(process.env.STARLIMS_DEVTOOLS_BRIDGE_URL || '');
const bridgeToken = String(process.env.STARLIMS_DEVTOOLS_BRIDGE_TOKEN || '');
const host = String(process.env.STARLIMS_MCP_HOST || '127.0.0.1');
const port = Number(process.env.STARLIMS_MCP_PORT || 3102);
const version = String(process.env.STARLIMS_DEVTOOLS_VERSION || '0.0.0');
const logger = createStderrLogger({ debug: process.env.STARLIMS_MCP_DEBUG === '1', secrets: [bridgeToken] });

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
      name: 'SCM_API', version, source: 'MrDoe/starlimsvscode + tenlyc/starlims-mcp', commit: '92b9014244eb09a56ed589db5155c3b7914b70a2'
    }]
  };
  const createServer = () => {
    const server = createStarlimsMcpServer({
      serverName: 'starlims-devtools', version, profile: 'devtools', adapter,
      instructions: DEVTOOLS_MCP_INSTRUCTIONS,
      onError: (tool, error) => logger.error(`STARLIMS MCP tool '${tool}' failed.`, error)
    });
    return server;
  };
  const handle = await startHttpTransport({ host, port, logger, createServer });
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
