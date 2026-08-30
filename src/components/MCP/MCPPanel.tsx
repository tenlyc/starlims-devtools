import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildCliPrompt, useAiContextStore } from '../../services/aiContextStore';
import { useOutputLogStore } from '../../services/outputLogStore';
import { getEnterpriseService } from '../../services/enterpriseService';
import { permissionPolicyForMode, type ConversationMode } from '../../services/agentPermissions';
import { GENERIC_PROFILES_STORE_KEY } from '../../services/genericAgentConfig';
import { editorStore } from '../../stores/editorStore';
import type { AgentApprovalDecision, AgentEvent, AgentItemKind, AgentModelOption, AgentProvider, AgentRuntimeStatus, AgentToolPermissionPolicy, GenericAgentConfig } from '../../types/agent';
import type { EnterpriseItem } from '../../services/iEnterpriseService';
import { useI18n } from '../../i18n';
import { syncCheckedOutWorkspace } from '../../services/agentWorkspaceService';
import { dependencyContextForPrompt, loadDependencyIndex } from '../../services/starlimsDependencyIndex';
import { loadAiLayers, mergeAiLayers } from '../../services/aiPlatform';
import { useMcpApprovalStore } from '../../services/mcpApprovalStore';

type MessageEntry = {
  entryType: 'message';
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider: AgentProvider;
  error?: boolean;
};
type ActivityEntry = {
  entryType: 'activity';
  id: string;
  provider: AgentProvider;
  kind: AgentItemKind;
  status: 'running' | 'completed' | 'failed' | 'declined';
  title: string;
  detail?: string;
  output?: string;
  diff?: string;
};
type ApprovalEntry = {
  entryType: 'approval';
  id: string;
  requestId: string;
  provider: AgentProvider;
  kind: string;
  title: string;
  detail?: string;
  canAcceptForSession?: boolean;
};
type TimelineEntry = MessageEntry | ActivityEntry | ApprovalEntry;
type ActivityGroupEntry = { entryType: 'activity-group'; id: string; entries: ActivityEntry[] };
type DisplayTimelineEntry = MessageEntry | ApprovalEntry | ActivityGroupEntry;
type ProviderConversation = { entries: TimelineEntry[]; running: boolean; sequence: number };
type Conversations = Record<AgentProvider, ProviderConversation>;
type McpStatus = { running: boolean; url: string; port: number; error?: string };
type ScriptMentionCandidate = {
  id: string;
  name: string;
  uri: string;
  type: string;
  language?: string;
  content?: string;
  source: 'editor' | 'enterprise';
};
type SavedConversation = {
  id: string;
  provider: AgentProvider;
  title: string;
  createdAt: number;
  updatedAt: number;
  entries: TimelineEntry[];
};
type LocalAgentRules = {
  enabled: boolean;
  name: string;
  content: string;
  updatedAt: number;
};
type GenericAgentProfile = GenericAgentConfig & { id: string; name: string };

const HISTORY_STORE_KEY = 'agentConversationHistory.v1';
const MODEL_STORE_KEY = 'agentSelectedModel.v1';
const GENERIC_CONFIG_STORE_KEY = 'genericAgentConfig.v1';
const GENERIC_API_KEY_SECRET = 'generic-agent-api-key';
const AGENT_RULES_STORE_KEY = 'agentWorkspaceInstructions.v1';
const AGENT_MODE_STORE_KEY = 'agentConversationMode.v1';
const AGENT_PERMISSION_STORE_KEY = 'mcpToolPermissionPolicy.v1';
type InteractivePermissionPolicy = Exclude<AgentToolPermissionPolicy, 'read-only'>;

const MODE_INSTRUCTIONS: Record<ConversationMode, string> = {
  agent: 'Agent mode: complete the request end-to-end. Inspect, use tools, edit, and verify as needed within the permissions granted by the user.',
  plan: 'Plan mode: inspect and reason using read-only operations, then provide a concrete implementation plan. Do not edit files or invoke state-changing tools.',
  debug: 'Debug mode: reproduce or inspect the issue, gather evidence, identify the root cause, and verify conclusions. Implement the smallest safe fix only when the user request includes fixing it.',
  multitask: 'Multitask mode: decompose independent work into parallel workstreams where possible, coordinate their results, and deliver one verified outcome.',
  ask: 'Ask mode: answer and explain using read-only inspection only. Do not edit files, change external state, or invoke state-changing tools.'
};

function normalizeModelList(...lists: Array<Array<string | undefined> | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of lists.flatMap((list) => list || [])) {
    const model = value?.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    result.push(model);
  }
  return result;
}

function profileSecretKey(id: string): string {
  return `generic-agent-api-key:${id}`;
}

function createGenericProfile(name = 'OpenAI-compatible'): GenericAgentProfile {
  return {
    id: crypto.randomUUID(), name, baseUrl: 'https://api.openai.com/v1', apiKey: '',
    model: '', models: [], maxToolRounds: 16
  };
}

function profileNameFromUrl(baseUrl: string): string {
  try { return new URL(baseUrl).hostname || 'OpenAI-compatible'; }
  catch { return 'OpenAI-compatible'; }
}

const PROVIDERS: Array<{ id: AgentProvider; mark: string }> = [
  { id: 'codex', mark: 'CX' },
  { id: 'generic', mark: 'AI' }
];
const kindMark: Record<AgentItemKind, string> = { mcp: 'MCP', command: '>_', file: 'Δ', reasoning: '◌', plan: '≡', other: '•' };

type ToolbarIconButtonProps = {
  title: string;
  onClick: () => void;
  children: ReactNode;
  indicator?: boolean;
};

function ToolbarIconButton({ title, onClick, children, indicator = false }: ToolbarIconButtonProps) {
  return (
    <button
      type="button"
      className="icon-button relative"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {children}
      {indicator && <span className="absolute right-1 top-1 h-2 w-2 rounded-full border border-white bg-emerald-500 dark:border-[#1b1b1b] dark:bg-[#3fb950]" />}
    </button>
  );
}

const ToolbarIcons = {
  settings: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m19.4 15 .1 2-2.1 2.1-2-.5-1.4.8-.6 2h-3l-.6-2-1.4-.8-2 .5L4.4 17l.5-2-1-1.5L2 13v-3l2-.6.8-1.4-.5-2L6.4 4l2 .5L10 3.6l.5-1.9h3l.6 2 1.4.8 2-.5 2.1 2.1-.5 2 .8 1.4 2 .6v3l-2 .6-.5 1.3Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>,
  customize: <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M17 13.5v7M13.5 17h7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>,
  history: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true"><path d="M4 6v5h5M4.8 10a8 8 0 1 1 .7 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 7.5V12l3 1.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  plus: <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" aria-hidden="true"><path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
};

function emptyConversation(): ProviderConversation {
  return { entries: [], running: false, sequence: 0 };
}

function initialConversations(): Conversations {
  return { codex: emptyConversation(), claude: emptyConversation(), opencode: emptyConversation(), generic: emptyConversation() };
}

function stripAnsi(value: string): string {
  const escape = String.fromCharCode(27);
  const controlSequenceIntroducer = String.fromCharCode(155);
  const ansiPattern = new RegExp(`(?:${escape}\\[|${controlSequenceIntroducer})[0-?]*[ -/]*[@-~]`, 'g');
  return value.replace(ansiPattern, '');
}

function mentionDisplayName(candidate: ScriptMentionCandidate): string {
  const leaf = (candidate.name || candidate.uri).split(/[\\/]/).filter(Boolean).pop() || candidate.name;
  if (/\.[a-z0-9]+$/i.test(leaf)) return leaf;
  const type = candidate.type.toUpperCase();
  if (type.includes('CODE') || type.includes('CLIENT')) return `${leaf}.js`;
  if (type.includes('GUIDE')) return `${leaf}.json`;
  if (type.includes('XML') || type.includes('RESOURCE')) return `${leaf}.xml`;
  return `${leaf}.ssl`;
}

function mentionParentPath(candidate: ScriptMentionCandidate): string {
  const parts = candidate.uri.split('/').filter(Boolean);
  const parent = parts.slice(0, -1);
  if (parent.length === 0) return '';
  return `…/${parent.slice(-2).join('/')}`;
}

function mentionFileMark(candidate: ScriptMentionCandidate): string {
  const name = mentionDisplayName(candidate).toLowerCase();
  if (name.endsWith('.js')) return 'JS';
  if (name.endsWith('.json')) return '{}';
  if (name.endsWith('.xml')) return 'XML';
  return '▱';
}

