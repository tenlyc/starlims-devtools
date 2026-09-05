import { useState, useCallback, useEffect, useRef } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { editorStore, OpenFile } from '../../stores/editorStore';
import { goToItem, goToServerScript, goToClientScript, goToDataSource, goToForm, detectGoToCommand, parseScriptNameFromLine } from '../../services/goToService';
import { registerSnippets } from '../../services/snippets';
import { registerLanguages, defineThemes } from '../../services/monarchTokens';
import { registerSslLanguageFeatures } from '../../services/sslLanguageFeatures';
import { resolveEditorLanguage } from '../../services/editorLanguage';
import { getEnterpriseService } from '../../services/enterpriseService';
import { useOutputLogStore } from '../../services/outputLogStore';
import { triggerCheckedOutRefresh } from '../../services/checkedOutStore';
import { useThemeStore } from '../../stores/themeStore';
import { getInlineCompletionService } from '../../services/InlineCompletionService';
import * as monaco from 'monaco-editor';
import { useAiContextStore } from '../../services/aiContextStore';
import { useI18n } from '../../i18n';
import { CustomizePage } from '../Customize/CustomizePage';
import { checkInItemWithGate, checkoutItemWithGate, executeDataSourceWithGate, executeServerScriptWithGate, saveItemWithGate, undoCheckoutWithGate } from '../../services/writeGateService';
import { saveEditorFileWithFeedback } from '../../services/editorSaveService';
import { hasPrimaryModifier, primaryShortcut } from '../../services/platformShortcuts';
import { FormPreviewPanel } from './FormPreviewPanel';
import { FORM_PREVIEW_TYPE, openFormPreviewEditor } from '../../services/formPreviewService';
import type { FormPreviewMode } from '../../types/formPreview';

// Runtime preview and debug are verified; the full Designer remains experimental.
const ENABLE_FORM_PREVIEW_UI = true;
const ENABLE_FORM_DESIGN_UI = false;

interface EditorContextMenu {
  x: number;
  y: number;
  line: string;
  position: number;
}

interface TabContextMenu {
  x: number;
  y: number;
  fileUri: string;
}

interface CloseConfirmModal {
  isOpen: boolean;
  fileName: string;
  file: OpenFile | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function EditorPanel() {
  const { t } = useI18n();
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileUri, setActiveFileUri] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<EditorContextMenu | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenu | null>(null);
  const [, setExtensionLanguageRevision] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [closeModal, setCloseModal] = useState<CloseConfirmModal>({
    isOpen: false,
    fileName: '',
    file: null,
    onSave: () => undefined,
    onDiscard: () => undefined,
    onCancel: () => undefined
  });
  const [settingsKey, setSettingsKey] = useState(0);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const [showDiffControls, setShowDiffControls] = useState(false);
  const addAiContext = useAiContextStore((state) => state.addItem);
  const shortcut = primaryShortcut;

  useEffect(() => {
    const refresh = () => setExtensionLanguageRevision((value) => value + 1);
    window.addEventListener('ai-languages:changed', refresh);
    return () => window.removeEventListener('ai-languages:changed', refresh);
  }, []);

  // Listen for diff controls update events
  useEffect(() => {
    const handleDiffControlsUpdate = (e: CustomEvent) => {
      setShowDiffControls(e.detail.visible);
    };
    window.addEventListener('diff-controls-update', handleDiffControlsUpdate as EventListener);
    return () => {
      window.removeEventListener('diff-controls-update', handleDiffControlsUpdate as EventListener);
    };
  }, []);

  // Theme subscription
  const { resolvedTheme } = useThemeStore();

  // Subscribe to editorStore
  const files = editorStore(state => state.openFiles);
  const currentActiveUri = editorStore(state => state.activeFileUri);
  const pendingReveal = editorStore(state => state.pendingReveal);

  const activeFile = files.find(f => f.uri === currentActiveUri);

