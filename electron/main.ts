import { app, BrowserWindow, ipcMain, dialog, shell, Menu, net } from 'electron';
import { join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { randomUUID } from 'crypto';
import Store from 'electron-store';
import log from 'electron-log';
import { StarlimsMcpHttpServer } from './mcpServer';
import { AgentRuntimeManager } from './agentRuntime';
import type { AgentApprovalDecision, AgentEvent, AgentProvider, AgentRuntimeStatus } from '../src/types/agent';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('Application starting...');

// Initialize store
const store = new Store({
  name: 'starlims-devtools-config',
  defaults: {
    servers: [],
    selectedServer: '',
    mcpPort: 3002,
    windowBounds: { width: 1400, height: 900 }
  }
});

let mainWindow: BrowserWindow | null = null;
let agentRuntime: AgentRuntimeManager | undefined;
const pendingMcpCalls = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

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

const mcpServer = new StarlimsMcpHttpServer(
  callRenderer,
  () => app.getVersion(),
  (message, error) => error ? log.error(message, error) : log.info(message),
  '127.0.0.1',
  Number(store.get('mcpPort') || 3002)
);

// Get resource path for production
const RESOURCE_PATH = app.isPackaged
  ? join(process.resourcesPath, 'resources')
  : join(__dirname, '..', 'resources');

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
        { label: 'Exit', accelerator: 'Alt+F4', click: () => app.quit() }
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
        { label: 'Refresh Enterprise Tree', accelerator: 'F5', click: () => mainWindow?.webContents.send('menu:refresh') },
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
  void mcpServer.start();

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
  void mcpServer.stop();
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

ipcMain.handle('mcp:getStatus', () => mcpServer.getStatus());

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

// Secret storage (using electron-store with encryption)
const secretsStore = new Store({ name: 'starlims-secrets' });

ipcMain.handle('secrets:get', (_, key: string) => {
  return secretsStore.get(key);
});

ipcMain.handle('secrets:set', (_, key: string, value: string) => {
  secretsStore.set(key, value);
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
ipcMain.handle('http:request', async (_, options: {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
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
    let responseHeaders: Record<string, string> = {};

    request.on('response', (response) => {
      response.headers && Object.entries(response.headers).forEach(([key, value]) => {
        responseHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
      });

      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          statusText: response.statusMessage,
          headers: responseHeaders,
          data: responseData
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
    if (options.body) {
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
  }

  return 'codex';
};

const getAgentRuntime = (): AgentRuntimeManager => {
  if (!agentRuntime) {
    agentRuntime = new AgentRuntimeManager({
      codexCommand: resolveCodexCommand,
      mcpUrl: () => mcpServer.getStatus().url,
      cwd: () => process.cwd(),
      getVersion: () => app.getVersion(),
      emit: (event: AgentEvent) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('agent:event', event);
      }
    });
  }
  return agentRuntime;
};

const cliCommand = (provider: CliProvider): { command: string; versionArgs: string[]; runArgs: string[] } => {
  if (provider === 'codex') {
    const mcpUrl = `http://127.0.0.1:${Number(store.get('mcpPort') || 3002)}/mcp`;
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
    await mcpServer.start();
    const status = mcpServer.getStatus();
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
      env: { ...process.env }
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

ipcMain.handle('agent:start', async (_, provider: AgentProvider, prompt: string) => {
  if (!['codex', 'claude'].includes(provider)) throw new Error('This provider does not support rich agent sessions yet.');
  if (!prompt.trim()) throw new Error('Prompt is required.');
  await mcpServer.start();
  const status = mcpServer.getStatus();
  if (!status.running) throw new Error(`STARLIMS MCP is not running: ${status.error || status.url}`);
  return getAgentRuntime().send(provider, prompt);
});

ipcMain.handle('agent:interrupt', async (_, provider: AgentProvider) => getAgentRuntime().interrupt(provider));
ipcMain.handle('agent:newSession', async (_, provider: AgentProvider) => getAgentRuntime().newSession(provider));
ipcMain.handle('agent:respondApproval', async (_, provider: AgentProvider, requestId: string, decision: AgentApprovalDecision) => {
  getAgentRuntime().respond(provider, requestId, decision);
  return true;
});

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
