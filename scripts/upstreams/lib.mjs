import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const lockPath = resolve(projectRoot, 'upstreams', 'upstreams.lock.json');
export const compatibilityPath = resolve(projectRoot, 'upstreams', 'compatibility.json');

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function readUpstreamLock() {
  const lock = await readJson(lockPath);
  if (lock?.schemaVersion !== 1 || !lock?.sources?.['starlims-lsp'] || !lock?.sources?.starlimsvscode) {
    throw new Error(`Unsupported or incomplete upstream lock: ${lockPath}`);
  }
  return lock;
}

export async function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'starlims-devtools-upstream-manager',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export async function fetchGitHubJson(path, timeout = 30_000) {
  const url = path.startsWith('http') ? path : `https://api.github.com/${path.replace(/^\//, '')}`;
  const response = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${url}: ${await response.text()}`);
  return response.json();
}

export async function download(url, timeout = 180_000) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'starlims-devtools-upstream-manager' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export function platformKey(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

export function lspOutputPath(key = platformKey()) {
  const executable = key.startsWith('win32-') ? 'starlims-lsp.exe' : 'starlims-lsp';
  return resolve(projectRoot, 'resources', 'starlims-lsp', 'bin', key, executable);
}

export function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function shortSha(value) {
  return typeof value === 'string' ? value.slice(0, 12) : '';
}