  const revealPendingLocation = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    const location = editorStore.getState().pendingReveal;
    if (!location || location.uri !== editorStore.getState().activeFileUri) return;
    const position = { lineNumber: Math.max(1, location.line), column: Math.max(1, location.column) };
    editor.setPosition(position);
    editor.revealPositionInCenter(position);
    editor.focus();
    editorStore.getState().consumeReveal();
  }, []);

  useEffect(() => {
    if (!pendingReveal || pendingReveal.uri !== currentActiveUri || !editorRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (editorRef.current) revealPendingLocation(editorRef.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [currentActiveUri, pendingReveal, revealPendingLocation]);

  // Update Monaco theme when resolvedTheme changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const themeName = resolvedTheme === 'dark' ? 'starlims-dark' : 'starlims-light';
      monacoRef.current.editor.setTheme(themeName);
      console.log('Theme changed to:', themeName);
    }
  }, [resolvedTheme]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (currentActiveUri && value !== undefined) {
      editorStore.getState().updateFileContent(currentActiveUri, value);
    }
  }, [currentActiveUri]);

  // Handle Monaco editor mount
  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance as any;

    // Always register themes and languages (they are idempotent)
    console.log('Registering themes and languages in handleEditorMount...');
    defineThemes(monacoInstance as any);
    registerLanguages(monacoInstance as any);
    registerSslLanguageFeatures(monacoInstance as any);
    registerSnippets();

    const saveCurrentFile = () => {
      void saveEditorFileWithFeedback(editorStore.getState().activeFileUri);
    };
    editor.addAction({
      id: 'starlims.saveRemoteItem',
      label: 'Save STARLIMS Item',
      keybindings: [monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS],
      run: saveCurrentFile
    });

    // Set theme based on current resolved theme
    const currentTheme = useThemeStore.getState().resolvedTheme;
    const themeName = currentTheme === 'dark' ? 'starlims-dark' : 'starlims-light';
    monacoInstance.editor.setTheme(themeName);
    console.log('Theme set to:', themeName);

    // Debug: log current file type and language
    if (activeFile) {
      const lang = resolveEditorLanguage(activeFile.type, activeFile.language);
      console.log('File type:', activeFile.type, '-> Language:', lang);
    }

    // Add F11 keybinding for GoTo
    editor.addCommand(monacoInstance.KeyCode.F11, () => {
      if (activeFile) {
        handleGoTo('auto');
      }
    });

    // Add Ctrl+/ keybinding for toggle comment
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Slash, () => {
      editor.getAction('editor.action.commentLine')?.run();
    });

    // Add Ctrl+Shift+L for select all occurrences
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyL, () => {
      editor.getAction('editor.action.selectHighlights')?.run();
    });

    // Add Alt+Click for multi-cursor (enabled by default in Monaco)
    // This is handled by the multiCursorModifier option

    // Handle context menu from Monaco editor
    editor.onContextMenu((e: any) => {
      if (e.event && e.event.clientX !== undefined) {
        e.event.preventDefault();
        setContextMenu({ x: e.event.clientX, y: e.event.clientY, line: '', position: 0 });
      }
    });

    // Track cursor position for GoTo navigation
    editor.onDidChangeCursorPosition((e: any) => {
      if (e.position) {
        const offset = editor.getModel()?.getOffsetAt(e.position) || 0;
        setCursorPosition(offset);
      }
    });

    // Initialize inline completion provider for AI-powered code suggestions
    const completionService = getInlineCompletionService();
    completionService.register(monacoInstance as any, editor);
    console.log('Inline completion service registered');

    requestAnimationFrame(() => revealPendingLocation(editor));

    // Expose editor methods globally for AI panel integration
    (window as any).getEditorSelection = () => {
      const sel = editor.getSelection();
      if (!sel || sel.isEmpty()) return '';
      return editor.getModel()?.getValueInRange(sel) || '';
    };

    (window as any).getActiveEditorContent = () => {
      const activeFile = editorStore.getState().getActiveFile();
      return activeFile?.content || '';
    };

    (window as any).getActiveFileName = () => {
      const activeFile = editorStore.getState().getActiveFile();
      return activeFile?.name || '';
    };

    (window as any).insertCodeAtCursor = (code: string) => {
      if (editor) {
        const position = editor.getPosition();
        if (position) {
          editor.executeEdits('ai-insert', [{
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: code
          }]);
          // Move cursor to end of inserted text
          const lines = code.split('\n');
          const lastLine = lines.length;
          const lastColumn = lines[lines.length - 1].length + 1;
          editor.setPosition(new monaco.Position(position.lineNumber + lastLine - 1, lastColumn));
          editor.focus();
        }
      }
    };

    // Smart code insertion - analyzes file structure and finds best insertion point
    (window as any).insertCodeSmart = (code: string) => {
      if (!editor) return;

      const model = editor.getModel();
      if (!model) return;

      const totalLines = model.getLineCount();

      // Build line index
      interface BlockInfo { line: number; keyword: string; indent: number; }
      const blocks: BlockInfo[] = [];

      for (let i = 1; i <= totalLines; i++) {
        const lineText = model.getLineContent(i);
        const trimmed = lineText.trim();

        // Track top-level blocks
        if (/^:CLASS\s+/i.test(trimmed)) {
          blocks.push({ line: i, keyword: ':CLASS', indent: lineText.search(/\S/) });
        } else if (/^:ENDCLASS$/i.test(trimmed)) {
          blocks.push({ line: i, keyword: ':ENDCLASS', indent: lineText.search(/\S/) });
        } else if (/^:PROCEDURE\s+/i.test(trimmed)) {
          blocks.push({ line: i, keyword: ':PROCEDURE', indent: lineText.search(/\S/) });
        } else if (/^:ENDPROC$/i.test(trimmed)) {
          blocks.push({ line: i, keyword: ':ENDPROC', indent: lineText.search(/\S/) });
        } else if (/^:FUNCTION\s+/i.test(trimmed)) {
          blocks.push({ line: i, keyword: ':FUNCTION', indent: lineText.search(/\S/) });
        } else if (/^:ENDFUNC$/i.test(trimmed)) {
          blocks.push({ line: i, keyword: ':ENDFUNC', indent: lineText.search(/\S/) });
        } else if (/^:TRY$/i.test(trimmed)) {
          blocks.push({ line: i, keyword: ':TRY', indent: lineText.search(/\S/) });
        } else if (/^:CATCH$/i.test(trimmed)) {
          blocks.push({ line: i, keyword: ':CATCH', indent: lineText.search(/\S/) });
        } else if (/^:ENDTRY$/i.test(trimmed)) {
          blocks.push({ line: i, keyword: ':ENDTRY', indent: lineText.search(/\S/) });
        }
      }

      // Detect what type of code we're inserting
      const trimmedCode = code.trim();
      const isProcedure = /^\s*:PROCEDURE\s+/im.test(trimmedCode);
      const isClass = /^\s*:CLASS\s+/im.test(trimmedCode);
      const isFunction = /^\s*:FUNCTION\s+/im.test(trimmedCode);
      const isMethod = /^\s*:METHOD\s+/im.test(trimmedCode);

      let insertLine = totalLines + 1;
      let insertColumn = 1;

      if (isClass) {
        // Insert class at end of file (classes are typically standalone)
        insertLine = totalLines + 1;
      } else if (isProcedure || isFunction) {
        // Find the last :ENDPROC or :ENDFUNC and insert after it
        let foundEnd = false;
        for (let i = blocks.length - 1; i >= 0; i--) {
          if (blocks[i].keyword === ':ENDPROC' || blocks[i].keyword === ':ENDFUNC') {
            insertLine = blocks[i].line + 1;
            foundEnd = true;
            break;
          }
        }
        if (!foundEnd) {
          // No procedure end found, maybe inside a class?
          const pos = editor.getPosition();
          const cursorLine = pos ? pos.lineNumber : 1;

          // Check if cursor is inside a class
          for (let i = blocks.length - 1; i >= 0; i--) {
            if (blocks[i].keyword === ':CLASS') {
              // Find the matching :ENDCLASS
              for (let j = i + 1; j < blocks.length; j++) {
                if (blocks[j].keyword === ':ENDCLASS') {
                  // Insert before :ENDCLASS if cursor is in this class
                  if (cursorLine >= blocks[i].line && cursorLine <= blocks[j].line) {
                    insertLine = blocks[j].line;
                    break;
                  }
                }
              }
              break;
            }
          }
        }
      } else if (isMethod) {
        // Insert method inside a class (before :ENDCLASS)
        const pos = editor.getPosition();
        const cursorLine = pos ? pos.lineNumber : 1;

        for (let i = blocks.length - 1; i >= 0; i--) {
          if (blocks[i].keyword === ':CLASS') {
            for (let j = i + 1; j < blocks.length; j++) {
              if (blocks[j].keyword === ':ENDCLASS') {
                if (cursorLine >= blocks[i].line && cursorLine <= blocks[j].line) {
                  insertLine = blocks[j].line;
                  break;
                }
              }
            }
            break;
          }
        }
      } else {
        // For generic code, insert at cursor position
        const pos = editor.getPosition();
        if (pos) {
          insertLine = pos.lineNumber;
          insertColumn = pos.column;
        }
      }

      // Perform the insertion
      editor.executeEdits('ai-smart-insert', [{
        range: new monaco.Range(insertLine, insertColumn, insertLine, insertColumn),
        text: code + '\n'
      }]);

      // Move cursor to end of inserted text
      const insertedLines = code.split('\n');
      const lastLine = insertedLines.length;
      const lastCol = insertedLines[insertedLines.length - 1].length + 1;
      editor.setPosition(new monaco.Position(insertLine + lastLine - 1, lastCol));
      editor.focus();

      console.log('Smart insert at line', insertLine, 'type:', isProcedure ? 'procedure' : isClass ? 'class' : isMethod ? 'method' : 'other');
    };

    // Code diff preview system - shows line-by-line diff in editor
    interface DiffLine {
      type: 'same' | 'added' | 'removed';
      content: string;
      lineNumber?: number;
    }
    interface DiffPreview {
      id: string;
      decorations: string[];
      originalLines: string[];
      newLines: string[];
      diffLines: DiffLine[];
      startLine: number;
    }
    const diffPreviews: Map<string, DiffPreview> = new Map();

    // Simple line-by-line diff
    function computeSimpleDiff(original: string[], modified: string[]): DiffLine[] {
      const result: DiffLine[] = [];
      const maxLen = Math.max(original.length, modified.length);

      for (let i = 0; i < maxLen; i++) {
        const origLine = original[i];
        const modLine = modified[i];

        if (origLine === modLine) {
          result.push({ type: 'same', content: origLine || '' });
        } else if (origLine === undefined) {
          result.push({ type: 'added', content: modLine || '' });
        } else if (modLine === undefined) {
          result.push({ type: 'removed', content: origLine });
        } else {
          result.push({ type: 'removed', content: origLine });
          result.push({ type: 'added', content: modLine });
        }
      }

      return result;
    }

    // Store current diff info for accept/reject
    let currentDiffInfo: { original: string; modified: string; decorations: string[]; startLine: number; endLine: number } | null = null;

    // Show diff view inline in editor - replaces original with diff showing +/- markers
    (window as any).showDiffInEditor = (original: string, modified: string): string | null => {
      if (!editor) return null;

      const model = editor.getModel();
      if (!model) return null;

      // Clear any previous diff
      if (currentDiffInfo && currentDiffInfo.decorations.length > 0) {
        editor.deltaDecorations(currentDiffInfo.decorations, []);
      }

      // Build diff lines
      const originalLines = original.split('\n');
      const modifiedLines = modified.split('\n');
      const diffLines = computeSimpleDiff(originalLines, modifiedLines);

      // Build diff display text with markers
      const diffDisplayLines: string[] = [];
      diffLines.forEach((line) => {
        if (line.type === 'same') {
          diffDisplayLines.push('   ' + line.content);
        } else if (line.type === 'added') {
          diffDisplayLines.push('+  ' + line.content);
        } else {
          diffDisplayLines.push('-  ' + line.content);
        }
      });

      // Find where original text is in the editor content
      const fullContent = model.getValue();
      const firstLine = originalLines[0];
      const startIdx = fullContent.indexOf(firstLine);

      if (startIdx === -1) {
        console.log('Could not find original code in editor');
        return null;
      }

      // Find starting line number
      let lineNum = 1;
      for (let j = 0; j < startIdx; j++) {
        if (fullContent[j] === '\n') lineNum++;
      }

      // Find the exact end position by searching for the complete original content
      // We need to find the position where original ends in fullContent
      let searchStart = startIdx;
      let endIdx = -1;

      // Try to find the exact original content by matching line by line
      for (let i = 1; i < originalLines.length; i++) {
        const line = originalLines[i];
        // Search for this line starting from current search position
        const foundIdx = fullContent.indexOf(line, searchStart);
        if (foundIdx === -1) {
          // Line not found exactly, try trimmed version
          const trimmedLine = line.trim();
          if (trimmedLine) {
            const trimmedFoundIdx = fullContent.indexOf(trimmedLine, searchStart);
            if (trimmedFoundIdx !== -1) {
              // Update search position to after this match
              searchStart = trimmedFoundIdx + trimmedLine.length;
            }
          }
        } else {
          // Update search position to after this match
          searchStart = foundIdx + line.length;
          endIdx = searchStart;
        }
      }

      // If we couldn't find all lines, estimate end based on original content
      if (endIdx === -1 || endIdx <= startIdx) {
        endIdx = startIdx + original.length;
      }

      // Calculate end line number based on endIdx
      let endLineNum = lineNum;
      for (let j = startIdx; j < endIdx; j++) {
        if (fullContent[j] === '\n') endLineNum++;
      }

      // Validate line numbers
      const maxLine = model.getLineCount();
      if (lineNum < 1) lineNum = 1;
      if (endLineNum > maxLine) endLineNum = maxLine;
      if (endLineNum < lineNum) endLineNum = lineNum;

      // Create a unique ID
      const previewId = `diff-${Date.now()}`;

      // Replace original region with diff display
      editor.executeEdits('ai-diff', [{
        range: new monaco.Range(lineNum, 1, endLineNum, model.getLineMaxColumn(endLineNum)),
        text: diffDisplayLines.join('\n')
      }]);

      // Apply decorations for colors
      const decorations = editor.deltaDecorations([], diffLines.map((line, idx) => ({
        range: new monaco.Range(lineNum + idx, 1, lineNum + idx, 1),
        options: {
          isWholeLine: true,
          className: line.type === 'added' ? 'diff-line-added' : line.type === 'removed' ? 'diff-line-removed' : ''
        }
      })));

      // Store diff info
      currentDiffInfo = {
        original,
        modified,
        decorations,
        startLine: lineNum,
        endLine: lineNum + diffDisplayLines.length - 1
      };

      // Store info for accept/reject
      diffPreviews.set(previewId, {
        id: previewId,
        decorations,
        originalLines: original.split('\n'),
        newLines: modified.split('\n'),
        diffLines,
        startLine: lineNum
      });

      // Set up the global diff controls
      (window as any).setDiffControls(previewId, () => {
        (window as any).acceptCurrentDiff();
      }, () => {
        (window as any).rejectCurrentDiff();
      });

      return previewId;
    };

    // Accept diff - replace diff display with just the new code (clean, no markers)
    (window as any).acceptCodeDiff = (previewId: string) => {
      const preview = diffPreviews.get(previewId);
      if (!preview || !currentDiffInfo) return;

      const model = editor.getModel();
      if (!model) return;

      // Clear decorations
      editor.deltaDecorations(preview.decorations, []);

      // Calculate valid end line
      const diffLineCount = preview.diffLines.length;
      let endLine = preview.startLine + diffLineCount - 1;
      const maxLine = model.getLineCount();
      if (endLine > maxLine) endLine = maxLine;

      editor.executeEdits('ai-diff-accept', [{
        range: new monaco.Range(preview.startLine, 1, endLine, model.getLineMaxColumn(endLine)),
        text: preview.newLines.join('\n')
      }]);

      currentDiffInfo = null;
      diffPreviews.delete(previewId);
      (window as any).clearDiffControls();
    };

    // Reject diff - restore original view
    (window as any).rejectCodeDiff = (previewId: string) => {
      const preview = diffPreviews.get(previewId);
      if (!preview || !currentDiffInfo) return;

      const model = editor.getModel();
      if (!model) return;

      // Clear decorations
      editor.deltaDecorations(preview.decorations, []);

      // Calculate valid end line
      const diffLineCount = preview.diffLines.length;
      let endLine = preview.startLine + diffLineCount - 1;
      const maxLine = model.getLineCount();
      if (endLine > maxLine) endLine = maxLine;

      editor.executeEdits('ai-diff-reject', [{
        range: new monaco.Range(preview.startLine, 1, endLine, model.getLineMaxColumn(endLine)),
        text: preview.originalLines.join('\n')
      }]);

      currentDiffInfo = null;
      diffPreviews.delete(previewId);
      (window as any).clearDiffControls();
    };

    // Global diff state for cross-component communication
    let currentDiffId: string | null = null;
    let onDiffAccept: (() => void) | null = null;
    let onDiffReject: (() => void) | null = null;

    (window as any).setDiffControls = (diffId: string, acceptFn: () => void, rejectFn: () => void) => {
      currentDiffId = diffId;
      onDiffAccept = acceptFn;
      onDiffReject = rejectFn;
      // Trigger a custom event to show the controls
      window.dispatchEvent(new CustomEvent('diff-controls-update', { detail: { visible: true, diffId } }));
    };

    (window as any).clearDiffControls = () => {
      currentDiffId = null;
      onDiffAccept = null;
      onDiffReject = null;
      window.dispatchEvent(new CustomEvent('diff-controls-update', { detail: { visible: false } }));
    };

    (window as any).acceptCurrentDiff = () => {
      if (currentDiffId && (window as any).acceptCodeDiff) {
        (window as any).acceptCodeDiff(currentDiffId);
      }
      (window as any).clearDiffControls();
    };

    (window as any).rejectCurrentDiff = () => {
      if (currentDiffId && (window as any).rejectCodeDiff) {
        (window as any).rejectCodeDiff(currentDiffId);
      }
      (window as any).clearDiffControls();
    };

    (window as any).getEditorRef = () => editor;
  };

  const handleCloseFile = async (uri: string, skipPrompt = false) => {
    const file = editorStore.getState().openFiles.find(f => f.uri === uri);
    if (!file) return;

    // If file is dirty and we're not skipping prompt, show custom modal
    if (file.isDirty && !skipPrompt) {
      // Open the custom close confirmation modal
      setCloseModal({
        isOpen: true,
        fileName: file.name,
        file: file,
        onSave: async () => {
          // Save and close
          try {
            const saved = (await saveItemWithGate({ source: 'editor', action: 'save', uri: file.uri, language: file.language, type: file.type, code: file.content, expectedRemoteContent: file.baselineContent, approved: true })).saved;
            if (saved) {
              editorStore.getState().markFileAsSaved(file.uri);
              console.log('File saved on close:', file.name);
            }
          } catch (err) {
            console.error('Save failed on close:', err);
            setCloseModal(prev => ({ ...prev, isOpen: false }));
            return;
          }
          setCloseModal(prev => ({ ...prev, isOpen: false }));
          editorStore.getState().closeFile(uri);
        },
        onDiscard: () => {
          // Close without saving
          setCloseModal(prev => ({ ...prev, isOpen: false }));
          editorStore.getState().closeFile(uri);
        },
        onCancel: () => {
          // Don't close
          setCloseModal(prev => ({ ...prev, isOpen: false }));
        }
      });
      return;
    } else if (file.isDirty && skipPrompt) {
      // Skip prompt mode - auto save (for programmatic closes)
      try {
        const saved = (await saveItemWithGate({ source: 'editor', action: 'save', uri: file.uri, language: file.language, type: file.type, code: file.content, expectedRemoteContent: file.baselineContent, approved: true })).saved;
        if (saved) {
          editorStore.getState().markFileAsSaved(file.uri);
          console.log('File auto-saved on close:', file.name);
        }
      } catch (err) {
        console.error('Auto-save failed on close:', err);
      }
    }

    editorStore.getState().closeFile(uri);
  };

  // Close other files (keep the specified one)
  const handleCloseOthers = (keepUri: string) => {
    const filesToClose = editorStore.getState().openFiles.filter(f => f.uri !== keepUri);
    filesToClose.forEach(file => {
      handleCloseFile(file.uri, true); // skip prompts, auto-save
    });
  };

  // Close all saved files
  const handleCloseSaved = () => {
    const savedFiles = editorStore.getState().openFiles.filter(f => !f.isDirty);
    savedFiles.forEach(file => {
      editorStore.getState().closeFile(file.uri);
    });
  };

  // Close all files
  const handleCloseAll = () => {
    editorStore.getState().openFiles.forEach(file => {
      handleCloseFile(file.uri, true); // skip prompts, auto-save
    });
  };

  // Handle tab right-click
  const handleTabContextMenu = (e: React.MouseEvent, uri: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTabContextMenu({ x: e.clientX, y: e.clientY, fileUri: uri });
  };

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, line: '', position: 0 });
  };

  // Edit operations using Monaco editor API
  const handleCut = () => {
    if (!editorRef.current) return;
    const selection = editorRef.current.getSelection();
    if (!selection || selection.isEmpty()) return;
    const selectedText = editorRef.current.getModel()?.getValueInRange(selection) || '';
    if (!selectedText) return;

    // Copy to clipboard first
    navigator.clipboard.writeText(selectedText).catch(err => console.error('Clipboard write failed:', err));

    // Execute cut - delete the selected text
    editorRef.current.executeEdits('cut', [{
      range: selection,
      text: ''
    }]);
  };

  const handleCopy = () => {
    if (!editorRef.current) return;
    const selection = editorRef.current.getSelection();
    if (!selection || selection.isEmpty()) return;
    const selectedText = editorRef.current.getModel()?.getValueInRange(selection) || '';
    if (!selectedText) return;

    navigator.clipboard.writeText(selectedText).catch(err => console.error('Clipboard write failed:', err));
  };

  const handlePaste = () => {
    if (!editorRef.current) return;
    const position = editorRef.current.getPosition();
    if (!position) return;

    navigator.clipboard.readText().then(text => {
      if (!text || !editorRef.current) return;
      const editor = editorRef.current;
      const model = editor.getModel();
      if (!model) return;
      const startOffset = model.getOffsetAt(position);
      editor.pushUndoStop();
      editor.executeEdits('paste', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: text
      }]);
      editor.pushUndoStop();
      editor.setPosition(model.getPositionAt(startOffset + text.length));
      editor.focus();
    }).catch(err => console.error('Clipboard read failed:', err));
  };

  const handleSelectAll = () => {
    if (!editorRef.current) return;
    editorRef.current.setSelection(editorRef.current.getModel()?.getFullModelRange() || new monaco.Range(1, 1, 1, 1));
  };

  // Format code handler
  const handleFormat = () => {
    if (!editorRef.current || !activeFile) return;

    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;

    console.log('Attempting to format document...');

    // Get the format action and run it
    const action = editor.getAction('editor.action.formatDocument');
    if (action) {
      console.log('Running format action...');
      action.run().then(() => {
        console.log('Format action completed');
      }).catch((err: any) => {
        console.error('Format action error:', err);
      });
    } else {
      console.log('No format action found - language formatter may not be registered');
    }
  };

  // Compare with remote handler
  const handleCompareWithRemote = async () => {
    console.log('handleCompareWithRemote called', { activeFile });
    if (!activeFile) {
      console.log('No activeFile, returning early');
      return;
    }
    if (!activeFile.uri) {
      console.log('No activeFile.uri, returning early');
      return;
    }

    const addEntry = useOutputLogStore.getState().addEntry;
    const addDiff = useOutputLogStore.getState().addDiff;

    console.log('Adding fetch entry to log');
    addEntry({
      level: 'info',
      message: `Fetching remote version: ${activeFile.name}...`,
      source: 'Editor'
    });

    try {
      const enterpriseService = getEnterpriseService();
      console.log('Calling getItemCode with URI:', activeFile.uri);
      const remoteCode = await enterpriseService.getItemCode(activeFile.uri);
      console.log('Got remoteCode, length:', remoteCode?.length, 'local content length:', activeFile.content?.length);

      if (remoteCode !== activeFile.content) {
        console.log('Differences found, adding diff');
        addEntry({
          level: 'warning',
          message: `Differences found between local and remote versions`,
          source: 'Editor'
        });

        // Show side-by-side diff
        addDiff(
          `Comparing ${activeFile.name}`,
          {
            fileName: activeFile.name,
            remoteContent: remoteCode,
            localContent: activeFile.content
          }
        );
      } else {
        console.log('No differences');
        addEntry({
          level: 'success',
          message: `No differences - file is up to date`,
          source: 'Editor'
        });
      }
    } catch (err) {
      console.error('Error in handleCompareWithRemote:', err);
      addEntry({
        level: 'error',
        message: `Failed to fetch remote version: ${err instanceof Error ? err.message : String(err)}`,
        source: 'Editor'
      });
    }
  };

  const handleReferenceForAi = () => {
    if (!activeFile) return;
    const selection = editorRef.current?.getSelection();
    const selectedContent = selection && !selection.isEmpty()
      ? editorRef.current?.getModel()?.getValueInRange(selection)
      : '';
    const isSelection = !!selectedContent;
    addAiContext({
      id: isSelection ? `${activeFile.uri}#selection` : activeFile.uri,
      name: isSelection ? `${activeFile.name} (selection)` : activeFile.name,
      uri: activeFile.uri,
      type: activeFile.type,
      language: activeFile.language,
      content: selectedContent || activeFile.content,
      source: 'editor'
    });
    window.dispatchEvent(new CustomEvent('ai:show'));
  };

  // Check Out handler
  const handleCheckOut = async () => {
    if (!activeFile) return;

    const addEntry = useOutputLogStore.getState().addEntry;

    addEntry({
      level: 'info',
      message: `Checking out: ${activeFile.name}...`,
      source: 'Editor'
    });

    try {
      const result = await checkoutItemWithGate({ source: 'editor', action: 'checkout', uri: activeFile.uri, language: activeFile.language, approved: true });

      if (result.success) {
        addEntry({
          level: 'success',
          message: `Checked out: ${activeFile.name}`,
          source: 'Editor'
        });
        triggerCheckedOutRefresh();
      } else {
        addEntry({
          level: 'error',
          message: `Check out failed: ${result.message}`,
          source: 'Editor'
        });
      }
    } catch (err) {
      addEntry({
        level: 'error',
        message: `Check out error: ${err instanceof Error ? err.message : String(err)}`,
        source: 'Editor'
      });
    }
  };

  // Check In handler
  const handleCheckIn = async () => {
    if (!activeFile) return;

    const addEntry = useOutputLogStore.getState().addEntry;

    addEntry({
      level: 'info',
      message: `Checking in: ${activeFile.name}...`,
      source: 'Editor'
    });

    try {
      const result = await checkInItemWithGate({ source: 'editor', action: 'checkin', uri: activeFile.uri, language: activeFile.language, approved: true });

      if (result.success) {
        addEntry({
          level: 'success',
          message: `Checked in: ${activeFile.name}`,
          source: 'Editor'
        });
        triggerCheckedOutRefresh();
      } else {
        addEntry({
          level: 'error',
          message: `Check in failed: ${result.message}`,
          source: 'Editor'
        });
      }
    } catch (err) {
      addEntry({
        level: 'error',
        message: `Check in error: ${err instanceof Error ? err.message : String(err)}`,
        source: 'Editor'
      });
    }
  };

  // Undo Check Out handler
  const handleUndoCheckOut = async () => {
    if (!activeFile) return;

    const addEntry = useOutputLogStore.getState().addEntry;

    addEntry({
      level: 'info',
      message: `Undoing check out: ${activeFile.name}...`,
      source: 'Editor'
    });

    try {
      const success = await undoCheckoutWithGate({ source: 'editor', action: 'undo-checkout', uri: activeFile.uri, language: activeFile.language, approved: true });

      if (success) {
        addEntry({
          level: 'success',
          message: `Undo check out successful: ${activeFile.name}`,
          source: 'Editor'
        });
        // Close the file as it's no longer checked out (skip prompt since this is explicit action)
        handleCloseFile(activeFile.uri, true);
        triggerCheckedOutRefresh();
      } else {
        addEntry({
          level: 'error',
          message: `Undo check out failed`,
          source: 'Editor'
        });
      }
    } catch (err) {
      addEntry({
        level: 'error',
        message: `Undo check out error: ${err instanceof Error ? err.message : String(err)}`,
        source: 'Editor'
      });
    }
  };

  const handleFormPreview = async (mode: FormPreviewMode) => {
    if (!activeFile) return;

    // Check if this is an HTML Form file
    const isHTMLForm = activeFile.type === 'HTMLFORMXML' || activeFile.type === 'HTMLFORMCODE';

    const addEntry = useOutputLogStore.getState().addEntry;

    if (!isHTMLForm) {
      addEntry({
        level: 'warning',
        message: 'Form preview is only available for HTML Form files',
        source: 'Editor'
      });
      return;
    }

    addEntry({
      level: 'info',
      message: `Opening ${mode} preview for: ${activeFile.name}...`,
      source: 'Editor'
    });

    try {
      const enterpriseService = getEnterpriseService();
      const embeddedGuid = activeFile.type === 'HTMLFORMXML'
        ? activeFile.content.match(/<Guid>\s*([^<]+?)\s*<\/Guid>/i)?.[1]?.trim()
        : undefined;
      // Checked-out/tree GUIDs identify the SCM item and are not guaranteed to be
      // the FormId consumed by starthtml.lims. The root Form XML GUID is the
      // authoritative runtime identifier whenever it is available.
      const runtimeFormGuid = embeddedGuid || activeFile.guid;
      const config = await enterpriseService.getHTMLFormPreviewConfig(
        activeFile.uri,
        runtimeFormGuid,
        mode,
        activeFile.language,
        activeFile.type === 'HTMLFORMXML' ? activeFile.content : undefined
      );
      if (config) {
        openFormPreviewEditor(config);
        addEntry({
          level: 'success',
          message: `${activeFile.name} opened in the integrated ${mode} preview`,
          source: 'Editor'
        });
      } else {
        addEntry({
          level: 'error',
          message: 'Could not create the form preview. Check the connection and form GUID.',
          source: 'Editor'
        });
      }
    } catch (err) {
      addEntry({
        level: 'error',
        message: `Preview error: ${err instanceof Error ? err.message : String(err)}`,
        source: 'Editor'
      });
    }
  };

  const handlePreviewForm = () => handleFormPreview('run');
  const handleDebugForm = () => handleFormPreview('debug');
  const handleDesignForm = () => handleFormPreview('design');

  // GoTo navigation handlers
  const handleGoTo = async (type: 'auto' | 'server' | 'client' | 'datasource' | 'form') => {
    if (!activeFile) return;

    const addEntry = useOutputLogStore.getState().addEntry;
    const content = activeFile.content;
    const position = cursorPosition;

    // Get the current line
    const lines = content.split('\n');
    const lineIndex = content.substring(0, position).split('\n').length - 1;
    const currentLine = lines[lineIndex] || '';

    let result: { success: boolean; message?: string } = { success: false };

    switch (type) {
      case 'auto':
        result = await goToItem(content, currentLine, position);
        break;
      case 'server': {
        const serverName = parseScriptNameFromLine(currentLine, 'server');
        if (serverName) result = await goToServerScript(serverName);
        break;
      }
      case 'client': {
        const clientName = parseScriptNameFromLine(currentLine, 'client');
        if (clientName) result = await goToClientScript(clientName);
        break;
      }
      case 'datasource': {
        const dsName = parseScriptNameFromLine(currentLine, 'datasource');
        if (dsName) result = await goToDataSource(dsName);
        break;
      }
      case 'form': {
        const formName = parseScriptNameFromLine(currentLine, 'form');
        if (formName) result = await goToForm(formName);
        break;
      }
    }

    if (result.success) {
      addEntry({
        level: 'success',
        message: `Navigated to: ${result.message || 'item'}`,
        source: 'GoTo'
      });
    } else {
      addEntry({
        level: 'warning',
        message: result.message || 'Could not find item to navigate to',
        source: 'GoTo'
      });
    }

    setContextMenu(null);
  };

  // Trigger global search in the enterprise tree
  const triggerGlobalSearch = () => {
    window.dispatchEvent(new CustomEvent('trigger-global-search'));
  };

  // Run script handler
  const handleRunScript = async () => {
    if (!activeFile) return;

    const addEntry = useOutputLogStore.getState().addEntry;

    // Save if dirty first
    if (activeFile.isDirty) {
      try {
        const saved = (await saveItemWithGate({ source: 'editor', action: 'save', uri: activeFile.uri, language: activeFile.language, type: activeFile.type, code: activeFile.content, expectedRemoteContent: activeFile.baselineContent, approved: true })).saved;
        if (saved) {
          editorStore.getState().markFileAsSaved(activeFile.uri);
        }
      } catch (err) {
        addEntry({
          level: 'error',
          message: `Failed to save before running: ${err instanceof Error ? err.message : String(err)}`,
          source: 'Editor'
        });
        return;
      }
    }

    addEntry({
      level: 'script',
      message: `Running script: ${activeFile.name}...`,
      source: 'Editor'
    });

    try {
      const enterpriseService = getEnterpriseService();

      // Get log length before running script
      let logBeforeLength = 0;
      try {
        const logBefore = await enterpriseService.getServerLog();
        logBeforeLength = logBefore.length;
      } catch (e) {
        console.log('Could not fetch initial log:', e);
      }

      // Check if this is a DataSource (SQL) file
      const isDataSource = activeFile.type === 'DS' || activeFile.type === 'APPDS' || activeFile.type === 'DataSourceScript' || activeFile.type === 'AppDataSourceScript';

      let result;
      if (isDataSource) {
        // Data sources are stored STARLIMS items. Execute them by URI through
        // RunScript, just like the enterprise tree and MCP tool do. Sending the
        // editor text to ExecuteQuery bypasses STARLIMS data-source semantics
        // and fails on servers where the optional ExecuteQuery API is absent.
        addEntry({
          level: 'info',
          message: `Executing data source: ${activeFile.name}...`,
          source: 'Editor'
        });

        result = await executeDataSourceWithGate({ source: 'editor', action: 'execute-data-source', uri: activeFile.uri, language: activeFile.language, approved: true });

        if (result.success) {
          addEntry({
            level: 'success',
            message: `Data source executed successfully: ${result.rowCount} row${result.rowCount === 1 ? '' : 's'}${typeof result.executionTime === 'number' ? ` (${result.executionTime}ms)` : ''}`,
            source: 'Editor'
          });

          useOutputLogStore.getState().addQueryResult(`Results for: ${activeFile.name}`, {
            columns: result.columns,
            rows: result.rows,
            rowCount: result.rowCount
          });
        } else {
          addEntry({
            level: 'error',
            message: `Data source execution failed: ${result.error || 'Unknown error'}`,
            source: 'Editor'
          });
        }
      } else {
        // Run the script
        result = await executeServerScriptWithGate({ source: 'editor', action: 'execute-script', uri: activeFile.uri, language: activeFile.language, approved: true });

        // Wait for script to complete and logs to be written
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get new log entries after running script
        let newLogs = '';
        try {
          const logAfter = await enterpriseService.getServerLog();
          newLogs = logAfter.substring(logBeforeLength);
        } catch (e) {
          console.log('Could not fetch log after:', e);
        }

        // Check if there are errors in the logs
        const hasError = newLogs.includes('ERROR:') || newLogs.includes('Error:');

        if (result && result.success && !hasError) {
          addEntry({
            level: 'success',
            message: `Script executed successfully`,
            source: 'Editor'
          });

          // Display script output if available
          if (result.output) {
            addEntry({
              level: 'info',
              message: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
              source: 'Editor'
            });
          }
        } else {
          // Script failed or has errors - show full log output
          addEntry({
            level: 'error',
            message: `Script execution failed`,
            source: 'Editor'
          });

          // Show detailed error from logs
          if (newLogs.trim()) {
            addEntry({
              level: 'error',
              message: newLogs.trim(),
              source: 'ServerLog'
            });
          } else if (result?.error) {
            addEntry({
              level: 'error',
              message: result.error,
              source: 'Editor'
            });
          }
        }
      }
    } catch (err) {
      addEntry({
        level: 'error',
        message: `Error running script: ${err instanceof Error ? err.message : String(err)}`,
        source: 'Editor'
      });
    }
  };

  useEffect(() => {
    const run = () => void handleRunScript();
    window.addEventListener('editor:run', run);
    return () => window.removeEventListener('editor:run', run);
  }, [activeFile]);

  // Cross-platform shortcuts use Command on macOS and Control elsewhere.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Support both Ctrl+S and Cmd+S on every desktop platform. Monaco's
      // CtrlCmd binding covers the native shortcut; this also supports users
      // who press the literal Control key on macOS.
      if (hasPrimaryModifier(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveEditorFileWithFeedback(editorStore.getState().activeFileUri);
        return;
      }
      // F11 - GoTo navigation
      if (e.key === 'F11' && activeFile) {
        e.preventDefault();
        handleGoTo('auto');
      }
      // F5 - Run script
      if (e.key === 'F5') {
        e.preventDefault();
        handleRunScript();
      }
      // Cmd/Ctrl+Shift+F - Global code search
      if (hasPrimaryModifier(e) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        triggerGlobalSearch();
      }
      // Ctrl+Shift+O - Go to symbol (outline)
      if (hasPrimaryModifier(e) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (editorRef.current) {
          editorRef.current.getAction('editor.action.quickOutline')?.run();
        }
      }
      // Ctrl+G - Go to line
      if (hasPrimaryModifier(e) && !e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (editorRef.current) {
          editorRef.current.getAction('editor.action.gotoLine')?.run();
        }
      }
      // Ctrl+F2 - Select all occurrences
      if (hasPrimaryModifier(e) && e.key === 'F2') {
        e.preventDefault();
        if (editorRef.current) {
          editorRef.current.getAction('editor.action.selectHighlights')?.run();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, cursorPosition]);

  // Get icon for file type
  const getFileIcon = (fileType: string): string => {
    switch (fileType) {
      case 'SS':
      case 'APPSS':
        return '🖥️';
      case 'CS':
      case 'APPCS':
        return '🖱️';
      case 'DS':
      case 'APPDS':
        return '🗃️';
      case 'HTMLFORMXML':
      case 'XFDFORMXML':
        return '🌐';
      case 'HTMLFORMCODE':
      case 'XFDFORMCODE':
        return 'JS';
      case 'HTMLFORMGUIDE':
        return '{}';
      case 'HTMLFORMRESOURCES':
      case 'XFDFORMRESOURCES':
        return 'XML';
      case 'SERVERLOG':
        return '▤';
      case 'CUSTOMIZE':
        return '▦';
      case FORM_PREVIEW_TYPE:
        return '▣';
      default:
        return '📄';
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#1e1e1e] relative">
      {/* Tab bar */}
      {files.length > 0 && (
        <div className="flex h-9 items-stretch bg-[#f3f3f3] dark:bg-[#181818] border-b border-[#d4d4d4] dark:border-[#2b2b2b] overflow-x-auto">
          <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            {files.map(file => (
              <div
                key={file.uri}
                className={`editor-tab flex min-w-[180px] max-w-[360px] shrink-0 items-center gap-2 px-3 cursor-pointer border-r border-slate-300 dark:border-[#2b2b2b] ${
                  currentActiveUri === file.uri ? 'active' : ''
                }`}
                onClick={() => editorStore.getState().setActiveFile(file.uri)}
                onContextMenu={(e) => handleTabContextMenu(e, file.uri)}
                title={`${file.name}\n${file.type}\n${file.uri}`}
              >
                <span className="shrink-0 text-sm">{getFileIcon(file.type)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                  {file.name}
                  {file.isDirty && <span className="ml-1 text-blue-600 dark:text-blue-400">●</span>}
                </span>
                <button
                  className="icon-button ml-1 h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); handleCloseFile(file.uri); }}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          {/* Run Script button */}
          {activeFile && (
            (activeFile.type === 'SS' || activeFile.type === 'APPSS' || activeFile.type === 'AppServerScript' || activeFile.type === 'ServerScript') ||
            (activeFile.type === 'DS' || activeFile.type === 'APPDS' || activeFile.type === 'DataSourceScript' || activeFile.type === 'AppDataSourceScript')
          ) && (
            <button
              className="mx-2 flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-slate-300 dark:text-[#4ec9b0] dark:hover:bg-[#2a2d2e]"
              onClick={handleRunScript}
              title={t('editor.runScript')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Run
            </button>
          )}
          {/* Debug Form button - for HTML Forms */}
          {ENABLE_FORM_PREVIEW_UI && activeFile && (
            (activeFile.type === 'HTMLFORMXML' || activeFile.type === 'HTMLFORMCODE')
          ) && (
            <button
              className="mx-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-slate-300 dark:text-[#4daafc] dark:hover:bg-[#2a2d2e]"
              onClick={handlePreviewForm}
              title="Open integrated form preview"
            >
              ◉ Preview
            </button>
          )}
          {ENABLE_FORM_PREVIEW_UI && activeFile && (
            (activeFile.type === 'HTMLFORMXML' || activeFile.type === 'HTMLFORMCODE')
          ) && (
            <button
              className="mx-2 flex items-center gap-1 rounded px-2 py-1 text-xs text-orange-600 hover:bg-slate-300 dark:text-[#d7ba7d] dark:hover:bg-[#2a2d2e]"
              onClick={handleDebugForm}
              title={t('editor.debugForm')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Debug
            </button>
          )}
          {/* Design Form button - for HTML Forms */}
          {ENABLE_FORM_DESIGN_UI && activeFile && (
            (activeFile.type === 'HTMLFORMXML' || activeFile.type === 'HTMLFORMCODE')
          ) && (
            <button
              className="mx-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-purple-600 hover:bg-slate-300 dark:text-[#c586c0] dark:hover:bg-[#2a2d2e]"
              onClick={handleDesignForm}
              title={t('editor.designForm')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Design
            </button>
          )}
          {activeFile?.type !== 'CUSTOMIZE' && activeFile?.type !== FORM_PREVIEW_TYPE && <>
          {/* View Controls - Separator */}
          <div className="my-2 mx-1 border-l border-slate-400 dark:border-[#3c3c3c]" />
          {/* Font Size Controls */}
          <div className="flex items-center gap-1">
            <button
              className="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs text-slate-600 hover:bg-slate-300 dark:text-[#cccccc] dark:hover:bg-[#2a2d2e]"
              onClick={() => { editorStore.getState().decreaseFontSize(); setSettingsKey(k => k + 1); }}
              title="减小字体"
            >
              A-
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400 px-0.5">
              {editorStore.getState().editorSettings.fontSize}
            </span>
            <button
              className="flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs text-slate-600 hover:bg-slate-300 dark:text-[#cccccc] dark:hover:bg-[#2a2d2e]"
              onClick={() => { editorStore.getState().increaseFontSize(); setSettingsKey(k => k + 1); }}
              title="增大字体"
            >
              A+
            </button>
          </div>
          {/* Toggle Buttons */}
          <div className="flex items-center gap-1">
            <button
              className={`flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs ${editorStore.getState().editorSettings.showLineNumbers ? 'bg-blue-600 text-white dark:bg-[#37373d]' : 'text-slate-500 hover:bg-slate-300 dark:text-[#8b8b8b] dark:hover:bg-[#2a2d2e]'}`}
              onClick={() => { editorStore.getState().toggleLineNumbers(); setSettingsKey(k => k + 1); }}
              title="显示行号"
            >
              #
            </button>
            <button
              className={`flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs ${editorStore.getState().editorSettings.wordWrap ? 'bg-blue-600 text-white dark:bg-[#37373d]' : 'text-slate-500 hover:bg-slate-300 dark:text-[#8b8b8b] dark:hover:bg-[#2a2d2e]'}`}
              onClick={() => { editorStore.getState().toggleWordWrap(); setSettingsKey(k => k + 1); }}
              title="自动换行"
            >
              ↩
            </button>
            <button
              className={`flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs ${editorStore.getState().editorSettings.showWhitespace ? 'bg-blue-600 text-white dark:bg-[#37373d]' : 'text-slate-500 hover:bg-slate-300 dark:text-[#8b8b8b] dark:hover:bg-[#2a2d2e]'}`}
              onClick={() => { editorStore.getState().toggleWhitespace(); setSettingsKey(k => k + 1); }}
              title="显示空白"
            >
              ␣
            </button>
            <button
              className={`flex h-7 min-w-7 items-center justify-center rounded px-2 text-xs ${editorStore.getState().editorSettings.minimap ? 'bg-blue-600 text-white dark:bg-[#37373d]' : 'text-slate-500 hover:bg-slate-300 dark:text-[#8b8b8b] dark:hover:bg-[#2a2d2e]'}`}
              onClick={() => { editorStore.getState().toggleMinimap(); setSettingsKey(k => k + 1); }}
              title="小地图"
            >
              ≡
            </button>
          </div>
          </>}
        </div>
      )}

      {/* Breadcrumb Navigation */}
      {activeFile && activeFile.type !== 'CUSTOMIZE' && activeFile.type !== FORM_PREVIEW_TYPE && (
        <div className="flex h-7 items-center gap-1 overflow-x-auto border-b border-[#d4d4d4] bg-[#f3f3f3] px-3 text-xs text-slate-500 dark:border-[#2b2b2b] dark:bg-[#1e1e1e] dark:text-[#969696]">
          <span>📁</span>
          <span className="truncate">{activeFile.uri || '未分类'}</span>
          <span className="text-slate-400">/</span>
          <span className="font-medium text-slate-700 dark:text-[#cccccc]">{activeFile.name}</span>
        </div>
      )}

      {/* Diff Controls - floating in top-right of editor area */}
      {showDiffControls && (
        <div className="absolute top-2 right-4 z-50 flex items-center gap-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-300 dark:border-slate-600 px-3 py-2">
          <span className="text-sm text-slate-600 dark:text-slate-300">代码差异已显示</span>
          <button
            onClick={() => (window as any).acceptCurrentDiff()}
            className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 text-white rounded font-medium"
          >
            ✓ 确认
          </button>
          <button
            onClick={() => (window as any).rejectCurrentDiff()}
            className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded font-medium"
          >
            ✕ 取消
          </button>
        </div>
      )}

      {/* Editor content */}
      <div className="flex-1 overflow-hidden" onContextMenu={handleContextMenu}>
        {activeFile?.type === 'CUSTOMIZE' ? <CustomizePage /> : activeFile?.type === FORM_PREVIEW_TYPE ? <FormPreviewPanel key={activeFile.content} content={activeFile.content} /> : activeFile ? (
          <MonacoEditor
            key={`${currentActiveUri || 'empty'}-${settingsKey}`}
            path={activeFile.uri}
            height="100%"
            language={resolveEditorLanguage(activeFile.type, activeFile.language)}
            defaultValue={activeFile.content}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              ...editorStore.getState().editorSettings,
              minimap: { enabled: editorStore.getState().editorSettings.minimap ?? true },
              fontSize: editorStore.getState().editorSettings.fontSize ?? 14,
              fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
              lineHeight: Math.round((editorStore.getState().editorSettings.fontSize ?? 14) * 1.55),
              padding: { top: 6 },
              lineNumbers: editorStore.getState().editorSettings.showLineNumbers ? 'on' : 'off',
              renderWhitespace: editorStore.getState().editorSettings.showWhitespace ? 'selection' : 'none',
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: editorStore.getState().editorSettings.wordWrap ? 'on' : 'off',
              tabSize: 2,
              insertSpaces: true,
              snippetSuggestions: 'top',
              contextmenu: false, // Disable default Monaco context menu
              // Code folding
              folding: true,
              showFoldingControls: 'always',
              foldingHighlight: true,
              foldingStrategy: 'auto',
              // Bracket matching
              bracketPairColorization: { enabled: true },
              matchBrackets: 'always',
              // Hover and parameter hints
              hover: { enabled: 'on' },
              parameterHints: { enabled: true },
              // Multi-cursor and selection
              multiCursorModifier: 'alt',
              occurrencesHighlight: 'singleFile',
              selectionHighlight: true,
              // Find/Replace
              find: {
                seedSearchStringFromSelection: 'always',
                autoFindInSelection: 'never',
              },
              // Links
              links: true,
              // Quick navigation
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: 'on',
              tabCompletion: 'on',
              wordBasedSuggestions: 'currentDocument',
              // Error/warning markers
              renderValidationDecorations: 'on',
              // Scrollbar
              scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
              },
            }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-white dark:bg-[#1e1e1e] text-slate-500 dark:text-[#858585]">
            <svg className="w-16 h-16 mb-4 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg mb-2">{t('editor.noFile')}</p>
            <p className="text-sm">{t('editor.noFileHint')}</p>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && activeFile && (
        <div
          className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-xl py-1 min-w-[270px]"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 290), top: Math.min(contextMenu.y, window.innerHeight - 250) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { void saveEditorFileWithFeedback(activeFile.uri); setContextMenu(null); }}
          >
            <span>💾</span>
            <span className="flex-1">{t('common.save')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('CtrlOrCmd+S')}</kbd>
          </button>
          <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
          {/* 编辑功能 - Cut/Copy/Paste */}
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { handleCut(); setContextMenu(null); }}
          >
            <span>✂️</span>
            <span className="flex-1">{t('context.cut')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('CtrlOrCmd+X')}</kbd>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { handleCopy(); setContextMenu(null); }}
          >
            <span>📋</span>
            <span className="flex-1">{t('context.copy')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('CtrlOrCmd+C')}</kbd>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { handlePaste(); setContextMenu(null); }}
          >
            <span>📝</span>
            <span className="flex-1">{t('context.paste')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('CtrlOrCmd+V')}</kbd>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { handleSelectAll(); setContextMenu(null); }}
          >
            <span>☑️</span>
            <span className="flex-1">{t('common.selectAll')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('CtrlOrCmd+A')}</kbd>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { handleFormat(); setContextMenu(null); }}
          >
            <span>✨</span>
            <span className="flex-1">{t('context.format')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('Shift+Alt+F')}</kbd>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => {
              if (editorRef.current) {
                editorRef.current.getAction('editor.action.commentLine')?.run();
              }
              setContextMenu(null);
            }}
          >
            <span>💬</span>
            <span className="flex-1">{t('context.toggleComment')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('CtrlOrCmd+/')}</kbd>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => {
              if (editorRef.current) {
                editorRef.current.getAction('editor.action.selectHighlights')?.run();
              }
              setContextMenu(null);
            }}
          >
            <span>🔍</span>
            <span className="flex-1">{t('context.selectMatches')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('CtrlOrCmd+F2')}</kbd>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => {
              if (editorRef.current) {
                editorRef.current.getAction('editor.action.gotoLine')?.run();
              }
              setContextMenu(null);
            }}
          >
            <span>📍</span>
            <span className="flex-1">{t('context.goToLine')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('CtrlOrCmd+G')}</kbd>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => {
              if (editorRef.current) {
                editorRef.current.getAction('editor.action.quickOutline')?.run();
              }
              setContextMenu(null);
            }}
          >
            <span>📑</span>
            <span className="flex-1">{t('context.goToOutline')}</span>
            <kbd className="text-xs text-slate-400">{shortcut('CtrlOrCmd+Shift+O')}</kbd>
          </button>
          <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
          <button
            className="w-full px-3 py-2 text-left text-sm text-blue-600 dark:text-[#4daafc] hover:bg-slate-100 dark:hover:bg-[#2a2d2e] flex items-center gap-2"
            onClick={() => { handleReferenceForAi(); setContextMenu(null); }}
          >
            <span className="font-mono font-bold">@</span>
            <span>{t('context.referenceAi')}</span>
          </button>
          <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { handleCompareWithRemote(); setContextMenu(null); }}
          >
            <span>🔄</span>
            <span>{t('context.compareRemote')}</span>
          </button>
          <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
          {(activeFile.type === 'SS' || activeFile.type === 'APPSS' || activeFile.type === 'AppServerScript' || activeFile.type === 'ServerScript') && (
            <>
              <button
                className="w-full px-3 py-2 text-left text-sm text-green-600 dark:text-green-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                onClick={() => { handleRunScript(); setContextMenu(null); }}
              >
                <span>▶️</span>
                <span>{t('context.runScript')}</span>
              </button>
              <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
            </>
          )}
          {/* Debug Form - for HTML Forms */}
          {ENABLE_FORM_PREVIEW_UI && (activeFile.type === 'HTMLFORMXML' || activeFile.type === 'HTMLFORMCODE') && (
            <>
              <button
                className="w-full px-3 py-2 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                onClick={() => { handlePreviewForm(); setContextMenu(null); }}
              >
                <span>◉</span>
                <span>Form Preview</span>
              </button>
              <button
                className="w-full px-3 py-2 text-left text-sm text-orange-600 dark:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                onClick={() => { handleDebugForm(); setContextMenu(null); }}
              >
                <span>🐛</span>
                <span>{t('editor.debugForm')}</span>
              </button>
              {ENABLE_FORM_DESIGN_UI && <button
                className="w-full px-3 py-2 text-left text-sm text-purple-600 dark:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                onClick={() => { handleDesignForm(); setContextMenu(null); }}
              >
                <span>🎨</span>
                <span>{t('editor.designForm')}</span>
              </button>}
              <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
            </>
          )}
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => handleGoTo('auto')}
          >
            <span>🔍</span>
            <span>{t('context.goToItem')}</span>
          </button>
          <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => handleGoTo('server')}
          >
            <span>🖥️</span>
            <span>{t('context.goToServerScript')}</span>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => handleGoTo('client')}
          >
            <span>🖱️</span>
            <span>{t('context.goToClientScript')}</span>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => handleGoTo('datasource')}
          >
            <span>🗃️</span>
            <span>{t('context.goToDataSource')}</span>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => handleGoTo('form')}
          >
            <span>🌐</span>
            <span>{t('context.goToForm')}</span>
          </button>
          <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
          <button
            className="w-full px-3 py-2 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { handleCheckOut(); setContextMenu(null); }}
          >
            <span>📤</span>
            <span>{t('context.checkOut')}</span>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-green-600 dark:text-green-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { handleCheckIn(); setContextMenu(null); }}
          >
            <span>📥</span>
            <span>{t('context.checkIn')}</span>
          </button>
          <button
            className="w-full px-3 py-2 text-left text-sm text-yellow-600 dark:text-yellow-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={() => { handleUndoCheckOut(); setContextMenu(null); }}
          >
            <span>↩️</span>
            <span>{t('context.undoCheckOut')}</span>
          </button>
          <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={() => setContextMenu(null)}
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      {/* Click outside to close context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        />
      )}

      {/* Tab Context Menu */}
      {tabContextMenu && (
        <>
          <div
            className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: Math.min(tabContextMenu.x, window.innerWidth - 180), top: Math.min(tabContextMenu.y, window.innerHeight - 200) }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              onClick={() => { handleCloseFile(tabContextMenu.fileUri); setTabContextMenu(null); }}
            >
              <span>✕</span>
              <span>{t('common.close')}</span>
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              onClick={() => { handleCloseOthers(tabContextMenu.fileUri); setTabContextMenu(null); }}
            >
              <span>✕</span>
              <span>{t('context.closeOthers')}</span>
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              onClick={() => { handleCloseSaved(); setTabContextMenu(null); }}
            >
              <span>✓</span>
              <span>{t('context.closeSaved')}</span>
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              onClick={() => { handleCloseAll(); setTabContextMenu(null); }}
            >
              <span>✕</span>
              <span>{t('context.closeAll')}</span>
            </button>
          </div>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setTabContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setTabContextMenu(null); }}
          />
        </>
      )}

      {/* Close Confirmation Modal */}
      {closeModal.isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center"
            onClick={() => closeModal.onCancel()}
          >
            <div
              className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-slate-300 dark:border-slate-600 w-96 max-w-[90vw] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">关闭文件</h3>
              </div>

              {/* Content */}
              <div className="px-4 py-4">
                <p className="text-slate-700 dark:text-slate-300 mb-2">
                  文件 <span className="text-slate-900 dark:text-white font-medium">"{closeModal.fileName}"</span> 有未保存的更改
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-sm">请选择要执行的操作：</p>
              </div>

              {/* Actions */}
              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex flex-col gap-2">
                <button
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  onClick={() => closeModal.onSave()}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  保存并关闭
                </button>
                <button
                  className="w-full px-4 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  onClick={() => closeModal.onDiscard()}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  不保存直接关闭
                </button>
                <button
                  className="w-full px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors"
                  onClick={() => closeModal.onCancel()}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
