import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';
import type { AgentApprovalDecision, AgentEvent, AgentModelOption, AgentProvider, AgentRuntimeStatus, AgentStartResult, AgentToolPermissionPolicy, ExternalMcpServers } from '../src/types/agent';
import { withLocalMcpNoProxy } from './localMcpEnv';

type JsonRpcId = number | string;
type JsonObject = Record<string, any>;
type Emit = (event: AgentEvent) => void;

export function normalizeCodexModels(result: unknown): AgentModelOption[] {
  const payload = result as JsonObject | undefined;
  const candidates = Array.isArray(result)
    ? result
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.items)
          ? payload.items
          : [];
  const seen = new Set<string>();
  return candidates.flatMap((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const model = candidate as JsonObject;
    const id = [model.model, model.id, model.slug].find((value) => typeof value === 'string' && value.trim())?.trim();
    if (!id || model.hidden || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      name: typeof model.displayName === 'string' && model.displayName.trim()
        ? model.displayName
        : typeof model.name === 'string' && model.name.trim() ? model.name : id,
      description: typeof model.description === 'string' ? model.description : undefined,
      isDefault: Boolean(model.isDefault ?? model.default)
    }];
  });
}

export function isReadOnlyAgentToolBlocked(toolName: string): boolean {
  const normalizedTool = toolName.split('__').pop() || toolName;
  return ['Bash', 'Edit', 'Write', 'NotebookEdit'].includes(toolName)
    || ['checkout_item', 'save_item', 'checkin_item', 'undo_checkout', 'execute_server_script', 'execute_data_source'].includes(normalizedTool);
}

function isPotentiallyUnsafeAgentTool(toolName: string): boolean {
  const normalizedTool = toolName.split('__').pop() || toolName;
  if (toolName === 'Bash') return true;
  if (toolName.startsWith('mcp__') && !toolName.startsWith('mcp__starlims__')) return true;
  return ['checkin_item', 'undo_checkout', 'execute_server_script', 'execute_data_source'].includes(normalizedTool);
}

function safeMcpName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'external';
}

function tomlString(value: string): string { return JSON.stringify(value); }

function externalCodexMcpArgs(servers: ExternalMcpServers): string[] {
  const args: string[] = [];
  for (const [rawName, server] of Object.entries(servers)) {
    if (server.enabled === false) continue;
    const name = safeMcpName(rawName);
    if (server.transport === 'stdio' && server.command) {
      args.push('-c', `mcp_servers.${name}.command=${tomlString(server.command)}`);
      if (server.args?.length) args.push('-c', `mcp_servers.${name}.args=${JSON.stringify(server.args)}`);
      if (server.env && Object.keys(server.env).length) {
        const env = Object.entries(server.env).map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`).join(', ');
        args.push('-c', `mcp_servers.${name}.env={ ${env} }`);
      }
    } else if (server.url) {
      args.push('-c', `mcp_servers.${name}.url=${tomlString(server.url)}`);
      if (server.headers && Object.keys(server.headers).length) {
        const headers = Object.entries(server.headers).map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`).join(', ');
        args.push('-c', `mcp_servers.${name}.http_headers={ ${headers} }`);
      }
    }
    args.push('-c', `mcp_servers.${name}.required=false`);
  }
  return args;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function itemStatus(value: unknown): 'running' | 'completed' | 'failed' | 'declined' {
  if (value === 'failed') return 'failed';
  if (value === 'declined') return 'declined';
  if (value === 'completed') return 'completed';
  return 'running';
}

export class CodexAppServerRuntime {
  private child?: ChildProcessWithoutNullStreams;
  private stopping = false;
  private starting?: Promise<void>;
  private nextId = 1;
  private threadId?: string;
  private threadModel?: string;
  private threadPermissionPolicy?: AgentToolPermissionPolicy;
  private activeTurnId?: string;
  private readonly pending = new Map<JsonRpcId, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private readonly approvals = new Map<string, { rpcId: JsonRpcId; method: string; params: JsonObject }>();

