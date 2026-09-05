import { copyFile, cp, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const sharedRoot = resolve(dirname(fileURLToPath(import.meta.resolve('@tenlyc/starlims-mcp'))), '..');
const distribution = join(sharedRoot, 'scm', 'distribution');
const artifact = join(distribution, 'SCM_API.sdp');
const manifest = JSON.parse(await readFile(join(distribution, 'manifest.json'), 'utf8'));
const bytes = await readFile(artifact);
if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('Shared SCM_API package checksum mismatch.');
// Compatibility source mirror for the existing editor/audit paths. Edit shared
// starlims-mcp/scm/server instead; DevTools never builds an independent SDP.
await cp(join(sharedRoot, 'scm', 'server'), join(root, 'src', 'scm_api'), { recursive: true });
for (const directory of [join(root, 'src', 'scm_api'), join(root, 'release')]) {
  await mkdir(directory, { recursive: true });
  await copyFile(artifact, join(directory, 'SCM_API.sdp'));
}
console.log(`Synced verified SCM_API.sdp from starlims-mcp (${manifest.sha256}).`);
