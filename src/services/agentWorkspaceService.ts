import type { AgentWorkspaceChange, AgentWorkspaceFile, AgentWorkspaceSyncResult } from '../types/agent';
import type { EnterpriseItem } from './iEnterpriseService';
import { getEnterpriseService } from './enterpriseService';
import { editorStore } from '../stores/editorStore';
import { SSLParser } from '../lsp/ssl/parser';
import { buildDependencyIndex, saveDependencyIndex } from './starlimsDependencyIndex';
import { saveItemWithGate } from './writeGateService';
import type { AiContextItem } from './aiContextStore';
import type { OpenFile } from '../stores/editorStore';
import type { AgentFileChange } from '../types/agent';
import { evaluateQualityGate, loadAiLayers, mergeAiLayers, qualityReviewStoreKey } from './aiPlatform';
import type { WorkspaceReviewState } from '../types/aiPlatform';

const TYPE_MAP: Record<string, string> = {
  AppServerScript: 'APPSS',
  AppClientScript: 'APPCS',
  AppDataSourceScript: 'APPDS',
  ServerScript: 'SS',
  ClientScript: 'CS',
  DataSourceScript: 'DS',
  HTMLForm: 'HTMLFORMXML',
  XFDForm: 'XFDFORMXML'
};

const SSL_TYPES = new Set(['SS', 'APPSS', 'SRVSCR', 'SERVERSCRIPT', 'APPSERVERSCRIPT']);
const LOCALIZED_TYPES = new Set([
  'HTMLFORMXML', 'HTMLFORMCODE', 'HTMLFORMGUIDE', 'HTMLFORMRESOURCES',
  'XFDFORMXML', 'XFDFORMCODE', 'XFDFORMRESOURCES'
]);

export type WorkspaceApplyConflict = {
  change: AgentWorkspaceChange;
  reason: string;
};

export type WorkspaceApplyResult = {
  applied: AgentWorkspaceChange[];
  conflicts: WorkspaceApplyConflict[];
  errors: WorkspaceApplyConflict[];
  cancelled: boolean;
};

function identity(item: Pick<AgentWorkspaceFile, 'uri' | 'language'>): string {
  return `${item.uri}\n${item.language || ''}`;
}

function displayName(change: AgentWorkspaceChange): string {
  return change.language ? `${change.name} (${change.language})` : change.name;
}

export async function resolveCheckedOutItemUri(item: EnterpriseItem): Promise<string | null> {
  const uri = item.uri || item.id;
  if (!uri) return null;
  if (uri.startsWith('/')) return uri;
  const resolved = await getEnterpriseService().getItemByGuid(uri, TYPE_MAP[item.type] || item.type);
  return resolved?.uri || null;
}

async function loadWorkspaceFile(item: EnterpriseItem): Promise<AgentWorkspaceFile | null> {
  const uri = await resolveCheckedOutItemUri(item);
  if (!uri) return null;
  // SCRIPTLANGUAGE (SSL/HTML) describes the item family and must never be sent
  // as SaveCode.UserLang. Only localized form documents carry a real UserLang.
  const language = LOCALIZED_TYPES.has(item.type.toUpperCase()) ? item.language : undefined;
  const content = await getEnterpriseService().getItemCode(uri, language);
  return {
    uri,
    name: item.name,
    type: item.type,
    language,
    checkedOutBy: item.checkedOutBy,
    checkedOutDate: item.checkedOutDate,
    content
  };
}

/** Synchronize every item currently checked out by the signed-in STARLIMS user. */
export async function syncCheckedOutWorkspace(): Promise<AgentWorkspaceSyncResult> {
  if (!window.electronAPI) throw new Error('Agent workspace is only available in the desktop application.');
  const items = await getEnterpriseService().getCheckedOutItems();
  const files: AgentWorkspaceFile[] = [];
  // Keep requests sequential: older STARLIMS installations can become unstable
  // when many GetCode calls share one session concurrently.
  for (const item of items) {
    const file = await loadWorkspaceFile(item);
    if (file) files.push(file);
  }
  const result = await window.electronAPI.agentWorkspaceSyncFiles(files, { replace: true });
  await saveDependencyIndex(buildDependencyIndex(files));
  window.dispatchEvent(new CustomEvent('agent-workspace:synced', { detail: result }));
  return result;
}

/**
 * Build the smallest useful Agent workspace for one turn. No remote request is
 * made here: the active editor and explicit @ references already carry content.
 */
export function collectAgentTurnWorkspaceFiles(contexts: AiContextItem[], activeFile?: OpenFile): AgentWorkspaceFile[] {
  const files = new Map<string, AgentWorkspaceFile>();
  const add = (file: AgentWorkspaceFile) => {
    if (!file.uri.startsWith('/') || file.type.toUpperCase() === 'CUSTOMIZE') return;
    const key = identity(file);
    if (!files.has(key)) files.set(key, file);
  };
  if (activeFile) add({
    uri: activeFile.uri, name: activeFile.name, type: activeFile.type,
    language: activeFile.language, content: activeFile.content
  });
  for (const context of contexts) {
    if (context.source === 'file') continue;
    add({
      uri: context.uri, name: context.name, type: context.type,
      language: context.language, content: context.content
    });
  }
  return [...files.values()];
}

