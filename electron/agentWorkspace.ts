import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { pathToFileURL } from 'url';

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

export type AgentWorkspaceChange = Omit<AgentWorkspaceFile, 'content'> & {
  relativePath: string;
  kind: 'modified' | 'deleted';
  before: string;
  after: string;
  baselineHash: string;
  proposedHash: string;
  fingerprint: string;
};

type ManifestFile = Omit<AgentWorkspaceFile, 'content'> & {
  relativePath: string;
  baselinePath: string;
  baselineHash: string;
};

type WorkspaceManifest = { updatedAt: string; files: ManifestFile[] };

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

const LOCALIZED_TYPES = new Set([
  'HTMLFORMXML', 'HTMLFORMCODE', 'HTMLFORMGUIDE', 'HTMLFORMRESOURCES',
  'XFDFORMXML', 'XFDFORMCODE', 'XFDFORMRESOURCES'
]);
const SSL_TYPES = new Set(['SS', 'APPSS', 'SRVSCR', 'SERVERSCRIPT', 'APPSERVERSCRIPT']);

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
  const languageSuffix = file.language && LOCALIZED_TYPES.has(file.type.toUpperCase()) ? `.${safePart(file.language)}` : '';
  return join('items', ...parentParts, `${leaf}${languageSuffix}${extensionFor(file)}`);
}

