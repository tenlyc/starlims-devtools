import { create } from 'zustand';

export interface OpenFile {
  uri: string;
  name: string;
  type: string;
  content: string;
  isDirty?: boolean;
  guid?: string;
}

export interface EditorSettings {
  fontSize: number;
  minimap: boolean;
  showLineNumbers: boolean;
  showWhitespace: boolean;
  wordWrap: boolean;
}

interface EditorState {
  openFiles: OpenFile[];
  activeFileUri: string | null;
  editorSettings: EditorSettings;

  // Actions
  openFile: (file: OpenFile) => void;
  closeFile: (uri: string) => void;
  setActiveFile: (uri: string) => void;
  updateFileContent: (uri: string, content: string) => void;
  markFileAsSaved: (uri: string) => void;
  getActiveFile: () => OpenFile | undefined;
  updateEditorSettings: (settings: Partial<EditorSettings>) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  toggleLineNumbers: () => void;
  toggleWhitespace: () => void;
  toggleWordWrap: () => void;
  toggleMinimap: () => void;
}

export const editorStore = create<EditorState>((set, get) => ({
  openFiles: [],
  activeFileUri: null,
  editorSettings: {
    fontSize: 14,
    minimap: true,
    showLineNumbers: true,
    showWhitespace: false,
    wordWrap: true,
  },

  openFile: (file: OpenFile) => {
    const { openFiles } = get();
    const existing = openFiles.find(f => f.uri === file.uri);
    if (existing) {
      set({ activeFileUri: file.uri });
    } else {
      set({
        openFiles: [...openFiles, file],
        activeFileUri: file.uri
      });
    }
  },

  closeFile: (uri: string) => {
    const { openFiles, activeFileUri } = get();
    const newFiles = openFiles.filter(f => f.uri !== uri);
    let newActiveUri = activeFileUri;
    if (activeFileUri === uri) {
      newActiveUri = newFiles.length > 0 ? newFiles[newFiles.length - 1].uri : null;
    }
    set({
      openFiles: newFiles,
      activeFileUri: newActiveUri
    });
  },

  setActiveFile: (uri: string) => {
    set({ activeFileUri: uri });
  },

  updateFileContent: (uri: string, content: string) => {
    const { openFiles } = get();
    set({
      openFiles: openFiles.map(f =>
        f.uri === uri ? { ...f, content, isDirty: true } : f
      )
    });
  },

  getActiveFile: () => {
    const { openFiles, activeFileUri } = get();
    return openFiles.find(f => f.uri === activeFileUri);
  },

  markFileAsSaved: (uri: string) => {
    const { openFiles } = get();
    set({
      openFiles: openFiles.map(f =>
        f.uri === uri ? { ...f, isDirty: false } : f
      )
    });
  },

  updateEditorSettings: (settings: Partial<EditorSettings>) => {
    const { editorSettings } = get();
    set({ editorSettings: { ...editorSettings, ...settings } });
  },

  increaseFontSize: () => {
    const { editorSettings } = get();
    const newSize = Math.min(editorSettings.fontSize + 1, 32);
    set({ editorSettings: { ...editorSettings, fontSize: newSize } });
    // Trigger re-render
    const callback = (window as any).__editorSettingsCallback;
    if (callback) callback();
  },

  decreaseFontSize: () => {
    const { editorSettings } = get();
    const newSize = Math.max(editorSettings.fontSize - 1, 8);
    set({ editorSettings: { ...editorSettings, fontSize: newSize } });
    // Trigger re-render
    const callback = (window as any).__editorSettingsCallback;
    if (callback) callback();
  },

  toggleLineNumbers: () => {
    const { editorSettings } = get();
    set({ editorSettings: { ...editorSettings, showLineNumbers: !editorSettings.showLineNumbers } });
    // Trigger re-render
    const callback = (window as any).__editorSettingsCallback;
    if (callback) callback();
  },

  toggleWhitespace: () => {
    const { editorSettings } = get();
    set({ editorSettings: { ...editorSettings, showWhitespace: !editorSettings.showWhitespace } });
    // Trigger re-render
    const callback = (window as any).__editorSettingsCallback;
    if (callback) callback();
  },

  toggleWordWrap: () => {
    const { editorSettings } = get();
    set({ editorSettings: { ...editorSettings, wordWrap: !editorSettings.wordWrap } });
    // Trigger re-render
    const callback = (window as any).__editorSettingsCallback;
    if (callback) callback();
  },

  toggleMinimap: () => {
    const { editorSettings } = get();
    set({ editorSettings: { ...editorSettings, minimap: !editorSettings.minimap } });
    // Trigger re-render
    const callback = (window as any).__editorSettingsCallback;
    if (callback) callback();
  },
}));
