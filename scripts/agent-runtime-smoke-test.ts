import assert from 'node:assert/strict';
import { AgentRuntimeManager, CODEX_APPROVAL_REQUEST_METHODS, CODEX_EMBEDDED_ISOLATION_ARGS, CODEX_HTTPS_PROVIDER_ARGS, codexApprovalResponse, codexMcpIsolationArgs, normalizeCodexModels, parseCodexMcpServerNames } from '../electron/agentRuntime';
import { withLocalMcpNoProxy } from '../electron/localMcpEnv';
import type { AgentEvent } from '../electron/agentTypes';
import { createUnifiedDiff, parseUnifiedDiff, summarizeAgentDiff } from '../src/services/agentDiff';
import { isImeCompositionKey } from '../src/services/textInput';

async function main() {
  assert.equal(isImeCompositionKey({ isComposing: true }, false), true);
  assert.equal(isImeCompositionKey({ keyCode: 229 }, false), true);
  assert.equal(isImeCompositionKey({ keyCode: 13 }, true), true);
  assert.equal(isImeCompositionKey({ keyCode: 13 }, false), false);
  const parsedDiff = parseUnifiedDiff([
    'diff --git a/src/old.ts b/src/new.ts',
    'similarity index 80%',
    'rename from src/old.ts',
    'rename to src/new.ts',
    '--- a/src/old.ts',
    '+++ b/src/new.ts',
    '@@ -1,2 +1,2 @@',
    '-const oldName = true;',
    '+const newName = true;',
    ' unchanged();'
  ].join('\n'));
  assert.equal(parsedDiff.length, 1);
  assert.equal(parsedDiff[0].path, 'src/new.ts');
  assert.equal(parsedDiff[0].oldPath, 'src/old.ts');
  assert.equal(parsedDiff[0].kind, 'move');
  assert.deepEqual(summarizeAgentDiff(parsedDiff), { files: [{ ...parsedDiff[0], additions: 1, deletions: 1 }], additions: 1, deletions: 1 });
  const legacyStructuredDiff = summarizeAgentDiff(undefined, JSON.stringify([{ path: '/tmp/demo.ts', kind: { type: 'update' }, diff: '@@ -1 +1 @@\n-old\n+new' }]));
  assert.equal(legacyStructuredDiff.files[0].path, '/tmp/demo.ts');
  assert.equal(legacyStructuredDiff.additions, 1);
  assert.equal(legacyStructuredDiff.deletions, 1);
  const generatedDiff = createUnifiedDiff('/Applications/QM/Test', 'line one\nold value\nline three', 'line one\nnew value\nline three');
  assert.match(generatedDiff, /--- a\/Applications\/QM\/Test/);
  assert.match(generatedDiff, /\+\+\+ b\/Applications\/QM\/Test/);
  assert.deepEqual(summarizeAgentDiff(undefined, generatedDiff), {
    files: [{ path: 'Applications/QM/Test', oldPath: undefined, kind: 'update', diff: generatedDiff, additions: 1, deletions: 1 }],
    additions: 1,
    deletions: 1
  });
  const longBefore = Array.from({ length: 2600 }, (_, index) => `stable line ${index}`);
  const longAfter = [...longBefore];
  longAfter[50] = 'changed near start';
  longAfter[2500] = 'changed near end';
  const focusedDiff = createUnifiedDiff('/Applications/LargeForm', longBefore.join('\r\n'), longAfter.join('\n'));
  const focusedSummary = summarizeAgentDiff(undefined, focusedDiff);
  assert.equal(focusedSummary.additions, 2);
  assert.equal(focusedSummary.deletions, 2);
  assert.ok(focusedDiff.split('\n').length < 40, 'Scattered edits should not render the unchanged middle of a large file.');
  assert.equal(createUnifiedDiff('/Applications/EolOnly', longBefore.join('\r\n'), longBefore.join('\n')), '');

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

  const codexConfig = `
[mcp_servers.notion]
url = "https://mcp.notion.com/mcp"
[mcp_servers.node_repl]
command = "node"
[mcp_servers.node_repl.env]
NODE_ENV = "test"
[mcp_servers."team.docs"]
url = "https://example.invalid/mcp"
`;
  assert.deepEqual(parseCodexMcpServerNames(codexConfig), ['notion', 'node_repl', 'team.docs']);
  const isolationArgs = codexMcpIsolationArgs(codexConfig, ['starlims', 'team_docs']);
  assert.ok(isolationArgs.includes('mcp_servers.notion.enabled=false'));
  assert.ok(isolationArgs.includes('mcp_servers.node_repl.enabled=false'));
  assert.ok(!isolationArgs.some((value) => value.includes('team.docs') && value.endsWith('enabled=false')));
  assert.ok(CODEX_HTTPS_PROVIDER_ARGS.includes('model_providers.starlims_http.supports_websockets=false'));
  assert.ok(CODEX_HTTPS_PROVIDER_ARGS.includes('model_providers.starlims_http.requires_openai_auth=true'));
  assert.ok(CODEX_EMBEDDED_ISOLATION_ARGS.includes('apps'));
  assert.ok(CODEX_EMBEDDED_ISOLATION_ARGS.includes('plugins'));
  assert.ok(CODEX_EMBEDDED_ISOLATION_ARGS.includes('remote_plugin'));
  assert.ok(CODEX_APPROVAL_REQUEST_METHODS.includes('mcpServer/elicitation/request'));
  const elicitationParams = {
    serverName: 'starlims',
    message: 'Allow execute_data_source?',
    _meta: { codex_approval_kind: 'mcp_tool_call', persist: ['session', 'always'] },
    requestedSchema: {
      type: 'object',
      properties: {
        confirmed: { type: 'boolean' },
        scope: { type: 'string', enum: ['once', 'session'] }
      },
      required: ['confirmed']
    }
  };
  assert.deepEqual(codexApprovalResponse('mcpServer/elicitation/request', elicitationParams, 'accept'), {
    action: 'accept', content: { confirmed: true, scope: 'once' }, _meta: null
  });
  assert.deepEqual(codexApprovalResponse('mcpServer/elicitation/request', elicitationParams, 'decline'), {
    action: 'decline', content: null, _meta: null
  });
  assert.deepEqual(codexApprovalResponse('mcpServer/elicitation/request', elicitationParams, 'acceptForSession'), {
    action: 'accept', content: { confirmed: true, scope: 'once' }, _meta: { persist: 'session' }
  });

  const events: AgentEvent[] = [];
  const runtime = new AgentRuntimeManager({
    codexCommand: () => 'codex',
    mcpUrl: () => 'http://127.0.0.1:3102/mcp',
    externalMcpServers: () => [],
    cwd: () => process.cwd(),
    getVersion: () => 'test',
    emit: (event) => events.push(event)
  });
  (runtime.codex as unknown as { handleServerRequest: (message: Record<string, unknown>) => void }).handleServerRequest({
    id: 91,
    method: 'mcpServer/elicitation/request',
    params: elicitationParams
  });
  const elicitationEvent = events.find((event) => event.type === 'approval' && event.requestId?.startsWith('codex:91:'));
  assert.ok(elicitationEvent, 'MCP elicitation must become a visible approval event instead of an unsupported request error.');
  assert.equal(elicitationEvent.kind, 'mcp');
  assert.equal(elicitationEvent.canAcceptForSession, true);

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
