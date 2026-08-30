import { net } from 'electron';
import { randomUUID } from 'crypto';
import { getProfileTools } from '@tenlyc/starlims-mcp';
import * as z from 'zod/v4';
import type { AgentApprovalDecision, AgentEvent, AgentStartResult, AgentToolPermissionPolicy, GenericAgentConfig } from '../src/types/agent';
import type { RendererToolCall } from './mcpServer';
import type { ExternalMcpManager } from './externalMcpManager';

type Emit = (event: AgentEvent) => void;
type ChatMessage = Record<string, unknown>;
const DEFAULT_MAX_TOOL_ROUNDS = 16;
const MAX_TOOL_ROUNDS_LIMIT = 64;

function approvalDetail(args: Record<string, unknown>): string {
  const safe = Object.fromEntries(Object.entries(args).map(([key, value]) => {
    if (/password|pass|token|cookie|secret|key|code|body/i.test(key)) return [key, '[hidden]'];
    if (typeof value === 'string' && value.length > 1000) return [key, `${value.slice(0, 1000)}…`];
    return [key, value];
  }));
  return JSON.stringify(safe, null, 2);
}

function resolveMaxToolRounds(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_TOOL_ROUNDS;
  return Math.min(MAX_TOOL_ROUNDS_LIMIT, Math.max(1, Math.floor(Number(value))));
}

type GenericBuiltinTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly: boolean;
};

const BUILTIN_TOOLS: GenericBuiltinTool[] = getProfileTools('devtools').map((tool) => {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
  return {
    name: tool.id,
    description: tool.description,
    parameters,
    readOnly: tool.risk === 'read'
  };
});

export function genericBuiltinToolsForPolicy(policy: AgentToolPermissionPolicy): GenericBuiltinTool[] {
  return BUILTIN_TOOLS.filter((tool) => policy !== 'read-only' || tool.readOnly);
}

export const GENERIC_AGENT_SYSTEM_PROMPT = [
  'You are an AI coding agent inside STARLIMS DevTools. Use the available STARLIMS tools for authoritative remote data and changes.',
  'For a remote edit: resolve and read the item, check it out when needed, save the complete updated code with the same language, then read it again to verify the saved result.',
  'Never check in or undo checkout unless the user explicitly requests it. Never claim a remote change succeeded unless the corresponding tool confirms it.',
  'If a write tool is unavailable, explain that the current conversation mode is read-only instead of pretending to edit. Answer in the user\'s language.'
].join(' ');

function endpoint(baseUrl: string, suffix: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return suffix === 'chat/completions' ? base : base.replace(/\/chat\/completions$/i, `/${suffix}`);
  return `${base}/${suffix}`;
}

