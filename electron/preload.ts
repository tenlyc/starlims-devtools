import { contextBridge, ipcRenderer } from 'electron';
import type { AgentApprovalDecision, AgentEvent, AgentFileAttachment, AgentModelOption, AgentProvider, AgentRuntimeStatus, AgentStartResult, AgentToolPermissionPolicy, AgentWorkspaceChange, AgentWorkspaceContext, AgentWorkspaceFile, AgentWorkspaceInfo, AgentWorkspaceSyncResult, ExternalMcpServers, GenericAgentConfig } from '../src/types/agent';
import type { DiagnosticLogEvent } from '../src/types/diagnosticLog';
import type { QualityTestRunResult } from '../src/types/aiPlatform';
import type { NativeLspLocation, NativeLspPosition, NativeLspSessionStatus, NativeLspUpstreamMetadata, NativeLspVersionInfo, NativeLspWorkspaceDocument, NativeLspWorkspaceEdit, NativeLspWorkspaceSymbol, NativeSslFormatResult, NativeSslInventory, NativeSslValidationResult } from '../src/types/sslLsp';

// Type definitions for exposed API
export interface ElectronAPI {
  // STARLIMS MCP bridge
  mcpGetStatus: () => Promise<{ enabled: boolean; running: boolean; host: string; port: number; url: string; error?: string }>;
  onMcpRequest: (callback: (request: { id: string; tool: string; arguments: Record<string, unknown> }) => void) => () => void;
  respondToMcpRequest: (response: { id: string; result?: unknown; error?: string }) => void;
  onDiagnosticLog: (callback: (event: DiagnosticLogEvent) => void) => () => void;
  sslLspStatus: () => Promise<{ available: boolean; version: string }>;
  sslLspValidate: (content: string, options?: { dataSource?: boolean; info?: boolean; hungarianTypes?: boolean }) => Promise<NativeSslValidationResult>;
  sslLspFormat: (content: string) => Promise<NativeSslFormatResult>;
  sslLspInventory: () => Promise<NativeSslInventory | null>;
  sslLspSessionStatus: () => Promise<NativeLspSessionStatus>;
  sslLspSessionRestart: () => Promise<NativeLspSessionStatus>;
  sslLspVersions: () => Promise<NativeLspVersionInfo[]>;
  sslLspUpstreamMetadata: () => Promise<NativeLspUpstreamMetadata>;
  sslLspSelectVersion: (version: string) => Promise<{ versions: NativeLspVersionInfo[]; status: NativeLspSessionStatus }>;
  sslLspWorkspaceDocuments: () => Promise<NativeLspWorkspaceDocument[]>;
  sslLspWorkspaceDocument: (uri: string) => Promise<(NativeLspWorkspaceDocument & { content: string }) | null>;
  sslLspDocumentSync: (document: { uri: string; content: string; version: number }) => Promise<boolean>;
  sslLspDocumentClose: (uri: string) => Promise<boolean>;
  sslLspDefinition: (uri: string, position: NativeLspPosition) => Promise<NativeLspLocation[]>;
  sslLspReferences: (uri: string, position: NativeLspPosition) => Promise<NativeLspLocation[]>;
  sslLspRename: (uri: string, position: NativeLspPosition, newName: string) => Promise<NativeLspWorkspaceEdit | null>;
  sslLspWorkspaceSymbols: (query: string) => Promise<NativeLspWorkspaceSymbol[]>;

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
  aiConfigImport: () => Promise<{ filePath: string; value: unknown } | null>;
  aiConfigExport: (suggestedName: string, value: unknown) => Promise<string | null>;
  agentWorkspaceConfigure: (context: AgentWorkspaceContext) => Promise<AgentWorkspaceInfo>;
  agentWorkspaceSyncFiles: (files: AgentWorkspaceFile[]) => Promise<AgentWorkspaceSyncResult>;
  agentWorkspaceGetChanges: () => Promise<AgentWorkspaceChange[]>;
  agentWorkspaceAcceptChanges: (files: Array<Pick<AgentWorkspaceFile, 'uri' | 'language'> & { fingerprint?: string }>) => Promise<number>;
  agentRunQualityTest: (command: string) => Promise<(QualityTestRunResult & { cancelled?: boolean })>;
  agentStart: (provider: AgentProvider, prompt: string, model?: string, toolPermissionPolicy?: AgentToolPermissionPolicy) => Promise<AgentStartResult>;
  agentInterrupt: (provider: AgentProvider) => Promise<void>;
  agentNewSession: (provider: AgentProvider) => Promise<void>;
  agentRespondApproval: (provider: AgentProvider, requestId: string, decision: AgentApprovalDecision) => Promise<boolean>;
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void;
  genericAgentListModels: (config: Pick<GenericAgentConfig, 'baseUrl' | 'apiKey'>) => Promise<string[]>;
  genericAgentComplete: (config: GenericAgentConfig, prompt: string) => Promise<string>;
  genericAgentTask: (config: GenericAgentConfig, system: string, prompt: string) => Promise<string>;
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
  sslLspStatus: () => ipcRenderer.invoke('ssl-lsp:status'),
  sslLspValidate: (content: string, options?: { dataSource?: boolean; info?: boolean; hungarianTypes?: boolean }) => ipcRenderer.invoke('ssl-lsp:validate', content, options),
  sslLspFormat: (content: string) => ipcRenderer.invoke('ssl-lsp:format', content),
  sslLspInventory: () => ipcRenderer.invoke('ssl-lsp:inventory'),
  sslLspSessionStatus: () => ipcRenderer.invoke('ssl-lsp:sessionStatus'),
  sslLspSessionRestart: () => ipcRenderer.invoke('ssl-lsp:sessionRestart'),
  sslLspVersions: () => ipcRenderer.invoke('ssl-lsp:versions'),
  sslLspUpstreamMetadata: () => ipcRenderer.invoke('ssl-lsp:upstreamMetadata'),
  sslLspSelectVersion: (version: string) => ipcRenderer.invoke('ssl-lsp:selectVersion', version),
  sslLspWorkspaceDocuments: () => ipcRenderer.invoke('ssl-lsp:workspaceDocuments'),
  sslLspWorkspaceDocument: (uri: string) => ipcRenderer.invoke('ssl-lsp:workspaceDocument', uri),
  sslLspDocumentSync: (document: { uri: string; content: string; version: number }) => ipcRenderer.invoke('ssl-lsp:documentSync', document),
  sslLspDocumentClose: (uri: string) => ipcRenderer.invoke('ssl-lsp:documentClose', uri),
  sslLspDefinition: (uri: string, position: NativeLspPosition) => ipcRenderer.invoke('ssl-lsp:definition', uri, position),
  sslLspReferences: (uri: string, position: NativeLspPosition) => ipcRenderer.invoke('ssl-lsp:references', uri, position),
  sslLspRename: (uri: string, position: NativeLspPosition, newName: string) => ipcRenderer.invoke('ssl-lsp:rename', uri, position, newName),
  sslLspWorkspaceSymbols: (query: string) => ipcRenderer.invoke('ssl-lsp:workspaceSymbols', query),

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
  aiConfigImport: () => ipcRenderer.invoke('ai-config:import'),
  aiConfigExport: (suggestedName: string, value: unknown) => ipcRenderer.invoke('ai-config:export', suggestedName, value),
  agentWorkspaceConfigure: (context: AgentWorkspaceContext) => ipcRenderer.invoke('agent:workspaceConfigure', context),
  agentWorkspaceSyncFiles: (files: AgentWorkspaceFile[]) => ipcRenderer.invoke('agent:workspaceSyncFiles', files),
  agentWorkspaceGetChanges: () => ipcRenderer.invoke('agent:workspaceGetChanges'),
  agentWorkspaceAcceptChanges: (files: Array<Pick<AgentWorkspaceFile, 'uri' | 'language'> & { fingerprint?: string }>) => ipcRenderer.invoke('agent:workspaceAcceptChanges', files),
  agentRunQualityTest: (command: string) => ipcRenderer.invoke('agent:runQualityTest', command),
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
  genericAgentComplete: (config: GenericAgentConfig, prompt: string) => ipcRenderer.invoke('generic-agent:complete', config, prompt),
  genericAgentTask: (config: GenericAgentConfig, system: string, prompt: string) => ipcRenderer.invoke('generic-agent:task', config, system, prompt),
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
