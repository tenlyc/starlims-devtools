import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SslLspSession } from '../electron/sslLspSession';

async function main(): Promise<void> {
  const lock = JSON.parse(readFileSync(resolve('upstreams/upstreams.lock.json'), 'utf8')) as { sources: { 'starlims-lsp': { version: string } } };
  const version = lock.sources['starlims-lsp'].version;
  const platform = `${process.platform}-${process.arch}`;
  const executable = resolve('resources/starlims-lsp/bin', platform, process.platform === 'win32' ? 'starlims-lsp.exe' : 'starlims-lsp');
  const session = new SslLspSession(() => executable, () => version);
  const alphaUri = '/Applications/Test/ServerScripts/Alpha';
  const betaUri = '/Applications/Test/ServerScripts/Beta';
  try {
    await session.configureWorkspace(resolve('.'), [
      { sourceUri: alphaUri, documentUri: 'file:///tmp/starlims-alpha.ssl', name: 'Alpha', type: 'SS', content: ':PROCEDURE Alpha;\n:PARAMETERS sValue;\n:RETURN sValue;\n:ENDPROC;\n' },
      { sourceUri: betaUri, documentUri: 'file:///tmp/starlims-beta.ssl', name: 'Beta', type: 'SS', content: ':DECLARE sResult;\nsResult := Alpha("x");\n' }
    ]);
    assert.equal(session.status(true).running, true);
    assert.equal(session.status(true).documents, 2);
    assert.ok((await session.workspaceSymbols('Alpha')).some((symbol) => symbol.name === 'Alpha' && symbol.location.uri === alphaUri));
    assert.deepEqual((await session.definition(betaUri, { line: 1, character: 13 }))[0]?.uri, alphaUri);
    const references = await session.references(alphaUri, { line: 0, character: 12 });
    assert.ok(references.some((location) => location.uri === alphaUri));
    assert.ok(references.some((location) => location.uri === betaUri));
    const rename = await session.rename(alphaUri, { line: 0, character: 12 }, 'Alpha2');
    assert.equal(rename?.changes?.[alphaUri]?.[0]?.newText, 'Alpha2');
    assert.equal(rename?.changes?.[betaUri]?.[0]?.newText, 'Alpha2');
    await Promise.all([session.restart(), session.restart()]);
    assert.equal(session.status(true).running, true);
    assert.equal(session.status(true).documents, 2);
    assert.ok((await session.workspaceSymbols('Alpha')).some((symbol) => symbol.name === 'Alpha' && symbol.location.uri === alphaUri));
  } finally {
    await session.stop();
  }
  console.log(`Persistent starlims-lsp ${version} session and conservative cross-file procedure navigation smoke test passed.`);
}

void main();