  constructor(
    private readonly command: () => string,
    private readonly mcpUrl: () => string,
    private readonly cwd: () => string,
    private readonly getVersion: () => string,
    private readonly emit: Emit,
    private readonly externalMcpServers: () => ExternalMcpServers = () => ({})
  ) {}

  async status(): Promise<AgentRuntimeStatus> {
    const command = this.command();
    return new Promise((resolve) => {
      const child = spawn(command, ['--version'], { shell: command.toLowerCase().endsWith('.cmd'), windowsHide: true });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk) => { output += chunk.toString(); });
      child.once('error', (error) => resolve({ available: false, runtime: 'app-server', command, detail: error.message }));
      child.once('close', (code) => resolve({
        available: code === 0,
        runtime: 'app-server',
        command,
        version: output.trim().split(/\r?\n/).find(Boolean),
        ...(code === 0 ? {} : { detail: output.trim() || `Exited with code ${code}` })
      }));
    });
  }

  async models(): Promise<AgentModelOption[]> {
    await this.ensureStarted();
    const result = await this.request('model/list', { limit: 100 });
    return normalizeCodexModels(result);
  }

  async send(prompt: string, model?: string, toolPermissionPolicy: AgentToolPermissionPolicy = 'ask-writes'): Promise<AgentStartResult> {
    await this.ensureStarted();
    const requestedModel = model?.trim() || undefined;
    if (this.threadId && (this.threadModel !== requestedModel || this.threadPermissionPolicy !== toolPermissionPolicy)) {
      await this.newSession();
    }
    if (!this.threadId) {
      const result = await this.request('thread/start', {
        cwd: this.cwd(),
        approvalPolicy: toolPermissionPolicy === 'full-access' ? 'never' : toolPermissionPolicy === 'auto-safe' ? 'on-request' : 'untrusted',
        sandbox: toolPermissionPolicy === 'read-only' ? 'read-only' : toolPermissionPolicy === 'full-access' ? 'danger-full-access' : 'workspace-write',
        serviceName: 'starlims-devtools',
        developerInstructions: 'You are the coding agent inside STARLIMS DevTools. Use the required starlims MCP server for remote STARLIMS data and changes. Never claim a remote operation succeeded unless the MCP tool confirms it.',
        ...(requestedModel ? { model: requestedModel } : {})
      });
      this.threadId = result.thread.id;
      this.threadModel = requestedModel;
      this.threadPermissionPolicy = toolPermissionPolicy;
      this.emit({ provider: 'codex', type: 'session', sessionId: this.threadId, title: 'Codex App Server connected' });
    }
    const result = await this.request('turn/start', {
      threadId: this.threadId,
      input: [{ type: 'text', text: prompt }]
    });
    this.activeTurnId = result.turn.id;
    return { sessionId: this.threadId, turnId: this.activeTurnId };
  }

  async interrupt(): Promise<void> {
    if (!this.threadId || !this.activeTurnId) return;
    await this.request('turn/interrupt', { threadId: this.threadId, turnId: this.activeTurnId });
  }

  async newSession(): Promise<void> {
    await this.interrupt().catch(() => undefined);
    this.threadId = undefined;
    this.threadModel = undefined;
    this.threadPermissionPolicy = undefined;
    this.activeTurnId = undefined;
  }

  respond(requestId: string, decision: AgentApprovalDecision): void {
    const approval = this.approvals.get(requestId);
    if (!approval || !this.child) throw new Error('Approval request is no longer active.');
    this.approvals.delete(requestId);
    let result: JsonObject;
    if (approval.method === 'item/permissions/requestApproval') {
      result = {
        permissions: decision === 'accept' || decision === 'acceptForSession' ? approval.params.permissions : {},
        scope: decision === 'acceptForSession' ? 'session' : 'turn'
      };
    } else {
      result = { decision };
    }
    this.write({ id: approval.rpcId, result });
  }

  dispose(): void {
    this.stopping = true;
    const stopped = new Error('Codex App Server stopped for a runtime restart.');
    for (const request of this.pending.values()) request.reject(stopped);
    this.pending.clear();
    this.child?.kill();
    this.child = undefined;
    this.starting = undefined;
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && !this.child.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try { await this.starting; } finally { this.starting = undefined; }
  }

  private async start(): Promise<void> {
    this.stopping = false;
    const command = this.command();
    const args = [
      'app-server',
      '-c', `mcp_servers.starlims.url=${this.mcpUrl()}`,
      '-c', 'mcp_servers.starlims.required=true',
      ...externalCodexMcpArgs(this.externalMcpServers())
    ];
    const child = spawn(command, args, {
      shell: command.toLowerCase().endsWith('.cmd'),
      windowsHide: true,
      env: withLocalMcpNoProxy()
    });
    this.child = child;
    createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line));
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) this.emit({ provider: 'codex', type: 'status', text });
    });
    child.once('exit', (code, signal) => {
      const expectedStop = this.stopping;
      this.stopping = false;
      const error = new Error(`Codex App Server exited with code ${code}.`);
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
      this.child = undefined;
      if (!expectedStop) {
        const detail = signal ? ` (signal ${signal})` : '';
        this.emit({ provider: 'codex', type: 'error', text: `${error.message}${detail}` });
      }
    });
    child.once('error', (error) => {
      this.child = undefined;
      this.emit({ provider: 'codex', type: 'error', text: error.message });
    });
    await this.request('initialize', {
      clientInfo: { name: 'starlims_devtools', title: 'STARLIMS DevTools', version: this.getVersion() },
      capabilities: { experimentalApi: true }
    });
    this.write({ method: 'initialized', params: {} });
  }

  private request(method: string, params: JsonObject): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.write({ id, method, params }); }
      catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private write(message: JsonObject): void {
    if (!this.child?.stdin.writable) throw new Error('Codex App Server is not connected.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: JsonObject;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && !message.method) {
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message || stringify(message.error)));
      else request.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      this.handleServerRequest(message);
      return;
    }
    if (message.method) this.handleNotification(message.method, message.params || {});
  }

  private handleServerRequest(message: JsonObject): void {
    const method = String(message.method);
    const supported = [
      'item/commandExecution/requestApproval',
      'item/fileChange/requestApproval',
      'item/permissions/requestApproval'
    ];
    if (!supported.includes(method)) {
      this.write({ id: message.id, error: { code: -32601, message: `Unsupported client request: ${method}` } });
      return;
    }
    const requestId = `codex:${String(message.id)}:${randomUUID()}`;
    const params = message.params || {};
    const kind = method.includes('commandExecution') ? 'command' : method.includes('fileChange') ? 'file' : 'permissions';
    const detail = params.command || params.reason || params.cwd || stringify(params.permissions || {});
    this.approvals.set(requestId, { rpcId: message.id, method, params });
    this.emit({
      provider: 'codex', type: 'approval', requestId, kind,
      sessionId: params.threadId, turnId: params.turnId, itemId: params.itemId,
      title: params.reason || (kind === 'command' ? 'Allow command execution?' : kind === 'file' ? 'Allow file changes?' : 'Grant additional permissions?'),
      detail, canAcceptForSession: true
    });
  }

  private handleNotification(method: string, params: JsonObject): void {
    const base = { provider: 'codex' as const, sessionId: params.threadId, turnId: params.turnId };
    if (method === 'item/agentMessage/delta') {
      this.emit({ ...base, type: 'text-delta', itemId: params.itemId, text: params.delta });
      return;
    }
    if (method === 'item/commandExecution/outputDelta' || method === 'item/fileChange/outputDelta') {
      this.emit({ ...base, type: 'item-output', itemId: params.itemId, output: params.delta });
      return;
    }
    if (method === 'turn/diff/updated') {
      this.emit({ ...base, type: 'diff', itemId: `diff:${params.turnId}`, title: 'Working tree changes', diff: params.diff });
      return;
    }
    if (method === 'item/mcpToolCall/progress') {
      this.emit({ ...base, type: 'item-output', itemId: params.itemId, output: `${params.message}\n` });
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      this.emitItem(base, params.item || {}, method === 'item/completed');
      return;
    }
    if (method === 'turn/completed') {
      const turn = params.turn || {};
      this.activeTurnId = undefined;
      if (turn.status === 'failed') this.emit({ ...base, type: 'error', text: turn.error?.message || stringify(turn.error || 'Codex turn failed.') });
      else this.emit({ ...base, type: 'done', status: turn.status === 'interrupted' ? 'declined' : 'completed', text: turn.status });
      return;
    }
    if (method === 'error' || method === 'warning') {
      const retrying = method === 'error' && Boolean(params.willRetry || params.error?.willRetry || /reconnecting/i.test(String(params.message || params.error?.message || '')));
      const raw = params.message || params.error?.message || stringify(params);
      this.emit({ ...base, type: method === 'error' && !retrying ? 'error' : 'status', text: retrying ? `Codex connection was interrupted; ${raw}` : raw });
    }
  }

  private emitItem(base: Pick<AgentEvent, 'provider' | 'sessionId' | 'turnId'>, item: JsonObject, completed: boolean): void {
    const status = completed ? itemStatus(item.status || 'completed') : 'running';
    if (item.type === 'mcpToolCall') {
      this.emit({ ...base, type: 'item', itemId: item.id, kind: 'mcp', status, title: `${item.server}.${item.tool}`, detail: stringify(item.arguments), output: item.error?.message || (completed && item.result ? stringify(item.result.structuredContent ?? item.result.content) : undefined) });
    } else if (item.type === 'commandExecution') {
      this.emit({ ...base, type: 'item', itemId: item.id, kind: 'command', status, title: item.command, detail: item.cwd, output: item.aggregatedOutput || undefined });
    } else if (item.type === 'fileChange') {
      this.emit({ ...base, type: 'item', itemId: item.id, kind: 'file', status, title: `File changes (${item.changes?.length || 0})`, diff: stringify(item.changes || []) });
    } else if (item.type === 'reasoning' || item.type === 'plan') {
      this.emit({ ...base, type: 'item', itemId: item.id, kind: item.type, status, title: item.type === 'plan' ? 'Plan' : 'Reasoning', detail: item.text || stringify(item.summary || []) });
    }
  }
}

