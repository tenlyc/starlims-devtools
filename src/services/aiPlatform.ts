import { SSLParser } from '../lsp/ssl/parser';
import type { AgentWorkspaceChange } from '../types/agent';
import type { AiExtensionManifest, AiLayerConfig, EffectiveAiConfig, QualityGateInput, QualityGatePolicy, QualityGateReport, WorkflowTask, WorkflowTemplate } from '../types/aiPlatform';

export const AI_LAYER_STORE_KEY = 'aiConfigurationLayers.v1';
export const AI_WORKSPACE_REVIEW_STORE_KEY = 'aiWorkspaceReview.v1';
export const qualityReviewStoreKey = (): string => `${AI_WORKSPACE_REVIEW_STORE_KEY}.${encodeURIComponent(localStorage.getItem('gitWorkspacePath') || 'default')}`;
const projectLayerStoreKey = (): string => `${AI_LAYER_STORE_KEY}.project.${encodeURIComponent(localStorage.getItem('gitWorkspacePath') || 'default')}`;

export const DEFAULT_QUALITY_POLICY: QualityGatePolicy = {
  blockSslErrors: true,
  blockDeletedFiles: true,
  requireDiffReview: true,
  requirePassedTests: false,
  warnChangedLines: 400
};

export const DEFAULT_WORKFLOWS: WorkflowTemplate[] = [{
  id: 'starlims-change',
  name: 'STARLIMS 变更工作流',
  description: '规划任务，形成实现方案，再并行执行代码审查与测试设计。',
  roles: ['planner', 'implementer', 'reviewer', 'tester'],
  parallelReviewAndTest: true
}];

export async function loadAiLayers(): Promise<Partial<Record<'team' | 'project' | 'personal', AiLayerConfig>>> {
  const [value, scopedProject] = await Promise.all([
    window.electronAPI?.storeGet(AI_LAYER_STORE_KEY).catch(() => null),
    window.electronAPI?.storeGet(projectLayerStoreKey()).catch(() => null)
  ]);
  const layers = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<Record<'team' | 'project' | 'personal', AiLayerConfig>> : {};
  return { ...layers, project: scopedProject && typeof scopedProject === 'object' ? scopedProject as AiLayerConfig : layers.project };
}

export async function saveAiLayer(layer: AiLayerConfig): Promise<void> {
  const layers = await loadAiLayers();
  const next = { ...layers, [layer.layer]: { ...layer, schemaVersion: 1, updatedAt: Date.now() } };
  if (layer.layer === 'project') {
    await window.electronAPI?.storeSet(projectLayerStoreKey(), next.project);
  } else {
    const globalLayers = { team: next.team, personal: next.personal };
    await window.electronAPI?.storeSet(AI_LAYER_STORE_KEY, globalLayers);
  }
  window.dispatchEvent(new CustomEvent('ai-layers:changed', { detail: next }));
}

const LAYER_ORDER = ['team', 'project', 'personal'] as const;
const SSL_TYPES = new Set(['SS', 'APPSS', 'SERVERSCRIPT', 'APPSERVERSCRIPT', 'SLSQL']);

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const result = new Map<string, T>();
  for (const item of items) result.set(item.id, item);
  return [...result.values()];
}

export function mergeAiLayers(layers: Partial<Record<(typeof LAYER_ORDER)[number], AiLayerConfig>>): EffectiveAiConfig {
  const ordered = LAYER_ORDER.map((layer) => layers[layer]).filter((value): value is AiLayerConfig => Boolean(value));
  return {
    rules: ordered.flatMap((layer) => layer.rules?.trim() ? [{ layer: layer.layer, content: layer.rules.trim() }] : []),
    quality: Object.assign({}, DEFAULT_QUALITY_POLICY, ...ordered.map((layer) => layer.quality || {})),
    workflows: uniqueById([...DEFAULT_WORKFLOWS, ...ordered.flatMap((layer) => layer.workflows || [])]),
    extensions: uniqueById(ordered.flatMap((layer) => layer.extensions || [])).filter((extension) => extension.enabled !== false)
  };
}

export function validateExtensionManifest(value: unknown): AiExtensionManifest {
  if (!value || typeof value !== 'object') throw new Error('Extension manifest must be an object.');
  const manifest = value as AiExtensionManifest;
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported extension manifest schema version.');
  if (!manifest.id?.trim() || !/^[a-z0-9][a-z0-9._-]*$/i.test(manifest.id)) throw new Error('Extension id is required and may only contain letters, numbers, dots, underscores, and hyphens.');
  if (!manifest.name?.trim() || !manifest.version?.trim()) throw new Error('Extension name and version are required.');
  const serialized = JSON.stringify(manifest);
  if (/"(?:api.?key|password|token|cookie|secret|authorization)"\s*:/i.test(serialized)) throw new Error('Extension manifests cannot contain credentials. Store secrets separately after import.');
  for (const workflow of manifest.contributes?.workflows || []) if (!workflow.id || !workflow.name || !Array.isArray(workflow.roles)) throw new Error(`Extension '${manifest.id}' contains an invalid workflow.`);
  for (const language of manifest.contributes?.languages || []) if (!language.id || !Array.isArray(language.extensions)) throw new Error(`Extension '${manifest.id}' contains an invalid language contribution.`);
  return { ...manifest, enabled: manifest.enabled !== false };
}

