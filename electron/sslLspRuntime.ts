import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import type { NativeLspUpstreamMetadata, NativeLspVersionInfo, NativeSslFormatResult, NativeSslInventory, NativeSslValidationResult } from '../src/types/sslLsp';

type CommandResult = { stdout: string; stderr: string; code: number | null };

function fileSha256(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

export class SslLspRuntime {
  private readonly bundledVersion: string;
  private selectedVersion: string;
  private cachedInventory?: NativeSslInventory;
  private readonly upstreamMetadata: NativeLspUpstreamMetadata;

  constructor(private readonly resourcePath: string, private readonly cacheRoot: string = join(tmpdir(), 'starlims-devtools-lsp-cache'), selectedVersion?: string) {
    try {
      const manifest = JSON.parse(readFileSync(join(resourcePath, 'starlims-lsp', 'VERSION.json'), 'utf8')) as NativeLspUpstreamMetadata & { version?: string };
      this.bundledVersion = manifest.version || 'unknown';
      this.upstreamMetadata = manifest;
    } catch {
      this.bundledVersion = 'unknown';
      this.upstreamMetadata = {};
    }
    this.cacheBundledVersion();
    this.selectedVersion = selectedVersion && this.cachedExecutablePath(selectedVersion) ? selectedVersion : this.bundledVersion;
  }

  get version(): string { return this.selectedVersion; }

  metadata(): NativeLspUpstreamMetadata { return structuredClone(this.upstreamMetadata); }

  private platformKey(): string { return `${process.platform}-${process.arch}`; }

  private binaryName(): string { return process.platform === 'win32' ? 'starlims-lsp.exe' : 'starlims-lsp'; }

  private bundledExecutablePath(): string {
    return join(this.resourcePath, 'starlims-lsp', 'bin', this.platformKey(), this.binaryName());
  }

  private cachedExecutablePath(version: string): string | null {
    const executable = join(this.cacheRoot, version, this.platformKey(), this.binaryName());
    const manifestPath = join(this.cacheRoot, version, this.platformKey(), 'manifest.json');
    if (!existsSync(executable) || !existsSync(manifestPath)) return null;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { sha256?: string };
      return manifest.sha256 && fileSha256(executable) === manifest.sha256 ? executable : null;
    } catch { return null; }
  }

  private cacheBundledVersion(): void {
    const source = this.bundledExecutablePath();
    if (this.bundledVersion === 'unknown' || !existsSync(source)) return;
    const directory = join(this.cacheRoot, this.bundledVersion, this.platformKey());
    const target = join(directory, this.binaryName());
    try {
      const expectedDigest = this.upstreamMetadata.assets?.[this.platformKey()]?.sha256;
      const actualDigest = fileSha256(source);
      if (!expectedDigest || actualDigest !== expectedDigest) return;
      mkdirSync(directory, { recursive: true });
      if (!existsSync(target) || fileSha256(target) !== actualDigest) copyFileSync(source, target);
      if (process.platform !== 'win32') chmodSync(target, 0o755);
      writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ version: this.bundledVersion, platform: this.platformKey(), source: 'bundled', sha256: actualDigest }, null, 2));
    } catch { /* A read-only or unavailable cache must not disable the bundled runtime. */ }
  }

  executablePath(): string {
    return this.cachedExecutablePath(this.selectedVersion) || this.bundledExecutablePath();
  }

  listVersions(): NativeLspVersionInfo[] {
    const versions = new Set<string>([this.bundledVersion]);
    try { for (const entry of readdirSync(this.cacheRoot, { withFileTypes: true })) if (entry.isDirectory() && this.cachedExecutablePath(entry.name)) versions.add(entry.name); } catch { /* empty cache */ }
    return [...versions].filter((version) => version !== 'unknown').sort((a, b) => b.localeCompare(a, undefined, { numeric: true })).map((version) => ({
      version,
      active: version === this.selectedVersion,
      bundled: version === this.bundledVersion,
      cached: Boolean(this.cachedExecutablePath(version))
    }));
  }

  selectVersion(version: string): boolean {
    if (version !== this.bundledVersion && !this.cachedExecutablePath(version)) return false;
    this.selectedVersion = version;
    this.cachedInventory = undefined;
    return true;
  }

  isAvailable(): boolean {
    return existsSync(this.executablePath());
  }

  async validate(content: string, options: { dataSource?: boolean; info?: boolean; hungarianTypes?: boolean } = {}): Promise<NativeSslValidationResult> {
    if (!this.isAvailable()) return { available: false, valid: true, diagnostics: [], error: 'Native starlims-lsp binary is not installed.' };
    const args = ['--validate', '--stdin'];
    if (options.dataSource) args.push('--ds');
    if (options.info) args.push('--info');
    if (options.hungarianTypes) args.push('--hungarian-types');
    try {
      const result = await this.run(args, content);
      const parsed = JSON.parse(result.stdout) as Array<{ valid?: boolean; diagnostics?: NativeSslValidationResult['diagnostics'] }>;
      const first = parsed[0] || {};
      return { available: true, version: this.version, valid: first.valid !== false, diagnostics: first.diagnostics || [] };
    } catch (error) {
      return { available: true, version: this.version, valid: false, diagnostics: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async format(content: string): Promise<NativeSslFormatResult> {
    if (!this.isAvailable()) return { available: false, error: 'Native starlims-lsp binary is not installed.' };
    try {
      const result = await this.run(['--format', '--stdin'], content);
      return { available: true, version: this.version, content: result.stdout };
    } catch (error) {
      return { available: true, version: this.version, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async inventory(): Promise<NativeSslInventory | null> {
    if (this.cachedInventory) return this.cachedInventory;
    if (!this.isAvailable()) return null;
    const result = await this.run(['--export-signatures'], '');
    const parsed = JSON.parse(result.stdout) as NativeSslInventory;
    this.cachedInventory = {
      version: parsed.version || this.version,
      functions: Array.isArray(parsed.functions) ? parsed.functions : [],
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : []
    };
    return this.cachedInventory;
  }

  private run(args: string[], input: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executablePath(), args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('starlims-lsp timed out after 15 seconds.'));
      }, 15_000);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('close', (code) => {
        clearTimeout(timer);
        // validate intentionally exits 1 when diagnostics contain errors, while
        // still returning valid JSON on stdout.
        if ((code === 0 || (args[0] === '--validate' && code === 1)) && stdout.trim()) resolve({ stdout, stderr, code });
        else reject(new Error(stderr.trim() || `starlims-lsp exited with code ${code}.`));
      });
      child.stdin.end(input, 'utf8');
    });
  }
}
