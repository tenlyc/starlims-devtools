export type AgentProvider = 'codex' | 'claude' | 'opencode' | 'generic';

export type AgentRuntimeStatus = {
  available: boolean;
  runtime: 'app-server' | 'agent-sdk' | 'cli' | 'api';
  version?: string;
  command?: string;
  detail?: string;
};

export type AgentItemKind = 'mcp' | 'command' | 'file' | 'reasoning' | 'plan' | 'other';
export type AgentItemStatus = 'running' | 'completed' | 'failed' | 'declined';

export type AgentEvent = {
  provider: AgentProvider;
  type: 'session' | 'status' | 'text-delta' | 'item' | 'item-output' | 'diff' | 'approval' | 'done' | 'error';
  sessionId?: string;
  turnId?: string;
  itemId?: string;
  requestId?: string;
  kind?: AgentItemKind | 'command' | 'file' | 'permissions';
  status?: AgentItemStatus;
  title?: string;
  text?: string;
  detail?: string;
  output?: string;
  diff?: string;
  canAcceptForSession?: boolean;
};

export type AgentStartResult = { sessionId?: string; turnId?: string };
export type AgentApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';
export type AgentToolPermissionPolicy = 'read-only' | 'ask-writes' | 'full-access';

export type AgentModelOption = {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
};

export type AgentFileAttachment = {
  id: string;
  name: string;
  path: string;
  content: string;
  size: number;
};

export type GenericAgentConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  models?: string[];
  maxToolRounds?: number;
  toolPermissionPolicy?: AgentToolPermissionPolicy;
};

export type ExternalMcpServerConfig = {
  enabled?: boolean;
  transport?: 'http' | 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
};

export type ExternalMcpServers = Record<string, ExternalMcpServerConfig>;
