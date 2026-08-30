import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SharedMcpReleaseInfo, SharedMcpVersionInfo } from '../src/types/sharedMcp';
import { SHARED_MCP_VERSION } from './mcpCapabilities';

const REPOSITORY = 'tenlyc/starlims-mcp';
const SERVER_ASSET = 'starlims-mcp-devtools-server.cjs';
const DIGEST_ASSET = `${SERVER_ASSET}.sha256`;

type GitHubAsset = { name?: string; browser_download_url?: string };
type GitHubRelease = { tag_name?: string; html_url?: string; published_at?: string; assets?: GitHubAsset[] };

const sha256 = (content: Buffer | string): string => createHash('sha256').update(content).digest('hex');
const normalizeVersion = (value: string): string => value.trim().replace(/^v/i, '');
const githubHeaders = (): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  'user-agent': 'STARLIMS-DevTools',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
});

export class SharedMcpPackageRuntime {
  readonly bundledVersion = SHARED_MCP_VERSION;
  private selectedVersion: string;
  private latestRelease?: SharedMcpReleaseInfo;
  private latestReleaseDocument?: GitHubRelease;

  constructor(
    private readonly bundledPath: string,
    private readonly cacheRoot: string,
    selectedVersion?: string
  ) {
    this.selectedVersion = selectedVersion && this.cachedServerPath(selectedVersion) ? selectedVersion : this.bundledVersion;
  }

  get version(): string { return this.selectedVersion; }

  executablePath(): string {
    const cached = this.cachedServerPath(this.selectedVersion);
    if (cached) return cached;
    this.selectedVersion = this.bundledVersion;
    return this.bundledPath;
  }

  release(): SharedMcpReleaseInfo | undefined { return this.latestRelease ? { ...this.latestRelease } : undefined; }

  listVersions(): SharedMcpVersionInfo[] {
    const versions = new Set<string>([this.bundledVersion]);
    try {
      for (const entry of readdirSync(this.cacheRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && this.cachedServerPath(entry.name)) versions.add(entry.name);
      }
    } catch { /* Empty cache. */ }
    return [...versions]
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
      .map((version) => ({
        version,
        active: version === this.selectedVersion,
        bundled: version === this.bundledVersion,
        cached: Boolean(this.cachedServerPath(version))
      }));
  }

  selectVersion(version: string): boolean {
    const normalized = normalizeVersion(version);
    if (normalized !== this.bundledVersion && !this.cachedServerPath(normalized)) return false;
    this.selectedVersion = normalized;
    return true;
  }

  async checkForUpdates(): Promise<SharedMcpReleaseInfo> {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
      headers: githubHeaders(),
      signal: AbortSignal.timeout(15_000)
    });
    let release: GitHubRelease;
    if (response.status === 404) {
      const tagsResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/tags?per_page=1`, {
        headers: githubHeaders(),
        signal: AbortSignal.timeout(15_000)
      });
      if (!tagsResponse.ok) throw new Error(`GitHub tag check failed with HTTP ${tagsResponse.status}.`);
      const tags = await tagsResponse.json() as Array<{ name?: string }>;
      release = { tag_name: tags[0]?.name, html_url: tags[0]?.name ? `https://github.com/${REPOSITORY}/releases/tag/${tags[0].name}` : undefined, assets: [] };
    } else {
      if (!response.ok) throw new Error(`GitHub release check failed with HTTP ${response.status}.`);
      release = await response.json() as GitHubRelease;
    }
    const version = normalizeVersion(String(release.tag_name || ''));
    if (!version) throw new Error('The latest starlims-mcp release has no version tag.');
    const names = new Set((release.assets || []).map((asset) => asset.name));
    this.latestReleaseDocument = release;
    this.latestRelease = {
      version,
      releaseUrl: String(release.html_url || `https://github.com/${REPOSITORY}/releases/tag/v${version}`),
      installable: names.has(SERVER_ASSET) && names.has(DIGEST_ASSET),
      ...(release.published_at ? { publishedAt: release.published_at } : {})
    };
    return { ...this.latestRelease };
  }

  async installLatest(): Promise<string> {
    const releaseInfo = this.latestRelease || await this.checkForUpdates();
    const release = this.latestReleaseDocument;
    if (!release || !releaseInfo.installable) {
      throw new Error(`starlims-mcp ${releaseInfo.version} does not provide the verified DevTools Server assets.`);
    }
    const findAsset = (name: string): string => {
      const url = release.assets?.find((asset) => asset.name === name)?.browser_download_url;
      if (!url) throw new Error(`Release asset '${name}' is missing.`);
      return url;
    };
    const [serverResponse, digestResponse] = await Promise.all([
      fetch(findAsset(SERVER_ASSET), { headers: { 'user-agent': 'STARLIMS-DevTools' }, signal: AbortSignal.timeout(60_000) }),
      fetch(findAsset(DIGEST_ASSET), { headers: { 'user-agent': 'STARLIMS-DevTools' }, signal: AbortSignal.timeout(15_000) })
    ]);
    if (!serverResponse.ok || !digestResponse.ok) throw new Error('Unable to download the verified starlims-mcp Server assets.');
    const content = Buffer.from(await serverResponse.arrayBuffer());
    const digestText = await digestResponse.text();
    const expectedDigest = digestText.match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase();
    const actualDigest = sha256(content);
    if (!expectedDigest || expectedDigest !== actualDigest) throw new Error('starlims-mcp Server SHA-256 verification failed.');

    const directory = join(this.cacheRoot, releaseInfo.version);
    const target = join(directory, SERVER_ASSET);
    const temporary = `${target}.download`;
    mkdirSync(directory, { recursive: true });
    try {
      writeFileSync(temporary, content, { mode: 0o600 });
      renameSync(temporary, target);
      writeFileSync(join(directory, 'manifest.json'), JSON.stringify({
        version: releaseInfo.version,
        repository: `https://github.com/${REPOSITORY}`,
        release: releaseInfo.releaseUrl,
        asset: SERVER_ASSET,
        sha256: actualDigest
      }, null, 2));
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    this.selectedVersion = releaseInfo.version;
    return releaseInfo.version;
  }

  private cachedServerPath(version: string): string | null {
    const directory = join(this.cacheRoot, normalizeVersion(version));
    const target = join(directory, SERVER_ASSET);
    const manifestPath = join(directory, 'manifest.json');
    if (!existsSync(target) || !existsSync(manifestPath)) return null;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: string; sha256?: string };
      return manifest.version === normalizeVersion(version) && manifest.sha256 === sha256(readFileSync(target)) ? target : null;
    } catch { return null; }
  }
}
