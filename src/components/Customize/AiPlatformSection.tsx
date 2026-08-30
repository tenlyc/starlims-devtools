import { useEffect, useMemo, useState } from 'react';
import type { AgentWorkspaceChange } from '../../types/agent';
import type { AiConfigLayer, AiLayerConfig, QualityTestCase, WorkflowRole, WorkflowRoleResult, WorkspaceReviewState } from '../../types/aiPlatform';
import { evaluateQualityGate, loadAiLayers, mergeAiLayers, parseWorkflowTasks, qualityReviewStoreKey, saveAiLayer, validateExtensionManifest, workflowRolePrompt, workspaceChangeFingerprint, workspaceChangeSetFingerprint } from '../../services/aiPlatform';
import { loadActiveGenericAgentConfig } from '../../services/genericAgentConfig';
import { useAiContextStore } from '../../services/aiContextStore';
import { useI18n } from '../../i18n';

type PlatformCategory = 'workflows' | 'quality' | 'layers' | 'extensions';
type Props = { category: PlatformCategory; changes: AgentWorkspaceChange[] };
const emptyReview: WorkspaceReviewState = { reviewedFingerprints: [], tests: [] };
const AGENT_RULES_STORE_KEY = 'agentWorkspaceInstructions.v1';
const emptyLayer = (layer: AiConfigLayer): AiLayerConfig => ({ schemaVersion: 1, layer, rules: '', quality: {}, workflows: [], extensions: [], updatedAt: 0 });
const changeKey = (change: Pick<AgentWorkspaceChange, 'uri' | 'language'>) => `${change.uri}\n${change.language || ''}`;
const roleLabels: Record<WorkflowRole, string> = { planner: '规划', implementer: '实现', reviewer: '审查', tester: '测试' };

