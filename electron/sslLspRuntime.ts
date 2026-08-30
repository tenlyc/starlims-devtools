import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import type { NativeLspReleaseInfo, NativeLspUpstreamMetadata, NativeLspVersionInfo, NativeSslFormatResult, NativeSslInventory, NativeSslValidationResult } from '../src/types/sslLsp';

type CommandResult = { stdout: string; stderr: string; code: number | null };

function fileSha256(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
const githubHeaders = (): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  'user-agent': 'STARLIMS-DevTools',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
});

export class SslLspRuntime {
  private readonly bundledVersion: string;
  private selectedVersion: string;
  private cachedInventory?: NativeSslInventory;
  private readonly upstreamMetadata: NativeLspUpstreamMetadata;
  private latestRelease?: NativeLspReleaseInfo;
  private latestReleaseDocument?: GitHubRelease;

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

  release(): NativeLspReleaseInfo | undefined { return this.latestRelease ? { ...this.latestRelease } : undefined; }

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
    const cached = this.cachedExecutablePath(this.selectedVersion);
    if (cached) return cached;
    this.selectedVersion = this.bundledVersion;
    return this.bundledExecutablePath();
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

  async checkForUpdates(): Promise<NativeLspReleaseInfo> {
    const repository = this.repositorySlug();
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`GitHub release check failed with HTTP ${response.status}.`);
    const release = await response.json() as GitHubRelease;
    const version = String(release.tag_name || '').replace(/^v/i, '');
    if (!version) throw new Error('The latest starlims-lsp release has no version tag.');
    const expectedName = this.upstreamMetadata.assets?.[this.platformKey()]?.name || this.defaultAssetName();
    const asset = (release.assets || []).find((item) => item.name === expectedName);
    const checksumAsset = this.findChecksumAsset(release.assets || [], expectedName);
    const githubDigest = this.githubSha256(asset?.digest);
    this.latestReleaseDocument = release;
    this.latestRelease = {
      version,
      releaseUrl: String(release.html_url || `https://github.com/${repository}/releases/tag/v${version}`),
      installable: Boolean(asset?.browser_download_url && (githubDigest || checksumAsset?.browser_download_url)),
      ...(asset?.name ? { assetName: asset.name } : {}),
      ...(release.published_at ? { publishedAt: release.published_at } : {}),
      ...(githubDigest ? { verification: 'github-digest' as const } : checksumAsset ? { verification: 'checksum-asset' as const } : {})
    };
    return { ...this.latestRelease };
  }

  async installLatest(): Promise<string> {
    const info = this.latestRelease || await this.checkForUpdates();
    const release = this.latestReleaseDocument;
    if (!release || !info.installable || !info.assetName) throw new Error(`starlims-lsp ${info.version} does not provide a verifiable ${this.platformKey()} asset.`);
    const asset = (release.assets || []).find((item) => item.name === info.assetName);
    if (!asset?.browser_download_url) throw new Error(`Release asset '${info.assetName}' is missing.`);
    const response = await fetch(asset.browser_download_url, { headers: { 'user-agent': 'STARLIMS-DevTools' }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`starlims-lsp download failed with HTTP ${response.status}.`);
    const content = Buffer.from(await response.arrayBuffer());
    const actualDigest = createHash('sha256').update(content).digest('hex');
    let expectedDigest = this.githubSha256(asset.digest);
    if (!expectedDigest) {
      const checksumAsset = this.findChecksumAsset(release.assets || [], info.assetName);
      if (!checksumAsset?.browser_download_url) throw new Error('The release has no trusted checksum for this platform asset.');
      const checksumResponse = await fetch(checksumAsset.browser_download_url, { headers: { 'user-agent': 'STARLIMS-DevTools' }, signal: AbortSignal.timeout(15_000) });
      if (!checksumResponse.ok) throw new Error(`Checksum download failed with HTTP ${checksumResponse.status}.`);
      const checksumText = await checksumResponse.text();
      expectedDigest = checksumText.split(/\r?\n/).find((line) => line.includes(info.assetName!))?.match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase()
        || checksumText.match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase();
    }
    if (!expectedDigest || expectedDigest !== actualDigest) throw new Error('starlims-lsp SHA-256 verification failed.');

    const directory = join(this.cacheRoot, info.version, this.platformKey());
    const target = join(directory, this.binaryName());
    const temporary = `${target}.download`;
    mkdirSync(directory, { recursive: true });
    try {
      writeFileSync(temporary, content, { mode: 0o700 });
      if (process.platform !== 'win32') chmodSync(temporary, 0o700);
      const versionResult = await this.runExecutable(temporary, ['--version'], '');
      if (!`${versionResult.stdout}${versionResult.stderr}`.includes(info.version)) throw new Error(`Downloaded starlims-lsp reports an unexpected version.`);
      const validation = await this.runExecutable(temporary, ['--validate', '--stdin'], '#include "AUDIT.HTML_EnterpriseAudit"\n:DECLARE sName;\nsName := "ok";\n', true);
      const parsed = JSON.parse(validation.stdout) as Array<{ diagnostics?: Array<{ message?: string }> }>;
      const messages = (parsed[0]?.diagnostics || []).map((item) => item.message || '').join('\n');
      if (/include.*semicolon|unknown.*include/i.test(messages)) throw new Error('Downloaded starlims-lsp is incompatible with STARLIMS Designer include syntax.');
      const formatted = await this.runExecutable(temporary, ['--format', '--stdin'], ':DECLARE sName;\nsName:="ok";\n');
      if (!formatted.stdout.trim()) throw new Error('Downloaded starlims-lsp failed the formatting contract.');
      renameSync(temporary, target);
      if (process.platform !== 'win32') chmodSync(target, 0o755);
      writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ version: info.version, platform: this.platformKey(), source: info.releaseUrl, asset: info.assetName, sha256: actualDigest }, null, 2));
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    this.selectedVersion = info.version;
    this.cachedInventory = undefined;
    return info.version;
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
    return this.runExecutable(this.executablePath(), args, input, args[0] === '--validate');
  }

  private runExecutable(executable: string, args: string[], input: string, allowValidationFailure = false): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
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
      child.stdin.on('error', (error: NodeJS.ErrnoException) => {
        // A short-lived executable may print a complete response and exit
        // before Node finishes closing stdin. The subsequent EPIPE is benign;
        // the close handler still validates the exit code and stdout.
        if (error.code === 'EPIPE') return;
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        // validate intentionally exits 1 when diagnostics contain errors, while
        // still returning valid JSON on stdout.
        if ((code === 0 || (allowValidationFailure && code === 1)) && stdout.trim()) resolve({ stdout, stderr, code });
        else reject(new Error(stderr.trim() || `starlims-lsp exited with code ${code}.`));
      });
      child.stdin.end(input, 'utf8');
    });
  }

  private repositorySlug(): string {
    const match = String(this.upstreamMetadata.repository || '').match(/github\.com\/([^/]+\/[^/#]+?)(?:\.git)?$/i);
    return match?.[1] || 'mahoskye/starlims-lsp';
  }

  private defaultAssetName(): string {
    const arch = process.arch === 'x64' ? 'amd64' : process.arch;
    if (process.platform === 'win32') return `starlims-lsp-windows-${arch}.exe`;
    const platform = process.platform === 'darwin' ? 'darwin' : process.platform;
    return `starlims-lsp-${platform}-${arch}`;
  }

  private githubSha256(value?: string): string | undefined {
    const match = String(value || '').match(/^sha256:([a-f0-9]{64})$/i);
    return match?.[1]?.toLowerCase();
  }

  private findChecksumAsset(assets: GitHubAsset[], binaryName: string): GitHubAsset | undefined {
    return assets.find((asset) => asset.name === `${binaryName}.sha256`)
      || assets.find((asset) => /^(?:sha256sums|checksums)(?:\.txt)?$/i.test(String(asset.name || '')));
  }
}

type GitHubAsset = { name?: string; browser_download_url?: string; digest?: string };
type GitHubRelease = { tag_name?: string; html_url?: string; published_at?: string; assets?: GitHubAsset[] };
