/**
 * Type declarations for Electron API exposed via preload
 */
import type { AgentApprovalDecision, AgentEvent, AgentFileAttachment, AgentImageAttachment, AgentModelOption, AgentProvider, AgentRuntimeStatus, AgentStartResult, AgentToolPermissionPolicy, AgentWorkspaceChange, AgentWorkspaceContext, AgentWorkspaceFile, AgentWorkspaceInfo, AgentWorkspaceSyncResult, ExternalMcpServers, GenericAgentConfig } from './agent';
import type { DiagnosticLogEvent } from './diagnosticLog';
import type { QualityTestRunResult } from './aiPlatform';
import type { NativeLspLocation, NativeLspPosition, NativeLspReleaseInfo, NativeLspSessionStatus, NativeLspUpstreamMetadata, NativeLspVersionInfo, NativeLspWorkspaceDocument, NativeLspWorkspaceEdit, NativeLspWorkspaceSymbol, NativeSslFormatResult, NativeSslInventory, NativeSslValidationResult } from './sslLsp';
import type { SharedMcpDetails } from './sharedMcp';

export interface ElectronAPI {
  // STARLIMS MCP bridge
  mcpGetStatus: () => Promise<{ enabled: boolean; running: boolean; host: string; port: number; url: string; error?: string }>;
  mcpGetDetails: () => Promise<SharedMcpDetails>;
  mcpCheckForUpdates: () => Promise<SharedMcpDetails>;
  mcpInstallLatest: () => Promise<SharedMcpDetails>;
  mcpSelectVersion: (version: string) => Promise<SharedMcpDetails>;
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
  sslLspCheckForUpdates: () => Promise<NativeLspReleaseInfo>;
  sslLspInstallLatest: () => Promise<{ versions: NativeLspVersionInfo[]; status: NativeLspSessionStatus; release?: NativeLspReleaseInfo }>;
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
  themeSet: (theme: 'dark' | 'light' | 'system') => Promise<boolean>;

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
  formPreviewSaveScreenshot: (dataUrl: string, suggestedName?: string) => Promise<string>;
  formPreviewConfigureSession: (webContentsId: number, options: { serverOrigin: string; aspnetSessionId?: string; starlimsSessionId?: string; langid?: string; user?: string; password?: string; runtimeAuthentication?: boolean }) => Promise<boolean>;
  formPreviewClick: (webContentsId: number, x: number, y: number) => Promise<boolean>;

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
  agentSaveImage: (dataUrl: string, suggestedName?: string) => Promise<AgentImageAttachment>;
  agentGetExternalMcpServers: () => Promise<ExternalMcpServers>;
  agentSetExternalMcpServers: (servers: ExternalMcpServers) => Promise<boolean>;
  aiConfigImport: () => Promise<{ filePath: string; value: unknown } | null>;
  aiConfigExport: (suggestedName: string, value: unknown) => Promise<string | null>;
  agentWorkspaceConfigure: (context: AgentWorkspaceContext) => Promise<AgentWorkspaceInfo>;
  agentWorkspaceSyncFiles: (files: AgentWorkspaceFile[], options?: { replace?: boolean }) => Promise<AgentWorkspaceSyncResult>;
  agentWorkspaceGetChanges: () => Promise<AgentWorkspaceChange[]>;
  agentWorkspaceAcceptChanges: (files: Array<Pick<AgentWorkspaceFile, 'uri' | 'language'> & { fingerprint?: string }>) => Promise<number>;
  agentWorkspaceDiscardChanges: (files: Array<Pick<AgentWorkspaceFile, 'uri' | 'language'> & { fingerprint?: string }>) => Promise<number>;
  agentRunQualityTest: (command: string) => Promise<QualityTestRunResult & { cancelled?: boolean }>;
  agentStart: (provider: AgentProvider, prompt: string, model?: string, toolPermissionPolicy?: AgentToolPermissionPolicy, images?: AgentImageAttachment[]) => Promise<AgentStartResult>;
  agentSteer: (provider: AgentProvider, prompt: string, images?: AgentImageAttachment[]) => Promise<AgentStartResult>;
  agentInterrupt: (provider: AgentProvider) => Promise<void>;
  agentNewSession: (provider: AgentProvider) => Promise<void>;
  agentRespondApproval: (provider: AgentProvider, requestId: string, decision: AgentApprovalDecision) => Promise<boolean>;
  onAgentEvent: (callback: (event: AgentEvent) => void) => () => void;
  genericAgentListModels: (config: Pick<GenericAgentConfig, 'baseUrl' | 'apiKey'>) => Promise<string[]>;
  genericAgentComplete: (config: GenericAgentConfig, prompt: string) => Promise<string>;
  genericAgentTask: (config: GenericAgentConfig, system: string, prompt: string) => Promise<string>;
  genericAgentStart: (config: GenericAgentConfig, prompt: string, images?: AgentImageAttachment[]) => Promise<AgentStartResult>;
  genericAgentSteer: (prompt: string, images?: AgentImageAttachment[]) => Promise<AgentStartResult>;
  genericAgentInterrupt: () => Promise<void>;
  genericAgentNewSession: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
