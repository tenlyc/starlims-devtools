import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { AgentWorkspaceManager } from '../electron/agentWorkspace';
import { isReadOnlyAgentToolBlocked } from '../electron/agentRuntime';

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'starlims-agent-workspace-'));
  try {
    const manager = new AgentWorkspaceManager(root);
    const info = await manager.configure({ serverName: 'DEV', serverUrl: 'https://example.test/lims', user: 'LIYC' });
    const synced = await manager.syncFiles([{
      uri: '/Applications/QualityManager/Test/Server Scripts/Validate',
      name: 'Validate', type: 'APPSS', language: 'CHS', content: ':RETURN .T.;'
    }]);
    assert.equal(synced.path, info.path);
    assert.equal(synced.files, 1);
    await stat(join(info.path, '.git'));
    const manifest = JSON.parse(await readFile(join(info.path, '.starlims', 'manifest.json'), 'utf8'));
    assert.equal(manifest.files[0].language, 'CHS');
    assert.match(await readFile(join(info.path, manifest.files[0].relativePath), 'utf8'), /:RETURN \.T\.;/);
    assert.equal(isReadOnlyAgentToolBlocked('Write'), true);
    assert.equal(isReadOnlyAgentToolBlocked('mcp__starlims__save_item'), true);
    assert.equal(isReadOnlyAgentToolBlocked('mcp__starlims__get_item_code'), false);

    const customRoot = join(root, 'custom-root');
    const customInfo = await manager.configure({
      serverName: 'QA', serverUrl: 'https://qa.example.test/lims', user: 'TESTER', rootPath: customRoot
    });
    assert.equal(relative(customRoot, customInfo.path).startsWith('..'), false);
    await stat(join(customInfo.path, '.starlims', 'workspace.json'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  console.log('Agent workspace smoke test passed.');
}

void main();
