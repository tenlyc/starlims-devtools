import type { AgentToolPermissionPolicy } from '../types/agent';

export type ConversationMode = 'agent' | 'plan' | 'debug' | 'multitask' | 'ask';

const STATE_CHANGING_TOOLS = new Set([
  'checkout_item',
  'save_item',
  'save_form_resources',
  'set_form_resource',
  'apply_menu_item',
  'checkin_item',
  'undo_checkout',
  'execute_server_script',
  'open_form_preview',
  'refresh_form_preview',
  'execute_data_source',
  'create_item',
  'checkout_table',
  'checkin_table',
  'create_table',
  'edit_table'
]);

export function permissionPolicyForMode(mode: ConversationMode, preferred: AgentToolPermissionPolicy = 'ask-writes'): AgentToolPermissionPolicy {
  return mode === 'plan' || mode === 'ask' ? 'read-only' : preferred;
}

export function isStateChangingMcpTool(name: string): boolean {
  return STATE_CHANGING_TOOLS.has(name);
}

const POTENTIALLY_UNSAFE_TOOLS = new Set([
  'apply_menu_item',
  'checkin_item',
  'undo_checkout',
  'execute_server_script',
  'open_form_preview',
  'refresh_form_preview',
  'execute_data_source',
  'checkin_table',
  'create_table',
  'edit_table'
]);

export function requiresMcpApproval(name: string, policy: AgentToolPermissionPolicy): boolean {
  if (!isStateChangingMcpTool(name) || policy === 'full-access') return false;
  if (policy === 'auto-safe') return POTENTIALLY_UNSAFE_TOOLS.has(name);
  return policy === 'ask-writes';
}
