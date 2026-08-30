import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import type {
  NativeLspLocation,
  NativeLspPosition,
  NativeLspSessionStatus,
  NativeLspWorkspaceDocument,
  NativeLspWorkspaceEdit,
  NativeLspWorkspaceSymbol
} from '../src/types/sslLsp';

type JsonRpcMessage = { jsonrpc?: string; id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message?: string } };
type PendingRequest = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export type SslWorkspaceDocumentInput = NativeLspWorkspaceDocument & { content: string };

const SETTINGS = {
  ssl: {
    format: { indentStyle: 'tab', indentSize: 4, semicolonEnforcement: true },
    diagnostics: { hungarianNotation: false },
    inlayHints: { enabled: true, minParameterCount: 2 }
  }
};

function sourceAliases(uri: string): string[] {
  const aliases = new Set([uri]);
  try {
    const parsed = new URL(uri);
    aliases.add(decodeURIComponent(parsed.pathname));
  } catch {
    if (uri.startsWith('/')) aliases.add(pathToFileURL(uri).href);
  }
  return [...aliases];
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function wordAt(content: string, position: NativeLspPosition): string {
  const line = content.split(/\r?\n/)[position.line] || '';
  const left = line.slice(0, position.character).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] || '';
  const right = line.slice(position.character).match(/^[A-Za-z0-9_]*/)?.[0] || '';
  return `${left}${right}`;
}

