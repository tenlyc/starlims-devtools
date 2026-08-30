import { spawnSync } from 'node:child_process';

const tests = [
  'ssl-lsp-smoke-test.ts',
  'ssl-lsp-package-runtime-smoke-test.ts',
  'upstream-management-smoke-test.ts',
  'starlims-lsp-upstream-smoke-test.ts',
  'ssl-lsp-session-smoke-test.ts',
  'server-config-smoke-test.ts',
  'windows-icon-smoke-test.ts',
  'ai-context-smoke-test.ts',
  'dependency-index-smoke-test.ts',
  'ai-platform-smoke-test.ts',
  'write-gate-smoke-test.ts',
  'generic-agent-tools-smoke-test.ts',
  'agent-runtime-smoke-test.ts',
  'agent-workspace-smoke-test.ts',
  'shared-mcp-component-smoke-test.ts',
  'shared-mcp-runtime-smoke-test.ts',
  'shared-mcp-fallback-smoke-test.ts',
  'shared-mcp-package-runtime-smoke-test.ts',
  'mcp-smoke-test.ts',
  'form-resources-mcp-smoke-test.ts',
  'editor-language-smoke-test.ts',
  'editor-productivity-smoke-test.ts',
  'context-menu-smoke-test.ts',
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
