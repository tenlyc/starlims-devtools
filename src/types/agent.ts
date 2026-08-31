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

export type AgentFileChange = {
  path: string;
  kind: 'add' | 'update' | 'delete' | 'move';
  diff: string;
  oldPath?: string;
  origin?: 'workspace' | 'remote';
  uri?: string;
  language?: string;
};

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
  files?: AgentFileChange[];
  canAcceptForSession?: boolean;
};

export type AgentStartResult = { sessionId?: string; turnId?: string };
export type AgentApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';
export type AgentToolPermissionPolicy = 'read-only' | 'ask-writes' | 'auto-safe' | 'full-access';

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

export type AgentWorkspaceContext = {
  serverName: string;
  serverUrl: string;
  user: string;
  rootPath?: string;
};

export type AgentWorkspaceFile = {
  uri: string;
  name: string;
  type: string;
  language?: string;
  checkedOutBy?: string;
  checkedOutDate?: string;
  content: string;
};

export type AgentWorkspaceInfo = {
  path: string;
  serverName: string;
  user: string;
};

export type AgentWorkspaceSyncResult = {
  path: string;
  files: number;
  preservedChanges: number;
};

export type AgentWorkspaceChange = Omit<AgentWorkspaceFile, 'content'> & {
  relativePath: string;
  kind: 'modified' | 'deleted';
  before: string;
  after: string;
  baselineHash: string;
  proposedHash: string;
  fingerprint: string;
};

export type AgentDependencyKind = 'include' | 'server-script' | 'data-source' | 'form';

export type AgentDependencyNode = Omit<AgentWorkspaceFile, 'content' | 'checkedOutDate'> & {
  id: string;
  relativePath?: string;
};

export type AgentDependencyEdge = {
  id: string;
  sourceId: string;
  targetId?: string;
  reference: string;
  kind: AgentDependencyKind;
  line: number;
  ambiguousTargetIds?: string[];
};

export type AgentDependencyIndex = {
  version: 1;
  generatedAt: string;
  nodes: AgentDependencyNode[];
  edges: AgentDependencyEdge[];
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
