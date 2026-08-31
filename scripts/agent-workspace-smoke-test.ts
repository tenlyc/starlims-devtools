import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { AgentWorkspaceManager } from '../electron/agentWorkspace';
import { isReadOnlyAgentToolBlocked } from '../electron/agentRuntime';
import { collectAgentTurnWorkspaceFiles } from '../src/services/agentWorkspaceService';

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'starlims-agent-workspace-'));
  try {
    const manager = new AgentWorkspaceManager(root);
    const info = await manager.configure({ serverName: 'DEMO', serverUrl: 'https://starlims.example.test/LIMS', user: 'DEMO_USER' });
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
    await manager.syncFiles([{
      uri: '/Applications/QualityManager/Test/Server Scripts/Helper',
      name: 'Helper', type: 'APPSS', content: ':RETURN NIL;'
    }], { replace: false });
    const incrementalManifest = JSON.parse(await readFile(join(info.path, '.starlims', 'manifest.json'), 'utf8'));
    assert.equal(incrementalManifest.files.length, 2, 'Targeted sync must retain clean files from previous turns.');
    await manager.syncFiles([{
      uri: '/Applications/QualityManager/Test/Server Scripts/Validate',
      name: 'Validate', type: 'APPSS', language: 'CHS', content: ':RETURN .T.;'
    }]);
    const workingCopy = join(info.path, manifest.files[0].relativePath);
    await writeFile(workingCopy, ':RETURN .F.;', 'utf8');
    const preserved = await manager.syncFiles([{
      uri: '/Applications/QualityManager/Test/Server Scripts/Validate',
      name: 'Validate', type: 'APPSS', language: 'CHS', content: ':RETURN .T.;'
    }]);
    assert.equal(preserved.preservedChanges, 1);
    assert.equal(await readFile(workingCopy, 'utf8'), ':RETURN .F.;');
    const changes = await manager.getChanges();
    assert.equal(changes.length, 1);
    assert.equal(changes[0].before, ':RETURN .T.;');
    assert.equal(changes[0].after, ':RETURN .F.;');
    assert.equal(changes[0].fingerprint.length, 64);
    assert.equal(await manager.acceptChanges([{ uri: changes[0].uri, language: changes[0].language, fingerprint: 'stale' }]), 0);
    assert.equal(await manager.acceptChanges([{ uri: changes[0].uri, language: changes[0].language, fingerprint: changes[0].fingerprint }]), 1);
    assert.equal((await manager.getChanges()).length, 0);
    await writeFile(workingCopy, ':RETURN "discard me";', 'utf8');
    const disposableChange = (await manager.getChanges())[0];
    assert.equal(await manager.discardChanges([{ uri: disposableChange.uri, language: disposableChange.language, fingerprint: 'stale' }]), 0);
    assert.equal(await manager.discardChanges([{ uri: disposableChange.uri, language: disposableChange.language, fingerprint: disposableChange.fingerprint }]), 1);
    assert.equal(await readFile(workingCopy, 'utf8'), ':RETURN .F.;');
    assert.equal((await manager.getChanges()).length, 0);
    const refreshed = await manager.syncFiles([{
      uri: '/Applications/QualityManager/Test/Server Scripts/Validate',
      name: 'Validate', type: 'APPSS', language: 'CHS', content: ':RETURN NIL;'
    }]);
    assert.equal(refreshed.preservedChanges, 0);
    assert.equal(await readFile(workingCopy, 'utf8'), ':RETURN NIL;');
    await manager.syncFiles([
      { uri: '/Applications/QM/App/HTMLForms/XML/Main', name: 'Main [XML]', type: 'HTMLFORMXML', language: 'CHS', content: '<chs />' },
      { uri: '/Applications/QM/App/HTMLForms/XML/Main', name: 'Main [XML]', type: 'HTMLFORMXML', language: 'ENG', content: '<eng />' }
    ]);
    const localizedManifest = JSON.parse(await readFile(join(info.path, '.starlims', 'manifest.json'), 'utf8'));
    assert.equal(localizedManifest.files.length, 2);
    assert.notEqual(localizedManifest.files[0].relativePath, localizedManifest.files[1].relativePath);
    await writeFile(join(info.path, localizedManifest.files[0].relativePath), '<local-change />', 'utf8');
    const stalePreserved = await manager.syncFiles([{
      uri: '/Applications/QM/App/HTMLForms/XML/Main', name: 'Main [XML]', type: 'HTMLFORMXML', language: 'ENG', content: '<eng />'
    }]);
    assert.equal(stalePreserved.preservedChanges, 1);
    assert.equal((await manager.getChanges()).length, 1);
    assert.equal(isReadOnlyAgentToolBlocked('Write'), true);
    assert.equal(isReadOnlyAgentToolBlocked('mcp__starlims__save_item'), true);
    assert.equal(isReadOnlyAgentToolBlocked('mcp__starlims__get_item_code'), false);
    const targeted = collectAgentTurnWorkspaceFiles([{
      id: 'context', uri: '/Applications/QM/App/Server Scripts/Referenced', name: 'Referenced',
      type: 'APPSS', language: 'CHS', content: ':RETURN .T.;', source: 'checkout'
    }, {
      id: 'local', uri: '/tmp/notes.txt', name: 'notes.txt', type: 'File', content: 'notes', source: 'file'
    }], {
      uri: '/Applications/QM/App/Server Scripts/Active', name: 'Active', type: 'APPSS',
      content: ':RETURN NIL;'
    });
    assert.deepEqual(targeted.map((file) => file.name), ['Active', 'Referenced']);

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