async function jsonRequest(url: string, apiKey: string, init: RequestInit = {}): Promise<any> {
  const response = await net.fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...(init.headers || {}) }
  });
  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${response.status} ${response.statusText}`);
  return data;
}

async function streamChatRequest(url: string, apiKey: string, body: Record<string, unknown>, onText: (text: string) => void, signal: AbortSignal): Promise<any> {
  const response = await net.fetch(url, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ ...body, stream: true })
  });
  if (!response.ok) {
    const text = await response.text();
    try { throw new Error(JSON.parse(text)?.error?.message || text || `HTTP ${response.status}`); }
    catch (error) { if (error instanceof SyntaxError) throw new Error(text || `HTTP ${response.status}`); throw error; }
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = await response.json() as any;
    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error('The provider returned no assistant message.');
    if (typeof message.content === 'string') onText(message.content);
    return message;
  }
  if (!response.body) throw new Error('The provider returned an empty response stream.');
  const message: any = { role: 'assistant', content: '', tool_calls: [] };
  const toolCalls = new Map<number, any>();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  const consume = (payload: string) => {
    if (!payload || payload === '[DONE]') return;
    const event = JSON.parse(payload);
    const delta = event?.choices?.[0]?.delta || {};
    if (typeof delta.content === 'string') {
      message.content += delta.content;
      onText(delta.content);
    }
    for (const part of delta.tool_calls || []) {
      const index = Number(part.index || 0);
      const current = toolCalls.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (part.id) current.id = part.id;
      if (part.type) current.type = part.type;
      if (part.function?.name) current.function.name += part.function.name;
      if (part.function?.arguments) current.function.arguments += part.function.arguments;
      toolCalls.set(index, current);
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) if (line.startsWith('data:')) consume(line.slice(5).trim());
    if (done) break;
  }
  if (buffer.startsWith('data:')) consume(buffer.slice(5).trim());
  message.tool_calls = [...toolCalls.entries()].sort(([left], [right]) => left - right).map(([, call]) => call);
  if (message.tool_calls.length === 0) delete message.tool_calls;
  return message;
}

export class GenericAgentRuntime {
  private controller?: AbortController;
  private sessionId?: string;
  private readonly approvals = new Map<string, { name: string; resolve: (allowed: boolean) => void }>();
  private readonly sessionAllowedTools = new Set<string>();

  constructor(private readonly callRenderer: RendererToolCall, private readonly externalMcp: ExternalMcpManager, private readonly emit: Emit) {}

  private requestToolApproval(name: string, args: Record<string, unknown>, turnId: string, itemId: string): Promise<boolean> {
    if (this.sessionAllowedTools.has(name)) return Promise.resolve(true);
    const requestId = `generic:${randomUUID()}`;
    return new Promise<boolean>((resolve) => {
      this.approvals.set(requestId, { name, resolve });
      this.emit({
        provider: 'generic', type: 'approval', requestId, kind: 'permissions',
        sessionId: this.sessionId, turnId, itemId,
        title: `Allow MCP tool “${name}”?`, detail: approvalDetail(args), canAcceptForSession: true
      });
    });
  }

  respond(requestId: string, decision: AgentApprovalDecision): void {
    const approval = this.approvals.get(requestId);
    if (!approval) throw new Error('Approval request is no longer active.');
    this.approvals.delete(requestId);
    if (decision === 'acceptForSession') this.sessionAllowedTools.add(approval.name);
    approval.resolve(decision === 'accept' || decision === 'acceptForSession');
  }

  async listModels(config: Pick<GenericAgentConfig, 'baseUrl' | 'apiKey'>): Promise<string[]> {
    const data = await jsonRequest(endpoint(config.baseUrl, 'models'), config.apiKey);
    return (Array.isArray(data?.data) ? data.data : []).map((item: any) => String(item.id || '')).filter(Boolean);
  }

  async complete(config: GenericAgentConfig, prompt: string): Promise<string> {
    const data = await jsonRequest(endpoint(config.baseUrl, 'chat/completions'), config.apiKey, {
      method: 'POST',
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: 'You provide concise STARLIMS code completions. Return only code to insert, without Markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.2,
        stream: false
      })
    });
    return String(data?.choices?.[0]?.message?.content || '').trim();
  }

  async task(config: GenericAgentConfig, system: string, prompt: string): Promise<string> {
    const data = await jsonRequest(endpoint(config.baseUrl, 'chat/completions'), config.apiKey, {
      method: 'POST',
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        max_tokens: 3000,
        temperature: 0.2,
        stream: false
      })
    });
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('The provider returned no workflow result.');
    return content.trim();
  }

  async send(config: GenericAgentConfig, prompt: string): Promise<AgentStartResult> {
    if (this.controller) throw new Error('Generic Agent is already processing a turn.');
    this.sessionId ||= randomUUID();
    const turnId = randomUUID();
    const controller = new AbortController();
    this.controller = controller;
    this.emit({ provider: 'generic', type: 'session', sessionId: this.sessionId, title: 'OpenAI-compatible Agent connected' });

    const policy: AgentToolPermissionPolicy = config.toolPermissionPolicy || 'ask-writes';
    const messages: ChatMessage[] = [
      { role: 'system', content: GENERIC_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ];
    const externalTools = (await this.externalMcp.listTools()).filter((tool) => policy !== 'read-only' || tool.readOnly);
    const tools = [
      ...genericBuiltinToolsForPolicy(policy).map(({ name, description, parameters }) => ({ type: 'function', function: { name, description, parameters } })),
      ...externalTools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }))
    ];
    const maxToolRounds = resolveMaxToolRounds(config.maxToolRounds);

    void (async () => {
      try {
        for (let round = 0; round < maxToolRounds; round += 1) {
          const message = await streamChatRequest(
            endpoint(config.baseUrl, 'chat/completions'), config.apiKey,
            { model: config.model, messages, tools, tool_choice: 'auto' },
            (text) => this.emit({ provider: 'generic', type: 'text-delta', sessionId: this.sessionId, turnId, itemId: `generic:${turnId}`, text }),
            controller.signal
          );
          if (!message) throw new Error('The provider returned no assistant message.');
          messages.push(message);
          const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
          if (calls.length === 0) {
            this.emit({ provider: 'generic', type: 'done', sessionId: this.sessionId, turnId, status: 'completed' });
            return;
          }
          for (const call of calls) {
            const name = String(call?.function?.name || 'unknown_tool');
            const itemId = String(call.id || randomUUID());
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(call?.function?.arguments || '{}'); } catch { throw new Error(`Invalid tool arguments for ${name}.`); }
            this.emit({ provider: 'generic', type: 'item', sessionId: this.sessionId, turnId, itemId, kind: 'mcp', status: 'running', title: `starlims.${name}`, detail: JSON.stringify(args, null, 2) });
            let output: unknown;
            try {
              if (this.externalMcp.hasTool(name)) {
                const readOnly = this.externalMcp.isToolReadOnly(name);
                if (!readOnly && policy === 'read-only') throw new Error(`Tool '${name}' is blocked by read-only mode.`);
                const needsApproval = !readOnly && policy !== 'full-access';
                if (needsApproval && !await this.requestToolApproval(name, args, turnId, itemId)) throw new Error(`Tool '${name}' was declined by the user.`);
                output = await this.externalMcp.callTool(name, args);
              } else {
                output = await this.callRenderer(name, args);
              }
              this.emit({ provider: 'generic', type: 'item', sessionId: this.sessionId, turnId, itemId, kind: 'mcp', status: 'completed', title: `starlims.${name}`, output: JSON.stringify(output, null, 2) });
            } catch (error) {
              output = { error: error instanceof Error ? error.message : String(error) };
              this.emit({ provider: 'generic', type: 'item', sessionId: this.sessionId, turnId, itemId, kind: 'mcp', status: 'failed', title: `starlims.${name}`, output: JSON.stringify(output) });
            }
            messages.push({ role: 'tool', tool_call_id: itemId, content: JSON.stringify(output) });
          }
        }
        throw new Error(`Generic Agent reached the configured limit of ${maxToolRounds} tool rounds. Increase “Maximum tool rounds” in Generic Agent settings, or narrow the request to reduce repeated tool calls.`);
      } catch (error) {
        if (controller.signal.aborted) this.emit({ provider: 'generic', type: 'done', sessionId: this.sessionId, turnId, status: 'declined', text: 'cancelled' });
        else this.emit({ provider: 'generic', type: 'error', sessionId: this.sessionId, turnId, text: error instanceof Error ? error.message : String(error) });
      } finally {
        if (this.controller === controller) this.controller = undefined;
      }
    })();
    return { sessionId: this.sessionId, turnId };
  }

  interrupt(): void { this.controller?.abort(); }
  newSession(): void { this.interrupt(); this.sessionId = undefined; this.sessionAllowedTools.clear(); }
}