/** Incrementally sync only the active editor and explicit Agent references. */
export async function syncAgentTurnWorkspace(contexts: AiContextItem[]): Promise<AgentWorkspaceSyncResult | null> {
  if (!window.electronAPI) return null;
  const files = collectAgentTurnWorkspaceFiles(contexts, editorStore.getState().getActiveFile());
  if (!files.length) return null;
  const result = await window.electronAPI.agentWorkspaceSyncFiles(files, { replace: false });
  window.dispatchEvent(new CustomEvent('agent-workspace:targeted-synced', { detail: result }));
  return result;
}

export async function getWorkspaceChanges(): Promise<AgentWorkspaceChange[]> {
  if (!window.electronAPI) return [];
  return window.electronAPI.agentWorkspaceGetChanges();
}

function filePathMatches(change: AgentWorkspaceChange, file: AgentFileChange): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/^\.\//, '');
  const reported = normalize(file.path);
  const relative = normalize(change.relativePath);
  return file.uri === change.uri || reported === relative || reported.endsWith(`/${relative}`);
}

export async function resolveAgentFileChange(file: AgentFileChange): Promise<AgentWorkspaceChange | null> {
  if (file.origin === 'remote') return null;
  return (await getWorkspaceChanges()).find((change) => filePathMatches(change, file)) || null;
}

export async function openAgentFileChange(file: AgentFileChange): Promise<boolean> {
  if (file.origin === 'remote' && file.uri) {
    const content = await getEnterpriseService().getItemCode(file.uri, file.language);
    const name = file.uri.split('/').filter(Boolean).at(-1) || file.path;
    editorStore.getState().openFile({ uri: file.uri, name, type: 'Remote', language: file.language, content });
    return true;
  }
  const change = await resolveAgentFileChange(file);
  if (!change) return false;
  editorStore.getState().openFile({
    uri: change.uri, name: change.name, type: change.type,
    language: change.language, content: change.after, baselineContent: change.before, isDirty: true
  });
  return true;
}

export async function discardAgentFileChange(file: AgentFileChange): Promise<boolean> {
  const change = await resolveAgentFileChange(file);
  if (!change || !window.electronAPI) return false;
  const confirmation = await window.electronAPI.showMessageBox({
    type: 'warning',
    title: 'Discard Agent change',
    message: `Discard the Agent change to “${displayName(change)}”?`,
    detail: 'The local working copy will be restored to its synchronized baseline. STARLIMS remote content will not be changed.',
    buttons: ['Cancel', 'Discard change'], defaultId: 0, cancelId: 0, noLink: true
  });
  if (confirmation.response !== 1) return false;
  const discarded = await window.electronAPI.agentWorkspaceDiscardChanges([{ uri: change.uri, language: change.language, fingerprint: change.fingerprint }]);
  if (!discarded) return false;
  const open = editorStore.getState().openFiles.find((candidate) => candidate.uri === change.uri && (candidate.language || '') === (change.language || ''));
  if (open) {
    editorStore.getState().updateFileContent(open.uri, change.before);
    editorStore.getState().markFileAsSaved(open.uri);
  }
  window.dispatchEvent(new CustomEvent('agent-workspace:discarded', { detail: change }));
  return true;
}

export async function reviewAndApplyAgentFileChange(file: AgentFileChange): Promise<WorkspaceApplyResult> {
  const change = await resolveAgentFileChange(file);
  if (!change) throw new Error('This file change is no longer present in the Agent workspace.');
  const [layers, savedReview] = await Promise.all([
    loadAiLayers(),
    window.electronAPI?.storeGet(qualityReviewStoreKey()).catch(() => null)
  ]);
  const stored = savedReview && typeof savedReview === 'object' ? savedReview as Partial<WorkspaceReviewState> : {};
  const reviewState: WorkspaceReviewState = {
    reviewedFingerprints: [...new Set([...(Array.isArray(stored.reviewedFingerprints) ? stored.reviewedFingerprints : []), change.fingerprint])],
    tests: Array.isArray(stored.tests) ? stored.tests : []
  };
  const gate = evaluateQualityGate({ changes: [change], reviewState, policy: mergeAiLayers(layers).quality });
  if (!gate.passed) throw new Error(gate.findings.filter((finding) => finding.level === 'error').map((finding) => finding.message).join('\n'));
  const result = await applyWorkspaceChanges([change]);
  if (!result.cancelled) {
    const nextReview = {
      ...reviewState,
      reviewedFingerprints: result.applied.length
        ? reviewState.reviewedFingerprints.filter((fingerprint) => fingerprint !== change.fingerprint)
        : reviewState.reviewedFingerprints
    };
    await window.electronAPI?.storeSet(qualityReviewStoreKey(), nextReview);
    window.dispatchEvent(new CustomEvent('ai-quality:changed', { detail: nextReview }));
  }
  return result;
}

