import assert from 'node:assert/strict';
import { AgentRuntimeManager, normalizeCodexModels } from '../electron/agentRuntime';
import { withLocalMcpNoProxy } from '../electron/localMcpEnv';
import type { AgentEvent } from '../electron/agentTypes';

async function main() {
  assert.deepEqual(normalizeCodexModels({ models: [
    { id: 'new-schema', name: 'New schema', default: true },
    { model: 'legacy-schema', displayName: 'Legacy schema' },
    { id: 'new-schema', name: 'Duplicate' },
    { id: 'hidden', hidden: true }
  ] }), [
    { id: 'new-schema', name: 'New schema', description: undefined, isDefault: true },
    { id: 'legacy-schema', name: 'Legacy schema', description: undefined, isDefault: false }
  ]);
  const proxyEnv = withLocalMcpNoProxy({
    HTTP_PROXY: 'http://127.0.0.1:7897',
    no_proxy: 'example.internal,127.0.0.1'
  });
  assert.equal(proxyEnv.HTTP_PROXY, 'http://127.0.0.1:7897');
  assert.equal(proxyEnv.NO_PROXY, 'example.internal,127.0.0.1,localhost,::1');
  assert.equal(proxyEnv.no_proxy, proxyEnv.NO_PROXY);

  const events: AgentEvent[] = [];
  const runtime = new AgentRuntimeManager({
    codexCommand: () => 'codex',
    mcpUrl: () => 'http://127.0.0.1:3102/mcp',
    externalMcpServers: () => [],
    cwd: () => process.cwd(),
    getVersion: () => 'test',
    emit: (event) => events.push(event)
  });

  const statuses = await runtime.statuses(async () => ({ available: false, runtime: 'cli' }));
  assert.equal(statuses.codex.runtime, 'app-server');
  assert.equal(statuses.claude, undefined, 'Claude Agent SDK must not be bundled in the desktop runtime.');
  assert.equal(statuses.opencode.runtime, 'cli');
  if (!statuses.codex.available || process.env.STARLIMS_TEST_CODEX_RUNTIME !== '1') {
    runtime.dispose();
    console.log(`Agent runtime smoke test passed (${statuses.codex.available ? 'live handshake skipped; set STARLIMS_TEST_CODEX_RUNTIME=1 to enable' : `optional runtime unavailable: ${statuses.codex.detail || 'not installed'}`}; no bundled Claude Agent SDK).`);
    return;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (runtime.codex as unknown as { ensureStarted: () => Promise<void> }).ensureStarted(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Codex App Server handshake timed out.')), 10_000); })
    ]);
    const models = await runtime.models('codex');
    assert.ok(models.length > 0, 'Codex App Server did not return any selectable models.');
    assert.ok(models.some((model) => model.isDefault), 'Codex App Server model list has no default model.');
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  runtime.dispose();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(
    events.some((event) => event.type === 'error' && event.text.includes('exited with code null')),
    false,
    'An intentional Codex runtime restart must not be reported as a crash.'
  );

  console.log(`Agent runtime smoke test passed (${statuses.codex.version}; no bundled Claude Agent SDK).`);
}

void main();
