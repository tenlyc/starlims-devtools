export type AgentProvider = 'codex' | 'claude' | 'opencode';

export type AgentRuntimeStatus = {
  available: boolean;
  runtime: 'app-server' | 'agent-sdk' | 'cli';
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
