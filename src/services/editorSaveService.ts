import { editorStore } from '../stores/editorStore';
import { useOutputLogStore } from './outputLogStore';
import { saveItemWithGate } from './writeGateService';

const savesInFlight = new Map<string, Promise<boolean>>();

export function saveEditorFile(uri?: string | null): Promise<boolean> {
  if (!uri) return Promise.resolve(false);
  const current = savesInFlight.get(uri);
  if (current) return current;

  const operation = (async () => {
    const file = editorStore.getState().openFiles.find((candidate) => candidate.uri === uri);
    if (!file) throw new Error('找不到当前编辑文件。');
    if (!file.isDirty) return true;

    try {
      const result = await saveItemWithGate({
        source: 'editor', action: 'save', uri: file.uri, language: file.language,
        type: file.type, code: file.content, expectedRemoteContent: file.baselineContent, approved: true
      });
      if (!result.saved) return false;
      editorStore.getState().markFileAsSaved(file.uri);
      useOutputLogStore.getState().addEntry({
        channel: 'starlims-operation', level: 'success', source: 'Editor',
        message: `已保存并回读验证：${file.name}`
      });
      return true;
    } catch (error) {
      useOutputLogStore.getState().addEntry({
        channel: 'starlims-operation', level: 'error', source: 'Editor',
        message: `保存 ${file.name} 失败：${error instanceof Error ? error.message : String(error)}`
      });
      throw error;
    }
  })().finally(() => savesInFlight.delete(uri));

  savesInFlight.set(uri, operation);
  return operation;
}

export async function saveEditorFileWithFeedback(uri?: string | null): Promise<boolean> {
  try {
    return await saveEditorFile(uri);
  } catch (error) {
    await window.electronAPI?.showMessageBox({
      type: 'error',
      title: '保存失败',
      message: '无法保存当前 STARLIMS 脚本。',
      detail: error instanceof Error ? error.message : String(error),
      buttons: ['确定'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }).catch(() => undefined);
    return false;
  }
}