export function AiPlatformSection({ category, changes }: Props) {
  const { t } = useI18n();
  const contexts = useAiContextStore((state) => state.items);
  const [layers, setLayers] = useState<Partial<Record<AiConfigLayer, AiLayerConfig>>>({});
  const [selectedLayer, setSelectedLayer] = useState<AiConfigLayer>('personal');
  const [layerDraft, setLayerDraft] = useState<AiLayerConfig>(emptyLayer('personal'));
  const [review, setReview] = useState<WorkspaceReviewState>(emptyReview);
  const [request, setRequest] = useState('');
  const [workflowId, setWorkflowId] = useState('starlims-change');
  const [roleResults, setRoleResults] = useState<WorkflowRoleResult[]>([]);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [testDraft, setTestDraft] = useState({ name: '', steps: '', expected: '', command: '' });
  const [agentRules, setAgentRules] = useState<{ enabled?: boolean; content?: string }>({});
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const effective = useMemo(() => mergeAiLayers(layers), [layers]);
  const allExtensions = useMemo(() => {
    const map = new Map<string, NonNullable<AiLayerConfig['extensions']>[number]>();
    for (const layer of ['team', 'project', 'personal'] as AiConfigLayer[]) for (const extension of layers[layer]?.extensions || []) map.set(extension.id, extension);
    return [...map.values()];
  }, [layers]);
  const report = useMemo(() => evaluateQualityGate({ changes, reviewState: review, policy: effective.quality }), [changes, review, effective.quality]);

  useEffect(() => {
    void Promise.all([
      loadAiLayers(),
      window.electronAPI?.storeGet(qualityReviewStoreKey()).catch(() => null),
      window.electronAPI?.storeGet(AGENT_RULES_STORE_KEY).catch(() => null)
    ]).then(([savedLayers, savedReview, savedAgentRules]) => {
      setLayers(savedLayers);
      setLayerDraft(savedLayers.personal || emptyLayer('personal'));
      if (savedReview && typeof savedReview === 'object') {
        const stored = savedReview as Partial<WorkspaceReviewState>;
        setReview({ reviewedFingerprints: Array.isArray(stored.reviewedFingerprints) ? stored.reviewedFingerprints : [], tests: Array.isArray(stored.tests) ? stored.tests : [] });
      }
      if (savedAgentRules && typeof savedAgentRules === 'object') setAgentRules(savedAgentRules);
    });
    const onLayers = (event: Event) => setLayers((event as CustomEvent<Partial<Record<AiConfigLayer, AiLayerConfig>>>).detail);
    window.addEventListener('ai-layers:changed', onLayers);
    return () => window.removeEventListener('ai-layers:changed', onLayers);
  }, []);

  useEffect(() => setLayerDraft(layers[selectedLayer] || emptyLayer(selectedLayer)), [selectedLayer, layers]);

  const persistReview = async (next: WorkspaceReviewState) => {
    setReview(next);
    await window.electronAPI?.storeSet(qualityReviewStoreKey(), next);
    window.dispatchEvent(new CustomEvent('ai-quality:changed', { detail: next }));
  };

  const saveLayerDraft = async () => {
    await saveAiLayer({ ...layerDraft, layer: selectedLayer, schemaVersion: 1, updatedAt: Date.now() });
    setMessage(t('customize.layerSaved'));
  };

  const importConfiguration = async () => {
    try {
      const imported = await window.electronAPI?.aiConfigImport();
      if (!imported) return;
      const value = imported.value as Partial<AiLayerConfig>;
      if (value.schemaVersion !== 1 || !['team', 'project', 'personal'].includes(String(value.layer))) throw new Error(t('customize.invalidLayer'));
      const layer = { ...emptyLayer(value.layer as AiConfigLayer), ...value, updatedAt: Date.now() } as AiLayerConfig;
      await saveAiLayer(layer);
      setSelectedLayer(layer.layer);
      setMessage(t('customize.layerImported'));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const exportConfiguration = async () => {
    try {
      const path = await window.electronAPI?.aiConfigExport(`starlims-ai-${selectedLayer}.json`, layerDraft);
      if (path) setMessage(t('customize.layerExported', { path }));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const importExtension = async () => {
    try {
      const imported = await window.electronAPI?.aiConfigImport();
      if (!imported) return;
      const extension = validateExtensionManifest(imported.value);
      const personal = layers.personal || emptyLayer('personal');
      const extensions = [...(personal.extensions || []).filter((item) => item.id !== extension.id), extension];
      await saveAiLayer({ ...personal, extensions, updatedAt: Date.now() });
      const contributed = extension.contributes?.mcpServers || {};
      if (Object.keys(contributed).length) {
        const existing = await window.electronAPI?.agentGetExternalMcpServers() || {};
        const namespaced = Object.fromEntries(Object.entries(contributed).map(([name, config]) => [`${extension.id}.${name}`, config]));
        await window.electronAPI?.agentSetExternalMcpServers({ ...namespaced, ...existing });
      }
      setMessage(t('customize.extensionImported'));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  const toggleExtension = async (id: string) => {
    for (const layerName of ['personal', 'project', 'team'] as AiConfigLayer[]) {
      const layer = layers[layerName];
      if (!layer?.extensions?.some((extension) => extension.id === id)) continue;
      const current = layer.extensions.find((extension) => extension.id === id);
      if (!current) continue;
      const enabling = current.enabled === false;
      await saveAiLayer({ ...layer, extensions: layer.extensions.map((extension) => extension.id === id ? { ...extension, enabled: enabling } : extension), updatedAt: Date.now() });
      const existing = await window.electronAPI?.agentGetExternalMcpServers() || {};
      const prefix = `${id}.`;
      const withoutExtension = Object.fromEntries(Object.entries(existing).filter(([name]) => !name.startsWith(prefix)));
      const contributed = enabling ? Object.fromEntries(Object.entries(current.contributes?.mcpServers || {}).map(([name, config]) => [`${id}.${name}`, config])) : {};
      await window.electronAPI?.agentSetExternalMcpServers({ ...contributed, ...withoutExtension });
      break;
    }
  };

  const runWorkflow = async () => {
    const userRequest = request.trim();
    if (!userRequest) return;
    setWorkflowBusy(true);
    setMessage('');
    setRoleResults([]);
    try {
      const config = await loadActiveGenericAgentConfig();
      if (!config) throw new Error(t('customize.workflowNeedsModel'));
      const api = window.electronAPI;
      if (!api) throw new Error('Electron Agent API is unavailable.');
      const workflow = effective.workflows.find((item) => item.id === workflowId) || effective.workflows[0];
      const contextText = contexts.slice(0, 4).map((item) => `### ${item.name}\n${item.content.slice(0, 6000)}`).join('\n\n');
      const ruleText = effective.rules.map((rule) => `[${rule.layer}]\n${rule.content.slice(0, 6000)}`).join('\n\n');
      const importedAgentRules = agentRules.enabled && agentRules.content?.trim() ? agentRules.content.trim().slice(0, 12000) : '';
      const callRole = async (role: WorkflowRole, prior = '') => {
        const rolePrompt = workflowRolePrompt(role, userRequest, [prior, contextText ? `Referenced scripts:\n${contextText}` : ''].filter(Boolean).join('\n\n'), workflow.instructions?.[role] || '');
        const system = `${rolePrompt.system}${ruleText ? `\n\nLayered team/project/personal rules (higher priority than workflow instructions):\n${ruleText}` : ''}${importedAgentRules ? `\n\nImported agent.md rules (highest user-rule priority; never overwrite this file):\n${importedAgentRules}` : ''}`;
        const startedAt = Date.now();
        setRoleResults((current) => [...current.filter((item) => item.role !== role), { role, status: 'running', startedAt }]);
        try {
          const output = await api.genericAgentTask(config, system, rolePrompt.prompt);
          const result: WorkflowRoleResult = { role, status: 'completed', output, startedAt, completedAt: Date.now() };
          setRoleResults((current) => [...current.filter((item) => item.role !== role), result]);
          return output;
        } catch (error) {
          const result: WorkflowRoleResult = { role, status: 'failed', error: error instanceof Error ? error.message : String(error), startedAt, completedAt: Date.now() };
          setRoleResults((current) => [...current.filter((item) => item.role !== role), result]);
          throw error;
        }
      };
      const plan = workflow.roles.includes('planner') ? await callRole('planner') : '';
      let implementation = plan;
      if (workflow.roles.includes('implementer')) {
        const tasks = parseWorkflowTasks(plan);
        if (tasks.length > 1) {
          const startedAt = Date.now();
          setRoleResults((current) => [...current.filter((item) => item.role !== 'implementer'), { role: 'implementer', status: 'running', startedAt }]);
          try {
            const outputs = await Promise.all(tasks.map(async (task) => {
              const rolePrompt = workflowRolePrompt('implementer', userRequest, `Approved plan:\n${plan}\n\nYour parallel-safe task:\n${task.title}${task.detail ? `\n${task.detail}` : ''}`, workflow.instructions?.implementer || '');
              const system = `${rolePrompt.system}${ruleText ? `\n\nLayered team/project/personal rules:\n${ruleText}` : ''}${importedAgentRules ? `\n\nImported agent.md rules (highest user-rule priority; never overwrite this file):\n${importedAgentRules}` : ''}`;
              return `### ${task.title}\n${await api.genericAgentTask(config, system, rolePrompt.prompt)}`;
            }));
            implementation = outputs.join('\n\n');
            setRoleResults((current) => [...current.filter((item) => item.role !== 'implementer'), { role: 'implementer', status: 'completed', output: implementation, startedAt, completedAt: Date.now() }]);
          } catch (error) {
            setRoleResults((current) => [...current.filter((item) => item.role !== 'implementer'), { role: 'implementer', status: 'failed', error: error instanceof Error ? error.message : String(error), startedAt, completedAt: Date.now() }]);
            throw error;
          }
        } else implementation = await callRole('implementer', plan);
      }
      const finalStages = workflow.roles.filter((role) => role === 'reviewer' || role === 'tester');
      if (workflow.parallelReviewAndTest) await Promise.all(finalStages.map((role) => callRole(role, implementation)));
      else for (const role of finalStages) await callRole(role, implementation);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setWorkflowBusy(false); }
  };

  const runTest = async (test: QualityTestCase) => {
    if (!test.command?.trim()) return;
    setRunningTestId(test.id);
    try {
      const result = await window.electronAPI?.agentRunQualityTest(test.command);
      if (!result || result.cancelled) return;
      const next = review.tests.map((item) => item.id === test.id ? {
        ...item,
        status: result.exitCode === 0 ? 'passed' as const : 'failed' as const,
        result: `${result.output || '(no output)'}\n\nExit: ${result.exitCode ?? 'terminated'} · ${result.durationMs} ms`,
        changeSetFingerprint: result.exitCode === 0 ? workspaceChangeSetFingerprint(changes) : undefined,
        updatedAt: Date.now()
      } : item);
      await persistReview({ ...review, tests: next });
    } catch (error) {
      const result = error instanceof Error ? error.message : String(error);
      await persistReview({ ...review, tests: review.tests.map((item) => item.id === test.id ? { ...item, status: 'failed', result, updatedAt: Date.now() } : item) });
    } finally { setRunningTestId(null); }
  };

  const sendWorkflowToAgent = () => {
    const outputs = roleResults.filter((result) => result.output).map((result) => `## ${roleLabels[result.role]}\n${result.output}`).join('\n\n');
    window.dispatchEvent(new CustomEvent('ai:show'));
    window.dispatchEvent(new CustomEvent('ai:prefill', { detail: { prompt: `根据以下多 Agent 工作流结果继续处理原始请求。遵守当前用户规则，并在实际修改后执行质量检查。\n\n原始请求：\n${request}\n\n${outputs}`, mode: 'agent' } }));
  };

  if (category === 'workflows') return <section>
    <SectionHeader title={t('customize.workflowsTitle')} hint={t('customize.workflowsHint')} />
    {message && <Message text={message} />}
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-[#303030] dark:bg-[#202020]"><label className="text-xs text-slate-500">{t('customize.workflowTemplate')}<select value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} className="mt-1.5 h-9 w-full rounded border border-slate-300 bg-transparent px-2 text-xs dark:border-[#444]">{effective.workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label><textarea value={request} onChange={(event) => setRequest(event.target.value)} placeholder={t('customize.workflowRequest')} className="mt-3 min-h-40 w-full resize-y rounded border border-slate-300 bg-transparent p-3 text-xs outline-none dark:border-[#444]" /><button disabled={workflowBusy || !request.trim()} onClick={() => void runWorkflow()} className="mt-3 min-h-9 w-full rounded bg-blue-600 px-3 text-xs text-white disabled:opacity-40 dark:bg-[#0e639c]">{workflowBusy ? t('customize.workflowRunning') : t('customize.workflowRun')}</button></div>
      <div className="space-y-3">{(['planner', 'implementer', 'reviewer', 'tester'] as WorkflowRole[]).map((role) => { const result = roleResults.find((item) => item.role === role); return <details key={role} open={Boolean(result)} className="rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#202020]"><summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-xs dark:bg-[#2b2b2b]">{role === 'planner' ? 'P' : role === 'implementer' ? 'I' : role === 'reviewer' ? 'R' : 'T'}</span><span className="flex-1">{roleLabels[role]}</span><span className="text-xs text-slate-500">{result?.status || t('customize.workflowWaiting')}</span></summary>{result && <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-slate-200 p-4 text-xs leading-5 dark:border-[#303030]">{result.output || result.error}</pre>}</details>; })}{roleResults.some((result) => result.status === 'completed') && !workflowBusy && <button onClick={sendWorkflowToAgent} className="min-h-9 rounded border border-slate-300 px-4 text-xs hover:bg-slate-100 dark:border-[#444] dark:hover:bg-[#252526]">{t('customize.workflowContinue')}</button>}</div>
    </div>
  </section>;

  if (category === 'quality') return <section>
    <SectionHeader title={t('customize.qualityTitle')} hint={t('customize.qualityHint')} />
    <div className={`mb-4 rounded-lg border p-4 ${report.passed ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20'}`}><div className="text-sm font-medium">{report.passed ? t('customize.qualityPassed') : t('customize.qualityBlocked')}</div><div className="mt-1 text-xs text-slate-500">{report.changedFiles} {t('customize.files')} · {report.changedLines} {t('customize.changedLines')} · {report.findings.length} {t('customize.findings')}</div></div>
    <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#202020]"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-[#303030]"><h3 className="text-sm">{t('customize.diffReview')}</h3><button onClick={() => void persistReview({ ...review, reviewedFingerprints: changes.filter((change) => change.kind !== 'deleted').map(workspaceChangeFingerprint) })} className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-[#444]">{t('customize.markAllReviewed')}</button></div>{changes.length ? changes.map((change) => <label key={changeKey(change)} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 text-xs last:border-b-0 dark:border-[#303030]"><input type="checkbox" disabled={change.kind === 'deleted'} checked={review.reviewedFingerprints.includes(workspaceChangeFingerprint(change))} onChange={(event) => void persistReview({ ...review, reviewedFingerprints: event.target.checked ? [...new Set([...review.reviewedFingerprints, workspaceChangeFingerprint(change)])] : review.reviewedFingerprints.filter((fingerprint) => fingerprint !== workspaceChangeFingerprint(change)) })} /><span className="min-w-0 flex-1 truncate">{change.name}{change.language ? ` · ${change.language}` : ''}</span><span className="font-mono text-[10px] text-slate-400" title={change.fingerprint}>{change.fingerprint.slice(0, 8)}</span><span className="text-slate-500">{change.kind}</span></label>) : <div className="p-8 text-center text-xs text-slate-500">{t('customize.workspaceNoChanges')}</div>}</div>
      <div className="rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#202020]"><h3 className="border-b border-slate-200 px-4 py-3 text-sm dark:border-[#303030]">{t('customize.gatePolicy')}</h3><div className="grid gap-3 p-4 text-xs">{(['blockSslErrors', 'blockDeletedFiles', 'requireDiffReview', 'requirePassedTests'] as const).map((key) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={effective.quality[key]} onChange={(event) => { const personal = layers.personal || emptyLayer('personal'); void saveAiLayer({ ...personal, quality: { ...personal.quality, [key]: event.target.checked }, updatedAt: Date.now() }); }} />{t(`customize.quality.${key}`)}</label>)}</div></div></div>
    <div className="mt-4 rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#202020]"><h3 className="border-b border-slate-200 px-4 py-3 text-sm dark:border-[#303030]">{t('customize.findings')}</h3>{report.findings.length ? report.findings.map((finding) => <div key={finding.id} className="flex gap-3 border-b border-slate-100 px-4 py-2.5 text-xs last:border-b-0 dark:border-[#303030]"><span className={finding.level === 'error' ? 'text-red-600' : finding.level === 'warning' ? 'text-amber-600' : 'text-blue-600'}>{finding.level.toUpperCase()}</span><span>{finding.message}</span></div>) : <div className="p-6 text-center text-xs text-slate-500">{t('customize.noFindings')}</div>}</div>
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-[#303030] dark:bg-[#202020]">
      <h3 className="mb-3 text-sm">{t('customize.testCases')}</h3>
      <div className="grid gap-2 md:grid-cols-2">
        <input value={testDraft.name} onChange={(event) => setTestDraft({ ...testDraft, name: event.target.value })} placeholder={t('customize.testName')} className="h-9 rounded border border-slate-300 bg-transparent px-2 text-xs dark:border-[#444]" />
        <input value={testDraft.command} onChange={(event) => setTestDraft({ ...testDraft, command: event.target.value })} placeholder={t('customize.testCommand')} className="h-9 rounded border border-slate-300 bg-transparent px-2 font-mono text-xs dark:border-[#444]" />
        <input value={testDraft.steps} onChange={(event) => setTestDraft({ ...testDraft, steps: event.target.value })} placeholder={t('customize.testSteps')} className="h-9 rounded border border-slate-300 bg-transparent px-2 text-xs dark:border-[#444]" />
        <div className="flex gap-2"><input value={testDraft.expected} onChange={(event) => setTestDraft({ ...testDraft, expected: event.target.value })} placeholder={t('customize.testExpected')} className="h-9 min-w-0 flex-1 rounded border border-slate-300 bg-transparent px-2 text-xs dark:border-[#444]" /><button disabled={!testDraft.name.trim()} onClick={() => { const test: QualityTestCase = { id: crypto.randomUUID(), ...testDraft, status: 'pending', changeSetFingerprint: workspaceChangeSetFingerprint(changes), updatedAt: Date.now() }; void persistReview({ ...review, tests: [...review.tests, test] }); setTestDraft({ name: '', steps: '', expected: '', command: '' }); }} className="rounded border border-slate-300 px-3 text-xs disabled:opacity-40 dark:border-[#444]">＋</button></div>
      </div>
      <div className="mt-3 space-y-2">{review.tests.map((test) => <div key={test.id} className="rounded border border-slate-200 p-2 text-xs dark:border-[#383838]"><div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 truncate">{test.name}</span>{test.command && <button disabled={runningTestId === test.id} onClick={() => void runTest(test)} className="h-8 rounded border border-slate-300 px-2 disabled:opacity-40 dark:border-[#444]">{runningTestId === test.id ? t('customize.testRunning') : t('customize.testRun')}</button>}<select value={test.status} onChange={(event) => void persistReview({ ...review, tests: review.tests.map((item) => item.id === test.id ? { ...item, status: event.target.value as QualityTestCase['status'], changeSetFingerprint: event.target.value === 'passed' ? workspaceChangeSetFingerprint(changes) : undefined, updatedAt: Date.now() } : item) })} className="h-8 rounded border border-slate-300 bg-transparent px-2 dark:border-[#444]"><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option></select><button onClick={() => void persistReview({ ...review, tests: review.tests.filter((item) => item.id !== test.id) })} className="icon-button text-base">×</button></div>{test.command && <div className="mt-1 truncate font-mono text-[11px] text-slate-500">{test.command}</div>}{test.result && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] dark:bg-[#181818]">{test.result}</pre>}</div>)}</div>
    </div>
  </section>;

  if (category === 'layers') return <section>
    <SectionHeader title={t('customize.layersTitle')} hint={t('customize.layersHint')} />
    {message && <Message text={message} />}
    <div className="mb-4 flex flex-wrap gap-2">{(['team', 'project', 'personal'] as AiConfigLayer[]).map((layer) => <button key={layer} onClick={() => setSelectedLayer(layer)} className={`rounded-full border px-4 py-1.5 text-xs ${selectedLayer === layer ? 'bg-slate-200 dark:bg-[#303030]' : ''} border-slate-300 dark:border-[#444]`}>{t(`customize.layer.${layer}`)}</button>)}<span className="flex-1" /><button onClick={() => void importConfiguration()} className="rounded border border-slate-300 px-3 text-xs dark:border-[#444]">{t('customize.import')}</button><button onClick={() => void exportConfiguration()} className="rounded border border-slate-300 px-3 text-xs dark:border-[#444]">{t('customize.export')}</button></div>
    <div className="rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#202020]"><div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-[#303030]">{t('customize.layerOrder')}</div><textarea value={layerDraft.rules || ''} onChange={(event) => setLayerDraft({ ...layerDraft, rules: event.target.value })} placeholder={t('customize.layerRulesPlaceholder')} className="min-h-[430px] w-full resize-y bg-transparent p-4 font-mono text-xs leading-5 outline-none" /><div className="flex justify-end border-t border-slate-200 px-4 py-3 dark:border-[#303030]"><button onClick={() => void saveLayerDraft()} className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white dark:bg-[#0e639c]">{t('common.save')}</button></div></div>
  </section>;

  return <section>
    <div className="mb-3 flex items-start justify-between gap-3"><SectionHeader title={t('customize.extensionsTitle')} hint={t('customize.extensionsHint')} /><button onClick={() => void importExtension()} className="min-h-9 shrink-0 rounded border border-slate-300 px-3 text-xs dark:border-[#444]">＋ {t('customize.importExtension')}</button></div>
    {message && <Message text={message} />}
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#202020]">{allExtensions.length ? allExtensions.map((extension) => <div key={extension.id} className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-[#303030]"><div className="flex h-9 w-9 items-center justify-center rounded bg-slate-100 text-xs dark:bg-[#2b2b2b]">EXT</div><div className="min-w-0 flex-1"><div className="truncate text-sm">{extension.name} <span className="text-xs text-slate-500">v{extension.version}</span></div><div className="truncate text-xs text-slate-500">{extension.description || extension.id}</div><div className="mt-1 flex gap-2 text-[10px] text-slate-400"><span>MCP {(extension.contributes?.mcpServers && Object.keys(extension.contributes.mcpServers).length) || 0}</span><span>Tools {extension.contributes?.tools?.length || 0}</span><span>Languages {extension.contributes?.languages?.length || 0}</span><span>Workflows {extension.contributes?.workflows?.length || 0}</span></div></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={extension.enabled !== false} onChange={() => void toggleExtension(extension.id)} />{t('agent.rulesEnabled')}</label></div>) : <div className="p-12 text-center text-xs text-slate-500">{t('customize.noExtensions')}</div>}</div>
    <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-[#303030] dark:bg-[#202020]">{t('customize.extensionSecurity')}</div>
  </section>;
}

function SectionHeader({ title, hint }: { title: string; hint: string }) { return <div className="mb-3"><h2 className="text-sm font-medium">{title}</h2><p className="mt-1 text-xs text-slate-500 dark:text-[#888]">{hint}</p></div>; }
function Message({ text }: { text: string }) { return <div className="mb-4 whitespace-pre-wrap rounded border border-slate-300 bg-white px-3 py-2 text-xs dark:border-[#3b3b3b] dark:bg-[#202020]">{text}</div>; }
