import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { getProfileTools } from '@tenlyc/starlims-mcp';

const require = createRequire(import.meta.url);
const applicationPackage = JSON.parse(readFileSync('package.json', 'utf8'));
const componentLock = JSON.parse(readFileSync('components/shared-components.lock.json', 'utf8'));
const installedPackage = JSON.parse(readFileSync('node_modules/@tenlyc/starlims-mcp/package.json', 'utf8'));
const commonJsCore = require('@tenlyc/starlims-mcp');
const component = componentLock.components?.['starlims-mcp'];

assert.equal(componentLock.schemaVersion, 1);
assert.equal(component.version, installedPackage.version);
assert.equal(component.tag, `v${installedPackage.version}`);
assert.match(component.commit, /^[0-9a-f]{40}$/);
assert.equal(
  applicationPackage.dependencies['@tenlyc/starlims-mcp'],
  `https://github.com/tenlyc/starlims-mcp/archive/refs/tags/${component.tag}.tar.gz`
);
assert.equal(typeof commonJsCore.createStarlimsMcpServer, 'function');

const devtoolsTools = getProfileTools('devtools');
assert.ok(devtoolsTools.some((tool) => tool.id === 'save_item' && tool.origin === 'shared'));
assert.ok(devtoolsTools.some((tool) => tool.id === 'query_checkin_history' && tool.origin === 'starlims-devtools'));
assert.ok(devtoolsTools.some((tool) => tool.id === 'get_form_resources' && tool.origin === 'shared' && tool.risk === 'read'));
assert.ok(devtoolsTools.some((tool) => tool.id === 'set_form_resource' && tool.origin === 'shared' && tool.risk === 'write'));
assert.ok(!devtoolsTools.some((tool) => tool.id === 'vscode_save_local_item'));

console.log(`Shared MCP component smoke test passed (${component.tag}, ${devtoolsTools.length} DevTools tools).`);