async function pathExists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function readText(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8'); } catch { return undefined; }
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function fileIdentity(file: Pick<AgentWorkspaceFile, 'uri' | 'language'>): string {
  return `${file.uri}\n${file.language || ''}`;
}

function baselineRelativePath(file: Pick<AgentWorkspaceFile, 'uri' | 'language'>): string {
  return join('baselines', `${contentHash(fileIdentity(file))}.txt`);
}

function changeFingerprint(file: Pick<AgentWorkspaceFile, 'uri' | 'language' | 'type'>, kind: 'modified' | 'deleted', baselineHash: string, proposedHash: string, workspaceScope: string): string {
  return contentHash(JSON.stringify({ version: 1, workspaceScope, uri: file.uri, language: file.language || '', type: file.type, kind, baselineHash, proposedHash }));
}

async function initializeGit(path: string): Promise<void> {
  if (await pathExists(join(path, '.git'))) return;
  await new Promise<void>((resolve) => {
    execFile('git', ['init'], { cwd: path }, () => resolve());
  });
}

export class AgentWorkspaceManager {
  private active?: AgentWorkspaceInfo & { statePath: string };

  constructor(private readonly root: string) {}

  currentPath(): string {
    return this.active?.path || join(this.root, 'default');
  }

  private currentStatePath(): string {
    return this.active?.statePath || join(this.root, '.state', 'default');
  }

  async configure(context: AgentWorkspaceContext): Promise<AgentWorkspaceInfo> {
    const identity = `${context.serverUrl}\n${context.user}`;
    const suffix = createHash('sha256').update(identity).digest('hex').slice(0, 10);
    const directory = `${safePart(context.serverName)}-${safePart(context.user || 'anonymous')}-${suffix}`;
    const workspaceRoot = context.rootPath?.trim() || this.root;
    const path = join(workspaceRoot, directory);
    const statePath = join(this.root, '.state', directory);
    await mkdir(join(path, '.starlims'), { recursive: true });
    await mkdir(join(path, 'items'), { recursive: true });
    await mkdir(join(statePath, 'baselines'), { recursive: true });
    const info = { path, serverName: context.serverName, user: context.user };
    await writeFile(join(path, '.starlims', 'workspace.json'), JSON.stringify({ ...context, rootPath: workspaceRoot, updatedAt: new Date().toISOString() }, null, 2));
    await writeFile(join(path, 'STARLIMS_WORKSPACE.md'), [
      '# STARLIMS Agent Workspace', '',
      `Server: ${context.serverName} (${context.serverUrl})`,
      `User: ${context.user || 'unknown'}`, '',
      'Files under `items/` are working copies of the current user’s checked-out STARLIMS scripts.',
      'Local edits are reviewed in STARLIMS DevTools before they are written back to STARLIMS.',
      'User-configured AI rules are managed separately; this workspace never creates or replaces AGENTS.md/agent.md.',
      'Use `.starlims/manifest.json` as an informational URI/language index; STARLIMS DevTools keeps the authoritative baseline separately.'
    ].join('\n'));
    await initializeGit(path);
    this.active = { ...info, statePath };
    return info;
  }

  private async readManifest(): Promise<WorkspaceManifest> {
    const source = await readText(join(this.currentStatePath(), 'manifest.json'));
    if (!source) return { updatedAt: '', files: [] };
    try {
      const parsed = JSON.parse(source) as WorkspaceManifest;
      return { updatedAt: String(parsed.updatedAt || ''), files: Array.isArray(parsed.files) ? parsed.files : [] };
    } catch {
      return { updatedAt: '', files: [] };
    }
  }

  private async writeManifest(manifest: WorkspaceManifest): Promise<void> {
    const root = this.currentPath();
    const statePath = this.currentStatePath();
    await mkdir(statePath, { recursive: true });
    await writeFile(join(statePath, 'manifest.json'), JSON.stringify(manifest, null, 2));
    // This mirror is informational only. Authoritative hashes and baseline paths
    // stay outside the Agent working directory and are never read from here.
    const publicManifest = {
      updatedAt: manifest.updatedAt,
      files: manifest.files.map(({ baselinePath: _baselinePath, baselineHash: _baselineHash, ...file }) => file)
    };
    await writeFile(join(root, '.starlims', 'manifest.json'), JSON.stringify(publicManifest, null, 2));
  }

  async syncFiles(files: AgentWorkspaceFile[]): Promise<{ path: string; files: number; preservedChanges: number }> {
    const root = this.currentPath();
    const statePath = this.currentStatePath();
    await mkdir(join(root, '.starlims'), { recursive: true });
    await mkdir(join(statePath, 'baselines'), { recursive: true });
    const previous = await this.readManifest();
    const previousByIdentity = new Map(previous.files.map((file) => [fileIdentity(file), file]));
    const manifest: ManifestFile[] = [];
    let preservedChanges = 0;
    for (const file of files) {
      const { content, ...metadata } = file;
      const desiredRelativePath = relativePathFor(file);
      const baselinePath = baselineRelativePath(file);
      const baselineTarget = join(statePath, baselinePath);
      const old = previousByIdentity.get(fileIdentity(file));
      const currentContent = await readText(join(root, old?.relativePath || desiredRelativePath));
      const oldBaseline = old ? await readText(join(statePath, old.baselinePath)) : undefined;
      const hasTrackedLocalChanges = Boolean(old && currentContent !== undefined && oldBaseline !== undefined && contentHash(currentContent) !== old.baselineHash);
      const hasUntrackedLocalChanges = Boolean(!old && currentContent !== undefined && contentHash(currentContent) !== contentHash(content));
      const hasRecoveredLocalChanges = Boolean(old && currentContent !== undefined && oldBaseline === undefined && contentHash(currentContent) !== contentHash(content));
      const hasLocalChanges = hasTrackedLocalChanges || hasUntrackedLocalChanges || hasRecoveredLocalChanges;
      const relativePath = hasLocalChanges && old ? old.relativePath : desiredRelativePath;
      const target = join(root, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await mkdir(dirname(baselineTarget), { recursive: true });
      if (hasLocalChanges) {
        preservedChanges++;
        const baseline = old && oldBaseline !== undefined ? oldBaseline : content;
        await writeFile(baselineTarget, baseline, 'utf8');
        manifest.push({ ...metadata, relativePath, baselinePath, baselineHash: old && oldBaseline !== undefined ? old.baselineHash : contentHash(content) });
      } else {
        await writeFile(target, content, 'utf8');
        await writeFile(baselineTarget, content, 'utf8');
        manifest.push({ ...metadata, relativePath, baselinePath, baselineHash: contentHash(content) });
      }
    }
    const currentIdentities = new Set(files.map(fileIdentity));
    // A checkout can disappear while an Agent still has unreviewed work. Keep
    // that manifest entry so the UI can surface the change and reject write-back
    // as a checkout conflict instead of silently losing the local edit.
    for (const old of previous.files) {
      if (currentIdentities.has(fileIdentity(old))) continue;
      const baseline = await readText(join(statePath, old.baselinePath));
      const current = await readText(join(root, old.relativePath));
      if (baseline === undefined) continue;
      if (current === undefined || contentHash(current) !== old.baselineHash) {
        manifest.push(old);
        preservedChanges++;
      }
    }
    await this.writeManifest({ updatedAt: new Date().toISOString(), files: manifest });
    return { path: root, files: files.length, preservedChanges };
  }

  async getChanges(): Promise<AgentWorkspaceChange[]> {
    const root = this.currentPath();
    const statePath = this.currentStatePath();
    const workspaceScope = `${this.active?.serverName || ''}\n${this.active?.user || ''}`;
    const manifest = await this.readManifest();
    const changes: AgentWorkspaceChange[] = [];
    for (const file of manifest.files) {
      const before = await readText(join(statePath, file.baselinePath));
      if (before === undefined) continue;
      const after = await readText(join(root, file.relativePath));
      if (after === undefined) {
        const proposedHash = contentHash('');
        changes.push({ ...file, kind: 'deleted', before, after: '', proposedHash, fingerprint: changeFingerprint(file, 'deleted', file.baselineHash, proposedHash, workspaceScope) });
      } else if (contentHash(after) !== file.baselineHash) {
        const proposedHash = contentHash(after);
        changes.push({ ...file, kind: 'modified', before, after, proposedHash, fingerprint: changeFingerprint(file, 'modified', file.baselineHash, proposedHash, workspaceScope) });
      }
    }
    return changes;
  }

  async lspDocuments(): Promise<Array<{ sourceUri: string; documentUri: string; name: string; type: string; language?: string; content: string }>> {
    const root = this.currentPath();
    const manifest = await this.readManifest();
    const documents: Array<{ sourceUri: string; documentUri: string; name: string; type: string; language?: string; content: string }> = [];
    for (const file of manifest.files) {
      if (!SSL_TYPES.has(file.type.toUpperCase())) continue;
      const absolutePath = join(root, file.relativePath);
      const content = await readText(absolutePath);
      if (content === undefined) continue;
      documents.push({
        sourceUri: file.uri,
        documentUri: pathToFileURL(absolutePath).href,
        name: file.name,
        type: file.type,
        language: file.language,
        content
      });
    }
    return documents;
  }

  async acceptChanges(identities: Array<{ uri: string; language?: string; fingerprint?: string }>): Promise<number> {
    const root = this.currentPath();
    const statePath = this.currentStatePath();
    const workspaceScope = `${this.active?.serverName || ''}\n${this.active?.user || ''}`;
    const manifest = await this.readManifest();
    const accepted = new Set(identities.map(fileIdentity));
    let count = 0;
    for (const file of manifest.files) {
      if (!accepted.has(fileIdentity(file))) continue;
      const content = await readText(join(root, file.relativePath));
      if (content === undefined) continue;
      const requested = identities.find((identity) => fileIdentity(identity) === fileIdentity(file));
      const proposedHash = contentHash(content);
      const currentFingerprint = changeFingerprint(file, 'modified', file.baselineHash, proposedHash, workspaceScope);
      if (requested?.fingerprint && requested.fingerprint !== currentFingerprint) continue;
      await writeFile(join(statePath, file.baselinePath), content, 'utf8');
      file.baselineHash = proposedHash;
      count++;
    }
    await this.writeManifest({ ...manifest, updatedAt: new Date().toISOString() });
    return count;
  }
}
