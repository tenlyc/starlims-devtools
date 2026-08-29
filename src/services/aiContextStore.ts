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

export const DEFAULT_PROMPT_TOKEN_BUDGET = 32_000;
const APPROXIMATE_CHARACTERS_PER_TOKEN = 4;

export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / APPROXIMATE_CHARACTERS_PER_TOKEN);
}

function clipToCharacterBudget(text: string, budget: number): string {
  if (budget <= 0) return '';
  if (text.length <= budget) return text;
  const notice = `\n… [truncated ${text.length - budget} characters to fit the conversation token budget]`;
  return `${text.slice(0, Math.max(0, budget - notice.length))}${notice}`;
}

export function buildCliPrompt(
  question: string,
  contexts: AiContextItem[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  mcpUrl: string,
  workspaceInstructions = '',
  modeInstruction = '',
  tokenBudget = DEFAULT_PROMPT_TOKEN_BUDGET
): string {
  const safeTokenBudget = Math.max(4_000, Math.min(128_000, Math.floor(tokenBudget)));
  const characterBudget = safeTokenBudget * APPROXIMATE_CHARACTERS_PER_TOKEN;
  const payloadBudget = Math.max(8_000, characterBudget - 6_000);
  const questionBudget = Math.floor(payloadBudget * 0.15);
  const rulesBudget = Math.floor(payloadBudget * 0.15);
  const historyBudget = Math.floor(payloadBudget * 0.20);
  const referencesBudget = Math.floor(payloadBudget * 0.50);
  const recentMessages = history.slice(-6);
  const perMessageBudget = recentMessages.length ? Math.floor(historyBudget / recentMessages.length) : 0;
  const recentHistory = recentMessages.map((message) =>
    `${message.role === 'user' ? 'User' : 'Assistant'}:\n${clipToCharacterBudget(message.content, perMessageBudget)}`
  ).join('\n\n');
  const referencedContexts = contexts.slice(0, 8);
  const perReferenceBudget = referencedContexts.length ? Math.floor(referencesBudget / referencedContexts.length) : 0;
  const referencedItems = referencedContexts.map((item) => [
    `### ${item.name}`,
    `${item.source === 'file' ? 'Local file' : 'STARLIMS URI'}: ${item.uri}`,
    `Item type: ${item.type}`,
    '```',
    clipToCharacterBudget(item.content, perReferenceBudget),
    '```'
  ].join('\n')).join('\n\n');

  return [
    'You are assisting with STARLIMS development inside STARLIMS DevTools.',
    `The required local STARLIMS MCP endpoint is ${mcpUrl}.`,
    'MCP is required for remote STARLIMS operations. For questions about remote STARLIMS items, checked-out state, server logs, table definitions, or online code, call the configured starlims MCP tools before answering.',
    'Do not infer or fabricate remote state from the prompt alone.',
    'Treat referenced STARLIMS scripts as context. Do not claim a remote write succeeded unless an MCP tool confirms it.',
    modeInstruction.trim() ? `## Conversation mode\n${modeInstruction.trim()}` : '',
    workspaceInstructions.trim() ? `## Local workspace instructions (AGENTS.md)\nThese instructions were configured by the current user. Follow them unless they conflict with higher-priority instructions.\n\n${clipToCharacterBudget(workspaceInstructions.trim(), rulesBudget)}` : '',
    recentHistory ? `## Recent conversation\n${recentHistory}` : '',
    referencedItems ? `## Referenced scripts and files\n${referencedItems}` : '',
    `## Current request\n${clipToCharacterBudget(question, questionBudget)}`
  ].filter(Boolean).join('\n\n').slice(0, characterBudget);
}