function offsetPosition(content: string, offset: number): NativeLspPosition {
  const before = content.slice(0, offset);
  const lines = before.split(/\r?\n/);
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

export class SslLspSession {
  private child?: ChildProcessWithoutNullStreams;
  private stdout = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number | string, PendingRequest>();
  private starting?: Promise<void>;
  private workspaceRoot?: string;
  private lastError?: string;
  private documents = new Map<string, SslWorkspaceDocumentInput>();
  private sourceToDocument = new Map<string, string>();
  private documentToSource = new Map<string, string>();
  private versions = new Map<string, number>();

  constructor(private readonly executable: () => string, private readonly version: () => string) {}

  status(available: boolean): NativeLspSessionStatus {
    return {
      available,
      running: Boolean(this.child && !this.child.killed),
      version: this.version(),
      workspaceRoot: this.workspaceRoot,
      documents: this.documents.size,
      error: this.lastError
    };
  }

  workspaceDocuments(): NativeLspWorkspaceDocument[] {
    return [...this.documents.values()].map(({ content: _content, ...document }) => document);
  }

  workspaceDocument(sourceUri: string): SslWorkspaceDocumentInput | null {
    const uri = this.resolveDocumentUri(sourceUri);
    return this.documents.get(uri) || null;
  }

  async configureWorkspace(root: string | undefined, documents: SslWorkspaceDocumentInput[]): Promise<void> {
    const rootChanged = root !== this.workspaceRoot;
    if (!rootChanged) {
      for (const uri of this.versions.keys()) this.notify('textDocument/didClose', { textDocument: { uri } });
    }
    this.workspaceRoot = root;
    this.documents.clear();
    this.sourceToDocument.clear();
    this.documentToSource.clear();
    this.versions.clear();
    for (const document of documents) {
      this.documents.set(document.documentUri, document);
      this.documentToSource.set(document.documentUri, document.sourceUri);
      for (const alias of sourceAliases(document.sourceUri)) this.sourceToDocument.set(alias, document.documentUri);
    }
    if (rootChanged) await this.stop();
    await this.ensureStarted();
    for (const document of documents) this.openDocument(document.sourceUri, document.content, 1);
  }

  async restart(): Promise<void> {
    const documents = [...this.documents.values()];
    await this.stop();
    await this.ensureStarted();
    for (const document of documents) this.openDocument(document.sourceUri, document.content, 1);
  }

  async syncDocument(sourceUri: string, content: string, version: number): Promise<void> {
    await this.ensureStarted();
    const mapped = this.documents.get(this.resolveDocumentUri(sourceUri));
    if (mapped) mapped.content = content;
    this.openDocument(sourceUri, content, version);
  }

  closeDocument(sourceUri: string): void {
    const uri = this.resolveDocumentUri(sourceUri);
    if (!this.versions.has(uri)) return;
    this.notify('textDocument/didClose', { textDocument: { uri } });
    this.versions.delete(uri);
  }

  async definition(sourceUri: string, position: NativeLspPosition): Promise<NativeLspLocation[]> {
    await this.ensureStarted();
    const result = await this.request<NativeLspLocation | NativeLspLocation[] | null>('textDocument/definition', {
      textDocument: { uri: this.resolveDocumentUri(sourceUri) }, position
    });
    const native = this.translateLocations(result ? (Array.isArray(result) ? result : [result]) : []);
    if (native.length) return native;
    const document = this.workspaceDocument(sourceUri);
    const word = document ? wordAt(document.content, position) : '';
    return word ? this.workspaceProcedureDefinitions(word) : [];
  }

  async references(sourceUri: string, position: NativeLspPosition): Promise<NativeLspLocation[]> {
    await this.ensureStarted();
    const result = await this.request<NativeLspLocation[] | null>('textDocument/references', {
      textDocument: { uri: this.resolveDocumentUri(sourceUri) }, position, context: { includeDeclaration: true }
    });
    const native = this.translateLocations(result || []);
    const document = this.workspaceDocument(sourceUri);
    const word = document ? wordAt(document.content, position) : '';
    const indexed = word && this.workspaceProcedureDefinitions(word).length ? this.workspaceProcedureReferences(word) : [];
    return this.uniqueLocations([...native, ...indexed]);
  }

  async rename(sourceUri: string, position: NativeLspPosition, newName: string): Promise<NativeLspWorkspaceEdit | null> {
    await this.ensureStarted();
    const result = await this.request<NativeLspWorkspaceEdit | null>('textDocument/rename', {
      textDocument: { uri: this.resolveDocumentUri(sourceUri) }, position, newName
    });
    const changes = Object.fromEntries(Object.entries(result?.changes || {}).map(([uri, edits]) => [this.translateUri(uri), edits]));
    const document = this.workspaceDocument(sourceUri);
    const word = document ? wordAt(document.content, position) : '';
    if (word && this.workspaceProcedureDefinitions(word).length) {
      for (const location of this.workspaceProcedureReferences(word)) {
        const existing = changes[location.uri] || [];
        if (!existing.some((edit) => JSON.stringify(edit.range) === JSON.stringify(location.range))) existing.push({ range: location.range, newText: newName });
        changes[location.uri] = existing;
      }
    }
    return Object.keys(changes).length ? { changes } : result;
  }

  async workspaceSymbols(query: string): Promise<NativeLspWorkspaceSymbol[]> {
    await this.ensureStarted();
    const result = await this.request<NativeLspWorkspaceSymbol[] | null>('workspace/symbol', { query });
    return (result || []).map((symbol) => ({
      ...symbol,
      location: { ...symbol.location, uri: this.translateUri(symbol.location.uri) }
    }));
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    this.starting = undefined;
    this.stdout = Buffer.alloc(0);
    this.versions.clear();
    if (!child || child.killed) return;
    child.kill();
    this.rejectPending(new Error('starlims-lsp session stopped.'));
  }

  private resolveDocumentUri(sourceUri: string): string {
    for (const alias of sourceAliases(sourceUri)) {
      const mapped = this.sourceToDocument.get(alias);
      if (mapped) return mapped;
    }
    return sourceUri;
  }

  private translateUri(uri: string): string {
    return this.documentToSource.get(uri) || uri;
  }

  private translateLocations(locations: NativeLspLocation[]): NativeLspLocation[] {
    return locations.map((location) => ({ ...location, uri: this.translateUri(location.uri) }));
  }

  private uniqueLocations(locations: NativeLspLocation[]): NativeLspLocation[] {
    const seen = new Set<string>();
    return locations.filter((location) => {
      const key = `${location.uri}:${location.range.start.line}:${location.range.start.character}:${location.range.end.line}:${location.range.end.character}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private workspaceProcedureDefinitions(name: string): NativeLspLocation[] {
    const pattern = new RegExp(`:PROCEDURE\\s+(${escapeRegex(name)})\\b`, 'gi');
    const locations: NativeLspLocation[] = [];
    for (const document of this.documents.values()) {
      for (const match of document.content.matchAll(pattern)) {
        const offset = (match.index || 0) + match[0].lastIndexOf(match[1]);
        const start = offsetPosition(document.content, offset);
        locations.push({ uri: document.sourceUri, range: { start, end: { line: start.line, character: start.character + match[1].length } } });
      }
    }
    return locations;
  }

  private workspaceProcedureReferences(name: string): NativeLspLocation[] {
    const declaration = new RegExp(`:PROCEDURE\\s+(${escapeRegex(name)})\\b`, 'gi');
    const invocation = new RegExp(`\\b(${escapeRegex(name)})\\s*\\(`, 'gi');
    const locations: NativeLspLocation[] = [];
    for (const document of this.documents.values()) {
      for (const pattern of [declaration, invocation]) {
        pattern.lastIndex = 0;
        for (const match of document.content.matchAll(pattern)) {
          const offset = (match.index || 0) + match[0].indexOf(match[1]);
          const start = offsetPosition(document.content, offset);
          locations.push({ uri: document.sourceUri, range: { start, end: { line: start.line, character: start.character + match[1].length } } });
        }
      }
    }
    return this.uniqueLocations(locations);
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && !this.child.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try { await this.starting; } finally { this.starting = undefined; }
  }

  private async start(): Promise<void> {
    this.lastError = undefined;
    const child = spawn(this.executable(), ['--stdio'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    child.stdout.on('data', (chunk: Buffer) => { this.stdout = Buffer.concat([this.stdout, chunk]); this.parseMessages(); });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { if (chunk.trim()) this.lastError = chunk.trim().slice(-2000); });
    child.once('error', (error) => { this.lastError = error.message; this.child = undefined; this.rejectPending(error); });
    child.once('close', (code) => {
      if (this.child === child) this.child = undefined;
      if (code !== 0 && code !== null) this.lastError = `starlims-lsp exited with code ${code}.`;
      this.rejectPending(new Error(this.lastError || 'starlims-lsp session closed.'));
    });
    const rootUri = this.workspaceRoot ? pathToFileURL(this.workspaceRoot).href : null;
    await this.request('initialize', {
      processId: process.pid,
      clientInfo: { name: 'STARLIMS DevTools', version: this.version() },
      rootUri,
      capabilities: {
        workspace: { workspaceFolders: true, symbol: { dynamicRegistration: false } },
        textDocument: {
          synchronization: { didSave: true },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          rename: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false }
        }
      },
      workspaceFolders: rootUri ? [{ uri: rootUri, name: 'STARLIMS Agent Workspace' }] : null
    });
    this.notify('initialized', {});
    this.notify('workspace/didChangeConfiguration', { settings: SETTINGS });
  }

  private openDocument(sourceUri: string, content: string, version: number): void {
    const uri = this.resolveDocumentUri(sourceUri);
    const previous = this.versions.get(uri);
    if (previous === undefined) {
      this.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'ssl', version, text: content } });
    } else {
      this.notify('textDocument/didChange', { textDocument: { uri, version: Math.max(version, previous + 1) }, contentChanges: [{ text: content }] });
    }
    this.versions.set(uri, Math.max(version, (previous || 0) + (previous === undefined ? 0 : 1)));
  }

  private request<T = unknown>(method: string, params: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.child || this.child.killed) return reject(new Error('starlims-lsp session is not running.'));
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`starlims-lsp request ${method} timed out.`));
      }, 15_000);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    if (this.child && !this.child.killed) this.send({ jsonrpc: '2.0', method, params });
  }

  private send(message: JsonRpcMessage): void {
    const body = JSON.stringify(message);
    this.child?.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
  }

  private parseMessages(): void {
    while (this.stdout.length) {
      const separator = this.stdout.indexOf('\r\n\r\n');
      if (separator < 0) return;
      const header = this.stdout.subarray(0, separator).toString('ascii');
      const length = Number(header.match(/Content-Length:\s*(\d+)/i)?.[1]);
      if (!Number.isFinite(length)) { this.stdout = this.stdout.subarray(separator + 4); continue; }
      const end = separator + 4 + length;
      if (this.stdout.length < end) return;
      const body = this.stdout.subarray(separator + 4, end).toString('utf8');
      this.stdout = this.stdout.subarray(end);
      try { this.handleMessage(JSON.parse(body) as JsonRpcMessage); } catch (error) { this.lastError = error instanceof Error ? error.message : String(error); }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || `LSP error ${message.error.code}`));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      const result = message.method === 'workspace/configuration'
        ? Array.isArray((message.params as { items?: unknown[] })?.items)
          ? (message.params as { items: unknown[] }).items.map(() => SETTINGS.ssl)
          : []
        : null;
      this.send({ jsonrpc: '2.0', id: message.id, result });
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
}
