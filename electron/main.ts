import { app, BrowserWindow, ipcMain, dialog, shell, Menu, net, safeStorage } from 'electron';
import { delimiter, join } from 'path';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import Store from 'electron-store';
import log from 'electron-log';
import { StarlimsMcpHttpServer } from './mcpServer';
import { SharedMcpRuntime } from './sharedMcpRuntime';
import { SharedMcpPackageRuntime } from './sharedMcpPackageRuntime';
import { DEVTOOLS_MCP_CAPABILITIES, SHARED_MCP_PACKAGE, SHARED_MCP_VERSION } from './mcpCapabilities';
import { getProfileTools } from '@tenlyc/starlims-mcp';
import { AgentRuntimeManager } from './agentRuntime';
import { withLocalMcpNoProxy } from './localMcpEnv';
import { GenericAgentRuntime } from './genericAgentRuntime';
import { ExternalMcpManager } from './externalMcpManager';
import { AgentWorkspaceManager } from './agentWorkspace';
import { SslLspRuntime } from './sslLspRuntime';
import { SslLspSession } from './sslLspSession';
import type { AgentApprovalDecision, AgentEvent, AgentFileAttachment, AgentProvider, AgentRuntimeStatus, AgentToolPermissionPolicy, AgentWorkspaceContext, AgentWorkspaceFile, ExternalMcpServers } from '../src/types/agent';
import type { DiagnosticLogEvent } from '../src/types/diagnosticLog';
import type { SharedMcpDetails, SharedMcpToolInfo } from '../src/types/sharedMcp';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('Application starting...');

// Initialize store
const LEGACY_MCP_PORT = 3002;
const DEFAULT_MCP_PORT = 3102;
const store = new Store({
  name: 'starlims-devtools-config',
  defaults: {
    servers: [],
    selectedServer: '',
    mcpPort: DEFAULT_MCP_PORT,
    windowBounds: { width: 1400, height: 900 }
  }
});
const secretsStore = new Store({ name: 'starlims-secrets' });

// Port 3002 belongs to starlimsvscode and 3003-3099 is its form callback
// range. Migrate the old DevTools default outside both reserved ranges.
if (Number(store.get('mcpPort')) === LEGACY_MCP_PORT) {
  store.set('mcpPort', DEFAULT_MCP_PORT);
  log.info(`Migrated STARLIMS DevTools MCP port from ${LEGACY_MCP_PORT} to ${DEFAULT_MCP_PORT}.`);
}

const getMcpPort = (): number => Number(store.get('mcpPort') || DEFAULT_MCP_PORT);

let mainWindow: BrowserWindow | null = null;
let agentRuntime: AgentRuntimeManager | undefined;
let genericAgentRuntime: GenericAgentRuntime | undefined;
let activeToolPermissionPolicy: AgentToolPermissionPolicy = 'ask-writes';
const agentWorkspace = new AgentWorkspaceManager(join(app.getPath('userData'), 'agent-workspaces'));
const EXTERNAL_MCP_STORE_KEY = 'externalMcpServers.v1';
const MCP_TOOL_PERMISSION_STORE_KEY = 'mcpToolPermissionPolicy.v1';
const SECRET_MARKER = '__STARLIMS_SECRET__';
const sensitiveConfigKey = (key: string): boolean => /(?:api.?key|password|token|cookie|secret|authorization)/i.test(key);
const mcpSecretKey = (server: string, section: 'env' | 'headers', key: string): string => `external-mcp:${server}:${section}:${key}`;
const readStoredSecret = (key: string): string => {
  const stored = secretsStore.get(key) as unknown;
  if (stored && typeof stored === 'object' && (stored as any).encrypted === true && typeof (stored as any).value === 'string') {
    try { return safeStorage.decryptString(Buffer.from((stored as any).value, 'base64')); } catch { return ''; }
  }
  return typeof stored === 'string' ? stored : '';
};
const writeStoredSecret = (key: string, value: string): void => {
  if (safeStorage.isEncryptionAvailable()) secretsStore.set(key, { encrypted: true, value: safeStorage.encryptString(value).toString('base64') });
  else secretsStore.set(key, value);
};
const protectExternalMcpServers = (servers: ExternalMcpServers): ExternalMcpServers => Object.fromEntries(Object.entries(servers).map(([server, config]) => {
  const protect = (section: 'env' | 'headers', values?: Record<string, string>) => values && Object.fromEntries(Object.entries(values).map(([key, value]) => {
    if (!sensitiveConfigKey(key)) return [key, value];
    if (value && value !== SECRET_MARKER) writeStoredSecret(mcpSecretKey(server, section, key), value);
    return [key, SECRET_MARKER];
  }));
  return [server, { ...config, env: protect('env', config.env), headers: protect('headers', config.headers) }];
}));
const resolveExternalMcpServers = (servers: ExternalMcpServers): ExternalMcpServers => Object.fromEntries(Object.entries(servers).map(([server, config]) => {
  const resolve = (section: 'env' | 'headers', values?: Record<string, string>) => values && Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === SECRET_MARKER ? readStoredSecret(mcpSecretKey(server, section, key)) : value]));
  return [server, { ...config, env: resolve('env', config.env), headers: resolve('headers', config.headers) }];
}));
const normalizeToolPermissionPolicy = (value: unknown): AgentToolPermissionPolicy =>
  value === 'read-only' || value === 'auto-safe' || value === 'full-access' ? value : 'ask-writes';
