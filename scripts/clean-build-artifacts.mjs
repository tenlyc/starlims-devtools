import { readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const fixedOutputs = new Set(['dist', 'dist-electron', 'out', 'release']);
const targets = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fixedOutputs.has(name) || /^release-/.test(name));

for (const name of targets) {
  rmSync(resolve(root, name), { recursive: true, force: true });
  console.log(`Removed ${name}/`);
}

console.log('Build artifacts cleaned. Future packages are written only to release/.');
