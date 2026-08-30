import { create } from 'zustand';
import type { AgentProvider } from '../types/agent';

export type InlineMcpApproval = {
  id: string;
  provider: AgentProvider;
  tool: string;
  detail: string;
};

type ApprovalState = {
  activeProvider: AgentProvider;
  pending: InlineMcpApproval[];
  setActiveProvider: (provider: AgentProvider) => void;
  resolve: (id: string, allowed: boolean) => void;
};

const resolvers = new Map<string, (allowed: boolean) => void>();

export const useMcpApprovalStore = create<ApprovalState>((set) => ({
  activeProvider: 'codex',
  pending: [],
  setActiveProvider: (activeProvider) => set({ activeProvider }),
  resolve: (id, allowed) => {
    const resolver = resolvers.get(id);
    resolvers.delete(id);
    set((state) => ({ pending: state.pending.filter((item) => item.id !== id) }));
    resolver?.(allowed);
  }
}));

export function requestInlineMcpApproval(input: Omit<InlineMcpApproval, 'provider'> & { provider?: AgentProvider }): Promise<boolean> {
  const state = useMcpApprovalStore.getState();
  const provider = input.provider || state.activeProvider;
  return new Promise<boolean>((resolve) => {
    resolvers.set(input.id, resolve);
    useMcpApprovalStore.setState((current) => ({
      pending: [...current.pending.filter((item) => item.id !== input.id), { ...input, provider }]
    }));
  });
}
