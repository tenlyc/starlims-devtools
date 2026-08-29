import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { mkdir, stat, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';

export type AgentWorkspaceContext = {
  serverName: string;
  serverUrl: string;
  user: string;
};

export type AgentWorkspaceFile = {
  uri: string;
  name: string;
  type: string;
  language?: string;
  content: string;
};

export type AgentWorkspaceInfo = {
  path: string;
  serverName: string;
  user: string;
};

const TYPE_EXTENSIONS: Record<string, string> = {
  SS: '.ssl', APPSS: '.ssl', SRVSCR: '.ssl',
  CS: '.js', APPCS: '.js', CLIENTSCRIPT: '.js', HTMLFORMCODE: '.js',
  DS: '.sql', APPDS: '.sql', DATASOURCESCRIPT: '.sql',
  HTMLFORMXML: '.xml', HTMLFORMRESOURCES: '.xml', HTMLFORMGUIDE: '.json'
};

function safePart(value: string): string {
  const normalized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+$/, '_');
  return normalized.slice(0, 100) || '_';
}

function extensionFor(file: AgentWorkspaceFile): string {
  const current = basename(file.name).match(/\.[a-z0-9]+$/i)?.[0];
  if (current) return current;
  return TYPE_EXTENSIONS[file.type.toUpperCase()] || '.txt';
}

function relativePathFor(file: AgentWorkspaceFile): string {
  const uriParts = file.uri.split('/').filter(Boolean).map(safePart);
  const leaf = safePart(file.name || uriParts.pop() || 'script');
  const parentParts = uriParts.length && uriParts[uriParts.length - 1] === leaf ? uriParts.slice(0, -1) : uriParts;
  return join('items', ...parentParts, `${leaf}${extensionFor(file)}`);
}

async function pathExists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function initializeGit(path: string): Promise<void> {
  if (await pathExists(join(path, '.git'))) return;
  await new Promise<void>((resolve) => {
    execFile('git', ['init'], { cwd: path }, () => resolve());
  });
}

export class AgentWorkspaceManager {
  private active?: AgentWorkspaceInfo;

  constructor(private readonly root: string) {}

  currentPath(): string {
    return this.active?.path || join(this.root, 'default');
  }

  async configure(context: AgentWorkspaceContext): Promise<AgentWorkspaceInfo> {
    const identity = `${context.serverUrl}\n${context.user}`;
    const suffix = createHash('sha256').update(identity).digest('hex').slice(0, 10);
    const directory = `${safePart(context.serverName)}-${safePart(context.user || 'anonymous')}-${suffix}`;
    const path = join(this.root, directory);
    await mkdir(join(path, '.starlims'), { recursive: true });
    await mkdir(join(path, 'items'), { recursive: true });
    const info = { path, serverName: context.serverName, user: context.user };
    await writeFile(join(path, '.starlims', 'workspace.json'), JSON.stringify({ ...context, updatedAt: new Date().toISOString() }, null, 2));
    await writeFile(join(path, 'STARLIMS_WORKSPACE.md'), [
      '# STARLIMS Agent Workspace', '',
      `Server: ${context.serverName} (${context.serverUrl})`,
      `User: ${context.user || 'unknown'}`, '',
      'Files under `items/` are local mirrors of scripts opened in STARLIMS DevTools.',
      'Use the configured STARLIMS MCP tools for authoritative remote reads and all remote changes.'
    ].join('\n'));
    await initializeGit(path);
    this.active = info;
    return info;
  }

  async syncFiles(files: AgentWorkspaceFile[]): Promise<{ path: string; files: number }> {
    const root = this.currentPath();
    await mkdir(join(root, '.starlims'), { recursive: true });
    const manifest: Array<AgentWorkspaceFile & { relativePath: string }> = [];
    for (const file of files) {
      const relativePath = relativePathFor(file);
      const target = join(root, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
      manifest.push({ ...file, content: '', relativePath });
    }
    await writeFile(join(root, '.starlims', 'manifest.json'), JSON.stringify({ updatedAt: new Date().toISOString(), files: manifest }, null, 2));
    return { path: root, files: files.length };
  }
}