const getExternalMcpServers = (): ExternalMcpServers => (store.get(EXTERNAL_MCP_STORE_KEY) || {}) as ExternalMcpServers;
const getResolvedExternalMcpServers = (): ExternalMcpServers => resolveExternalMcpServers(getExternalMcpServers());
const externalMcpManager = new ExternalMcpManager();
const protectedExternalMcpServers = protectExternalMcpServers(getExternalMcpServers());
store.set(EXTERNAL_MCP_STORE_KEY, protectedExternalMcpServers);
externalMcpManager.setConfigs(getResolvedExternalMcpServers());
const emitDiagnosticLog = (event: Omit<DiagnosticLogEvent, 'timestamp'>): void => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('devtools:log', { ...event, timestamp: Date.now() } satisfies DiagnosticLogEvent);
};
const pendingMcpCalls = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

const stripSensitiveConfiguration = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripSensitiveConfiguration);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/api.?key|password|token|cookie|secret|authorization/i.test(key))
    .map(([key, item]) => [key, stripSensitiveConfiguration(item)]));
};

const callRenderer = (tool: string, arguments_: Record<string, unknown>): Promise<unknown> => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.reject(new Error('STARLIMS DevTools window is not available.'));
  }
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingMcpCalls.delete(id);
      reject(new Error(`STARLIMS MCP tool '${tool}' timed out after 60 seconds.`));
    }, 60_000);
    pendingMcpCalls.set(id, { resolve, reject, timer });
    mainWindow!.webContents.send('mcp:request', { id, tool, arguments: arguments_ });
  });
};

const logMcpRuntime = (message: string, error?: unknown): void => {
  if (error) log.error(message, error);
  else log.info(message);
  emitDiagnosticLog({
    channel: 'mcp-server', level: error ? 'error' : 'info', source: 'MCP Server',
    message: error ? `${message} ${error instanceof Error ? error.message : String(error)}` : message
  });
};

const embeddedMcpServer = new StarlimsMcpHttpServer(
  callRenderer,
  () => app.getVersion(),
  logMcpRuntime,
  '127.0.0.1',
  getMcpPort()
);
const SHARED_MCP_SELECTED_VERSION_KEY = 'sharedMcpSelectedVersion.v1';
const sharedMcpPackageRuntime = new SharedMcpPackageRuntime(
  join(__dirname, 'sharedMcpCli.js'),
  join(app.getPath('userData'), 'shared-mcp-cache'),
  String(store.get(SHARED_MCP_SELECTED_VERSION_KEY) || '') || undefined
);
const mcpRuntime = new SharedMcpRuntime(
  callRenderer,
  embeddedMcpServer,
  () => app.getVersion(),
  getMcpPort,
  logMcpRuntime,
  () => sharedMcpPackageRuntime.executablePath(),
  () => sharedMcpPackageRuntime.version
);

const sharedMcpTools = (): SharedMcpToolInfo[] => [
  {
    id: 'get_capabilities',
    title: 'Get capabilities',
    description: 'Describe active tools, origins, risk levels, adapter capabilities, and backend component versions.',
    origin: 'starlims-mcp',
    repository: 'https://github.com/tenlyc/starlims-mcp',
    risk: 'read',
    capability: 'meta.capabilities',
    schemaVersion: '1.0',
    profiles: ['unified', 'devtools', 'vscode-compat']
  },
  ...getProfileTools('devtools', DEVTOOLS_MCP_CAPABILITIES).map((tool) => ({
    id: tool.id,
    title: tool.title,
    description: tool.description,
    origin: tool.origin,
    repository: tool.provenance.repository,
    risk: tool.risk,
    capability: tool.capability,
    schemaVersion: tool.schemaVersion,
    profiles: [...tool.profiles]
  }))
];

const sharedMcpDetails = (): SharedMcpDetails => ({
  status: mcpRuntime.getStatus(),
  packageName: SHARED_MCP_PACKAGE,
  bundledVersion: SHARED_MCP_VERSION,
  activeVersion: sharedMcpPackageRuntime.version,
  versions: sharedMcpPackageRuntime.listVersions(),
  tools: sharedMcpTools(),
  ...(sharedMcpPackageRuntime.release() ? { latestRelease: sharedMcpPackageRuntime.release() } : {})
});

// Get resource path for production
const RESOURCE_PATH = app.isPackaged
  ? join(process.resourcesPath, 'resources')
  : join(__dirname, '..', 'resources');
const SSL_LSP_SELECTED_VERSION_KEY = 'sslLspSelectedVersion.v1';
const sslLspRuntime = new SslLspRuntime(
  RESOURCE_PATH,
  join(app.getPath('userData'), 'lsp-cache'),
  String(store.get(SSL_LSP_SELECTED_VERSION_KEY) || '') || undefined
);
const sslLspSession = new SslLspSession(() => sslLspRuntime.executablePath(), () => sslLspRuntime.version);

function createWindow() {
  const bounds = store.get('windowBounds') as { width: number; height: number };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 1024,
    minHeight: 700,
    title: 'STARLIMS DevTools',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    },
    show: false
  });

  // Create application menu
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu:save') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('menu:toggleSidebar') },
        { label: 'Toggle MCP Panel', accelerator: 'CmdOrCtrl+Shift+A', click: () => mainWindow?.webContents.send('menu:toggleMCPPanel') },
        { type: 'separator' },
        { role: 'reload' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' }
      ]
    },
    {
      label: 'STARLIMS',
      submenu: [
        { label: 'Connect to Server', click: () => mainWindow?.webContents.send('menu:connect') },
        { label: 'Disconnect', click: () => mainWindow?.webContents.send('menu:disconnect') },
        { type: 'separator' },
        { label: 'Refresh Enterprise Tree', accelerator: 'F6', click: () => mainWindow?.webContents.send('menu:refresh') },
        { type: 'separator' },
        { label: 'Run Script', accelerator: 'F5', click: () => mainWindow?.webContents.send('menu:runScript') },
        { type: 'separator' },
        { label: 'Check Out', click: () => mainWindow?.webContents.send('menu:checkOut') },
        { label: 'Check In', click: () => mainWindow?.webContents.send('menu:checkIn') },
        { type: 'separator' },
        { label: 'Package Manager', click: () => mainWindow?.webContents.send('menu:openSCMPackage') }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://github.com/tenlyc/starlims-devtools') },
        { label: 'About', click: () => showAboutDialog() }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    log.info('Main window shown');
  });

  mainWindow.on('resize', () => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize();
      store.set('windowBounds', { width, height });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  log.info('Window created successfully');
}

