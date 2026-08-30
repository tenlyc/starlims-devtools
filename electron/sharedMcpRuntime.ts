import { randomBytes } from 'crypto';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'http';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import type { McpStatus, RendererToolCall, StarlimsMcpHttpServer } from './mcpServer';
import { withLocalMcpNoProxy } from './localMcpEnv';
import { DEVTOOLS_MCP_CAPABILITIES, SHARED_MCP_PACKAGE, SHARED_MCP_VERSION } from './mcpCapabilities';

export type SharedMcpStatus = McpStatus & {
  implementation: 'shared-process' | 'embedded-fallback';
  sharedPackage: string;
};

class RendererToolBridge {
  private server?: HttpServer;
  readonly token = randomBytes(32).toString('hex');
  url = '';

  constructor(private readonly callRenderer: RendererToolCall) {}

  async start(): Promise<void> {
    if (this.server?.listening) return;
    const server = createServer((request, response) => void this.handle(request, response));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    this.server = server;
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unable to resolve the DevTools MCP bridge address.');
    this.url = `http://127.0.0.1:${address.port}/invoke`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = undefined;
    this.url = '';
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (request.method !== 'POST' || request.url !== '/invoke') return this.respond(response, 404, { error: 'Not found.' });
    if (request.headers.authorization !== `Bearer ${this.token}`) return this.respond(response, 401, { error: 'Unauthorized.' });
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 2 * 1024 * 1024) throw new Error('MCP bridge request exceeds 2 MB.');
        chunks.push(buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { tool?: unknown; arguments?: unknown };
      if (typeof body.tool !== 'string' || !body.tool) throw new Error('A tool name is required.');
      const arguments_ = body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
        ? body.arguments as Record<string, unknown>
        : {};
      this.respond(response, 200, { result: await this.callRenderer(body.tool, arguments_) });
    } catch (error) {
      this.respond(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private respond(response: ServerResponse, status: number, body: unknown): void {
    response.statusCode = status;
    response.end(JSON.stringify(body));
  }
}

export class SharedMcpRuntime {
  private readonly bridge: RendererToolBridge;
  private child?: ChildProcess;
  private starting?: Promise<void>;
  private stopping = false;
  private sharedRunning = false;
  private lastError?: string;

  constructor(
    callRenderer: RendererToolCall,
    private readonly embedded: StarlimsMcpHttpServer,
    private readonly getVersion: () => string,
    private readonly getPort: () => number,
    private readonly log: (message: string, error?: unknown) => void,
    private readonly getCliPath: () => string = () => join(__dirname, 'sharedMcpCli.js'),
    private readonly getSharedVersion: () => string = () => SHARED_MCP_VERSION
  ) {
    this.bridge = new RendererToolBridge(callRenderer);
  }

  getStatus(): SharedMcpStatus {
    if (this.sharedRunning) {
      const port = this.getPort();
      return {
        enabled: true,
        running: true,
        host: '127.0.0.1',
        port,
        url: `http://127.0.0.1:${port}/mcp`,
        implementation: 'shared-process',
        sharedPackage: `${SHARED_MCP_PACKAGE}@${this.getSharedVersion()}`
      };
    }
    const fallback = this.embedded.getStatus();
    return {
      ...fallback,
      ...(this.lastError ? { error: `Shared Server unavailable; using embedded fallback. ${this.lastError}` } : {}),
      implementation: 'embedded-fallback',
      sharedPackage: `${SHARED_MCP_PACKAGE}@${this.getSharedVersion()}`
    };
  }

  start(): Promise<void> {
    if (this.sharedRunning || this.embedded.getStatus().running) return Promise.resolve();
    this.starting ||= this.startPreferred().finally(() => { this.starting = undefined; });
    return this.starting;
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.sharedRunning = false;
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((resolve) => child.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000))
      ]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    await Promise.allSettled([this.bridge.stop(), this.embedded.stop()]);
  }

  private async startPreferred(): Promise<void> {
    this.stopping = false;
    await this.embedded.stop();
    try {
      await this.bridge.start();
      const cliPath = this.getCliPath();
      const child = spawn(process.execPath, [cliPath], {
        windowsHide: true,
        env: withLocalMcpNoProxy({
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          STARLIMS_DEVTOOLS_BRIDGE_URL: this.bridge.url,
          STARLIMS_DEVTOOLS_BRIDGE_TOKEN: this.bridge.token,
          STARLIMS_DEVTOOLS_VERSION: this.getVersion(),
          STARLIMS_MCP_CAPABILITIES: JSON.stringify(DEVTOOLS_MCP_CAPABILITIES),
          STARLIMS_MCP_BACKEND_COMPONENTS: JSON.stringify([{
            name: 'SCM_API', version: this.getVersion(), source: 'MrDoe/starlimsvscode + tenlyc/starlims-mcp', commit: '92b9014244eb09a56ed589db5155c3b7914b70a2'
          }]),
          STARLIMS_MCP_HOST: '127.0.0.1',
          STARLIMS_MCP_PORT: String(this.getPort())
        }),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.child = child;
      child.stdout?.on('data', (data: Buffer) => this.log(`[shared MCP] ${data.toString().trim()}`));
      child.stderr?.on('data', (data: Buffer) => this.log(`[shared MCP] ${data.toString().trim()}`));
      child.once('exit', (code, signal) => void this.handleUnexpectedExit(child, code, signal));
      child.once('error', (error) => this.log('Shared MCP child process failed.', error));
      await this.waitForHealth(child);
      this.sharedRunning = true;
      this.lastError = undefined;
      this.log(`Shared STARLIMS MCP process is healthy at ${this.getStatus().url}`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.log('Shared STARLIMS MCP process failed; starting embedded fallback.', error);
      this.sharedRunning = false;
      if (this.child && this.child.exitCode === null) this.child.kill('SIGTERM');
      this.child = undefined;
      await this.bridge.stop();
      await this.embedded.start();
    }
  }

  private async waitForHealth(child: ChildProcess): Promise<void> {
    const healthUrl = `http://127.0.0.1:${this.getPort()}/health`;
    let lastError = 'health check timed out';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Shared MCP process exited with code ${child.exitCode}.`);
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(500) });
        if (response.ok) return;
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Shared MCP health check failed: ${lastError}`);
  }

  private async handleUnexpectedExit(child: ChildProcess, code: number | null, signal: NodeJS.Signals | null): Promise<void> {
    if (child !== this.child) return;
    this.child = undefined;
    this.sharedRunning = false;
    if (this.stopping) return;
    this.lastError = `Shared MCP process exited (${signal || (code ?? 'unknown')}).`;
    this.log(`${this.lastError} Starting embedded fallback.`);
    await this.bridge.stop();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await this.embedded.start();
  }
}