function validateLocalChange(change: AgentWorkspaceChange): string | null {
  if (change.kind === 'deleted') return '工作区文件已删除；为避免误删，当前版本不会把删除操作写回 STARLIMS。';
  if (!SSL_TYPES.has(change.type.toUpperCase())) return null;
  const errors = new SSLParser().parse(change.after).errors;
  if (!errors.length) return null;
  const first = errors[0];
  return `SSL 语法检查发现 ${errors.length} 个错误，第 ${first.line + 1} 行：${first.message}`;
}

/**
 * Confirm and apply reviewed working-copy changes. A fresh remote read must still
 * equal the stored baseline, otherwise the file is reported as a conflict.
 */
export async function applyWorkspaceChanges(changes: AgentWorkspaceChange[]): Promise<WorkspaceApplyResult> {
  const result: WorkspaceApplyResult = { applied: [], conflicts: [], errors: [], cancelled: false };
  if (!changes.length) return result;

  const freshChanges = await getWorkspaceChanges();
  const freshByIdentity = new Map(freshChanges.map((change) => [identity(change), change]));
  const staleChanges = changes.filter((change) => freshByIdentity.get(identity(change))?.fingerprint !== change.fingerprint);
  for (const change of staleChanges) result.conflicts.push({ change, reason: '本地内容在审查后已发生变化，原内容指纹已失效；请重新审查。' });
  changes = changes.filter((change) => !staleChanges.some((stale) => identity(stale) === identity(change)));
  if (!changes.length) return result;

  const validationFailures = changes
    .map((change) => ({ change, reason: validateLocalChange(change) }))
    .filter((item): item is WorkspaceApplyConflict => Boolean(item.reason));
  if (validationFailures.length) result.conflicts.push(...validationFailures);

  const candidates = changes.filter((change) => !validationFailures.some((failure) => identity(failure.change) === identity(change)));
  if (!candidates.length) return result;

  const confirmation = await window.electronAPI.showMessageBox({
    type: 'warning',
    title: '写回 STARLIMS',
    message: `确认把 ${candidates.length} 个已审查的本地修改写回 STARLIMS？`,
    detail: `${candidates.slice(0, 8).map(displayName).join('\n')}${candidates.length > 8 ? `\n…另有 ${candidates.length - 8} 个文件` : ''}\n\n写回前会重新检查签出状态与远端冲突。`,
    buttons: ['取消', '确认写回'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (confirmation.response !== 1) {
    result.cancelled = true;
    return result;
  }

  const checkedOutItems = await getEnterpriseService().getCheckedOutItems();
  const checkedOutFiles: AgentWorkspaceFile[] = [];
  for (const item of checkedOutItems) {
    const file = await loadWorkspaceFile(item);
    if (file) checkedOutFiles.push(file);
  }
  const checkedOutByIdentity = new Map(checkedOutFiles.map((file) => [identity(file), file]));

  for (const change of candidates) {
    const remote = checkedOutByIdentity.get(identity(change));
    if (!remote) {
      result.conflicts.push({ change, reason: '该脚本已不在当前用户的签出列表中，或签出语言已变化。' });
      continue;
    }
    if (remote.content !== change.before) {
      result.conflicts.push({ change, reason: '服务器内容在本地基线建立后已经变化。请先处理远端冲突。' });
      continue;
    }
    try {
      await saveItemWithGate({
        source: 'workspace', action: 'save', uri: change.uri, language: change.language,
        type: change.type, code: change.after, expectedRemoteContent: change.before, approved: true
      });
      result.applied.push(change);
      const openFile = editorStore.getState().openFiles.find((file) => file.uri === change.uri && (file.language || '') === (change.language || ''));
      if (openFile) {
        editorStore.getState().updateFileContent(openFile.uri, change.after);
        editorStore.getState().markFileAsSaved(openFile.uri);
      }
    } catch (error) {
      result.errors.push({ change, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  if (result.applied.length) {
    const accepted = await window.electronAPI.agentWorkspaceAcceptChanges(result.applied.map(({ uri, language, fingerprint }) => ({ uri, language, fingerprint })));
    if (accepted !== result.applied.length) {
      const acceptedFingerprints = new Set((await getWorkspaceChanges()).map((change) => change.fingerprint));
      const staleApplied = result.applied.filter((change) => acceptedFingerprints.has(change.fingerprint));
      for (const change of staleApplied) result.errors.push({ change, reason: '保存后本地内容再次变化，未更新基线；请重新审查当前版本。' });
      result.applied = result.applied.filter((change) => !staleApplied.includes(change));
    }
    window.dispatchEvent(new CustomEvent('agent-workspace:applied', { detail: result }));
  }
  return result;
}
