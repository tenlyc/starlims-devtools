import assert from 'node:assert/strict';
import { AgentRuntimeManager } from '../electron/agentRuntime';

async function main() {
  const events: unknown[] = [];
  const runtime = new AgentRuntimeManager({
    codexCommand: () => 'codex',
    mcpUrl: () => 'http://127.0.0.1:3002/mcp',
    cwd: () => process.cwd(),
    getVersion: () => 'test',
    emit: (event) => events.push(event)
  });

  const statuses = await runtime.statuses(async () => ({ available: false, runtime: 'cli' }));
  assert.equal(statuses.codex.runtime, 'app-server');
  assert.equal(statuses.codex.available, true, statuses.codex.detail);
  assert.equal(statuses.claude.runtime, 'agent-sdk');
  assert.equal(statuses.claude.available, true, statuses.claude.detail);
  assert.equal(statuses.opencode.runtime, 'cli');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (runtime.codex as unknown as { ensureStarted: () => Promise<void> }).ensureStarted(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Codex App Server handshake timed out.')), 10_000); })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  runtime.dispose();

  console.log(`Agent runtime smoke test passed (${statuses.codex.version}; ${statuses.claude.version}).`);
}

void main();
