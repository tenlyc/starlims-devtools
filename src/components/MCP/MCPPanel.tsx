import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildCliPrompt, useAiContextStore } from '../../services/aiContextStore';
import type { AgentApprovalDecision, AgentEvent, AgentItemKind, AgentProvider, AgentRuntimeStatus } from '../../types/agent';

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
type ProviderConversation = { entries: TimelineEntry[]; running: boolean; sequence: number };
type Conversations = Record<AgentProvider, ProviderConversation>;
type McpStatus = { running: boolean; url: string; port: number; error?: string };

const PROVIDERS: Array<{ id: AgentProvider; label: string; mark: string }> = [
  { id: 'codex', label: 'Codex', mark: 'CX' }
];
const kindMark: Record<AgentItemKind, string> = { mcp: 'MCP', command: '>_', file: 'Δ', reasoning: '◌', plan: '≡', other: '•' };

function emptyConversation(): ProviderConversation {
  return { entries: [], running: false, sequence: 0 };
}

function initialConversations(): Conversations {
  return { codex: emptyConversation(), claude: emptyConversation(), opencode: emptyConversation() };
}

function stripAnsi(value: string): string {
  const escape = String.fromCharCode(27);
  const controlSequenceIntroducer = String.fromCharCode(155);
  const ansiPattern = new RegExp(`(?:${escape}\\[|${controlSequenceIntroducer})[0-?]*[ -/]*[@-~]`, 'g');
  return value.replace(ansiPattern, '');
}

