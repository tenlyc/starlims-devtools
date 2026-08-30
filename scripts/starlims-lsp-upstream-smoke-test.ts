import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SslLspRuntime } from '../electron/sslLspRuntime';
import { preserveDesignerIncludes } from '../src/services/sslLspCompatibility';

async function main(): Promise<void> {
  const lock = JSON.parse(readFileSync(resolve('upstreams/upstreams.lock.json'), 'utf8')) as {
    sources: { 'starlims-lsp': { version: string } };
  };
  const expectedVersion = lock.sources['starlims-lsp'].version;
  const runtime = new SslLspRuntime(resolve('resources'));
  assert.equal(runtime.version, expectedVersion);
  assert.equal(runtime.isAvailable(), true, `Missing prepared starlims-lsp binary: ${runtime.executablePath()}`);
  const inventory = await runtime.inventory();
  assert.equal(inventory?.version, expectedVersion);
  assert.ok((inventory?.functions.length || 0) >= 300, 'Expected the upstream built-in function inventory');
  assert.ok((inventory?.classes.length || 0) >= 20, 'Expected the upstream class inventory');

  const valid = await runtime.validate('#include "AUDIT.HTML_EnterpriseAudit"\n:DECLARE sName;\nsName := "ok";\n', { hungarianTypes: true });
  assert.equal(valid.available, true);
  assert.equal(valid.error, undefined);
  assert.equal(valid.diagnostics.some((item) => /include.*semicolon|unknown.*include/i.test(item.message)), false);

  const dataSource = await runtime.validate('SELECT * FROM BATCHES', { dataSource: true });
  assert.equal(dataSource.available, true);
  assert.equal(dataSource.error, undefined);

  const invalid = await runtime.validate(':IF .T.;\n:RETURN 1;\n', { hungarianTypes: true });
  assert.equal(invalid.available, true);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.diagnostics.some((item) => item.severity === 'error'));

  const source = '#include "AUDIT.HTML_EnterpriseAudit"\n:DECLARE sName;\nsName:="ok";\n';
  const formatted = await runtime.format(source);
  assert.equal(formatted.available, true);
  assert.equal(formatted.error, undefined);
  const compatible = preserveDesignerIncludes(source, formatted.content || '');
  assert.match(compatible, /^#include "AUDIT\.HTML_EnterpriseAudit"$/m);
  assert.doesNotMatch(compatible, /^#\s+include .*;$/m);

  console.log(`Upstream starlims-lsp v${runtime.version} validation, formatting, and #include compatibility smoke test passed.`);
}

void main();