function contextDisplayName(item: { name: string; uri: string; source: 'checkout' | 'editor' | 'file' }): string {
  const rawName = item.name || item.uri;
  const parts = rawName.split(/[\\/]/).filter(Boolean);
  let leaf = parts.at(-1) || rawName;
  if (/^(?:xml|code\s*behind|codebehind|guide|resources)$/i.test(leaf) && parts.length > 1) {
    leaf = parts.at(-2) || leaf;
  }
  if (item.source !== 'file') {
    leaf = leaf.replace(/\s*\[(?:XML|Code Behind|Guide|Resources)\]\s*$/i, '');
  }
  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
}

function conversationTitle(entries: TimelineEntry[]): string {
  const first = entries.find((entry): entry is MessageEntry => entry.entryType === 'message' && entry.role === 'user');
  return first?.content.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Agent conversation';
}

function replaceOrAppend(entries: TimelineEntry[], entry: TimelineEntry): TimelineEntry[] {
  const index = entries.findIndex((item) => item.id === entry.id);
  if (index < 0) return [...entries, entry];
  const next = [...entries];
  next[index] = entry;
  return next;
}

function groupTimelineEntries(entries: TimelineEntry[]): DisplayTimelineEntry[] {
  const grouped: DisplayTimelineEntry[] = [];
  for (const entry of entries) {
    if (entry.entryType !== 'activity') {
      grouped.push(entry);
      continue;
    }
    const previous = grouped.at(-1);
    if (previous?.entryType === 'activity-group') previous.entries.push(entry);
    else grouped.push({ entryType: 'activity-group', id: `activity-group:${entry.id}`, entries: [entry] });
  }
  return grouped;
}

function applyAgentEvent(conversation: ProviderConversation, event: AgentEvent): ProviderConversation {
  if (event.type === 'text-delta' && event.text) {
    const id = `${event.provider}:message:${event.itemId || event.turnId || `response-${conversation.sequence}`}`;
    const existing = conversation.entries.find((entry): entry is MessageEntry => entry.id === id && entry.entryType === 'message');
    const message: MessageEntry = {
      entryType: 'message', id, role: 'assistant', provider: event.provider,
      content: `${existing?.content || ''}${event.text}`
    };
    return { ...conversation, entries: replaceOrAppend(conversation.entries, message) };
  }

  if ((event.type === 'item' || event.type === 'diff') && event.itemId) {
    const id = `${event.provider}:activity:${event.itemId}`;
    const existing = conversation.entries.find((entry): entry is ActivityEntry => entry.id === id && entry.entryType === 'activity');
    const activity: ActivityEntry = {
      entryType: 'activity', id, provider: event.provider,
      kind: event.type === 'diff' ? 'file' : (event.kind as AgentItemKind) || existing?.kind || 'other',
      status: event.type === 'diff' ? 'completed' : event.status || existing?.status || 'running',
      title: event.title || existing?.title || 'Agent activity',
      detail: event.detail ?? existing?.detail,
      output: event.output ?? existing?.output,
      diff: event.diff ?? existing?.diff
    };
    return { ...conversation, entries: replaceOrAppend(conversation.entries, activity) };
  }

  if (event.type === 'item-output' && event.itemId) {
    const id = `${event.provider}:activity:${event.itemId}`;
    const existing = conversation.entries.find((entry): entry is ActivityEntry => entry.id === id && entry.entryType === 'activity');
    const activity: ActivityEntry = existing
      ? { ...existing, output: `${existing.output || ''}${event.output || ''}` }
      : { entryType: 'activity', id, provider: event.provider, kind: 'other', status: 'running', title: 'Agent activity', output: event.output };
    return { ...conversation, entries: replaceOrAppend(conversation.entries, activity) };
  }

  if (event.type === 'approval' && event.requestId) {
    const approval: ApprovalEntry = {
      entryType: 'approval', id: `${event.provider}:approval:${event.requestId}`,
      requestId: event.requestId, provider: event.provider, kind: event.kind || 'permissions',
      title: event.title || 'Approval required', detail: event.detail,
      canAcceptForSession: event.canAcceptForSession
    };
    return { ...conversation, entries: replaceOrAppend(conversation.entries, approval) };
  }

  if (event.type === 'done') return { ...conversation, running: false };
  if (event.type === 'error') {
    const error: MessageEntry = {
      entryType: 'message', id: `${event.provider}:error:${crypto.randomUUID()}`,
      role: 'assistant', provider: event.provider, error: true,
      content: event.text || 'Agent runtime failed.'
    };
    return { ...conversation, running: false, entries: [...conversation.entries, error] };
  }
  return conversation;
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="min-w-0 break-words font-sans text-[13px] leading-6 text-slate-800 dark:text-[#d4d4d4]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-blue-500 pl-3 text-slate-600 dark:text-[#aaa]">{children}</blockquote>,
          pre: ({ children }) => <pre className="my-3 max-w-full overflow-auto rounded-md border border-slate-300 bg-slate-950 p-3 font-mono text-[12px] leading-5 text-slate-100 dark:border-[#3a3a3a] dark:bg-[#101010]">{children}</pre>,
          code: ({ className, children, ...props }) => className
            ? <code className={`${className} font-mono`} {...props}>{children}</code>
            : <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[12px] text-rose-700 dark:bg-[#2b2b2b] dark:text-[#ce9178]" {...props}>{children}</code>,
          a: ({ children, ...props }) => <a className="text-blue-600 underline hover:text-blue-500 dark:text-[#4daafc]" target="_blank" rel="noreferrer" {...props}>{children}</a>,
          table: ({ children }) => <div className="my-3 overflow-auto"><table className="w-full border-collapse text-xs">{children}</table></div>,
          th: ({ children }) => <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left dark:border-[#444] dark:bg-[#252525]">{children}</th>,
          td: ({ children }) => <td className="border border-slate-300 px-2 py-1 align-top dark:border-[#444]">{children}</td>,
          hr: () => <hr className="my-4 border-slate-300 dark:border-[#3a3a3a]" />
        }}
      >{content}</ReactMarkdown>
    </div>
  );
}