function replaceOrAppend(entries: TimelineEntry[], entry: TimelineEntry): TimelineEntry[] {
  const index = entries.findIndex((item) => item.id === entry.id);
  if (index < 0) return [...entries, entry];
  const next = [...entries];
  next[index] = entry;
  return next;
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
  const [provider, setProvider] = useState<AgentProvider>('codex');
  const [statuses, setStatuses] = useState<Partial<Record<AgentProvider, AgentRuntimeStatus>>>({});
  const [mcp, setMcp] = useState<McpStatus | null>(null);
  const [conversations, setConversations] = useState<Conversations>(initialConversations);
  const [input, setInput] = useState('');
  const [showConnection, setShowConnection] = useState(false);
  const contexts = useAiContextStore((state) => state.items);
  const removeContext = useAiContextStore((state) => state.removeItem);
  const clearContexts = useAiContextStore((state) => state.clear);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversation = conversations[provider];
  const { entries, running } = conversation;

  useEffect(() => {
    const refresh = async () => {
      if (!window.electronAPI) return;
      const [agentStatuses, mcpStatus] = await Promise.all([
        window.electronAPI.agentGetStatuses().catch(() => ({} as Record<AgentProvider, AgentRuntimeStatus>)),
        window.electronAPI.mcpGetStatus().catch(() => null)
      ]);
      setStatuses(agentStatuses);
      setMcp(mcpStatus);
    };
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => window.electronAPI?.onAgentEvent((event) => {
    setConversations((current) => ({
      ...current,
      [event.provider]: applyAgentEvent(current[event.provider], event)
    }));
  }), []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [provider, entries, running]);
  useEffect(() => { if (contexts.length) inputRef.current?.focus(); }, [contexts.length]);

  const activeStatus = statuses[provider];
  const title = useMemo(() => PROVIDERS.find((item) => item.id === provider)?.label || provider, [provider]);

  const updateConversation = (target: AgentProvider, update: (current: ProviderConversation) => ProviderConversation) => {
    setConversations((current) => ({ ...current, [target]: update(current[target]) }));
  };

  const send = async () => {
    const question = input.trim();
    if (!question || running || !activeStatus?.available || !window.electronAPI) return;
    const selectedProvider = provider;
    const userMessage: MessageEntry = { entryType: 'message', id: crypto.randomUUID(), role: 'user', content: question, provider: selectedProvider };
    const history = selectedProvider === 'opencode'
      ? entries.filter((entry): entry is MessageEntry => entry.entryType === 'message' && !entry.error).map(({ role, content }) => ({ role, content }))
      : [];
    const prompt = buildCliPrompt(question, contexts, history, mcp?.url || 'http://127.0.0.1:3002/mcp');
    updateConversation(selectedProvider, (current) => ({ ...current, entries: [...current.entries, userMessage], running: true, sequence: current.sequence + 1 }));
    setInput('');
    try {
      if (selectedProvider === 'opencode') {
        const output = await window.electronAPI.cliExecute(selectedProvider, prompt);
        const message: MessageEntry = { entryType: 'message', id: crypto.randomUUID(), role: 'assistant', provider: selectedProvider, content: stripAnsi(output) };
        updateConversation(selectedProvider, (current) => ({ ...current, running: false, entries: [...current.entries, message] }));
      } else {
        await window.electronAPI.agentStart(selectedProvider, prompt);
      }
    } catch (error) {
      const message: MessageEntry = { entryType: 'message', id: crypto.randomUUID(), role: 'assistant', provider: selectedProvider, error: true, content: error instanceof Error ? error.message : String(error) };
      updateConversation(selectedProvider, (current) => ({ ...current, running: false, entries: [...current.entries, message] }));
    }
  };

  const newConversation = async () => {
    const selectedProvider = provider;
    if (selectedProvider !== 'opencode') await window.electronAPI?.agentNewSession(selectedProvider).catch(() => undefined);
    updateConversation(selectedProvider, () => emptyConversation());
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
    <div className="h-full flex flex-col bg-white text-slate-700 dark:bg-[#181818] dark:text-[#cccccc]">
      <div className="h-9 flex items-center border-b border-slate-300 bg-slate-100 dark:border-[#2b2b2b] dark:bg-[#1b1b1b]">
        <div className="px-3 text-[11px] uppercase tracking-wide text-slate-500 dark:text-[#8b8b8b]">Agent</div>
        <div className="flex-1 flex h-full">
          {PROVIDERS.map((item) => <button key={item.id} onClick={() => setProvider(item.id)} className={`relative px-3 text-xs transition-colors ${provider === item.id ? 'bg-white text-slate-900 dark:bg-[#202020] dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-[#929292] dark:hover:text-[#dddddd]'}`} title={[statuses[item.id]?.version, statuses[item.id]?.command, statuses[item.id]?.detail].filter(Boolean).join('\n') || `${item.label} runtime`}>
            {item.label}<span className={`absolute right-1.5 top-1.5 w-1.5 h-1.5 rounded-full ${statuses[item.id]?.available ? 'bg-emerald-500 dark:bg-[#3fb950]' : 'bg-slate-400 dark:bg-[#555]'}`} />
            {provider === item.id && <span className="absolute left-0 right-0 top-0 h-px bg-[#4daafc]" />}
          </button>)}
        </div>
        <button className="px-2 text-slate-500 hover:text-slate-900 dark:text-[#8b8b8b] dark:hover:text-white" title={`New ${title} conversation`} onClick={() => void newConversation()}>＋</button>
      </div>

      <div className="px-3 py-2 border-b border-slate-200 text-[11px] flex items-center justify-between bg-slate-50 dark:border-[#292929] dark:bg-[#191919]">
        <div className="flex items-center gap-2 min-w-0"><span className={`w-1.5 h-1.5 rounded-full ${activeStatus?.available ? 'bg-emerald-500 dark:bg-[#3fb950]' : 'bg-slate-400 dark:bg-[#666]'}`} /><span className="truncate" title={activeStatus?.detail}>{activeStatus?.available ? `${title} ${activeStatus.runtime === 'app-server' ? 'App Server' : activeStatus.runtime === 'agent-sdk' ? 'Agent SDK' : 'CLI'} ready` : `${title} runtime unavailable`}</span></div>
        <button className="text-slate-500 hover:text-blue-600 dark:text-[#8b8b8b] dark:hover:text-[#4daafc]" onClick={() => setShowConnection((value) => !value)}>MCP {mcp?.running ? '●' : '○'}</button>
      </div>

      {showConnection && <div className="px-3 py-2 border-b border-slate-200 bg-slate-100 text-[11px] space-y-1 dark:border-[#292929] dark:bg-[#111]">
        <div className="flex justify-between"><span className="text-slate-500 dark:text-[#888]">STARLIMS MCP</span><span className={mcp?.running ? 'text-emerald-600 dark:text-[#3fb950]' : 'text-red-600 dark:text-[#f85149]'}>{mcp?.running ? 'RUNNING' : 'OFFLINE'}</span></div>
        <button className="block w-full truncate text-left font-mono text-blue-600 dark:text-[#4daafc]" title="Copy endpoint" onClick={() => void navigator.clipboard.writeText(mcp?.url || '')}>{mcp?.url}</button>
        <div className="text-slate-500 dark:text-[#777]">Codex App Server uses this required STARLIMS MCP endpoint.</div>
      </div>}

      <div className="flex-1 overflow-auto bg-white px-3 py-3 font-mono text-xs leading-5 dark:bg-[#181818]">
        {entries.length === 0 && <div className="h-full flex flex-col items-center justify-center px-5 text-center text-slate-500 dark:text-[#777]"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 dark:border-[#333] dark:text-[#bbb]">{PROVIDERS.find((item) => item.id === provider)?.mark}</div><div className="mb-1 text-slate-700 dark:text-[#bbb]">Ask {title} about STARLIMS</div><div className="text-[11px] leading-4">Each AI keeps its own conversation. Right-click a script or the editor to add context.</div></div>}

        {entries.map((entry) => {
          if (entry.entryType === 'message') return <div key={entry.id} className="mb-4"><div className={`mb-1 text-[10px] uppercase tracking-wider ${entry.role === 'user' ? 'text-blue-600 dark:text-[#4daafc]' : entry.error ? 'text-red-600 dark:text-[#f85149]' : 'text-emerald-600 dark:text-[#3fb950]'}`}>{entry.role === 'user' ? 'You' : entry.error ? `${entry.provider} error` : entry.provider}</div>{entry.role === 'assistant' && !entry.error ? <MarkdownMessage content={entry.content} /> : <div className={`whitespace-pre-wrap break-words font-sans text-[13px] leading-6 ${entry.error ? 'text-red-700 dark:text-[#f0a09a]' : 'text-slate-800 dark:text-[#d4d4d4]'}`}>{entry.content}</div>}</div>;

          if (entry.entryType === 'activity') return <details key={entry.id} className="mb-2 rounded border border-slate-200 bg-slate-50 dark:border-[#333] dark:bg-[#202020]" open={entry.status === 'running' || entry.status === 'failed'}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-[11px]"><span className="w-7 text-center text-blue-600 dark:text-[#4daafc]">{kindMark[entry.kind]}</span><span className="flex-1 truncate text-slate-700 dark:text-[#ccc]" title={entry.title}>{entry.title}</span><span className={entry.status === 'completed' ? 'text-emerald-600 dark:text-[#3fb950]' : entry.status === 'failed' || entry.status === 'declined' ? 'text-red-600 dark:text-[#f85149]' : 'text-amber-600 dark:text-[#d29922]'}>{entry.status}</span></summary>
            {(entry.detail || entry.output || entry.diff) && <div className="border-t border-slate-200 px-2 py-2 text-[10px] text-slate-600 dark:border-[#333] dark:text-[#aaa]">{entry.detail && <pre className="mb-2 whitespace-pre-wrap break-all">{entry.detail}</pre>}{entry.output && <pre className="mb-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-slate-800 dark:text-[#d4d4d4]">{entry.output}</pre>}{entry.diff && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-emerald-700 dark:text-[#7ee787]">{entry.diff}</pre>}</div>}
          </details>;

          return <div key={entry.id} className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] dark:border-[#6e5b24] dark:bg-[#2b2517]"><div className="font-sans font-medium text-amber-900 dark:text-[#e3c66d]">{entry.title}</div>{entry.detail && <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all text-amber-800 dark:text-[#c8b56a]">{entry.detail}</pre>}<div className="mt-2 flex gap-1.5 font-sans"><button className="rounded bg-blue-600 px-2 py-1 text-white" onClick={() => void answerApproval(entry, 'accept')}>Allow once</button>{entry.canAcceptForSession && <button className="rounded border border-blue-400 px-2 py-1 text-blue-700 dark:text-[#7dcfff]" onClick={() => void answerApproval(entry, 'acceptForSession')}>Allow session</button>}<button className="rounded border border-slate-300 px-2 py-1 text-slate-600 dark:border-[#555] dark:text-[#bbb]" onClick={() => void answerApproval(entry, 'decline')}>Decline</button></div></div>;
        })}

        {running && <div className="flex items-center gap-2 text-slate-500 dark:text-[#888]"><span className="agent-pulse">●</span>{title} is working… {provider !== 'opencode' && <button className="font-sans text-red-600 hover:underline dark:text-[#f85149]" onClick={() => void window.electronAPI?.agentInterrupt(provider)}>Stop</button>}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-300 bg-slate-100 p-2 dark:border-[#2b2b2b] dark:bg-[#1b1b1b]">
        {contexts.length > 0 && <div className="flex flex-wrap gap-1.5 pb-2">{contexts.map((item) => <div key={item.id} className="max-w-full flex items-center gap-1 rounded border border-slate-300 bg-slate-200 px-2 py-1 text-[11px] text-slate-700 dark:border-[#3b3b3b] dark:bg-[#2a2d2e] dark:text-[#c5c5c5]" title={item.uri}><span className="text-blue-600 dark:text-[#4daafc]">@</span><span className="truncate max-w-[190px]">{item.name}</span><button className="text-slate-500 hover:text-slate-900 dark:text-[#777] dark:hover:text-white" onClick={() => removeContext(item.id)}>×</button></div>)}{contexts.length > 1 && <button className="text-[10px] text-slate-500 hover:text-slate-900 dark:text-[#777] dark:hover:text-white" onClick={clearContexts}>clear</button>}</div>}
        <div className="rounded-md border border-slate-300 bg-white focus-within:border-blue-500 dark:border-[#3b3b3b] dark:bg-[#202020] dark:focus-within:border-[#555]">
          <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={4} disabled={running} placeholder={`Ask ${title}…  @ scripts are attached above`} className="w-full resize-none bg-transparent px-3 py-2 text-xs leading-5 text-slate-900 placeholder-slate-400 outline-none dark:text-[#e1e1e1] dark:placeholder-[#666]" />
          <div className="flex items-center justify-between px-2 pb-2 text-[10px] text-slate-500 dark:text-[#666]"><span>Enter to send · Shift+Enter for newline</span><button disabled={!input.trim() || running || !activeStatus?.available} onClick={() => void send()} className="h-6 w-6 rounded bg-blue-600 text-white disabled:bg-slate-300 disabled:text-slate-500 dark:bg-[#0e639c] dark:disabled:bg-[#333] dark:disabled:text-[#666]" title="Send">↑</button></div>
        </div>
      </div>
    </div>
  );
}