function changeKey(change: Pick<AgentWorkspaceChange, 'uri' | 'language'>): string {
  return `${change.uri}\n${change.language || ''}`;
}

function changedLineCount(change: AgentWorkspaceChange): number {
  const before = change.before.split(/\r?\n/);
  const after = change.after.split(/\r?\n/);
  let changed = Math.abs(before.length - after.length);
  for (let index = 0; index < Math.min(before.length, after.length); index++) if (before[index] !== after[index]) changed++;
  return changed;
}

export function evaluateQualityGate({ changes, reviewState, policy }: QualityGateInput): QualityGateReport {
  const findings: QualityGateReport['findings'] = [];
  let changedLines = 0;
  for (const change of changes) {
    changedLines += changedLineCount(change);
    if (change.kind === 'deleted' && policy.blockDeletedFiles) findings.push({ id: `deleted:${changeKey(change)}`, level: 'error', source: 'workspace', uri: change.uri, message: `${change.name}: deleted workspace files cannot be written back.` });
    if (change.kind !== 'deleted' && SSL_TYPES.has(change.type.toUpperCase())) {
      const errors = new SSLParser().parse(change.after).errors;
      if (errors.length) findings.push({ id: `ssl:${changeKey(change)}`, level: policy.blockSslErrors ? 'error' : 'warning', source: 'ssl', uri: change.uri, message: `${change.name}: ${errors.length} SSL syntax error(s); first at line ${errors[0].line + 1}: ${errors[0].message}` });
    }
    if (policy.requireDiffReview && !reviewState.reviewedKeys.includes(changeKey(change))) findings.push({ id: `review:${changeKey(change)}`, level: 'error', source: 'review', uri: change.uri, message: `${change.name}: diff has not been marked as reviewed.` });
  }
  if (changedLines > policy.warnChangedLines) findings.push({ id: 'large-diff', level: 'warning', source: 'diff', message: `The selected changes affect approximately ${changedLines} lines, above the ${policy.warnChangedLines}-line review threshold.` });
  if (policy.requirePassedTests) {
    if (!reviewState.tests.length) findings.push({ id: 'tests-missing', level: 'error', source: 'test', message: 'At least one test case is required before write-back.' });
    for (const test of reviewState.tests) if (test.status !== 'passed') findings.push({ id: `test:${test.id}`, level: 'error', source: 'test', message: `Test '${test.name}' has not passed.` });
  }
  return { passed: !findings.some((finding) => finding.level === 'error'), findings, changedFiles: changes.length, changedLines };
}

export function workflowRolePrompt(role: 'planner' | 'implementer' | 'reviewer' | 'tester', request: string, prior = '', custom = ''): { system: string; prompt: string } {
  const systems = {
    planner: 'You are the planning role in a STARLIMS engineering team. Decompose the request into concrete, dependency-aware tasks. Group dependent work together so the emitted tasks are safe to process in parallel. End with a fenced ```json block containing an array of up to 8 objects with id, title, and optional detail. Do not modify files or remote state.',
    implementer: 'You are the implementation role in a STARLIMS engineering team. Produce a precise implementation proposal based on the approved plan. Respect user rules and do not claim unperformed changes.',
    reviewer: 'You are the review role in a STARLIMS engineering team. Review the proposed implementation for correctness, security, regressions, STARLIMS conventions, and dependency impact.',
    tester: 'You are the test role in a STARLIMS engineering team. Design executable tests and quality checks for the proposed implementation, including SSL diagnostics and STARLIMS regression coverage.'
  };
  return { system: `${systems[role]}${custom.trim() ? `\nRole-specific instructions:\n${custom.trim()}` : ''}`, prompt: [`User request:\n${request}`, prior ? `Prior stage output:\n${prior}` : ''].filter(Boolean).join('\n\n') };
}

export function parseWorkflowTasks(plan: string): WorkflowTask[] {
  const fenced = [...plan.matchAll(/```json\s*([\s\S]*?)```/gi)].at(-1)?.[1];
  if (!fenced) return [];
  try {
    const parsed = JSON.parse(fenced);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 8).flatMap((value, index) => {
      if (!value || typeof value !== 'object') return [];
      const title = String((value as { title?: unknown }).title || '').trim();
      if (!title) return [];
      return [{ id: String((value as { id?: unknown }).id || `task-${index + 1}`), title, detail: String((value as { detail?: unknown }).detail || '').trim() || undefined }];
    });
  } catch { return []; }
}