export class AgentRuntimeManager {
  readonly codex: CodexAppServerRuntime;

  constructor(options: { codexCommand: () => string; mcpUrl: () => string; externalMcpServers: () => ExternalMcpServers; cwd: () => string; getVersion: () => string; emit: Emit }) {
    this.codex = new CodexAppServerRuntime(options.codexCommand, options.mcpUrl, options.cwd, options.getVersion, options.emit, options.externalMcpServers);
  }

  async statuses(openCodeStatus: () => Promise<AgentRuntimeStatus>): Promise<Partial<Record<AgentProvider, AgentRuntimeStatus>>> {
    const [codex, opencode] = await Promise.all([this.codex.status(), openCodeStatus()]);
    return { codex, opencode };
  }

  models(provider: AgentProvider): Promise<AgentModelOption[]> {
    if (provider === 'codex') return this.codex.models();
    return Promise.resolve([]);
  }

  send(provider: AgentProvider, prompt: string, model?: string, toolPermissionPolicy: AgentToolPermissionPolicy = 'ask-writes'): Promise<AgentStartResult> {
    if (provider === 'codex') return this.codex.send(prompt, model, toolPermissionPolicy);
    throw new Error('This provider remains in CLI compatibility mode.');
  }

  async interrupt(provider: AgentProvider): Promise<void> {
    if (provider === 'codex') await this.codex.interrupt();
  }

  async newSession(provider: AgentProvider): Promise<void> {
    if (provider === 'codex') await this.codex.newSession();
  }

  respond(provider: AgentProvider, requestId: string, decision: AgentApprovalDecision): void {
    if (provider === 'codex') this.codex.respond(requestId, decision);
  }

  dispose(): void { this.codex.dispose(); }
}