export function MCPPanel() {
  const { t } = useI18n();
  const [provider, setProvider] = useState<AgentProvider>('codex');
  const [statuses, setStatuses] = useState<Partial<Record<AgentProvider, AgentRuntimeStatus>>>({});
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [conversations, setConversations] = useState<Conversations>(initialConversations);
  const [input, setInput] = useState('');
  const [showConnection, setShowConnection] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<ScriptMentionCandidate[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [models, setModels] = useState<AgentModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const [conversationMode, setConversationMode] = useState<ConversationMode>('agent');
  const [permissionPolicy, setPermissionPolicy] = useState<InteractivePermissionPolicy>('ask-writes');
  const [showPermissionMenu, setShowPermissionMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<SavedConversation[]>([]);
  const [sessionIds, setSessionIds] = useState<Record<AgentProvider, string>>(() => ({ codex: crypto.randomUUID(), claude: crypto.randomUUID(), opencode: crypto.randomUUID(), generic: crypto.randomUUID() }));
  const [replayHistory, setReplayHistory] = useState(false);
  const [showGenericSettings, setShowGenericSettings] = useState(false);
  const [genericProfiles, setGenericProfiles] = useState<GenericAgentProfile[]>(() => [createGenericProfile()]);
  const [activeGenericProfileId, setActiveGenericProfileId] = useState(() => genericProfiles[0].id);
  const [genericModels, setGenericModels] = useState<string[]>([]);
  const [genericModelDraft, setGenericModelDraft] = useState('');
  const [genericTestMessage, setGenericTestMessage] = useState('');
  const [agentRules, setAgentRules] = useState<LocalAgentRules>({ enabled: false, name: '', content: '', updatedAt: 0 });
  const contexts = useAiContextStore((state) => state.items);
  const addAiContext = useAiContextStore((state) => state.addItem);
  const removeContext = useAiContextStore((state) => state.removeItem);
  const clearContexts = useAiContextStore((state) => state.clear);
  const pendingMcpApprovals = useMcpApprovalStore((state) => state.pending.filter((item) => item.provider === provider));
  const resolveMcpApproval = useMcpApprovalStore((state) => state.resolve);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const preferredCodexModelRef = useRef('');
  const modelLoadSequenceRef = useRef(0);
  const conversation = conversations[provider];
  const { entries, running } = conversation;
  const displayEntries = groupTimelineEntries(entries);
  const genericConfig = genericProfiles.find((profile) => profile.id === activeGenericProfileId) || genericProfiles[0];
  const genericModelChoices = genericProfiles.flatMap((profile) => normalizeModelList(profile.models, [profile.model]).map((model) => ({
    value: `${profile.id}|${encodeURIComponent(model)}`,
    profileId: profile.id,
    profileName: profile.name,
    model
  })));
  const genericModelSelection = `${activeGenericProfileId}|${encodeURIComponent(genericConfig.model || '')}`;
  const setGenericConfig = (updater: GenericAgentConfig | ((current: GenericAgentConfig) => GenericAgentConfig)) => {
    setGenericProfiles((profiles) => profiles.map((profile) => {
      if (profile.id !== activeGenericProfileId) return profile;
      const next = typeof updater === 'function' ? updater(profile) : updater;
      return { ...profile, ...next };
    }));
  };

  const loadCodexModels = useCallback(async (retries = 2) => {
    if (!window.electronAPI) return;
    const sequence = ++modelLoadSequenceRef.current;
    setModelsLoading(true);
    setModelsError('');
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const availableModels = await window.electronAPI.agentGetModels('codex');
        if (availableModels.length === 0) throw new Error('Codex did not return any available models.');
        if (sequence !== modelLoadSequenceRef.current) return;
        setModels(availableModels);
        setSelectedModel((current) => {
          if (availableModels.some((model) => model.id === current)) return current;
          const preferred = preferredCodexModelRef.current;
          if (preferred && availableModels.some((model) => model.id === preferred)) return preferred;
          return availableModels.find((model) => model.isDefault)?.id || availableModels[0].id;
        });
        setModelsLoading(false);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < retries) await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    if (sequence !== modelLoadSequenceRef.current) return;
    setModelsLoading(false);
    setModelsError(lastError instanceof Error ? lastError.message : String(lastError || 'Unknown error'));
  }, []);

  useEffect(() => {
    const refresh = async () => {
      if (!window.electronAPI) return;
      const [agentStatuses, mcpStatus] = await Promise.all([
        window.electronAPI.agentGetStatuses().catch(() => ({} as Record<AgentProvider, AgentRuntimeStatus>)),
        window.electronAPI.mcpGetStatus().catch(() => null)
      ]);
      setStatuses((current) => ({ ...current, ...agentStatuses }));
      setMcp(mcpStatus);
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onRulesChanged = (event: Event) => setAgentRules((event as CustomEvent<LocalAgentRules>).detail);
    const onOpenGenericSettings = () => {
      setProvider('generic');
      setShowGenericSettings(true);
    };
    const onPrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; mode?: ConversationMode }>).detail;
      if (typeof detail?.prompt === 'string') setInput(detail.prompt);
      if (detail?.mode && detail.mode in MODE_INSTRUCTIONS) setConversationMode(detail.mode);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener('ai-rules:changed', onRulesChanged);
    window.addEventListener('ai:open-generic-settings', onOpenGenericSettings);
    window.addEventListener('ai:prefill', onPrefill);
    return () => {
      window.removeEventListener('ai-rules:changed', onRulesChanged);
      window.removeEventListener('ai:open-generic-settings', onOpenGenericSettings);
      window.removeEventListener('ai:prefill', onPrefill);
    };
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    void window.electronAPI.storeGet(AGENT_RULES_STORE_KEY).then((saved) => {
      if (!saved || typeof saved !== 'object') return;
      setAgentRules({
        enabled: saved.enabled !== false && typeof saved.content === 'string' && Boolean(saved.content.trim()),
        name: typeof saved.name === 'string' ? saved.name : 'AGENTS.md',
        content: typeof saved.content === 'string' ? saved.content : '',
        updatedAt: typeof saved.updatedAt === 'number' ? saved.updatedAt : 0
      });
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    void (async () => {
      const savedProfiles = await window.electronAPI!.storeGet(GENERIC_PROFILES_STORE_KEY).catch(() => null);
      let profiles: GenericAgentProfile[] = [];
      let activeId = '';
      if (Array.isArray(savedProfiles?.profiles) && savedProfiles.profiles.length > 0) {
        activeId = typeof savedProfiles.activeProfileId === 'string' ? savedProfiles.activeProfileId : '';
        profiles = await Promise.all(savedProfiles.profiles.map(async (saved: any) => {
          const id = typeof saved.id === 'string' && saved.id ? saved.id : crypto.randomUUID();
          const model = typeof saved.model === 'string' ? saved.model : '';
          const models = normalizeModelList(Array.isArray(saved.models) ? saved.models : [], [model]);
          return {
            id,
            name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim() : profileNameFromUrl(String(saved.baseUrl || '')),
            baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : 'https://api.openai.com/v1',
            apiKey: await window.electronAPI!.secretsGet(profileSecretKey(id)).catch(() => '') || '',
            model: models.includes(model) ? model : (models[0] || ''), models,
            maxToolRounds: typeof saved.maxToolRounds === 'number' ? Math.min(64, Math.max(1, Math.floor(saved.maxToolRounds))) : 16
          };
        }));
      } else {
        const [saved, apiKey] = await Promise.all([
          window.electronAPI!.storeGet(GENERIC_CONFIG_STORE_KEY).catch(() => null),
          window.electronAPI!.secretsGet(GENERIC_API_KEY_SECRET).catch(() => '')
        ]);
        const model = typeof saved?.model === 'string' ? saved.model : '';
        const models = normalizeModelList(Array.isArray(saved?.models) ? saved.models : [], [model]);
        const baseUrl = typeof saved?.baseUrl === 'string' ? saved.baseUrl : 'https://api.openai.com/v1';
        const migrated = createGenericProfile(profileNameFromUrl(baseUrl));
        profiles = [{ ...migrated, baseUrl, apiKey: typeof apiKey === 'string' ? apiKey : '', model: models.includes(model) ? model : (models[0] || ''), models, maxToolRounds: typeof saved?.maxToolRounds === 'number' ? Math.min(64, Math.max(1, Math.floor(saved.maxToolRounds))) : 16 }];
        activeId = migrated.id;
      }
      const active = profiles.find((profile) => profile.id === activeId) || profiles[0];
      setGenericProfiles(profiles);
      setActiveGenericProfileId(active.id);
      setStatuses((current) => ({ ...current, generic: {
        available: Boolean(active.baseUrl && active.model && active.apiKey), runtime: 'api',
        version: 'OpenAI-compatible API', detail: `${active.name} · ${active.baseUrl}`
      } }));
    })();
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    void Promise.all([
      window.electronAPI.storeGet(HISTORY_STORE_KEY).catch(() => []),
      window.electronAPI.storeGet(MODEL_STORE_KEY).catch(() => ''),
      window.electronAPI.storeGet(AGENT_MODE_STORE_KEY).catch(() => 'agent'),
      window.electronAPI.storeGet(AGENT_PERMISSION_STORE_KEY).catch(() => 'ask-writes')
    ]).then(([savedHistory, savedModel, savedMode, savedPermission]) => {
      setHistory(Array.isArray(savedHistory) ? savedHistory : []);
      preferredCodexModelRef.current = typeof savedModel === 'string' ? savedModel : '';
      if (typeof savedMode === 'string' && savedMode in MODE_INSTRUCTIONS) setConversationMode(savedMode as ConversationMode);
      if (savedPermission === 'ask-writes' || savedPermission === 'auto-safe' || savedPermission === 'full-access') setPermissionPolicy(savedPermission);
      void loadCodexModels();
    });
  }, [loadCodexModels]);

  useEffect(() => {
    let timer: number | undefined;
    const reloadAfterWorkspaceChange = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void loadCodexModels(3), 250);
    };
    window.addEventListener('agent-workspace:configured', reloadAfterWorkspaceChange);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('agent-workspace:configured', reloadAfterWorkspaceChange);
    };
  }, [loadCodexModels]);

  useEffect(() => {
    if (!window.electronAPI || !selectedModel) return;
    void window.electronAPI.storeSet(MODEL_STORE_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (!window.electronAPI) return;
    void window.electronAPI.storeSet(AGENT_MODE_STORE_KEY, conversationMode);
  }, [conversationMode]);

  useEffect(() => {
    useMcpApprovalStore.getState().setActiveProvider(provider);
  }, [provider]);

  useEffect(() => {
    if (!window.electronAPI) return;
    void window.electronAPI.storeSet(AGENT_PERMISSION_STORE_KEY, permissionPolicy);
  }, [permissionPolicy]);

  useEffect(() => {
    const current = conversations[provider];
    if (!window.electronAPI || current.entries.length === 0) return;
    const timer = window.setTimeout(() => {
      const safeEntries = current.entries.filter((entry) => entry.entryType !== 'approval');
      const id = sessionIds[provider];
      setHistory((saved) => {
        const existing = saved.find((item) => item.id === id);
        const record: SavedConversation = {
          id, provider, title: conversationTitle(safeEntries),
          createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(), entries: safeEntries
        };
        const next = [record, ...saved.filter((item) => item.id !== id)].slice(0, 50);
        void window.electronAPI.storeSet(HISTORY_STORE_KEY, next);
        return next;
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [conversations, provider, sessionIds]);

  useEffect(() => window.electronAPI?.onAgentEvent((event) => {
    if (['session', 'status', 'item', 'approval', 'done', 'error'].includes(event.type)) {
      const level = event.type === 'error' || (event.type === 'item' && event.status === 'failed')
        ? 'error'
        : event.type === 'approval'
          ? 'warning'
          : event.type === 'done' || (event.type === 'item' && event.status === 'completed')
            ? 'success'
            : 'info';
      useOutputLogStore.getState().addEntry({
        channel: 'ai-runtime', level, source: `${event.provider} Agent`,
        message: event.text || event.title || event.status || event.type
      });
    }
    setConversations((current) => ({
      ...current,
      [event.provider]: applyAgentEvent(current[event.provider], event)
    }));
  }), []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [provider, entries, running, pendingMcpApprovals.length]);
  useEffect(() => { if (contexts.length) inputRef.current?.focus(); }, [contexts.length]);

  useEffect(() => {
    if (mentionQuery === null) return;
    const normalized = mentionQuery.trim().toLowerCase();
    const openCandidates: ScriptMentionCandidate[] = editorStore.getState().openFiles
      .filter((file) => !normalized || `${file.name} ${file.uri}`.toLowerCase().includes(normalized))
      .map((file) => ({
        id: file.uri, name: file.name, uri: file.uri, type: file.type,
        language: file.language, content: file.content, source: 'editor' as const
      }));
    setMentionResults(openCandidates.slice(0, 8));
    setMentionIndex(0);
    if (normalized.length < 2) {
      setMentionLoading(false);
      return;
    }

    let cancelled = false;
    setMentionLoading(true);
    const timer = window.setTimeout(async () => {
      const result = await getEnterpriseService().search(normalized).catch(() => ({ items: [], totalCount: 0 }));
      if (cancelled) return;
      const remoteCandidates = result.items
        .filter((item: EnterpriseItem) => !!item.uri && !item.hasChildren)
        .map((item: EnterpriseItem): ScriptMentionCandidate => ({
          id: item.uri!, name: item.name, uri: item.uri!, type: item.type,
          language: item.language, source: 'enterprise'
        }));
      const merged = [...openCandidates, ...remoteCandidates].filter((candidate, index, all) =>
        all.findIndex((item) => item.uri === candidate.uri) === index
      );
      setMentionResults(merged.slice(0, 12));
      setMentionIndex(0);
      setMentionLoading(false);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mentionQuery]);

  const providerLabel = (target: AgentProvider) => target === 'codex' ? 'Codex' : target === 'generic' ? t('agent.genericTab') : target;
  const activeStatus = statuses[provider];
  const title = providerLabel(provider);

  const updateConversation = (target: AgentProvider, update: (current: ProviderConversation) => ProviderConversation) => {
    setConversations((current) => ({ ...current, [target]: update(current[target]) }));
  };

  const send = async () => {
    const question = input.trim();
    if (!question || running || !activeStatus?.available || !window.electronAPI) return;
    const selectedProvider = provider;
    const userMessage: MessageEntry = { entryType: 'message', id: crypto.randomUUID(), role: 'user', content: question, provider: selectedProvider };
    const promptHistory = selectedProvider === 'opencode' || selectedProvider === 'generic' || replayHistory
      ? entries.filter((entry): entry is MessageEntry => entry.entryType === 'message' && !entry.error).map(({ role, content }) => ({ role, content }))
      : [];
    updateConversation(selectedProvider, (current) => ({ ...current, entries: [...current.entries, userMessage], running: true, sequence: current.sequence + 1 }));
    setInput('');
    try {
      useMcpApprovalStore.getState().setActiveProvider(selectedProvider);
      const effectivePermissionPolicy = permissionPolicyForMode(conversationMode, permissionPolicy);
      await window.electronAPI.storeSet(AGENT_PERMISSION_STORE_KEY, effectivePermissionPolicy);
      await syncCheckedOutWorkspace().catch((error) => {
        useOutputLogStore.getState().addEntry({
          channel: 'ai-runtime', level: 'warning', source: 'Agent Workspace',
          message: `Could not refresh checked-out files before this turn; using the existing workspace. ${error instanceof Error ? error.message : String(error)}`
        });
      });
      const dependencyContext = dependencyContextForPrompt(await loadDependencyIndex(), contexts.map((context) => context.uri));
      const layeredRules = mergeAiLayers(await loadAiLayers()).rules.map((rule) => `[${rule.layer}]\n${rule.content}`).join('\n\n');
      const effectiveRules = [layeredRules, agentRules.enabled ? agentRules.content : ''].filter(Boolean).join('\n\n');
      const prompt = buildCliPrompt(
        question,
        contexts,
        promptHistory,
        mcp?.url || 'http://127.0.0.1:3102/mcp',
        effectiveRules,
        MODE_INSTRUCTIONS[conversationMode],
        undefined,
        dependencyContext
      );
      if (selectedProvider === 'generic') {
        await window.electronAPI.genericAgentStart({ ...genericConfig, toolPermissionPolicy: effectivePermissionPolicy }, prompt);
      } else if (selectedProvider === 'opencode') {
        const output = await window.electronAPI.cliExecute(selectedProvider, prompt);
        const message: MessageEntry = { entryType: 'message', id: crypto.randomUUID(), role: 'assistant', provider: selectedProvider, content: stripAnsi(output) };
        updateConversation(selectedProvider, (current) => ({ ...current, running: false, entries: [...current.entries, message] }));
      } else {
        await window.electronAPI.agentStart(selectedProvider, prompt, selectedProvider === 'codex' ? selectedModel : undefined, effectivePermissionPolicy);
      }
      setReplayHistory(false);
    } catch (error) {
      const message: MessageEntry = { entryType: 'message', id: crypto.randomUUID(), role: 'assistant', provider: selectedProvider, error: true, content: error instanceof Error ? error.message : String(error) };
      updateConversation(selectedProvider, (current) => ({ ...current, running: false, entries: [...current.entries, message] }));
    }
  };

  const updateMentionFromInput = (value: string, caret: number) => {
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/(?:^|\s|\(|\[)@([^@\s]*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const chooseMention = async (candidate: ScriptMentionCandidate) => {
    const field = inputRef.current;
    const caret = field?.selectionStart ?? input.length;
    const beforeCaret = input.slice(0, caret);
    const match = beforeCaret.match(/(?:^|\s|\(|\[)@([^@\s]*)$/);
    const triggerStart = match ? caret - match[1].length - 1 : caret;
    const nextInput = `${input.slice(0, triggerStart)}${input.slice(caret)}`;
    setInput(nextInput);
    setMentionQuery(null);
    try {
      const content = candidate.content ?? await getEnterpriseService().getItemCode(candidate.uri, candidate.language);
      addAiContext({
        id: candidate.uri, name: candidate.name, uri: candidate.uri,
        type: candidate.type, content, source: candidate.source === 'editor' ? 'editor' : 'checkout'
      });
    } catch (error) {
      useOutputLogStore.getState().addEntry({
        channel: 'ai-runtime', level: 'error', source: 'AI Context',
        message: `Failed to reference ${candidate.name}: ${error instanceof Error ? error.message : String(error)}`
      });
    }
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(triggerStart, triggerStart);
    });
  };

  const openMentionPicker = () => {
    const field = inputRef.current;
    const caret = field?.selectionStart ?? input.length;
    const nextInput = `${input.slice(0, caret)}@${input.slice(caret)}`;
    setInput(nextInput);
    setMentionQuery('');
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret + 1, caret + 1);
    });
  };

  const newConversation = async () => {
    const selectedProvider = provider;
    if (selectedProvider === 'generic') await window.electronAPI?.genericAgentNewSession().catch(() => undefined);
    else if (selectedProvider !== 'opencode') await window.electronAPI?.agentNewSession(selectedProvider).catch(() => undefined);
    updateConversation(selectedProvider, () => emptyConversation());
    setSessionIds((current) => ({ ...current, [selectedProvider]: crypto.randomUUID() }));
    setReplayHistory(false);
  };

  const attachFiles = async () => {
    if (!window.electronAPI) return;
    try {
      const files = await window.electronAPI.agentSelectFiles();
      files.forEach((file) => addAiContext({
        id: file.id, name: file.name, uri: file.path, type: 'File', content: file.content, source: 'file'
      }));
    } catch (error) {
      useOutputLogStore.getState().addEntry({
        channel: 'ai-runtime', level: 'error', source: 'AI Attachment',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const openCustomize = () => editorStore.getState().openFile({
    uri: 'starlims-devtools://customize', name: t('customize.title'), type: 'CUSTOMIZE', content: ''
  });

  const openSavedConversation = async (saved: SavedConversation) => {
    setProvider(saved.provider);
    setConversations((current) => ({
      ...current,
      [saved.provider]: { entries: saved.entries, running: false, sequence: 0 }
    }));
    setSessionIds((current) => ({ ...current, [saved.provider]: saved.id }));
    if (saved.provider === 'generic') await window.electronAPI?.genericAgentNewSession().catch(() => undefined);
    else if (saved.provider !== 'opencode') await window.electronAPI?.agentNewSession(saved.provider).catch(() => undefined);
    setReplayHistory(true);
    setShowHistory(false);
  };

  const saveGenericSettings = async () => {
    if (!window.electronAPI) return;
    const configuredModels = normalizeModelList(genericConfig.models, [genericConfig.model]);
    const selectedModel = configuredModels.includes(genericConfig.model.trim()) ? genericConfig.model.trim() : (configuredModels[0] || '');
    const clean = { baseUrl: genericConfig.baseUrl.trim().replace(/\/+$/, ''), model: selectedModel, models: configuredModels, maxToolRounds: Math.min(64, Math.max(1, Math.floor(genericConfig.maxToolRounds || 16))) };
    const nextProfiles = genericProfiles.map((profile) => profile.id === activeGenericProfileId ? { ...profile, ...clean, name: profile.name.trim() || profileNameFromUrl(clean.baseUrl) } : profile);
    await Promise.all([
      window.electronAPI.storeSet(GENERIC_PROFILES_STORE_KEY, {
        activeProfileId: activeGenericProfileId,
        profiles: nextProfiles.map(({ apiKey: _apiKey, ...profile }) => profile)
      }),
      ...nextProfiles.map((profile) => window.electronAPI!.secretsSet(profileSecretKey(profile.id), profile.apiKey))
    ]);
    const available = Boolean(clean.baseUrl && clean.model && genericConfig.apiKey);
    setGenericProfiles(nextProfiles);
    const active = nextProfiles.find((profile) => profile.id === activeGenericProfileId)!;
    setStatuses((current) => ({ ...current, generic: { available, runtime: 'api', version: 'OpenAI-compatible API', detail: `${active.name} · ${clean.baseUrl}` } }));
    window.dispatchEvent(new CustomEvent('generic-profiles:changed', { detail: {
      activeProfileId: activeGenericProfileId,
      profiles: nextProfiles.map(({ apiKey: _apiKey, ...profile }) => profile)
    } }));
    setShowGenericSettings(false);
  };

  const testGenericConnection = async () => {
    setGenericTestMessage(t('agent.genericTesting'));
    try {
      const available = await window.electronAPI!.genericAgentListModels(genericConfig);
      setGenericModels(available);
      setGenericConfig((current) => {
        const configuredModels = normalizeModelList(current.models, available, [current.model]);
        return { ...current, models: configuredModels, model: current.model || configuredModels[0] || '' };
      });
      setGenericTestMessage(t('agent.genericTestSuccess', { count: available.length }));
    } catch (error) {
      setGenericTestMessage(t('agent.genericTestFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  };

  const addGenericModel = () => {
    const additions = genericModelDraft.split(/[\n,]/).map((model) => model.trim()).filter(Boolean);
    if (additions.length === 0) return;
    setGenericConfig((current) => {
      const configuredModels = normalizeModelList(current.models, additions, [current.model]);
      return { ...current, models: configuredModels, model: current.model || configuredModels[0] || '' };
    });
    setGenericModelDraft('');
  };

  const removeGenericModel = (model: string) => {
    setGenericConfig((current) => {
      const configuredModels = (current.models || []).filter((candidate) => candidate !== model);
      return { ...current, models: configuredModels, model: current.model === model ? (configuredModels[0] || '') : current.model };
    });
  };

  const selectGenericProfile = (id: string) => {
    const selected = genericProfiles.find((profile) => profile.id === id);
    if (!selected) return;
    setActiveGenericProfileId(id);
    setGenericModels([]);
    setGenericTestMessage('');
    setStatuses((current) => ({ ...current, generic: {
      available: Boolean(selected.baseUrl && selected.model && selected.apiKey), runtime: 'api',
      version: 'OpenAI-compatible API', detail: `${selected.name} · ${selected.baseUrl}`
    } }));
    if (!window.electronAPI) return;
    void window.electronAPI.storeGet(GENERIC_PROFILES_STORE_KEY).then((saved) => saved && window.electronAPI!.storeSet(GENERIC_PROFILES_STORE_KEY, { ...saved, activeProfileId: id })).catch(() => undefined);
  };

  const selectGenericProfileModel = (value: string) => {
    const separator = value.indexOf('|');
    if (separator < 0) return;
    const profileId = value.slice(0, separator);
    const model = decodeURIComponent(value.slice(separator + 1));
    const selected = genericProfiles.find((profile) => profile.id === profileId);
    if (!selected) return;
    setGenericProfiles((profiles) => profiles.map((profile) => profile.id === profileId ? { ...profile, model } : profile));
    setActiveGenericProfileId(profileId);
    setGenericModels([]);
    setGenericTestMessage('');
    setStatuses((current) => ({ ...current, generic: {
      available: Boolean(selected.baseUrl && model && selected.apiKey), runtime: 'api',
      version: 'OpenAI-compatible API', detail: `${selected.name} · ${selected.baseUrl}`
    } }));
    if (!window.electronAPI) return;
    void window.electronAPI.storeGet(GENERIC_PROFILES_STORE_KEY).then((saved) => {
      if (!saved || !Array.isArray(saved.profiles)) return;
      return window.electronAPI!.storeSet(GENERIC_PROFILES_STORE_KEY, {
        ...saved, activeProfileId: profileId,
        profiles: saved.profiles.map((profile: any) => profile.id === profileId ? { ...profile, model, models: normalizeModelList(profile.models, [model]) } : profile)
      });
    }).catch(() => undefined);
  };

  const addGenericProfile = () => {
    const profile = createGenericProfile(t('agent.newPlatform'));
    setGenericProfiles((current) => [...current, profile]);
    setActiveGenericProfileId(profile.id);
    setGenericModels([]);
    setGenericTestMessage('');
  };

  const removeGenericProfile = async () => {
    if (genericProfiles.length <= 1 || !confirm(t('agent.deletePlatformConfirm', { name: genericConfig.name }))) return;
    const remaining = genericProfiles.filter((profile) => profile.id !== activeGenericProfileId);
    const next = remaining[0];
    setGenericProfiles(remaining);
    setActiveGenericProfileId(next.id);
    await window.electronAPI?.secretsDelete(profileSecretKey(activeGenericProfileId)).catch(() => undefined);
    setStatuses((current) => ({ ...current, generic: {
      available: Boolean(next.baseUrl && next.model && next.apiKey), runtime: 'api',
      version: 'OpenAI-compatible API', detail: `${next.name} · ${next.baseUrl}`
    } }));
  };

  const answerApproval = async (approval: ApprovalEntry, decision: AgentApprovalDecision) => {
    await window.electronAPI?.agentRespondApproval(approval.provider, approval.requestId, decision);
    const accepted = decision === 'accept' || decision === 'acceptForSession';
    updateConversation(approval.provider, (current) => ({
      ...current,
      entries: current.entries.map((entry) => entry.id === approval.id ? {
        entryType: 'activity', id: `${approval.id}:result`, provider: approval.provider,
        kind: 'other', status: accepted ? 'completed' : 'declined',
        title: accepted ? (decision === 'acceptForSession' ? 'Permission allowed for session' : 'Permission allowed once') : 'Permission declined',
        detail: approval.title
      } : entry)
    }));
  };

  return (
    <div className="relative h-full flex flex-col bg-[#f3f3f3] text-slate-700 dark:bg-[#181818] dark:text-[#cccccc]">
      <div className="flex h-11 items-center border-b border-[#d4d4d4] bg-[#f3f3f3] dark:border-[#2b2b2b] dark:bg-[#1b1b1b]">
        <div className="px-3 text-[11px] uppercase tracking-wide text-slate-500 dark:text-[#8b8b8b]">{t('agent.title')}</div>
        <div className="flex-1 flex h-full">
          {PROVIDERS.map((item) => <button key={item.id} onClick={() => setProvider(item.id)} className={`relative px-3 text-xs transition-colors ${provider === item.id ? 'bg-white text-slate-900 dark:bg-[#202020] dark:text-white' : 'text-slate-500 hover:bg-[#e8e8e8] hover:text-slate-900 dark:text-[#929292] dark:hover:bg-transparent dark:hover:text-[#dddddd]'}`} title={[statuses[item.id]?.version, statuses[item.id]?.command, statuses[item.id]?.detail].filter(Boolean).join('\n') || `${providerLabel(item.id)} runtime`}>
            {providerLabel(item.id)}<span className={`absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full ${statuses[item.id]?.available ? 'bg-emerald-500 dark:bg-[#3fb950]' : 'bg-slate-400 dark:bg-[#555]'}`} />
            {provider === item.id && <span className="absolute left-0 right-0 top-0 h-px bg-[#4daafc]" />}
          </button>)}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 px-1">
          {provider === 'generic' && <ToolbarIconButton title={t('agent.genericSettings')} onClick={() => setShowGenericSettings(true)}>{ToolbarIcons.settings}</ToolbarIconButton>}
          <ToolbarIconButton title={t('customize.title')} onClick={openCustomize} indicator={agentRules.enabled}>{ToolbarIcons.customize}</ToolbarIconButton>
          <ToolbarIconButton title={t('agent.history')} onClick={() => setShowHistory(true)}>{ToolbarIcons.history}</ToolbarIconButton>
          <ToolbarIconButton title={t('agent.newConversation', { name: title })} onClick={() => void newConversation()}>{ToolbarIcons.plus}</ToolbarIconButton>
        </div>
      </div>

      {showHistory && <div className="absolute inset-0 z-50 flex flex-col bg-white dark:bg-[#181818]">
        <div className="flex h-11 items-center gap-2 border-b border-slate-300 px-2 dark:border-[#2b2b2b]"><button className="icon-button text-xl" title={t('common.back')} onClick={() => setShowHistory(false)}>‹</button><span className="flex-1 text-xs font-medium">{t('agent.history')}</span></div>
        <div className="flex-1 overflow-auto p-2">{history.length === 0 ? <div className="py-10 text-center text-xs text-slate-500 dark:text-[#777]">{t('agent.historyEmpty')}</div> : history.map((saved) => <button key={saved.id} onClick={() => void openSavedConversation(saved)} className="mb-1.5 block w-full rounded border border-slate-200 px-3 py-2 text-left hover:bg-slate-100 dark:border-[#303030] dark:hover:bg-[#252526]"><span className="block truncate text-xs text-slate-800 dark:text-[#d4d4d4]">{saved.title}</span><span className="mt-1 flex justify-between text-[10px] text-slate-500 dark:text-[#777]"><span>{saved.provider}</span><span>{new Date(saved.updatedAt).toLocaleString()}</span></span></button>)}</div>
      </div>}

      {showGenericSettings && <div className="absolute inset-0 z-50 flex flex-col bg-white dark:bg-[#181818]">
        <div className="flex h-11 items-center gap-2 border-b border-slate-300 px-2 dark:border-[#2b2b2b]"><button className="icon-button text-xl" title={t('common.back')} onClick={() => setShowGenericSettings(false)}>‹</button><span className="flex-1 text-xs font-medium">{t('agent.genericSettings')}</span></div>
        <div className="flex-1 space-y-4 overflow-auto p-4 text-xs">
          <div className="space-y-2"><span className="block text-slate-600 dark:text-[#bbb]">{t('agent.platform')}</span><div className="flex gap-2"><select value={activeGenericProfileId} onChange={(event) => selectGenericProfile(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 py-2 outline-none focus:border-blue-500 dark:border-[#444] dark:bg-[#202020]">{genericProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><button type="button" onClick={addGenericProfile} className="icon-button border border-slate-300 text-lg dark:border-[#444]" title={t('agent.addPlatform')}>＋</button><button type="button" disabled={genericProfiles.length <= 1} onClick={() => void removeGenericProfile()} className="icon-button border border-slate-300 text-base text-slate-500 disabled:opacity-30 dark:border-[#444]" title={t('agent.deletePlatform')}>−</button></div></div>
          <label className="block"><span className="mb-1.5 block text-slate-600 dark:text-[#bbb]">{t('agent.platformName')}</span><input value={genericConfig.name} onChange={(event) => setGenericProfiles((profiles) => profiles.map((profile) => profile.id === activeGenericProfileId ? { ...profile, name: event.target.value } : profile))} placeholder={t('agent.platformNamePlaceholder')} className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 outline-none focus:border-blue-500 dark:border-[#444] dark:bg-[#202020]" /></label>
          <label className="block"><span className="mb-1.5 block text-slate-600 dark:text-[#bbb]">Base URL</span><input value={genericConfig.baseUrl} onChange={(event) => setGenericConfig((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.openai.com/v1" className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 outline-none focus:border-blue-500 dark:border-[#444] dark:bg-[#202020]" /></label>
          <label className="block"><span className="mb-1.5 block text-slate-600 dark:text-[#bbb]">API Key</span><input type="password" value={genericConfig.apiKey} onChange={(event) => setGenericConfig((current) => ({ ...current, apiKey: event.target.value }))} placeholder="sk-..." className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 outline-none focus:border-blue-500 dark:border-[#444] dark:bg-[#202020]" /></label>
          <label className="block"><span className="mb-1.5 block text-slate-600 dark:text-[#bbb]">{t('agent.defaultModel')}</span><select value={genericConfig.model} onChange={(event) => setGenericConfig((current) => ({ ...current, model: event.target.value }))} className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 outline-none focus:border-blue-500 dark:border-[#444] dark:bg-[#202020]"><option value="" disabled>{t('agent.selectModel')}</option>{normalizeModelList(genericConfig.models, [genericConfig.model]).map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
          <div className="space-y-2"><span className="block text-slate-600 dark:text-[#bbb]">{t('agent.modelList')}</span><div className="flex gap-2"><input list="generic-agent-models" value={genericModelDraft} onChange={(event) => setGenericModelDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addGenericModel(); } }} placeholder={t('agent.modelPlaceholder')} className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 py-2 outline-none focus:border-blue-500 dark:border-[#444] dark:bg-[#202020]" /><datalist id="generic-agent-models">{genericModels.map((model) => <option key={model} value={model} />)}</datalist><button type="button" onClick={addGenericModel} className="rounded border border-slate-300 px-3 text-lg hover:bg-slate-100 dark:border-[#444] dark:hover:bg-[#252526]" title={t('agent.addModel')}>＋</button></div><div className="flex max-h-36 flex-wrap gap-1.5 overflow-auto">{normalizeModelList(genericConfig.models, [genericConfig.model]).map((model) => <span key={model} className={`inline-flex max-w-full items-center gap-1 rounded border px-2 py-1 ${model === genericConfig.model ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-[#173047] dark:text-[#75beff]' : 'border-slate-300 dark:border-[#444]'}`}><button type="button" className="max-w-[240px] truncate" onClick={() => setGenericConfig((current) => ({ ...current, model }))} title={model}>{model}</button><button type="button" onClick={() => removeGenericModel(model)} className="text-base leading-none text-slate-400 hover:text-red-500" title={t('common.delete')}>×</button></span>)}</div></div>
          <label className="block"><span className="mb-1.5 flex items-center justify-between text-slate-600 dark:text-[#bbb]"><span>{t('agent.maxToolRounds')}</span><span className="text-[10px] text-slate-400 dark:text-[#777]">{t('agent.maxToolRoundsRange')}</span></span><input type="number" min={1} max={64} step={1} value={genericConfig.maxToolRounds || 16} onChange={(event) => setGenericConfig((current) => ({ ...current, maxToolRounds: Math.min(64, Math.max(1, Number(event.target.value) || 1)) }))} className="w-full rounded border border-slate-300 bg-white px-2.5 py-2 outline-none focus:border-blue-500 dark:border-[#444] dark:bg-[#202020]" /><span className="mt-1.5 block text-[10px] leading-4 text-slate-400 dark:text-[#777]">{t('agent.maxToolRoundsHint')}</span></label>
          <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-5 text-slate-500 dark:border-[#303030] dark:bg-[#202020] dark:text-[#888]">{t('agent.genericHint')}</div>
          {genericTestMessage && <div className="break-words text-[11px] text-slate-600 dark:text-[#aaa]">{genericTestMessage}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-300 p-3 dark:border-[#2b2b2b]"><button className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-[#444] dark:hover:bg-[#252526]" onClick={() => void testGenericConnection()}>{t('agent.testConnection')}</button><button disabled={!genericConfig.baseUrl.trim() || !genericConfig.apiKey.trim() || normalizeModelList(genericConfig.models, [genericConfig.model]).length === 0} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white disabled:bg-slate-400 dark:bg-[#0e639c] dark:disabled:bg-[#333]" onClick={() => void saveGenericSettings()}>{t('common.save')}</button></div>
      </div>}

      <div className="px-3 py-2 border-b border-[#d4d4d4] text-[11px] flex items-center justify-between bg-[#f3f3f3] dark:border-[#292929] dark:bg-[#191919]">
        <div className="flex items-center gap-2 min-w-0"><span className={`w-1.5 h-1.5 rounded-full ${activeStatus?.available ? 'bg-emerald-500 dark:bg-[#3fb950]' : 'bg-slate-400 dark:bg-[#666]'}`} /><span className="truncate" title={activeStatus?.detail}>{activeStatus?.available ? t('agent.ready', { name: `${title} ${activeStatus.runtime === 'app-server' ? 'App Server' : activeStatus.runtime === 'agent-sdk' ? 'Agent SDK' : activeStatus.runtime === 'api' ? 'API' : 'CLI'}` }) : t('agent.unavailable', { name: title })}</span></div>
        <button className="text-slate-500 hover:text-blue-600 dark:text-[#8b8b8b] dark:hover:text-[#4daafc]" onClick={() => setShowConnection((value) => !value)}>MCP {mcp?.running ? '●' : '○'}</button>
      </div>

      {showConnection && <div className="px-3 py-2 border-b border-slate-200 bg-slate-100 text-[11px] space-y-1 dark:border-[#292929] dark:bg-[#111]">
        <div className="flex justify-between"><span className="text-slate-500 dark:text-[#888]">STARLIMS MCP</span><span className={mcp?.running ? 'text-emerald-600 dark:text-[#3fb950]' : 'text-red-600 dark:text-[#f85149]'}>{mcp?.running ? t('agent.running') : t('agent.offline')}</span></div>
        <button className="block w-full truncate text-left font-mono text-blue-600 dark:text-[#4daafc]" title={t('agent.copyEndpoint')} onClick={() => void navigator.clipboard.writeText(mcp?.url || '')}>{mcp?.url}</button>
        <div className="text-slate-500 dark:text-[#777]">{t('agent.endpointHint')}</div>
      </div>}

      <div className="flex-1 overflow-auto bg-[#f3f3f3] px-3 py-3 font-mono text-xs leading-5 dark:bg-[#181818]">
        {entries.length === 0 && pendingMcpApprovals.length === 0 && <div className="h-full flex flex-col items-center justify-center px-5 text-center text-slate-500 dark:text-[#777]"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 dark:border-[#333] dark:text-[#bbb]">{PROVIDERS.find((item) => item.id === provider)?.mark}</div><div className="mb-1 text-slate-700 dark:text-[#bbb]">{t('agent.askTitle', { name: title })}</div><div className="text-[11px] leading-4">{t('agent.askHint')}</div></div>}

        {displayEntries.map((entry) => {
          if (entry.entryType === 'message') {
            const assistantName = entry.provider === 'generic' ? (genericConfig.model || providerLabel(entry.provider)) : providerLabel(entry.provider);
            return <div key={entry.id} className="mb-4"><div className={`mb-1 text-[10px] uppercase tracking-wider ${entry.role === 'user' ? 'text-blue-600 dark:text-[#4daafc]' : entry.error ? 'text-red-600 dark:text-[#f85149]' : 'text-emerald-600 dark:text-[#3fb950]'}`}>{entry.role === 'user' ? t('agent.you') : entry.error ? t('agent.error', { name: assistantName }) : assistantName}</div>{entry.role === 'assistant' && !entry.error ? <MarkdownMessage content={entry.content} /> : <div className={`whitespace-pre-wrap break-words font-sans text-[13px] leading-6 ${entry.error ? 'text-red-700 dark:text-[#f0a09a]' : 'text-slate-800 dark:text-[#d4d4d4]'}`}>{entry.content}</div>}</div>;
          }

          if (entry.entryType === 'activity-group') {
            const runningCount = entry.entries.filter((item) => item.status === 'running').length;
            const failedCount = entry.entries.filter((item) => item.status === 'failed' || item.status === 'declined').length;
            const latest = entry.entries.at(-1)!;
            return <details key={entry.id} className="group mb-2 rounded border border-slate-200 bg-slate-50 dark:border-[#333] dark:bg-[#202020]">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-2 px-2 text-[11px]" title={latest.title}>
                <span className="w-4 shrink-0 text-center text-slate-400 transition-transform group-open:rotate-90">›</span>
                <span className="shrink-0 text-blue-600 dark:text-[#4daafc]">{t('agent.activity')}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-[#aaa]">{latest.title}</span>
                <span className="shrink-0 text-slate-500">{entry.entries.length}</span>
                <span className={`shrink-0 ${failedCount ? 'text-red-600 dark:text-[#f85149]' : runningCount ? 'text-amber-600 dark:text-[#d29922]' : 'text-emerald-600 dark:text-[#3fb950]'}`}>{failedCount ? t('agent.activityFailed', { count: failedCount }) : runningCount ? t('agent.activityRunning', { count: runningCount }) : t('agent.activityCompleted')}</span>
              </summary>
              <div className="border-t border-slate-200 px-1.5 py-1 dark:border-[#333]">{entry.entries.map((activity) => <details key={activity.id} className="rounded hover:bg-slate-100 dark:hover:bg-[#252526]">
                <summary className="flex min-h-7 cursor-pointer list-none items-center gap-2 px-1.5 text-[10px]"><span className="w-7 text-center text-blue-600 dark:text-[#4daafc]">{kindMark[activity.kind]}</span><span className="min-w-0 flex-1 truncate text-slate-700 dark:text-[#ccc]" title={activity.title}>{activity.title}</span><span className={activity.status === 'completed' ? 'text-emerald-600 dark:text-[#3fb950]' : activity.status === 'failed' || activity.status === 'declined' ? 'text-red-600 dark:text-[#f85149]' : 'text-amber-600 dark:text-[#d29922]'}>{activity.status}</span></summary>
                {(activity.detail || activity.output || activity.diff) && <div className="border-t border-slate-200 px-2 py-2 text-[10px] text-slate-600 dark:border-[#333] dark:text-[#aaa]">{activity.detail && <pre className="mb-2 whitespace-pre-wrap break-all">{activity.detail}</pre>}{activity.output && <pre className="mb-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-slate-800 dark:text-[#d4d4d4]">{activity.output}</pre>}{activity.diff && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-emerald-700 dark:text-[#7ee787]">{activity.diff}</pre>}</div>}
              </details>)}</div>
            </details>;
          }

          return <div key={entry.id} className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] dark:border-[#6e5b24] dark:bg-[#2b2517]"><div className="font-sans font-medium text-amber-900 dark:text-[#e3c66d]">{entry.title}</div>{entry.detail && <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all text-amber-800 dark:text-[#c8b56a]">{entry.detail}</pre>}<div className="mt-2 flex gap-1.5 font-sans"><button className="rounded bg-blue-600 px-2 py-1 text-white" onClick={() => void answerApproval(entry, 'accept')}>{t('agent.allowOnce')}</button>{entry.canAcceptForSession && <button className="rounded border border-blue-400 px-2 py-1 text-blue-700 dark:text-[#7dcfff]" onClick={() => void answerApproval(entry, 'acceptForSession')}>{t('agent.allowSession')}</button>}<button className="rounded border border-slate-300 px-2 py-1 text-slate-600 dark:border-[#555] dark:text-[#bbb]" onClick={() => void answerApproval(entry, 'decline')}>{t('agent.decline')}</button></div></div>;
        })}

        {pendingMcpApprovals.map((approval) => <div key={approval.id} className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] dark:border-[#6e5b24] dark:bg-[#2b2517]"><div className="font-sans font-medium text-amber-900 dark:text-[#e3c66d]">{t('agent.mcpApproval', { tool: approval.tool })}</div><pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all text-amber-800 dark:text-[#c8b56a]">{approval.detail}</pre><div className="mt-2 flex gap-1.5 font-sans"><button className="rounded bg-blue-600 px-2 py-1 text-white" onClick={() => resolveMcpApproval(approval.id, true)}>{t('agent.allowOnce')}</button><button className="rounded border border-slate-300 px-2 py-1 text-slate-600 dark:border-[#555] dark:text-[#bbb]" onClick={() => resolveMcpApproval(approval.id, false)}>{t('agent.decline')}</button></div></div>)}

        {running && <div className="flex items-center gap-2 text-slate-500 dark:text-[#888]"><span className="agent-pulse">●</span>{t('agent.working', { name: title })} {provider !== 'opencode' && <button className="font-sans text-red-600 hover:underline dark:text-[#f85149]" onClick={() => void (provider === 'generic' ? window.electronAPI?.genericAgentInterrupt() : window.electronAPI?.agentInterrupt(provider))}>{t('agent.stop')}</button>}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="relative border-t border-[#d4d4d4] bg-[#f3f3f3] p-2 dark:border-[#2b2b2b] dark:bg-[#1b1b1b]">
        {mentionQuery !== null && <div className="absolute bottom-[calc(100%-2px)] left-2 right-2 z-30 max-h-64 overflow-auto rounded-md border border-slate-300 bg-white p-1 shadow-2xl dark:border-[#454545] dark:bg-[#2b2b2b]">
          {mentionLoading && <div className="px-2 py-1 text-[10px] text-slate-500 dark:text-[#969696]">{t('common.loading')}</div>}
          {mentionResults.length === 0 && !mentionLoading
            ? <div className="px-3 py-4 text-center text-xs text-slate-500 dark:text-[#969696]">{t('agent.mentionEmpty')}</div>
            : mentionResults.map((candidate, index) => <button
              key={`${candidate.source}:${candidate.id}`}
              type="button"
              className={`flex h-8 w-full min-w-0 items-center gap-2 rounded px-2 text-left ${index === mentionIndex ? 'bg-blue-100 dark:bg-[#094771]' : 'hover:bg-slate-100 dark:hover:bg-[#37373d]'}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void chooseMention(candidate)}
              title={candidate.uri}
            >
              <span className={`w-5 shrink-0 text-center font-mono text-[11px] font-semibold ${mentionFileMark(candidate) === 'JS' ? 'text-yellow-500' : 'text-slate-500 dark:text-[#c5c5c5]'}`}>{mentionFileMark(candidate)}</span>
              <span className="max-w-[68%] shrink-0 truncate text-xs leading-4 text-slate-800 dark:text-[#dddddd]">{mentionDisplayName(candidate)}</span>
              <span className="min-w-0 flex-1 truncate text-right text-[10px] leading-4 text-slate-400 dark:text-[#858585]">{mentionParentPath(candidate)}</span>
            </button>)}
        </div>}
        {contexts.length > 0 && <div className="flex flex-wrap gap-1.5 pb-2">{contexts.map((item) => <div key={item.id} className="max-w-full flex min-h-8 items-center gap-1 rounded border border-slate-300 bg-slate-200 py-0.5 pl-2 pr-0.5 text-[11px] text-slate-700 dark:border-[#3b3b3b] dark:bg-[#2a2d2e] dark:text-[#c5c5c5]" title={item.uri}><span className="text-blue-600 dark:text-[#4daafc]">{item.source === 'file' ? '📎' : '@'}</span><span className="max-w-[190px] truncate">{contextDisplayName(item)}</span><button className="icon-button h-7 w-7 text-base" title={t('common.close')} onClick={() => removeContext(item.id)}>×</button></div>)}{contexts.length > 1 && <button className="min-h-8 rounded px-2 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-[#888] dark:hover:bg-[#2a2d2e] dark:hover:text-white" onClick={clearContexts}>{t('agent.clear')}</button>}</div>}
        <div className="relative rounded-md border border-slate-300 bg-white focus-within:border-blue-500 dark:border-[#3b3b3b] dark:bg-[#202020] dark:focus-within:border-[#555]">
          {showPermissionMenu && <div className="absolute bottom-10 left-2 z-40 w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-lg border border-slate-300 bg-white p-1.5 font-sans shadow-2xl dark:border-[#454545] dark:bg-[#2b2b2b]">
            <div className="px-2 py-1.5 text-xs text-slate-500 dark:text-[#aaa]">{t('agent.permissionQuestion')}</div>
            {([
              ['ask-writes', '✋', t('agent.permission.ask'), t('agent.permission.askHint')],
              ['auto-safe', '◉', t('agent.permission.auto'), t('agent.permission.autoHint')],
              ['full-access', '!', t('agent.permission.full'), t('agent.permission.fullHint')]
            ] as const).map(([value, mark, label, hint]) => <button key={value} type="button" onClick={() => { setPermissionPolicy(value); setShowPermissionMenu(false); }} className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-[#37373d] ${value === 'full-access' ? 'text-orange-600 dark:text-[#f0883e]' : 'text-slate-800 dark:text-[#ddd]'}`}><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-current text-[10px]">{mark}</span><span className="min-w-0 flex-1"><span className="block text-xs">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-500 dark:text-[#999]">{hint}</span></span>{permissionPolicy === value && <span className="text-base">✓</span>}</button>)}
          </div>}
          <textarea ref={inputRef} value={input} onChange={(event) => { setInput(event.target.value); updateMentionFromInput(event.target.value, event.target.selectionStart); }} onClick={(event) => updateMentionFromInput(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyDown={(event) => {
            if (mentionQuery !== null && mentionResults.length > 0) {
              if (event.key === 'ArrowDown') { event.preventDefault(); setMentionIndex((index) => (index + 1) % mentionResults.length); return; }
              if (event.key === 'ArrowUp') { event.preventDefault(); setMentionIndex((index) => (index - 1 + mentionResults.length) % mentionResults.length); return; }
              if (event.key === 'Enter') { event.preventDefault(); void chooseMention(mentionResults[mentionIndex]); return; }
            }
            if (event.key === 'Escape' && mentionQuery !== null) { event.preventDefault(); setMentionQuery(null); return; }
            if (event.key === 'Enter' && mentionQuery !== null) { event.preventDefault(); return; }
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
          }} rows={4} disabled={running} placeholder={t('agent.placeholder', { name: title })} className="w-full resize-none bg-transparent px-3 py-2 text-xs leading-5 text-slate-900 placeholder-slate-400 outline-none dark:text-[#e1e1e1] dark:placeholder-[#666]" />
          <div className="flex items-center justify-between gap-2 px-2 pb-2 text-xs text-slate-500 dark:text-[#777]">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <button type="button" onClick={openMentionPicker} className="icon-button text-base font-semibold text-blue-600 dark:text-[#4daafc]" title={t('agent.mentionScripts')}>@</button>
              <button type="button" onClick={() => void attachFiles()} className="icon-button text-base text-slate-600 dark:text-[#c5c5c5]" title={t('agent.attachFiles')}>📎</button>
              <button type="button" onClick={() => setShowPermissionMenu((value) => !value)} className={`icon-button h-8 w-8 shrink-0 text-sm ${permissionPolicy === 'full-access' ? 'text-orange-600 dark:text-[#f0883e]' : permissionPolicy === 'auto-safe' ? 'text-emerald-600 dark:text-[#3fb950]' : 'text-slate-600 dark:text-[#c5c5c5]'}`} title={t(`agent.permission.${permissionPolicy}`)} aria-label={t('agent.permission')}>{permissionPolicy === 'ask-writes' ? '✋' : permissionPolicy === 'auto-safe' ? '◉' : '!'}</button>
              <select value={conversationMode} onChange={(event) => setConversationMode(event.target.value as ConversationMode)} className="h-8 min-w-0 max-w-[96px] shrink truncate rounded-md border border-slate-300 bg-transparent px-1.5 text-xs text-slate-700 outline-none hover:bg-slate-100 dark:border-[#454545] dark:bg-[#202020] dark:text-[#c5c5c5] dark:hover:bg-[#2a2d2e]" title={t(`agent.mode.${conversationMode}`)} aria-label={t('agent.mode')}><option value="agent">∞ {t('agent.mode.agent')}</option><option value="plan">☷ {t('agent.mode.plan')}</option><option value="debug">✹ {t('agent.mode.debug')}</option><option value="multitask">◎ {t('agent.mode.multitask')}</option><option value="ask">□ {t('agent.mode.ask')}</option></select>
              {provider === 'codex' && <><select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={models.length === 0} className="h-8 min-w-0 max-w-[160px] flex-1 truncate rounded-md border border-slate-300 bg-transparent px-1.5 text-xs text-slate-700 outline-none dark:border-[#454545] dark:bg-[#202020] dark:text-[#c5c5c5]" title={modelsError || models.find((model) => model.id === selectedModel)?.description || t('agent.model')} aria-label={t('agent.model')}>{models.length === 0 && <option value="">{modelsLoading ? t('common.loading') : t('agent.modelUnavailable')}</option>}{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select>{!modelsLoading && models.length === 0 && <button type="button" onClick={() => void loadCodexModels(2)} className="icon-button h-8 w-8 shrink-0 text-base" title={`${t('agent.modelRetry')}${modelsError ? `: ${modelsError}` : ''}`} aria-label={t('agent.modelRetry')}>↻</button>}</>}
              {provider === 'generic' && <select value={genericModelSelection} onChange={(event) => selectGenericProfileModel(event.target.value)} disabled={genericModelChoices.length === 0} className="h-8 min-w-0 max-w-[180px] flex-1 truncate rounded-md border border-slate-300 bg-transparent px-1.5 text-xs text-slate-700 outline-none dark:border-[#454545] dark:bg-[#202020] dark:text-[#c5c5c5]" title={`${genericConfig.name} · ${genericConfig.model || t('agent.configure')}`} aria-label={t('agent.model')}>{genericModelChoices.length === 0 && <option value={genericModelSelection}>{t('agent.configure')}</option>}{genericModelChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.model}</option>)}</select>}
            </div>
            <button disabled={!input.trim() || running || !activeStatus?.available} onClick={() => void send()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-base font-medium text-white transition-colors hover:bg-blue-500 disabled:bg-slate-300 disabled:text-slate-500 dark:bg-[#0e639c] dark:hover:bg-[#1177bb] dark:disabled:bg-[#333] dark:disabled:text-[#666]" title={t('agent.send')}>↑</button>
          </div>
        </div>
      </div>
    </div>
  );
}