function showAboutDialog() {
  dialog.showMessageBox({
    type: 'info',
    title: 'About STARLIMS DevTools',
    message: 'STARLIMS DevTools',
    detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}`
  });
}

// App lifecycle
app.whenReady().then(() => {
  log.info('App ready');
  createWindow();
  void mcpRuntime.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  agentRuntime?.dispose();
  genericAgentRuntime?.interrupt();
  void mcpRuntime.stop();
  void sslLspSession.stop();
});

// ==================== IPC Handlers ====================

ipcMain.on('mcp:response', (_event, response: { id: string; result?: unknown; error?: string }) => {
  const pending = pendingMcpCalls.get(response.id);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingMcpCalls.delete(response.id);
  if (response.error) pending.reject(new Error(response.error));
  else pending.resolve(response.result);
});

ipcMain.handle('mcp:getStatus', () => mcpRuntime.getStatus());
ipcMain.handle('mcp:getDetails', () => sharedMcpDetails());
ipcMain.handle('mcp:checkForUpdates', async () => {
  await sharedMcpPackageRuntime.checkForUpdates();
  return sharedMcpDetails();
});
ipcMain.handle('mcp:installLatest', async () => {
  const previousVersion = sharedMcpPackageRuntime.version;
  const version = await sharedMcpPackageRuntime.installLatest();
  store.set(SHARED_MCP_SELECTED_VERSION_KEY, version);
  await mcpRuntime.restart();
  if (mcpRuntime.getStatus().implementation !== 'shared-process') {
    sharedMcpPackageRuntime.selectVersion(previousVersion);
    store.set(SHARED_MCP_SELECTED_VERSION_KEY, sharedMcpPackageRuntime.version);
    await mcpRuntime.restart();
    throw new Error(`starlims-mcp ${version} failed its health check; restored ${sharedMcpPackageRuntime.version}.`);
  }
  return sharedMcpDetails();
});
ipcMain.handle('mcp:selectVersion', async (_, version: string) => {
  const previousVersion = sharedMcpPackageRuntime.version;
  if (!sharedMcpPackageRuntime.selectVersion(String(version || ''))) {
    throw new Error(`starlims-mcp ${version} is not available in the verified local cache.`);
  }
  store.set(SHARED_MCP_SELECTED_VERSION_KEY, sharedMcpPackageRuntime.version);
  await mcpRuntime.restart();
  if (mcpRuntime.getStatus().implementation !== 'shared-process') {
    sharedMcpPackageRuntime.selectVersion(previousVersion);
    store.set(SHARED_MCP_SELECTED_VERSION_KEY, sharedMcpPackageRuntime.version);
    await mcpRuntime.restart();
    throw new Error(`starlims-mcp ${version} failed its health check; restored ${sharedMcpPackageRuntime.version}.`);
  }
  return sharedMcpDetails();
});

// Dialog handlers
ipcMain.handle('dialog:showOpenDialog', async (_, options) => {
  return dialog.showOpenDialog(mainWindow!, options);
});

ipcMain.handle('dialog:showSaveDialog', async (_, options) => {
  return dialog.showSaveDialog(mainWindow!, options);
});

ipcMain.handle('dialog:showMessageBox', async (_, options) => {
  return dialog.showMessageBox(mainWindow!, options);
});

// Store handlers
ipcMain.handle('store:get', (_, key: string) => {
  return store.get(key);
});

ipcMain.handle('store:set', (_, key: string, value: any) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('store:delete', (_, key: string) => {
  store.delete(key);
  return true;
});

// Secret storage. Existing plain-string entries remain readable and migrate on the next save.
// The retired AI panel stored provider metadata (and, in older releases, keys)
// in the ordinary config store. Generic Agent profiles are now the sole source
// of model configuration, so remove the obsolete plaintext-bearing entries.
if (store.has('aiSavedConfigs') || store.has('aiConfig') || store.has('aiProvider')) {
  store.delete('aiSavedConfigs');
  store.delete('aiConfig');
  store.delete('aiProvider');
  log.info('Removed retired legacy AI configuration entries.');
}

ipcMain.handle('secrets:get', (_, key: string) => {
  const stored = secretsStore.get(key) as unknown;
  if (stored && typeof stored === 'object' && (stored as any).encrypted === true && typeof (stored as any).value === 'string') {
    try { return safeStorage.decryptString(Buffer.from((stored as any).value, 'base64')); }
    catch (error) { log.error(`Failed to decrypt secret ${key}.`, error); return ''; }
  }
  return typeof stored === 'string' ? stored : '';
});

ipcMain.handle('secrets:set', (_, key: string, value: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    secretsStore.set(key, { encrypted: true, value: safeStorage.encryptString(value).toString('base64') });
  } else {
    secretsStore.set(key, value);
  }
  return true;
});

ipcMain.handle('secrets:delete', (_, key: string) => {
  secretsStore.delete(key);
  return true;
});

// Window control
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

// Shell operations
ipcMain.handle('shell:openExternal', (_, url: string) => {
  console.log('shell:openExternal called with URL:', url);
  return shell.openExternal(url);
});

// Open URL in system browser (not Electron window)
ipcMain.handle('window:openSystemBrowser', async (_, url: string) => {
  console.log('Opening system browser with URL:', url);
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open system browser:', error);
    return { success: false, error: String(error) };
  }
});

// Debug Window - Opens STARLIMS Form in a new BrowserWindow with DevTools for debugging
ipcMain.handle('window:openDebugWindow', async (_, options: {
  url: string;
  title?: string;
  width?: number;
  height?: number;
}) => {
  const { url, title = 'STARLIMS Form Debug', width = 1400, height = 900 } = options;

  const debugWindow = new BrowserWindow({
    width,
    height,
    title,
    webPreferences: {
      devTools: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the debug URL (with Debug=true parameter)
  await debugWindow.loadURL(url);

  // Open DevTools automatically for JavaScript debugging
  debugWindow.webContents.openDevTools();

  return { success: true };
});

// App info
ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

ipcMain.handle('app:getPath', (_, name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents') => {
  return app.getPath(name);
});

// Resource path
ipcMain.handle('app:getResourcePath', () => {
  return RESOURCE_PATH;
});

// HTTP Request proxy to avoid CORS issues
// When `binary` is true, the response body is collected as raw bytes and
// returned base64-encoded (required for downloading SDP packages).
ipcMain.handle('http:request', async (_, options: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  binary?: boolean;
}) => {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: options.method || 'GET',
      url: options.url
    });

    // Set headers
    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        request.setHeader(key, value);
      });
    }

    // Collect response
    let responseData = '';
    const chunks: Buffer[] = [];
    let responseHeaders: Record<string, string> = {};

    request.on('response', (response) => {
      response.headers && Object.entries(response.headers).forEach(([key, value]) => {
        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
      });

      response.on('data', (chunk) => {
        if (options.binary) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        } else {
          responseData += chunk.toString();
        }
      });

      response.on('end', () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          statusText: response.statusMessage,
          headers: responseHeaders,
          data: options.binary ? Buffer.concat(chunks).toString('base64') : responseData
        });
      });

      response.on('error', (error) => {
        reject(error);
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    // Send body if present
    if (options.bodyBase64) {
      request.write(Buffer.from(options.bodyBase64, 'base64'));
    } else if (options.body) {
      request.write(options.body);
    }

    request.end();
  });
});

// Git IPC handlers
ipcMain.handle('git:isAvailable', async () => {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const git = spawn('git', ['--version'], { shell: true });
    git.on('close', (code: number) => resolve(code === 0));
    git.on('error', () => resolve(false));
  });
});

ipcMain.handle('git:isRepository', async (_, workspacePath: string) => {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const git = spawn('git', ['rev-parse', '--git-dir'], { cwd: workspacePath, shell: true });
    let stderr = '';
    git.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    git.on('close', (code: number) => resolve(code === 0));
    git.on('error', () => resolve(false));
  });
});

ipcMain.handle('git:getBranch', async (_, workspacePath: string) => {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const git = spawn('git', ['branch', '--show-current'], { cwd: workspacePath, shell: true });
    let stdout = '';
    git.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    git.on('close', (code: number) => { resolve(code === 0 ? stdout.trim() : ''); });
    git.on('error', () => resolve(''));
  });
});

ipcMain.handle('git:hasChanges', async (_, workspacePath: string) => {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const git = spawn('git', ['status', '--porcelain'], { cwd: workspacePath, shell: true });
    let stdout = '';
    git.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    git.on('close', () => { resolve(stdout.trim().length > 0); });
    git.on('error', () => resolve(false));
  });
});

// CLI execution handlers for AI code generation
type CliProvider = 'codex' | 'claude' | 'opencode';

const resolveCodexCommand = (): string => {
  const configured = process.env.CODEX_CLI_PATH?.trim();
  if (configured && existsSync(configured)) return configured;

  const executable = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const home = process.env.HOME || process.env.USERPROFILE || app.getPath('home');
  const pathCandidates = (process.env.PATH || '')
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, executable));

  if (process.platform === 'darwin') {
    const macCandidates = [
      '/Applications/ChatGPT.app/Contents/Resources/codex',
      '/Applications/Codex.app/Contents/Resources/codex',
      join(home, 'Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex'),
      join(home, 'Applications', 'Codex.app', 'Contents', 'Resources', 'codex'),
      '/opt/homebrew/bin/codex',
      '/usr/local/bin/codex',
      join(home, '.local', 'bin', 'codex')
    ];
    const resolved = [...pathCandidates, ...macCandidates].find((candidate) => existsSync(candidate));
    if (resolved) return resolved;
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    const codexBin = localAppData ? join(localAppData, 'OpenAI', 'Codex', 'bin') : '';
    if (codexBin && existsSync(codexBin)) {
      const candidates = readdirSync(codexBin, { withFileTypes: true })
        .flatMap((entry) => {
          const candidate = entry.isDirectory()
            ? join(codexBin, entry.name, 'codex.exe')
            : entry.name.toLowerCase() === 'codex.exe' ? join(codexBin, entry.name) : '';
          return candidate && existsSync(candidate) ? [candidate] : [];
        })
        .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
      if (candidates[0]) return candidates[0];
    }

    const npmShim = process.env.APPDATA ? join(process.env.APPDATA, 'npm', 'codex.cmd') : '';
    if (npmShim && existsSync(npmShim)) return npmShim;

    const windowsCandidates = [
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'ChatGPT', 'resources', 'codex.exe') : '',
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'OpenAI', 'ChatGPT', 'resources', 'codex.exe') : '',
      process.env.ProgramFiles ? join(process.env.ProgramFiles, 'ChatGPT', 'resources', 'codex.exe') : '',
      join(home, '.local', 'bin', 'codex.exe')
    ].filter(Boolean);
    const resolved = windowsCandidates.find((candidate) => existsSync(candidate));
    if (resolved) return resolved;
  }

  if (process.platform === 'linux') {
    const linuxCandidates = [
      '/usr/local/bin/codex',
      '/usr/bin/codex',
      '/snap/bin/codex',
      join(home, '.local', 'bin', 'codex'),
      join(home, '.npm-global', 'bin', 'codex')
    ];
    const resolved = [...pathCandidates, ...linuxCandidates].find((candidate) => existsSync(candidate));
    if (resolved) return resolved;
  }

  const resolvedFromPath = pathCandidates.find((candidate) => existsSync(candidate));
  if (resolvedFromPath) return resolvedFromPath;

  return 'codex';
};

const getAgentRuntime = (): AgentRuntimeManager => {
  if (!agentRuntime) {
    agentRuntime = new AgentRuntimeManager({
      codexCommand: resolveCodexCommand,
      mcpUrl: () => mcpRuntime.getStatus().url,
      externalMcpServers: () => activeToolPermissionPolicy === 'read-only' ? {} : getResolvedExternalMcpServers(),
      cwd: () => agentWorkspace.currentPath(),
      getVersion: () => app.getVersion(),
      emit: (event: AgentEvent) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('agent:event', event);
      }
    });
  }
  return agentRuntime;
};

const getGenericAgentRuntime = (): GenericAgentRuntime => {
  genericAgentRuntime ||= new GenericAgentRuntime(callRenderer, externalMcpManager, (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('agent:event', event);
  });
  return genericAgentRuntime;
};

const cliCommand = (provider: CliProvider): { command: string; versionArgs: string[]; runArgs: string[] } => {
  if (provider === 'codex') {
    const mcpUrl = `http://127.0.0.1:${getMcpPort()}/mcp`;
    return {
      command: resolveCodexCommand(),
      versionArgs: ['--version'],
      runArgs: [
        'exec', '--skip-git-repo-check', '--color', 'never',
        '-c', `mcp_servers.starlims.url=${mcpUrl}`,
        '-c', 'mcp_servers.starlims.required=true',
        '-'
      ]
    };
  }
  if (provider === 'claude') return { command: 'claude', versionArgs: ['--version'], runArgs: ['-p'] };
  return { command: 'opencode', versionArgs: ['--version'], runArgs: ['run'] };
};

