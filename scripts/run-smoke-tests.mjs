import { spawnSync } from 'node:child_process';

const tests = [
  'ssl-lsp-smoke-test.ts',
  'server-config-smoke-test.ts',
  'ai-context-smoke-test.ts',
  'agent-runtime-smoke-test.ts',
  'mcp-smoke-test.ts',
  'editor-language-smoke-test.ts',
  'checkout-form-smoke-test.ts',
  'enterprise-search-tree-smoke-test.ts',
  'i18n-smoke-test.ts',
  'scm-export-smoke-test.ts',
  'bottom-panel-smoke-test.ts'
];

for (const test of tests) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', `scripts/${test}`], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`All ${tests.length} smoke tests passed.`);
