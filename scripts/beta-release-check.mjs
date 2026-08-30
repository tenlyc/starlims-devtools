import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.');
const outputDirectory = resolve(root, 'release-readiness');
const checks = [];
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (id, title, command, args) => {
  const startedAt = Date.now();
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'inherit', env: process.env });
  if (result.error) console.error(`${title}: ${result.error.message}`);
  checks.push({ id, title, status: result.status === 0 ? 'passed' : 'failed', durationMs: Date.now() - startedAt });
  return result.status === 0;
};

let automatedOk = run('project-check', 'TypeScript, build and smoke tests', npmCommand, ['run', 'check']);
automatedOk = run('eslint-baseline', 'ESLint warning baseline', npmCommand, ['run', 'lint:baseline']) && automatedOk;

if (process.env.BETA_INCLUDE_LIVE_WRITE === '1') {
  automatedOk = run('live-write', 'Live STARLIMS write-path acceptance', npmCommand, ['run', 'test:mcp-live-write']) && automatedOk;
} else {
  checks.push({ id: 'live-write', title: 'Live STARLIMS write-path acceptance', status: 'manual', note: 'Run twice on disposable items: once with FINALIZE=undo and once with FINALIZE=checkin.' });
}

checks.push(
  { id: 'mac-signing', title: 'macOS Developer ID signing and notarization', status: 'stable-gate', note: 'Beta may be unsigned when release notes clearly state the first-launch requirement.' },
  { id: 'windows-real-host', title: 'Windows installer and real STARLIMS host acceptance', status: 'stable-gate', note: 'Windows CI guards source/build regressions; a real Windows host remains required before stable.' }
);

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), releaseChannel: 'beta', automatedStatus: automatedOk ? 'passed' : 'failed', checks };
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, 'beta-report.json'), `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  '# STARLIMS DevTools Beta readiness', '', `Generated: ${report.generatedAt}`, '',
  '| Check | Status | Note |', '| --- | --- | --- |',
  ...checks.map((check) => `| ${check.title} | ${check.status} | ${check.note || `${check.durationMs} ms`} |`),
  '', `Automated result: **${report.automatedStatus}**`, ''
].join('\n');
await writeFile(resolve(outputDirectory, 'beta-report.md'), markdown);
console.log(`Beta readiness report: ${resolve(outputDirectory, 'beta-report.md')}`);
if (!automatedOk) process.exit(1);
