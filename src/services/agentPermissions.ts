import type { AgentToolPermissionPolicy } from '../types/agent';

export type ConversationMode = 'agent' | 'plan' | 'debug' | 'multitask' | 'ask';

const STATE_CHANGING_TOOLS = new Set([
  'checkout_item',
  'save_item',
  'save_form_resources',
  'set_form_resource',
  'checkin_item',
  'undo_checkout',
  'execute_server_script',
  'execute_data_source'
]);

export function permissionPolicyForMode(mode: ConversationMode, preferred: AgentToolPermissionPolicy = 'ask-writes'): AgentToolPermissionPolicy {
  return mode === 'plan' || mode === 'ask' ? 'read-only' : preferred;
}

export function isStateChangingMcpTool(name: string): boolean {
  return STATE_CHANGING_TOOLS.has(name);
}

const POTENTIALLY_UNSAFE_TOOLS = new Set([
  'checkin_item',
  'undo_checkout',
  'execute_server_script',
  'execute_data_source'
]);

export function requiresMcpApproval(name: string, policy: AgentToolPermissionPolicy): boolean {
  if (!isStateChangingMcpTool(name) || policy === 'full-access') return false;
  if (policy === 'auto-safe') return POTENTIALLY_UNSAFE_TOOLS.has(name);
  return policy === 'ask-writes';
}
