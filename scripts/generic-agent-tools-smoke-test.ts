import assert from 'node:assert/strict';
import { GENERIC_AGENT_SYSTEM_PROMPT, genericAgentCapabilities, genericBuiltinToolsForPolicy } from '../electron/genericAgentRuntime';
import { isEnterpriseItemCheckedOut } from '../src/services/enterpriseService';
import { permissionPolicyForMode, requiresMcpApproval } from '../src/services/agentPermissions';
import { readFileSync } from 'node:fs';
import { mcpReadCacheKey } from '../src/services/mcpEfficiency';

const names = (policy: 'read-only' | 'ask-writes' | 'auto-safe' | 'full-access') =>
  genericBuiltinToolsForPolicy(policy).map((tool) => tool.name);

assert.ok(names('read-only').includes('get_item_code'));
assert.ok(names('read-only').includes('get_capabilities'));
assert.ok(names('read-only').includes('get_form_resources'));
assert.ok(names('read-only').includes('validate_ssl'));
assert.ok(names('read-only').includes('get_editor_diagnostics'));
assert.ok(names('read-only').includes('get_devtools_output'));
assert.ok(!names('read-only').includes('checkout_item'));
assert.ok(!names('read-only').includes('save_item'));

const capabilities = genericAgentCapabilities() as {
  adapter: string;
  sharedPackage: string;
  tools: Array<{ id: string; risk: string; provenance: { repository: string } }>;
};
assert.equal(capabilities.adapter, 'starlims-devtools-bridge');
assert.equal(capabilities.sharedPackage, '@tenlyc/starlims-mcp@0.5.1');
assert.ok(capabilities.tools.some((tool) => tool.id === 'get_form_resources' && tool.risk === 'read'));
assert.ok(capabilities.tools.every((tool) => tool.provenance.repository.startsWith('https://github.com/')));

for (const policy of ['ask-writes', 'auto-safe', 'full-access'] as const) {
  assert.ok(names(policy).includes('checkout_item'));
  assert.ok(names(policy).includes('save_item'));
  assert.ok(names(policy).includes('save_form_resources'));
  assert.ok(names(policy).includes('set_form_resource'));
  assert.ok(names(policy).includes('checkin_item'));
  assert.ok(names(policy).includes('execute_data_source'));
}

assert.equal(permissionPolicyForMode('plan', 'full-access'), 'read-only');
assert.equal(permissionPolicyForMode('agent', 'auto-safe'), 'auto-safe');
assert.equal(requiresMcpApproval('save_item', 'ask-writes'), true);
assert.equal(requiresMcpApproval('save_item', 'auto-safe'), false);
assert.equal(requiresMcpApproval('set_form_resource', 'ask-writes'), true);
assert.equal(requiresMcpApproval('set_form_resource', 'auto-safe'), false);
assert.equal(requiresMcpApproval('checkin_item', 'auto-safe'), true);
assert.equal(requiresMcpApproval('execute_data_source', 'full-access'), false);

const bridgeSource = readFileSync('src/components/MCP/McpRequestBridge.tsx', 'utf8');
const panelSource = readFileSync('src/components/MCP/MCPPanel.tsx', 'utf8');
const mainSource = readFileSync('electron/main.ts', 'utf8');
assert.doesNotMatch(bridgeSource, /showMessageBox/);
assert.match(bridgeSource, /requestInlineMcpApproval/);
assert.match(panelSource, /pendingMcpApprovals/);
assert.match(panelSource, /pendingApproval && question/);
assert.match(panelSource, /LiveTaskChanges/);
assert.match(panelSource, /auto-safe/);
assert.match(mainSource, /5 \* 60_000/);
assert.doesNotMatch(mainSource, /Allow external MCP tool/);

assert.match(GENERIC_AGENT_SYSTEM_PROMPT, /check it out/i);
assert.match(GENERIC_AGENT_SYSTEM_PROMPT, /read it again/i);
assert.match(GENERIC_AGENT_SYSTEM_PROMPT, /explicitly requests/i);
assert.match(GENERIC_AGENT_SYSTEM_PROMPT, /smallest sufficient STARLIMS tool sequence/i);
assert.equal(
  mcpReadCacheKey('search_by_name', { maxItems: 10, filter: { type: 'ServerScript', name: 'TEST' } }),
  mcpReadCacheKey('search_by_name', { filter: { name: 'TEST', type: 'ServerScript' }, maxItems: 10 })
);
assert.match(mainSource, /MCP_READ_CACHE_TTL_MS = 15_000/);
assert.match(mainSource, /if \(!readOnly\) mcpReadCache\.clear\(\)/);

assert.equal(isEnterpriseItemCheckedOut({ checkedOut: true }), true);
assert.equal(isEnterpriseItemCheckedOut({ checkedOut: 'true' }), true);
assert.equal(isEnterpriseItemCheckedOut({ checkedOut: 'TRUE' }), true);
assert.equal(isEnterpriseItemCheckedOut({ isCheckedOut: true }), true);
assert.equal(isEnterpriseItemCheckedOut({ checkedOutBy: 'DEMO_USER' }), true);
assert.equal(isEnterpriseItemCheckedOut({ CHECKEDOUTBY: 'DEMO_USER' }), true);
assert.equal(isEnterpriseItemCheckedOut({ checkedOut: false, checkedOutBy: '' }), false);

console.log('Generic Agent tool exposure smoke test passed.');