const checkCli = (provider: CliProvider): Promise<{ available: boolean; version?: string; command?: string }> => {
  const { spawn } = require('child_process');
  const spec = cliCommand(provider);
  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.versionArgs, { shell: true, windowsHide: true });
    let output = '';
    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
    child.on('close', (code: number) => {
      const unavailable = /not recognized|not found|could not find/i.test(output);
      resolve({
        available: code === 0 && !unavailable,
        version: output.trim().split(/\r?\n/).find(Boolean),
        command: spec.command
      });
    });
    child.on('error', () => resolve({ available: false }));
  });
};

const executeCli = async (provider: CliProvider, prompt: string): Promise<string> => {
  if (provider === 'codex') {
    await mcpRuntime.start();
    const status = mcpRuntime.getStatus();
    if (!status.running) {
      throw new Error(`STARLIMS MCP is not running: ${status.error || status.url}`);
    }
  }

  const { spawn } = require('child_process');
  const spec = cliCommand(provider);
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.runArgs, {
      shell: true,
      windowsHide: true,
      env: provider === 'codex' ? withLocalMcpNoProxy() : { ...process.env }
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      reject(new Error(`${provider} CLI timed out after 10 minutes.`));
    }, 600_000);

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    child.on('close', (code: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (code === 0 && stdout.trim()) resolve(stdout.trim());
      else reject(new Error((stderr || stdout || `${provider} CLI exited with code ${code}`).trim()));
    });
    child.on('error', (error: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
};

ipcMain.handle('cli:getStatuses', async () => {
  const providers: CliProvider[] = ['codex', 'claude', 'opencode'];
  const entries = await Promise.all(providers.map(async (provider) => [provider, await checkCli(provider)] as const));
  return Object.fromEntries(entries);
});

ipcMain.handle('agent:getStatuses', async () => {
  const openCodeStatus = async (): Promise<AgentRuntimeStatus> => {
    const status = await checkCli('opencode');
    return { ...status, runtime: 'cli', detail: status.available ? 'CLI compatibility mode' : status.version };
  };
  return getAgentRuntime().statuses(openCodeStatus);
});

ipcMain.handle('agent:getModels', async (_, provider: AgentProvider) => {
  if (provider !== 'codex') return [];
  try {
    return await getAgentRuntime().models(provider);
  } catch (error) {
    log.error('Failed to load Codex models.', error);
    throw error;
  }
});

ipcMain.handle('agent:getExternalMcpServers', () => getExternalMcpServers());
ipcMain.handle('agent:setExternalMcpServers', async (_, servers: ExternalMcpServers) => {
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) throw new Error('MCP configuration must be an object.');
  for (const [name, config] of Object.entries(servers)) {
    if (!name.trim() || !config || typeof config !== 'object') throw new Error('Each MCP server requires a valid name and configuration.');
    const transport = config.transport || (config.command ? 'stdio' : 'http');
    if (!['http', 'sse', 'stdio'].includes(transport)) throw new Error(`Unsupported MCP transport for '${name}'.`);
    if (transport === 'stdio' && !config.command?.trim()) throw new Error(`MCP server '${name}' requires command.`);
    if (transport !== 'stdio' && !config.url?.trim()) throw new Error(`MCP server '${name}' requires url.`);
  }
  const protectedServers = protectExternalMcpServers(servers);
  store.set(EXTERNAL_MCP_STORE_KEY, protectedServers);
  externalMcpManager.setConfigs(resolveExternalMcpServers(protectedServers));
  genericAgentRuntime?.newSession();
  agentRuntime?.dispose();
  agentRuntime = undefined;
  return true;
});

