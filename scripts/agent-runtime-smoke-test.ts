import assert from 'node:assert/strict';
import { AgentRuntimeManager } from '../electron/agentRuntime';
import { withLocalMcpNoProxy } from '../electron/localMcpEnv';

async function main() {
  const proxyEnv = withLocalMcpNoProxy({
    HTTP_PROXY: 'http://127.0.0.1:7897',
    no_proxy: 'example.internal,127.0.0.1'
  });
  assert.equal(proxyEnv.HTTP_PROXY, 'http://127.0.0.1:7897');
  assert.equal(proxyEnv.NO_PROXY, 'example.internal,127.0.0.1,localhost,::1');
  assert.equal(proxyEnv.no_proxy, proxyEnv.NO_PROXY);

  const events: unknown[] = [];
  const runtime = new AgentRuntimeManager({
    codexCommand: () => 'codex',
    mcpUrl: () => 'http://127.0.0.1:3102/mcp',
    cwd: () => process.cwd(),
    getVersion: () => 'test',
    emit: (event) => events.push(event)
  });

  const statuses = await runtime.statuses(async () => ({ available: false, runtime: 'cli' }));
  assert.equal(statuses.codex.runtime, 'app-server');
  assert.equal(statuses.claude.runtime, 'agent-sdk');
  assert.equal(statuses.claude.available, true, statuses.claude.detail);
  assert.equal(statuses.opencode.runtime, 'cli');
  if (!statuses.codex.available) {
    runtime.dispose();
    console.log(`Agent runtime smoke test passed (Codex optional runtime unavailable: ${statuses.codex.detail || 'not installed'}; Claude Agent SDK ${statuses.claude.version}).`);
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

  console.log(`Agent runtime smoke test passed (${statuses.codex.version}; ${statuses.claude.version}).`);
}

void main();
