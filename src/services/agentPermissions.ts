import type { AgentToolPermissionPolicy } from '../types/agent';

export type ConversationMode = 'agent' | 'plan' | 'debug' | 'multitask' | 'ask';

const STATE_CHANGING_TOOLS = new Set([
  'checkout_item',
  'save_item',
  'checkin_item',
  'undo_checkout',
  'execute_server_script',
  'execute_data_source'
]);

export function permissionPolicyForMode(mode: ConversationMode): AgentToolPermissionPolicy {
  return mode === 'plan' || mode === 'ask' ? 'read-only' : 'ask-writes';
}

export function isStateChangingMcpTool(name: string): boolean {
  return STATE_CHANGING_TOOLS.has(name);
}
