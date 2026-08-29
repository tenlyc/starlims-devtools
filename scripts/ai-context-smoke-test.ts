import assert from 'node:assert/strict';
import { isStateChangingMcpTool, permissionPolicyForMode } from '../src/services/agentPermissions';
import { buildCliPrompt } from '../src/services/aiContextStore';

const prompt = buildCliPrompt(
  'Explain this procedure.',
  [{
    id: '/Server Scripts/TEST',
    name: 'TEST',
    uri: '/Server Scripts/TEST',
    type: 'ServerScript',
    content: ':PROCEDURE TEST;\n:RETURN .T.;\n:ENDPROC;',
    source: 'checkout'
  }],
  [{ role: 'user', content: 'We are reviewing checked-out code.' }],
  'http://127.0.0.1:3102/mcp'
);

assert.match(prompt, /STARLIMS MCP endpoint is http:\/\/127\.0\.0\.1:3102\/mcp/);
assert.match(prompt, /MCP is required for remote STARLIMS operations/);
assert.match(prompt, /Do not infer or fabricate remote state/);
assert.match(prompt, /STARLIMS URI: \/Server Scripts\/TEST/);
assert.match(prompt, /:PROCEDURE TEST/);
assert.match(prompt, /Explain this procedure/);

const filePrompt = buildCliPrompt('Review it.', [{
  id: 'file:/tmp/example.sql', name: 'example.sql', uri: '/tmp/example.sql', type: 'File',
  content: 'select 1;', source: 'file'
}], [], 'http://127.0.0.1:3102/mcp');
assert.match(filePrompt, /Local file: \/tmp\/example.sql/);
assert.match(filePrompt, /select 1/);

console.log('AI context smoke test passed.');

assert.equal(permissionPolicyForMode('plan'), 'read-only');
assert.equal(permissionPolicyForMode('ask'), 'read-only');
assert.equal(permissionPolicyForMode('agent'), 'ask-writes');
assert.equal(permissionPolicyForMode('debug'), 'ask-writes');
assert.equal(isStateChangingMcpTool('save_item'), true);
assert.equal(isStateChangingMcpTool('get_item_code'), false);
