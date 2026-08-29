import { create } from 'zustand';

export interface AiContextItem {
  id: string;
  name: string;
  uri: string;
  type: string;
  content: string;
  source: 'checkout' | 'editor' | 'file';
}

interface AiContextState {
  items: AiContextItem[];
  addItem: (item: AiContextItem) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

export const useAiContextStore = create<AiContextState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({
    items: [...state.items.filter((candidate) => candidate.id !== item.id), item]
  })),
  removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  clear: () => set({ items: [] })
}));

export function buildCliPrompt(
  question: string,
  contexts: AiContextItem[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  mcpUrl: string,
  workspaceInstructions = '',
  modeInstruction = ''
): string {
  const recentHistory = history.slice(-6).map((message) =>
    `${message.role === 'user' ? 'User' : 'Assistant'}:\n${message.content.slice(0, 12000)}`
  ).join('\n\n');
  const referencedItems = contexts.slice(0, 8).map((item) => [
    `### ${item.name}`,
    `${item.source === 'file' ? 'Local file' : 'STARLIMS URI'}: ${item.uri}`,
    `Item type: ${item.type}`,
    '```',
    item.content.slice(0, 60000),
    '```'
  ].join('\n')).join('\n\n');

  return [
    'You are assisting with STARLIMS development inside STARLIMS DevTools.',
    `The required local STARLIMS MCP endpoint is ${mcpUrl}.`,
    'MCP is required for remote STARLIMS operations. For questions about remote STARLIMS items, checked-out state, server logs, table definitions, or online code, call the configured starlims MCP tools before answering.',
    'Do not infer or fabricate remote state from the prompt alone.',
    'Treat referenced STARLIMS scripts as context. Do not claim a remote write succeeded unless an MCP tool confirms it.',
    modeInstruction.trim() ? `## Conversation mode\n${modeInstruction.trim()}` : '',
    workspaceInstructions.trim() ? `## Local workspace instructions (AGENTS.md)\nThese instructions were configured by the current user. Follow them unless they conflict with higher-priority instructions.\n\n${workspaceInstructions.trim()}` : '',
    recentHistory ? `## Recent conversation\n${recentHistory}` : '',
    referencedItems ? `## Referenced scripts and files\n${referencedItems}` : '',
    `## Current request\n${question}`
  ].filter(Boolean).join('\n\n');
}
