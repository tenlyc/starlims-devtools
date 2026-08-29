/**
 * Type declarations for Electron API exposed via preload
 */
import type { AgentApprovalDecision, AgentEvent, AgentFileAttachment, AgentModelOption, AgentProvider, AgentRuntimeStatus, AgentStartResult, AgentToolPermissionPolicy, ExternalMcpServers, GenericAgentConfig } from './agent';
import type { DiagnosticLogEvent } from './diagnosticLog';

export interface ElectronAPI {
  // STARLIMS MCP bridge
  mcpGetStatus: () => Promise<{ enabled: boolean; running: boolean; host: string; port: number; url: string; error?: string }>;
  onMcpRequest: (callback: (request: { id: string; tool: string; arguments: Record<string, unknown> }) => void) => () => void;
  respondToMcpRequest: (response: { id: string; result?: unknown; error?: string }) => void;
  onDiagnosticLog: (callback: (event: DiagnosticLogEvent) => void) => () => void;

  // Dialog
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
  showMessageBox: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;

  // Store
  storeGet: (key: string) => Promise<any>;
  storeSet: (key: string, value: any) => Promise<boolean>;
  storeDelete: (key: string) => Promise<boolean>;

  // Secrets
  secretsGet: (key: string) => Promise<string | null>;
  secretsSet: (key: string, value: string) => Promise<boolean>;
  secretsDelete: (key: string) => Promise<boolean>;

  // Window
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  openDebugWindow: (options: {
    url: string;
    title?: string;
    width?: number;
    height?: number;
  }) => Promise<{ success: boolean }>;

  // Shell
  shellOpenExternal: (url: string) => Promise<void>;
  openSystemBrowser: (url: string) => Promise<{ success: boolean; error?: string }>;

  // App
  getAppVersion: () => Promise<string>;
  getAppPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents') => Promise<string>;
  getResourcePath: () => Promise<string>;

  // HTTP Request (proxy to avoid CORS)
  httpRequest: (options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    bodyBase64?: string;
    binary?: boolean;
  }) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: string; // base64 when binary=true
  }>;

  // Menu events
  onMenuEvent: (callback: (event: string) => void) => void;
  removeMenuListener: () => void;

  // CLI (for AI code generation)
  cliCheckClaude: () => Promise<boolean>;
  cliCheckOpenCode: () => Promise<boolean>;
  cliExecuteClaude: (prompt: string) => Promise<string>;
  cliExecuteOpenCode: (prompt: string) => Promise<string>;
  cliGetStatuses: () => Promise<Record<'codex' | 'claude' | 'opencode', { available: boolean; version?: string; command?: string }>>;
  cliExecute: (provider: 'codex' | 'claude' | 'opencode', prompt: string) => Promise<string>;

  // Rich agent runtimes
  agentGetStatuses: () => Promise<Partial<Record<AgentProvider, AgentRuntimeStatus>>>;
  agentGetModels: (provider: AgentProvider) => Promise<AgentModelOption[]>;
  agentSelectFiles: () => Promise<AgentFileAttachment[]>;
  agentGetExternalMcpServers: () => Promise<ExternalMcpServers>;
  agentSetExternalMcpServers: (servers: ExternalMcpServers) => Promise<boolean>;
  agentStart: (provider: AgentProvider, prompt: string, model?: string, toolPermissionPolicy?: AgentToolPermissionPolicy) => Promise<AgentStartResult>;
  agentInterrupt: (provider: AgentProvider) => Promise<void>;
  agentNewSession: (provider: AgentProvider) => Promise<void>;
  agentRespondApproval: (provider: AgentProvider, requestId: string, decision: AgentApprovalDecision) => Promise<boolean>;
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void;
  genericAgentListModels: (config: Pick<GenericAgentConfig, 'baseUrl' | 'apiKey'>) => Promise<string[]>;
  genericAgentStart: (config: GenericAgentConfig, prompt: string) => Promise<AgentStartResult>;
  genericAgentInterrupt: () => Promise<void>;
  genericAgentNewSession: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
