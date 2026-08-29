import type { AgentWorkspaceChange, AgentWorkspaceFile, AgentWorkspaceSyncResult } from '../types/agent';
import type { EnterpriseItem } from './iEnterpriseService';
import { getEnterpriseService } from './enterpriseService';
import { editorStore } from '../stores/editorStore';
import { SSLParser } from '../lsp/ssl/parser';

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
  const result = await window.electronAPI.agentWorkspaceSyncFiles(files);
  window.dispatchEvent(new CustomEvent('agent-workspace:synced', { detail: result }));
  return result;
}

export async function getWorkspaceChanges(): Promise<AgentWorkspaceChange[]> {
  if (!window.electronAPI) return [];
  return window.electronAPI.agentWorkspaceGetChanges();
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
      const saved = await getEnterpriseService().saveItemCode(change.uri, change.after, change.language);
      if (!saved) {
        result.errors.push({ change, reason: 'STARLIMS SaveCode 返回失败。' });
        continue;
      }
      const verifiedContent = await getEnterpriseService().getItemCode(change.uri, change.language);
      if (verifiedContent !== change.after) {
        result.errors.push({ change, reason: '保存后回读校验不一致，本地修改仍保留为待审查状态。' });
        continue;
      }
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
    await window.electronAPI.agentWorkspaceAcceptChanges(result.applied.map(({ uri, language }) => ({ uri, language })));
    window.dispatchEvent(new CustomEvent('agent-workspace:applied', { detail: result }));
  }
  return result;
}
