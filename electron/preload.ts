import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for exposed API
export interface ElectronAPI {
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
  }) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: string;
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
}

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
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
  }) => ipcRenderer.invoke('http:request', options),

  // Menu events
  onMenuEvent: (callback: (event: string) => void) => {
    const events = [
      'menu:newFile', 'menu:openFile', 'menu:save',
      'menu:toggleSidebar', 'menu:toggleAIPanel',
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
  cliExecuteOpenCode: (prompt: string) => ipcRenderer.invoke('cli:executeOpenCode', prompt)
} as ElectronAPI);

// TypeScript declaration for window object
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
