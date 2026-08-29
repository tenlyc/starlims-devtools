import { contextBridge, ipcRenderer } from 'electron';
import type { AgentApprovalDecision, AgentEvent, AgentFileAttachment, AgentModelOption, AgentProvider, AgentRuntimeStatus, AgentStartResult, AgentToolPermissionPolicy, ExternalMcpServers, GenericAgentConfig } from '../src/types/agent';
import type { DiagnosticLogEvent } from '../src/types/diagnosticLog';

// Type definitions for exposed API
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

  // Shell
  shellOpenExternal: (url: string) => Promise<void>;

  // Open URL in system browser
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

  // Git
  gitIsAvailable: () => Promise<boolean>;
  gitIsRepository: (workspacePath: string) => Promise<boolean>;
  gitGetBranch: (workspacePath: string) => Promise<string>;
  gitHasChanges: (workspacePath: string) => Promise<boolean>;

  // CLI
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

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // STARLIMS MCP bridge
  mcpGetStatus: () => ipcRenderer.invoke('mcp:getStatus'),
  onMcpRequest: (callback: (request: { id: string; tool: string; arguments: Record<string, unknown> }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: { id: string; tool: string; arguments: Record<string, unknown> }) => callback(request);
    ipcRenderer.on('mcp:request', listener);
    return () => ipcRenderer.removeListener('mcp:request', listener);
  },
  respondToMcpRequest: (response: { id: string; result?: unknown; error?: string }) => ipcRenderer.send('mcp:response', response),
  onDiagnosticLog: (callback: (event: DiagnosticLogEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, logEvent: DiagnosticLogEvent) => callback(logEvent);
    ipcRenderer.on('devtools:log', listener);
    return () => ipcRenderer.removeListener('devtools:log', listener);
  },

  // Dialog
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('dialog:showOpenDialog', options),
  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:showSaveDialog', options),
  showMessageBox: (options: Electron.MessageBoxOptions) =>
    ipcRenderer.invoke('dialog:showMessageBox', options),

  // Store
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
  storeDelete: (key: string) => ipcRenderer.invoke('store:delete', key),

  // Secrets
  secretsGet: (key: string) => ipcRenderer.invoke('secrets:get', key),
  secretsSet: (key: string, value: string) => ipcRenderer.invoke('secrets:set', key, value),
  secretsDelete: (key: string) => ipcRenderer.invoke('secrets:delete', key),

  // Window
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),

  // Shell
  shellOpenExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Open URL in system browser
  openSystemBrowser: (url: string) => ipcRenderer.invoke('window:openSystemBrowser', url),

  // Window
  openDebugWindow: (options: { url: string; title?: string; width?: number; height?: number }) =>
    ipcRenderer.invoke('window:openDebugWindow', options),

  // App
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getAppPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
  getResourcePath: () => ipcRenderer.invoke('app:getResourcePath'),

  // HTTP Request (proxy to avoid CORS)
  httpRequest: (options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    bodyBase64?: string;
    binary?: boolean;
  }) => ipcRenderer.invoke('http:request', options),

  // Menu events
  onMenuEvent: (callback: (event: string) => void) => {
    const events = [
      'menu:newFile', 'menu:openFile', 'menu:save',
      'menu:toggleSidebar', 'menu:toggleMCPPanel',
      'menu:connect', 'menu:disconnect',
      'menu:refresh', 'menu:runScript',
      'menu:checkOut', 'menu:checkIn',
      'menu:openSCMPackage'
    ];

    events.forEach(event => {
      ipcRenderer.on(event, () => callback(event));
    });
  },
  removeMenuListener: () => {
    ipcRenderer.removeAllListeners('menu:*');
  },

  // Git
  gitIsAvailable: () => ipcRenderer.invoke('git:isAvailable'),
  gitIsRepository: (workspacePath: string) => ipcRenderer.invoke('git:isRepository', workspacePath),
  gitGetBranch: (workspacePath: string) => ipcRenderer.invoke('git:getBranch', workspacePath),
  gitHasChanges: (workspacePath: string) => ipcRenderer.invoke('git:hasChanges', workspacePath),

  // CLI
  cliCheckClaude: () => ipcRenderer.invoke('cli:checkClaude'),
  cliCheckOpenCode: () => ipcRenderer.invoke('cli:checkOpenCode'),
  cliExecuteClaude: (prompt: string) => ipcRenderer.invoke('cli:executeClaude', prompt),
  cliExecuteOpenCode: (prompt: string) => ipcRenderer.invoke('cli:executeOpenCode', prompt),
  cliGetStatuses: () => ipcRenderer.invoke('cli:getStatuses'),
  cliExecute: (provider: 'codex' | 'claude' | 'opencode', prompt: string) => ipcRenderer.invoke('cli:execute', provider, prompt),

  // Rich agent runtimes
  agentGetStatuses: () => ipcRenderer.invoke('agent:getStatuses'),
  agentGetModels: (provider: AgentProvider) => ipcRenderer.invoke('agent:getModels', provider),
  agentSelectFiles: () => ipcRenderer.invoke('agent:selectFiles'),
  agentGetExternalMcpServers: () => ipcRenderer.invoke('agent:getExternalMcpServers'),
  agentSetExternalMcpServers: (servers: ExternalMcpServers) => ipcRenderer.invoke('agent:setExternalMcpServers', servers),
  agentStart: (provider: AgentProvider, prompt: string, model?: string, toolPermissionPolicy?: AgentToolPermissionPolicy) => ipcRenderer.invoke('agent:start', provider, prompt, model, toolPermissionPolicy),
  agentInterrupt: (provider: AgentProvider) => ipcRenderer.invoke('agent:interrupt', provider),
  agentNewSession: (provider: AgentProvider) => ipcRenderer.invoke('agent:newSession', provider),
  agentRespondApproval: (provider: AgentProvider, requestId: string, decision: AgentApprovalDecision) => ipcRenderer.invoke('agent:respondApproval', provider, requestId, decision),
  onAgentEvent: (callback: (event: AgentEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, agentEvent: AgentEvent) => callback(agentEvent);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
  genericAgentListModels: (config: Pick<GenericAgentConfig, 'baseUrl' | 'apiKey'>) => ipcRenderer.invoke('generic-agent:listModels', config),
  genericAgentStart: (config: GenericAgentConfig, prompt: string) => ipcRenderer.invoke('generic-agent:start', config, prompt),
  genericAgentInterrupt: () => ipcRenderer.invoke('generic-agent:interrupt'),
  genericAgentNewSession: () => ipcRenderer.invoke('generic-agent:newSession')
} as ElectronAPI);

// TypeScript declaration for window object
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