ipcMain.handle('agent:selectFiles', async (): Promise<AgentFileAttachment[]> => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Attach files to Agent',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Code and text files', extensions: ['ssl', 'srvscr', 'ss', 'js', 'jsx', 'ts', 'tsx', 'json', 'xml', 'sql', 'md', 'txt', 'css', 'html', 'htm', 'yaml', 'yml', 'csv', 'log'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (result.canceled) return [];
  return result.filePaths.map((filePath) => {
    const size = statSync(filePath).size;
    if (size > 2 * 1024 * 1024) throw new Error(`File is larger than 2 MB: ${filePath}`);
    const buffer = readFileSync(filePath);
    if (buffer.includes(0)) throw new Error(`Binary files are not supported yet: ${filePath}`);
    return {
      id: `file:${filePath}`,
      name: filePath.split(/[\\/]/).pop() || filePath,
      path: filePath,
      content: buffer.toString('utf8'),
      size
    };
  });
});

ipcMain.handle('ai-config:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import STARLIMS DevTools AI configuration or extension',
    properties: ['openFile'],
    filters: [{ name: 'JSON configuration', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  if (statSync(filePath).size > 2 * 1024 * 1024) throw new Error('Configuration file is larger than 2 MB.');
  return { filePath, value: JSON.parse(readFileSync(filePath, 'utf8')) };
});

ipcMain.handle('ai-config:export', async (_, suggestedName: string, value: unknown) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export STARLIMS DevTools AI configuration',
    defaultPath: String(suggestedName || 'starlims-ai-config.json').replace(/[^a-zA-Z0-9._-]/g, '-'),
    filters: [{ name: 'JSON configuration', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return null;
  writeFileSync(result.filePath, `${JSON.stringify(stripSensitiveConfiguration(value), null, 2)}\n`, 'utf8');
  return result.filePath;
});

ipcMain.handle('ssl-lsp:status', async () => ({ available: sslLspRuntime.isAvailable(), version: sslLspRuntime.version }));
ipcMain.handle('ssl-lsp:validate', async (_, content: string, options?: { dataSource?: boolean; info?: boolean; hungarianTypes?: boolean }) =>
  sslLspRuntime.validate(String(content || ''), options || {}));
ipcMain.handle('ssl-lsp:format', async (_, content: string) => sslLspRuntime.format(String(content || '')));
ipcMain.handle('ssl-lsp:inventory', async () => sslLspRuntime.inventory());
ipcMain.handle('ssl-lsp:sessionStatus', async () => sslLspSession.status(sslLspRuntime.isAvailable()));
ipcMain.handle('ssl-lsp:sessionRestart', async () => {
  if (!sslLspRuntime.isAvailable()) return sslLspSession.status(false);
  await sslLspSession.restart();
  return sslLspSession.status(true);
});
ipcMain.handle('ssl-lsp:versions', async () => sslLspRuntime.listVersions());
ipcMain.handle('ssl-lsp:upstreamMetadata', async () => sslLspRuntime.metadata());
ipcMain.handle('ssl-lsp:checkForUpdates', async () => sslLspRuntime.checkForUpdates());
ipcMain.handle('ssl-lsp:installLatest', async () => {
  const previousVersion = sslLspRuntime.version;
  const installedVersion = await sslLspRuntime.installLatest();
  store.set(SSL_LSP_SELECTED_VERSION_KEY, installedVersion);
  try {
    await sslLspSession.restart();
  } catch (error) {
    sslLspRuntime.selectVersion(previousVersion);
    store.set(SSL_LSP_SELECTED_VERSION_KEY, sslLspRuntime.version);
    await sslLspSession.restart().catch(() => undefined);
    throw new Error(`starlims-lsp ${installedVersion} failed to start; restored ${sslLspRuntime.version}. ${error instanceof Error ? error.message : String(error)}`);
  }
  return { versions: sslLspRuntime.listVersions(), status: sslLspSession.status(sslLspRuntime.isAvailable()), release: sslLspRuntime.release() };
});
ipcMain.handle('ssl-lsp:selectVersion', async (_, version: string) => {
  const previousVersion = sslLspRuntime.version;
  if (!sslLspRuntime.selectVersion(String(version || ''))) throw new Error(`starlims-lsp version ${version} is not available in the verified local cache.`);
  store.set(SSL_LSP_SELECTED_VERSION_KEY, sslLspRuntime.version);
  try { await sslLspSession.restart(); }
  catch (error) {
    sslLspRuntime.selectVersion(previousVersion);
    store.set(SSL_LSP_SELECTED_VERSION_KEY, sslLspRuntime.version);
    await sslLspSession.restart().catch(() => undefined);
    throw new Error(`starlims-lsp ${version} failed to start; restored ${sslLspRuntime.version}. ${error instanceof Error ? error.message : String(error)}`);
  }
  return { versions: sslLspRuntime.listVersions(), status: sslLspSession.status(sslLspRuntime.isAvailable()) };
});
ipcMain.handle('ssl-lsp:workspaceDocuments', async () => sslLspSession.workspaceDocuments());
ipcMain.handle('ssl-lsp:workspaceDocument', async (_, uri: string) => sslLspSession.workspaceDocument(String(uri || '')));
ipcMain.handle('ssl-lsp:documentSync', async (_, document: { uri?: string; content?: string; version?: number }) => {
  if (!sslLspRuntime.isAvailable()) return false;
  await sslLspSession.syncDocument(String(document?.uri || ''), String(document?.content || ''), Number(document?.version || 1));
  return true;
});
ipcMain.handle('ssl-lsp:documentClose', async (_, uri: string) => { sslLspSession.closeDocument(String(uri || '')); return true; });
ipcMain.handle('ssl-lsp:definition', async (_, uri: string, position: { line: number; character: number }) =>
  sslLspSession.definition(String(uri || ''), { line: Number(position?.line || 0), character: Number(position?.character || 0) }));
ipcMain.handle('ssl-lsp:references', async (_, uri: string, position: { line: number; character: number }) =>
  sslLspSession.references(String(uri || ''), { line: Number(position?.line || 0), character: Number(position?.character || 0) }));
ipcMain.handle('ssl-lsp:rename', async (_, uri: string, position: { line: number; character: number }, newName: string) =>
  sslLspSession.rename(String(uri || ''), { line: Number(position?.line || 0), character: Number(position?.character || 0) }, String(newName || '')));
ipcMain.handle('ssl-lsp:workspaceSymbols', async (_, query: string) => sslLspSession.workspaceSymbols(String(query || '')));

ipcMain.handle('agent:start', async (_, provider: AgentProvider, prompt: string, model?: string, toolPermissionPolicy?: AgentToolPermissionPolicy) => {
  if (provider !== 'codex') throw new Error('This provider does not support rich agent sessions yet.');
  if (!prompt.trim()) throw new Error('Prompt is required.');
  await mcpRuntime.start();
  const status = mcpRuntime.getStatus();
  if (!status.running) throw new Error(`STARLIMS MCP is not running: ${status.error || status.url}`);
  const normalizedPolicy = normalizeToolPermissionPolicy(toolPermissionPolicy);
  store.set(MCP_TOOL_PERMISSION_STORE_KEY, normalizedPolicy);
  if (activeToolPermissionPolicy !== normalizedPolicy) {
    agentRuntime?.dispose();
    agentRuntime = undefined;
    activeToolPermissionPolicy = normalizedPolicy;
  }
  return getAgentRuntime().send(provider, prompt, model, normalizedPolicy);
});

ipcMain.handle('agent:workspaceConfigure', async (_, context: AgentWorkspaceContext) => {
  if (!context?.serverName?.trim() || !context?.serverUrl?.trim()) throw new Error('A STARLIMS server is required for the Agent workspace.');
  const previousPath = agentWorkspace.currentPath();
  const info = await agentWorkspace.configure({
    serverName: String(context.serverName), serverUrl: String(context.serverUrl), user: String(context.user || ''),
    rootPath: context.rootPath ? String(context.rootPath) : undefined
  });
  if (previousPath !== info.path) {
    agentRuntime?.dispose();
    agentRuntime = undefined;
  }
  if (sslLspRuntime.isAvailable()) {
    try { await sslLspSession.configureWorkspace(info.path, await agentWorkspace.lspDocuments()); }
    catch (error) { log.warn('Unable to configure starlims-lsp workspace', error); }
  }
  return info;
});

ipcMain.handle('agent:workspaceSyncFiles', async (_, files: AgentWorkspaceFile[]) => {
  if (!Array.isArray(files)) throw new Error('Workspace files must be an array.');
  const result = await agentWorkspace.syncFiles(files.map((file) => ({
    uri: String(file.uri || ''), name: String(file.name || 'script'), type: String(file.type || 'text'),
    language: file.language ? String(file.language) : undefined,
    checkedOutBy: file.checkedOutBy ? String(file.checkedOutBy) : undefined,
    checkedOutDate: file.checkedOutDate ? String(file.checkedOutDate) : undefined,
    content: String(file.content || '')
  })));
  if (sslLspRuntime.isAvailable()) {
    try { await sslLspSession.configureWorkspace(result.path, await agentWorkspace.lspDocuments()); }
    catch (error) { log.warn('Unable to index Agent workspace with starlims-lsp', error); }
  }
  return result;
});

ipcMain.handle('agent:workspaceGetChanges', async () => agentWorkspace.getChanges());

ipcMain.handle('agent:workspaceAcceptChanges', async (_, files: Array<{ uri: string; language?: string; fingerprint?: string }>) => {
  if (!Array.isArray(files)) throw new Error('Accepted workspace files must be an array.');
  return agentWorkspace.acceptChanges(files.map((file) => ({
    uri: String(file.uri || ''), language: file.language ? String(file.language) : undefined,
    fingerprint: file.fingerprint ? String(file.fingerprint) : undefined
  })));
});

ipcMain.handle('agent:runQualityTest', async (_, command: string) => {
  const normalized = String(command || '').trim();
  if (!normalized) throw new Error('A test command is required.');
  const cwd = agentWorkspace.currentPath();
  if (!cwd || !existsSync(cwd)) throw new Error('Configure the Agent workspace before running tests.');
  const confirmation = await dialog.showMessageBox(mainWindow!, {
    type: 'warning',
    title: 'Run workspace test',
    message: 'Run this test command in the Agent workspace?',
    detail: `${normalized}\n\nWorkspace: ${cwd}`,
    buttons: ['Run', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  if (confirmation.response !== 0) return { cancelled: true, exitCode: null, output: '', durationMs: 0 };
  const startedAt = Date.now();
  return await new Promise<{ cancelled?: boolean; exitCode: number | null; output: string; durationMs: number }>((resolve, reject) => {
    const child = spawn(normalized, { cwd, shell: true, env: process.env });
    let output = '';
    const append = (chunk: Buffer) => { output = `${output}${chunk.toString('utf8')}`.slice(-100_000); };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    const timeout = setTimeout(() => child.kill(), 300_000);
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({ exitCode, output: output.trim(), durationMs: Date.now() - startedAt });
    });
  });
});

ipcMain.handle('agent:interrupt', async (_, provider: AgentProvider) => getAgentRuntime().interrupt(provider));
ipcMain.handle('agent:newSession', async (_, provider: AgentProvider) => getAgentRuntime().newSession(provider));
ipcMain.handle('agent:respondApproval', async (_, provider: AgentProvider, requestId: string, decision: AgentApprovalDecision) => {
  if (provider === 'generic') getGenericAgentRuntime().respond(requestId, decision);
  else getAgentRuntime().respond(provider, requestId, decision);
  return true;
});

ipcMain.handle('generic-agent:listModels', async (_, config) => getGenericAgentRuntime().listModels(config));
ipcMain.handle('generic-agent:complete', async (_, config, prompt: string) => {
  if (!config?.baseUrl || !config?.apiKey || !config?.model) throw new Error('Base URL, API Key, and model are required.');
  return getGenericAgentRuntime().complete(config, String(prompt || ''));
});
ipcMain.handle('generic-agent:task', async (_, config, system: string, prompt: string) => {
  if (!config?.baseUrl || !config?.apiKey || !config?.model) throw new Error('Base URL, API Key, and model are required.');
  return getGenericAgentRuntime().task(config, String(system || ''), String(prompt || ''));
});
ipcMain.handle('generic-agent:start', async (_, config, prompt: string) => {
  if (!config?.baseUrl || !config?.apiKey || !config?.model) throw new Error('Base URL, API Key, and model are required.');
  store.set(MCP_TOOL_PERMISSION_STORE_KEY, normalizeToolPermissionPolicy(config.toolPermissionPolicy));
  return getGenericAgentRuntime().send(config, prompt);
});
ipcMain.handle('generic-agent:interrupt', async () => getGenericAgentRuntime().interrupt());
ipcMain.handle('generic-agent:newSession', async () => getGenericAgentRuntime().newSession());

ipcMain.handle('cli:execute', async (_, provider: CliProvider, prompt: string) => {
  if (!['codex', 'claude', 'opencode'].includes(provider)) throw new Error('Unsupported AI CLI provider.');
  if (!prompt.trim()) throw new Error('Prompt is required.');
  return executeCli(provider, prompt);
});

ipcMain.handle('cli:checkClaude', async () => {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const claude = spawn('claude', ['-v'], { shell: true });
    let stdout = '';
    claude.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    claude.on('close', (code: number) => { resolve(code === 0 && stdout.includes('claude')); });
    claude.on('error', () => resolve(false));
  });
});

ipcMain.handle('cli:checkOpenCode', async () => {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const opencode = spawn('opencode', ['--version'], { shell: true });
    let stdout = '';
    opencode.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    opencode.on('close', (code: number) => { resolve(code === 0); });
    opencode.on('error', () => resolve(false));
  });
});

