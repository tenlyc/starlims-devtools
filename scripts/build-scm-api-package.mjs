import { copyFile, mkdtemp, mkdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'src', 'scm_api');
const target = join(source, 'SCM_API.sdp');
const releaseTarget = join(root, 'release', 'SCM_API.sdp');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'starlims-scm-api-'));
const temporaryPackage = join(temporaryRoot, 'SCM_API.sdp');
const packageEntries = [
  'Applications',
  'Client Scripts',
  'Global Resources',
  'Images',
  'SCM Images',
  'Server Scripts',
  'Tables',
  'content.txt',
  'manifest.xml'
];

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

try {
  if (process.platform === 'win32') {
    const paths = packageEntries.map((entry) => `'${join(source, entry).replaceAll("'", "''")}'`).join(',');
    await run('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -LiteralPath ${paths} -DestinationPath '${temporaryPackage.replaceAll("'", "''")}' -Force`], root);
  } else {
    await run('zip', ['-q', '-r', temporaryPackage, ...packageEntries], source);
  }
  await rename(temporaryPackage, target);
  await mkdir(dirname(releaseTarget), { recursive: true });
  await copyFile(target, releaseTarget);
  console.log(`Built unified ${target}`);
  console.log(`Copied release artifact to ${releaseTarget}`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
