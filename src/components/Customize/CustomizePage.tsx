import { useEffect, useState } from 'react';
import type { AgentWorkspaceChange, ExternalMcpServerConfig, ExternalMcpServers } from '../../types/agent';
import { useI18n } from '../../i18n';
import { applyWorkspaceChanges, getWorkspaceChanges, syncCheckedOutWorkspace } from '../../services/agentWorkspaceService';
import { lineDiff } from '../../utils/lineDiff';

const AGENT_RULES_STORE_KEY = 'agentWorkspaceInstructions.v1';
const AGENT_WORKSPACE_ROOT_STORE_KEY = 'agentWorkspaceRoot.v1';
type LocalAgentRules = { enabled: boolean; name: string; content: string; updatedAt: number };
type McpDraft = { originalName: string | null; name: string; config: ExternalMcpServerConfig; envText: string; headersText: string };

const emptyRules: LocalAgentRules = { enabled: false, name: '', content: '', updatedAt: 0 };

function jsonObject(value: string, label: string): Record<string, string> | undefined {
  if (!value.trim()) return undefined;
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object.`);
  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, String(item)]));
}

export function CustomizePage() {
  const { t } = useI18n();
  const [category, setCategory] = useState<'workspace' | 'rules' | 'mcp'>('workspace');
  const [search, setSearch] = useState('');
  const [rules, setRules] = useState<LocalAgentRules>(emptyRules);
  const [mcpServers, setMcpServers] = useState<ExternalMcpServers>({});
  const [mcpDraft, setMcpDraft] = useState<McpDraft | null>(null);
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [currentWorkspacePath, setCurrentWorkspacePath] = useState(() => localStorage.getItem('gitWorkspacePath') || '');
  const [workspaceChanges, setWorkspaceChanges] = useState<AgentWorkspaceChange[]>([]);
  const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set());
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [message, setMessage] = useState('');

  const changeKey = (change: Pick<AgentWorkspaceChange, 'uri' | 'language'>) => `${change.uri}\n${change.language || ''}`;

  const refreshWorkspaceChanges = async () => {
    const changes = await getWorkspaceChanges();
    setWorkspaceChanges(changes);
    setSelectedChanges(new Set(changes.filter((change) => change.kind === 'modified').map(changeKey)));
    return changes;
  };

  useEffect(() => {
    if (!window.electronAPI) return;
    void Promise.all([
      window.electronAPI.storeGet(AGENT_RULES_STORE_KEY).catch(() => null),
      window.electronAPI.agentGetExternalMcpServers().catch(() => ({})),
      window.electronAPI.storeGet(AGENT_WORKSPACE_ROOT_STORE_KEY).catch(() => '')
    ]).then(([savedRules, servers, savedWorkspaceRoot]) => {
      if (savedRules && typeof savedRules === 'object') setRules({ ...emptyRules, ...savedRules });
      setMcpServers(servers || {});
      setWorkspaceRoot(typeof savedWorkspaceRoot === 'string' ? savedWorkspaceRoot : '');
    });
    const onWorkspaceConfigured = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (detail?.path) setCurrentWorkspacePath(detail.path);
      void refreshWorkspaceChanges();
    };
    const onWorkspaceUpdated = () => void refreshWorkspaceChanges();
    window.addEventListener('agent-workspace:configured', onWorkspaceConfigured);
    window.addEventListener('agent-workspace:synced', onWorkspaceUpdated);
    window.addEventListener('agent-workspace:applied', onWorkspaceUpdated);
    return () => {
      window.removeEventListener('agent-workspace:configured', onWorkspaceConfigured);
      window.removeEventListener('agent-workspace:synced', onWorkspaceUpdated);
      window.removeEventListener('agent-workspace:applied', onWorkspaceUpdated);
    };
  }, []);

  const chooseWorkspaceRoot = async () => {
    const result = await window.electronAPI?.showOpenDialog({
      title: t('customize.workspaceChoose'),
      defaultPath: workspaceRoot || undefined,
      properties: ['openDirectory', 'createDirectory']
    });
    if (!result?.canceled && result.filePaths[0]) setWorkspaceRoot(result.filePaths[0]);
  };

  const saveWorkspaceRoot = async (root = workspaceRoot) => {
    const normalized = root.trim();
    if (normalized) await window.electronAPI?.storeSet(AGENT_WORKSPACE_ROOT_STORE_KEY, normalized);
    else await window.electronAPI?.storeDelete(AGENT_WORKSPACE_ROOT_STORE_KEY);
    setWorkspaceRoot(normalized);
    window.dispatchEvent(new CustomEvent('agent-workspace:changed', { detail: normalized }));
    setMessage(t('customize.workspaceSaved'));
  };

  const syncWorkspace = async () => {
    setWorkspaceBusy(true);
    setMessage('');
    try {
      const result = await syncCheckedOutWorkspace();
      const changes = await refreshWorkspaceChanges();
      setMessage(t('customize.workspaceSyncResult', { files: result.files, changes: changes.length, preserved: result.preservedChanges }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const applySelectedChanges = async () => {
    const selected = workspaceChanges.filter((change) => selectedChanges.has(changeKey(change)));
    if (!selected.length) return;
    setWorkspaceBusy(true);
    setMessage('');
    try {
      const result = await applyWorkspaceChanges(selected);
      await refreshWorkspaceChanges();
      if (result.cancelled) setMessage(t('customize.workspaceApplyCancelled'));
      else setMessage(t('customize.workspaceApplyResult', {
        applied: result.applied.length,
        conflicts: result.conflicts.length,
        errors: result.errors.length
      }) + [...result.conflicts, ...result.errors].slice(0, 3).map((item) => `\n${item.change.name}: ${item.reason}`).join(''));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const saveRules = async () => {
    const next = { ...rules, enabled: rules.enabled && Boolean(rules.content.trim()), name: rules.name || 'AGENTS.md', updatedAt: Date.now() };
    setRules(next);
    await window.electronAPI?.storeSet(AGENT_RULES_STORE_KEY, next);
    window.dispatchEvent(new CustomEvent('ai-rules:changed', { detail: next }));
    setMessage(t('customize.saved'));
  };

  const importRules = async () => {
    const file = (await window.electronAPI?.agentSelectFiles())?.[0];
    if (!file) return;
    if (!/\.(md|txt)$/i.test(file.name)) { setMessage(t('agent.rulesFileType')); return; }
    setRules({ enabled: true, name: file.name, content: file.content, updatedAt: Date.now() });
    setMessage('');
  };

  const persistMcp = async (next: ExternalMcpServers) => {
    await window.electronAPI?.agentSetExternalMcpServers(next);
    setMcpServers(next);
    setMessage(t('customize.mcpRestarted'));
  };

  const editMcp = (name: string, config: ExternalMcpServerConfig) => setMcpDraft({
    originalName: name,
    name,
    config: { ...config, transport: config.transport || (config.command ? 'stdio' : 'http') },
    envText: config.env ? JSON.stringify(config.env, null, 2) : '',
    headersText: config.headers ? JSON.stringify(config.headers, null, 2) : ''
  });

  const addMcp = () => {
    let name = 'new-server';
    let suffix = 2;
    while (mcpServers[name]) name = `new-server-${suffix++}`;
    setMcpDraft({ originalName: null, name, config: { enabled: true, transport: 'http', url: '' }, envText: '', headersText: '' });
  };

  const saveMcpDraft = async () => {
    if (!mcpDraft) return;
    try {
      const name = mcpDraft.name.trim();
      if (!name) throw new Error(t('customize.mcpNameRequired'));
      const config: ExternalMcpServerConfig = {
        ...mcpDraft.config,
        args: mcpDraft.config.transport === 'stdio' ? (mcpDraft.config.args || []).filter(Boolean) : undefined,
        env: jsonObject(mcpDraft.envText, 'env'),
        headers: jsonObject(mcpDraft.headersText, 'headers')
      };
      const next = { ...mcpServers };
      if (mcpDraft.originalName && mcpDraft.originalName !== name) delete next[mcpDraft.originalName];
      next[name] = config;
      await persistMcp(next);
      setMcpDraft(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredServers = Object.entries(mcpServers).filter(([name, config]) => !normalizedSearch || `${name} ${config.url || ''} ${config.command || ''}`.toLowerCase().includes(normalizedSearch));

  return <div className="h-full overflow-auto bg-slate-50 text-slate-800 dark:bg-[#181818] dark:text-[#cccccc]">
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="mb-5 flex items-center gap-3"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('customize.search')} className="h-9 flex-1 rounded-full border border-slate-300 bg-white px-4 text-sm outline-none focus:border-blue-500 dark:border-[#3b3b3b] dark:bg-[#202020]" /></div>
      <div className="mb-8 flex items-center gap-2 border-b border-slate-200 pb-4 dark:border-[#2b2b2b]">
        <button onClick={() => { setCategory('workspace'); setMessage(''); }} className={`rounded-full border px-4 py-1.5 text-xs ${category === 'workspace' ? 'border-slate-500 bg-slate-200 dark:border-[#777] dark:bg-[#303030]' : 'border-slate-300 dark:border-[#3b3b3b]'}`}>{t('customize.workspace')}</button>
        <button onClick={() => { setCategory('mcp'); setMcpDraft(null); setMessage(''); }} className={`rounded-full border px-4 py-1.5 text-xs ${category === 'mcp' ? 'border-slate-500 bg-slate-200 dark:border-[#777] dark:bg-[#303030]' : 'border-slate-300 dark:border-[#3b3b3b]'}`}>MCPs <span className="text-slate-500">{Object.keys(mcpServers).length + 1}</span></button>
        <button onClick={() => { setCategory('rules'); setMessage(''); }} className={`rounded-full border px-4 py-1.5 text-xs ${category === 'rules' ? 'border-slate-500 bg-slate-200 dark:border-[#777] dark:bg-[#303030]' : 'border-slate-300 dark:border-[#3b3b3b]'}`}>{t('customize.rules')} <span className="text-slate-500">{rules.content.trim() ? 1 : 0}</span></button>
      </div>

      {message && <div className="mb-4 rounded border border-slate-300 bg-white px-3 py-2 text-xs dark:border-[#3b3b3b] dark:bg-[#202020]">{message}</div>}

      {category === 'workspace' ? <section>
        <div className="mb-3"><h2 className="text-sm font-medium">{t('customize.workspaceTitle')}</h2><p className="mt-1 text-xs text-slate-500 dark:text-[#888]">{t('customize.workspaceHint')}</p></div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#303030] dark:bg-[#202020]">
          <label className="block text-xs"><span className="mb-1.5 block text-slate-500">{t('customize.workspaceRoot')}</span><div className="flex gap-2"><input value={workspaceRoot} onChange={(event) => setWorkspaceRoot(event.target.value)} placeholder={t('customize.workspaceDefault')} className="h-9 min-w-0 flex-1 rounded border border-slate-300 bg-transparent px-3 font-mono text-xs outline-none focus:border-blue-500 dark:border-[#444]" /><button onClick={() => void chooseWorkspaceRoot()} className="rounded border border-slate-300 px-3 text-xs hover:bg-slate-100 dark:border-[#444] dark:hover:bg-[#2a2d2e]">{t('customize.workspaceBrowse')}</button></div></label>
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-[#303030] dark:bg-[#181818]"><div className="mb-1 text-slate-500 dark:text-[#888]">{t('customize.workspaceCurrent')}</div><div className="break-all font-mono text-slate-700 dark:text-[#ccc]">{currentWorkspacePath || t('customize.workspaceNotReady')}</div></div>
          <div className="mt-4 flex items-center justify-between"><button onClick={() => void saveWorkspaceRoot('')} className="text-xs text-slate-500 hover:text-blue-600 dark:hover:text-[#4daafc]">{t('customize.workspaceReset')}</button><button onClick={() => void saveWorkspaceRoot()} className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white dark:bg-[#0e639c]">{t('common.save')}</button></div>
        </div>
        <div className="mt-5 rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#202020]">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-[#303030]">
            <div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{t('customize.workspaceChanges')}</h3><p className="mt-0.5 text-xs text-slate-500 dark:text-[#888]">{t('customize.workspaceChangesHint')}</p></div>
            <button disabled={workspaceBusy || !currentWorkspacePath} onClick={() => void syncWorkspace()} className="min-h-9 rounded border border-slate-300 px-3 text-xs disabled:opacity-40 dark:border-[#444]">{t('customize.workspaceSync')}</button>
            <button disabled={workspaceBusy || !currentWorkspacePath} onClick={() => void refreshWorkspaceChanges()} className="min-h-9 rounded border border-slate-300 px-3 text-xs disabled:opacity-40 dark:border-[#444]">{t('common.refresh')}</button>
            <button disabled={workspaceBusy || selectedChanges.size === 0} onClick={() => void applySelectedChanges()} className="min-h-9 rounded bg-blue-600 px-3 text-xs text-white disabled:opacity-40 dark:bg-[#0e639c]">{t('customize.workspaceApply')} ({selectedChanges.size})</button>
          </div>
          {workspaceChanges.length === 0 ? <div className="px-4 py-10 text-center text-xs text-slate-500 dark:text-[#888]">{t('customize.workspaceNoChanges')}</div> : <div>
            {workspaceChanges.map((change) => {
              const key = changeKey(change);
              const diff = lineDiff(change.before, change.after);
              const added = diff.filter((line) => line.type === 'add').length;
              const removed = diff.filter((line) => line.type === 'del').length;
              return <details key={key} className="border-b border-slate-200 last:border-b-0 dark:border-[#303030]">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-[#252526]">
                  <input type="checkbox" disabled={change.kind === 'deleted'} checked={selectedChanges.has(key)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedChanges((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} />
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${change.kind === 'deleted' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{change.kind === 'deleted' ? t('customize.workspaceDeleted') : t('customize.workspaceModified')}</span>
                  <span className="min-w-0 flex-1 truncate text-xs" title={change.relativePath}>{change.name}{change.language ? ` · ${change.language}` : ''}</span>
                  <span className="text-[11px] text-emerald-600">+{added}</span><span className="text-[11px] text-red-500">−{removed}</span>
                </summary>
                <div className="max-h-72 overflow-auto border-t border-slate-200 bg-slate-50 font-mono text-[11px] leading-5 dark:border-[#303030] dark:bg-[#181818]">
                  {diff.slice(0, 240).map((line, index) => <div key={`${index}-${line.type}`} className={`whitespace-pre px-3 ${line.type === 'add' ? 'bg-emerald-100/70 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200' : line.type === 'del' ? 'bg-red-100/70 text-red-900 dark:bg-red-950/50 dark:text-red-200' : 'text-slate-500 dark:text-[#888]'}`}><span className="mr-2 inline-block w-3 select-none">{line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}</span>{line.text || ' '}</div>)}
                  {diff.length > 240 && <div className="px-3 py-2 text-slate-500">{t('customize.workspaceDiffTruncated')}</div>}
                </div>
              </details>;
            })}
          </div>}
        </div>
      </section> : category === 'rules' ? <section>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-medium">{t('customize.userRules')}</h2><p className="mt-1 text-xs text-slate-500 dark:text-[#888]">{t('agent.rulesHint')}</p></div><button onClick={() => void importRules()} className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-[#444] dark:hover:bg-[#252526]">＋ {t('agent.rulesImport')}</button></div>
        <div className="rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#202020]">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#303030]"><div className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-lg dark:bg-[#2b2b2b]">⚡</div><div className="min-w-0 flex-1"><div className="truncate text-sm">{rules.name || 'AGENTS.md'}</div><div className="text-xs text-slate-500 dark:text-[#888]">{rules.content.trim() ? t('customize.rulesLoaded') : t('agent.rulesNoFile')}</div></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={rules.enabled} disabled={!rules.content.trim()} onChange={(event) => setRules((current) => ({ ...current, enabled: event.target.checked }))} />{t('agent.rulesEnabled')}</label></div>
          <textarea value={rules.content} onChange={(event) => setRules((current) => ({ ...current, content: event.target.value, name: current.name || 'AGENTS.md' }))} placeholder={t('agent.rulesPlaceholder')} className="min-h-[420px] w-full resize-y bg-transparent p-4 font-mono text-xs leading-5 outline-none" />
          <div className="flex justify-between border-t border-slate-200 px-4 py-3 dark:border-[#303030]"><button onClick={() => setRules(emptyRules)} className="text-xs text-slate-500 hover:text-red-600">{t('agent.rulesClear')}</button><button onClick={() => void saveRules()} className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white dark:bg-[#0e639c]">{t('common.save')}</button></div>
        </div>
      </section> : <section>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-medium">{t('customize.mcpServers')}</h2><p className="mt-1 text-xs text-slate-500 dark:text-[#888]">{t('customize.mcpHint')}</p></div><button onClick={addMcp} className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-[#444] dark:hover:bg-[#252526]">＋ {t('customize.new')}</button></div>
        <div className="mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#202020]">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#303030]"><div className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 dark:bg-[#2b2b2b]">SL</div><div className="flex-1"><div className="text-sm">STARLIMS</div><div className="text-xs text-slate-500 dark:text-[#888]">{t('customize.builtInMcp')}</div></div><span className="text-xs text-emerald-600 dark:text-[#3fb950]">{t('customize.builtIn')}</span></div>
          {filteredServers.map(([name, config]) => <div key={name} className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-[#303030]"><div className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-xs dark:bg-[#2b2b2b]">M</div><div className="min-w-0 flex-1"><div className="truncate text-sm">{name}</div><div className="truncate text-xs text-slate-500 dark:text-[#888]">{config.transport || (config.command ? 'stdio' : 'http')} · {config.url || [config.command, ...(config.args || [])].filter(Boolean).join(' ')}</div></div><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={config.enabled !== false} onChange={(event) => void persistMcp({ ...mcpServers, [name]: { ...config, enabled: event.target.checked } })} />{t('agent.rulesEnabled')}</label><button onClick={() => editMcp(name, config)} className="min-h-8 rounded px-2 text-xs text-blue-600 hover:bg-slate-100 dark:text-[#4daafc] dark:hover:bg-[#2a2d2e]">{t('customize.edit')}</button><button onClick={() => { const next = { ...mcpServers }; delete next[name]; void persistMcp(next); }} className="icon-button text-lg hover:text-red-600" title={t('server.delete')}>×</button></div>)}
        </div>

        {mcpDraft && <div className="rounded-lg border border-slate-300 bg-white p-4 dark:border-[#444] dark:bg-[#202020]"><h3 className="mb-4 text-sm font-medium">{mcpDraft.originalName ? t('customize.editMcp') : t('customize.newMcp')}</h3><div className="grid grid-cols-2 gap-3 text-xs"><label><span className="mb-1 block text-slate-500">{t('customize.name')}</span><input value={mcpDraft.name} onChange={(event) => setMcpDraft((current) => current && ({ ...current, name: event.target.value }))} className="w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 outline-none dark:border-[#444]" /></label><label><span className="mb-1 block text-slate-500">Transport</span><select value={mcpDraft.config.transport} onChange={(event) => setMcpDraft((current) => current && ({ ...current, config: { ...current.config, transport: event.target.value as ExternalMcpServerConfig['transport'] } }))} className="w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 dark:border-[#444]"><option value="http">Streamable HTTP</option><option value="sse">SSE</option><option value="stdio">stdio</option></select></label></div>
          {mcpDraft.config.transport === 'stdio' ? <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><label><span className="mb-1 block text-slate-500">Command</span><input value={mcpDraft.config.command || ''} onChange={(event) => setMcpDraft((current) => current && ({ ...current, config: { ...current.config, command: event.target.value } }))} className="w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 dark:border-[#444]" /></label><label><span className="mb-1 block text-slate-500">Args ({t('customize.onePerLine')})</span><textarea value={(mcpDraft.config.args || []).join('\n')} onChange={(event) => setMcpDraft((current) => current && ({ ...current, config: { ...current.config, args: event.target.value.split('\n') } }))} className="h-20 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 font-mono dark:border-[#444]" /></label><label className="col-span-2"><span className="mb-1 block text-slate-500">Environment JSON</span><textarea value={mcpDraft.envText} onChange={(event) => setMcpDraft((current) => current && ({ ...current, envText: event.target.value }))} className="h-20 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 font-mono dark:border-[#444]" /></label></div> : <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><label><span className="mb-1 block text-slate-500">URL</span><input value={mcpDraft.config.url || ''} onChange={(event) => setMcpDraft((current) => current && ({ ...current, config: { ...current.config, url: event.target.value } }))} className="w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 dark:border-[#444]" /></label><label><span className="mb-1 block text-slate-500">Headers JSON</span><textarea value={mcpDraft.headersText} onChange={(event) => setMcpDraft((current) => current && ({ ...current, headersText: event.target.value }))} className="h-20 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 font-mono dark:border-[#444]" /></label></div>}
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setMcpDraft(null)} className="rounded border border-slate-300 px-3 py-1.5 text-xs dark:border-[#444]">{t('common.cancel')}</button><button onClick={() => void saveMcpDraft()} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white dark:bg-[#0e639c]">{t('common.save')}</button></div>
        </div>}
      </section>}
    </div>
  </div>;
}