ipcMain.handle('cli:executeClaude', async (_, prompt: string) => {
  const { spawn } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  return new Promise((resolve, reject) => {
    // Write prompt to a temp file with UTF-8 BOM for proper encoding
    const tmpFile = path.join(os.tmpdir(), 'claude-prompt-' + Date.now() + '.txt');
    // Write with UTF-8 encoding
    fs.writeFileSync(tmpFile, '\ufeff' + prompt, 'utf8');

    let cmd, args;
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows: use PowerShell to read file with UTF-8 encoding
      cmd = 'powershell';
      args = ['-NoProfile', '-Command', `Get-Content -Path "${tmpFile}" -Raw -Encoding UTF8 | claude -p`];
    } else {
      // Unix: cat file | claude -p
      cmd = 'bash';
      args = ['-c', `cat "${tmpFile}" | claude -p`];
    }

    console.log('Executing Claude CLI with command:', cmd, args.join(' '));

    const claude = spawn(cmd, args, {
      shell: true,
      env: { ...process.env }
    });

    let output = '';
    let errorOutput = '';
    let hasFinished = false;

    // Timeout after 120 seconds
    const timeout = setTimeout(() => {
      if (!hasFinished) {
        hasFinished = true;
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        reject(new Error('Claude CLI timed out after 120 seconds'));
      }
    }, 120000);

    claude.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    claude.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    claude.on('close', (code: number) => {
      if (hasFinished) return;
      hasFinished = true;
      clearTimeout(timeout);
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch (e) {}

      console.log('Claude CLI closed with code:', code);
      console.log('Output:', output.substring(0, 500));
      console.log('Error:', errorOutput.substring(0, 500));

      if (code === 0 && output) {
        resolve(output);
      } else {
        reject(new Error(errorOutput || `Claude CLI exited with code ${code}`));
      }
    });

    claude.on('error', (err: Error) => {
      if (hasFinished) return;
      hasFinished = true;
      clearTimeout(timeout);
      try { fs.unlinkSync(tmpFile); } catch (e) {}
      console.error('Claude CLI error:', err);
      reject(err);
    });
  });
});

ipcMain.handle('cli:executeOpenCode', async (_, prompt: string) => {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    // OpenCode CLI usage may vary, using a common pattern
    const opencode = spawn('opencode', ['-m', '-q', prompt], {
      shell: true,
      env: { ...process.env }
    });

    let output = '';
    let errorOutput = '';

    opencode.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });

    opencode.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    opencode.on('close', (code: number) => {
      if (code === 0 && output) {
        resolve(output);
      } else {
        reject(new Error(errorOutput || `OpenCode CLI exited with code ${code}`));
      }
    });

    opencode.on('error', (err: Error) => {
      reject(err);
    });
  });
});

log.info('IPC handlers registered');
