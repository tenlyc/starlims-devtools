import type { AgentProvider } from '../types/agent';

export const AGENT_REMOTE_CHANGE_EVENT = 'agent:remote-change';

export type AgentRemoteChange = {
  id: string;
  provider: AgentProvider;
  uri: string;
  language?: string;
  before: string;
  after: string;
};

export function publishAgentRemoteChange(change: AgentRemoteChange): void {
  window.dispatchEvent(new CustomEvent<AgentRemoteChange>(AGENT_REMOTE_CHANGE_EVENT, { detail: change }));
}
