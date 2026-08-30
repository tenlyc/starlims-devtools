import { useState, useEffect, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { EditorPanel } from '../components/Editor/EditorPanel';
import { BottomPanel } from '../components/Output/BottomPanel';
import { MCPPanel } from '../components/MCP/MCPPanel';
import { McpRequestBridge } from '../components/MCP/McpRequestBridge';
import { ServerSelector } from '../components/ServerSelector/ServerSelector';
import { StatusBar } from '../components/StatusBar';
import { AppBrandIcon } from '../components/AppBrandIcon';
import { ParticleBackground } from '../components/ParticleBackground';
import { SourceControlPanel } from '../components/SCM/SourceControlPanel';
import { useServerStore } from '../stores/serverStore';
import { useThemeStore } from '../stores/themeStore';
import { editorStore } from '../stores/editorStore';
import { useDiagnosticStore } from '../services/diagnosticStore';
import { syncCheckedOutWorkspace } from '../services/agentWorkspaceService';
import { useI18n } from '../i18n';
import { loadAiLayers, mergeAiLayers } from '../services/aiPlatform';
import { configureExtensionLanguages } from '../services/editorLanguage';
import { saveEditorFileWithFeedback } from '../services/editorSaveService';

type WorkbenchLayout = {
  sidebarVisible: boolean;
  agentVisible: boolean;
  outputVisible: boolean;
  sidebarWidth: number;
  agentWidth: number;
  outputHeight: number;
};

const LAYOUT_STORAGE_KEY = 'starlims-devtools.workbench-layout.v1';
const AGENT_WORKSPACE_ROOT_STORE_KEY = 'agentWorkspaceRoot.v1';
const DEFAULT_LAYOUT: WorkbenchLayout = {
  sidebarVisible: true,
  agentVisible: true,
  outputVisible: true,
  sidebarWidth: 320,
  agentWidth: 420,
  outputHeight: 300
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function loadWorkbenchLayout(): WorkbenchLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || '{}') as Partial<WorkbenchLayout>;
    return {
      sidebarVisible: typeof saved.sidebarVisible === 'boolean' ? saved.sidebarVisible : DEFAULT_LAYOUT.sidebarVisible,
      agentVisible: typeof saved.agentVisible === 'boolean' ? saved.agentVisible : DEFAULT_LAYOUT.agentVisible,
      outputVisible: typeof saved.outputVisible === 'boolean' ? saved.outputVisible : DEFAULT_LAYOUT.outputVisible,
      sidebarWidth: typeof saved.sidebarWidth === 'number' ? saved.sidebarWidth : DEFAULT_LAYOUT.sidebarWidth,
      agentWidth: typeof saved.agentWidth === 'number' ? saved.agentWidth : DEFAULT_LAYOUT.agentWidth,
      outputHeight: typeof saved.outputHeight === 'number' ? saved.outputHeight : DEFAULT_LAYOUT.outputHeight
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export default function App() {
  const { t } = useI18n();
  const [initialLayout] = useState(loadWorkbenchLayout);
  const [sidebarVisible, setSidebarVisible] = useState(initialLayout.sidebarVisible);
  const [mcpPanelVisible, setMcpPanelVisible] = useState(initialLayout.agentVisible);
  const [outputVisible, setOutputVisible] = useState(initialLayout.outputVisible);
  const [showSCMPackage, setShowSCMPackage] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(initialLayout.sidebarWidth);
  const [mcpPanelWidth, setMcpPanelWidth] = useState(initialLayout.agentWidth);
  const [outputHeight, setOutputHeight] = useState(initialLayout.outputHeight);
  const [agentWorkspaceRoot, setAgentWorkspaceRoot] = useState<string | null>(null);

  const { currentServer, isConnected, connect, disconnect } = useServerStore();
  const { initTheme } = useThemeStore();
  const diagnosticMap = useDiagnosticStore((state) => state.diagnosticsByUri);
  const openEditorFiles = editorStore((state) => state.openFiles);
  const problemCount = openEditorFiles.reduce((total, file) => total + (diagnosticMap[file.uri]?.length || 0), 0);

  // Initialize theme on mount
  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    const applyExtensionLanguages = async (layers?: Awaited<ReturnType<typeof loadAiLayers>>) => {
      const effective = mergeAiLayers(layers || await loadAiLayers());
      configureExtensionLanguages(effective.extensions.flatMap((extension) => extension.contributes?.languages || []));
    };
    void applyExtensionLanguages();
    const onLayersChanged = (event: Event) => void applyExtensionLanguages((event as CustomEvent<Awaited<ReturnType<typeof loadAiLayers>>>).detail);
    window.addEventListener('ai-layers:changed', onLayersChanged);
    return () => window.removeEventListener('ai-layers:changed', onLayersChanged);
  }, []);

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({
      sidebarVisible,
      agentVisible: mcpPanelVisible,
      outputVisible,
      sidebarWidth,
      agentWidth: mcpPanelWidth,
      outputHeight
    } satisfies WorkbenchLayout));
  }, [sidebarVisible, mcpPanelVisible, outputVisible, sidebarWidth, mcpPanelWidth, outputHeight]);

  useEffect(() => {
    if (!window.electronAPI) return;
    void window.electronAPI.storeGet(AGENT_WORKSPACE_ROOT_STORE_KEY)
      .then((value) => setAgentWorkspaceRoot(typeof value === 'string' ? value : ''))
      .catch(() => setAgentWorkspaceRoot(''));
    const onWorkspaceRootChanged = (event: Event) => {
      setAgentWorkspaceRoot(String((event as CustomEvent<string>).detail || ''));
    };
    window.addEventListener('agent-workspace:changed', onWorkspaceRootChanged);
    return () => window.removeEventListener('agent-workspace:changed', onWorkspaceRootChanged);
  }, []);

  useEffect(() => {
    if (!isConnected || !currentServer || !window.electronAPI) return;
    if (agentWorkspaceRoot === null) return;
    void window.electronAPI.agentWorkspaceConfigure({
      serverName: currentServer.name,
      serverUrl: currentServer.url,
      user: currentServer.user || '',
      rootPath: agentWorkspaceRoot || undefined
    }).then((workspace) => {
      localStorage.setItem('gitWorkspacePath', workspace.path);
      window.dispatchEvent(new CustomEvent('agent-workspace:configured', { detail: workspace }));
      void loadAiLayers().then((layers) => configureExtensionLanguages(mergeAiLayers(layers).extensions.flatMap((extension) => extension.contributes?.languages || [])));
      return syncCheckedOutWorkspace();
    }).then((result) => {
      if (result?.preservedChanges) console.info(`Preserved ${result.preservedChanges} local Agent workspace change(s).`);
    }).catch((error) => console.error('Failed to configure Agent workspace:', error));
  }, [agentWorkspaceRoot, isConnected, currentServer]);

  useEffect(() => {
    const fitLayoutToWindow = () => {
      const availableWidth = Math.max(980, window.innerWidth - 44);
      const sideBudget = Math.max(560, availableWidth - 420);
      setSidebarWidth((width) => clamp(width, 220, Math.min(520, sideBudget - (mcpPanelVisible ? 340 : 0))));
      setMcpPanelWidth((width) => clamp(width, 340, Math.min(620, sideBudget - (sidebarVisible ? 220 : 0))));
      setOutputHeight((height) => clamp(height, 180, Math.min(600, Math.max(180, window.innerHeight - 320))));
    };
    fitLayoutToWindow();
    window.addEventListener('resize', fitLayoutToWindow);
    return () => window.removeEventListener('resize', fitLayoutToWindow);
  }, [sidebarVisible, mcpPanelVisible]);

  useEffect(() => {
    const showAgent = () => setMcpPanelVisible(true);
    window.addEventListener('ai:show', showAgent);
    return () => window.removeEventListener('ai:show', showAgent);
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    const activeFile = editorStore.getState().getActiveFile();
    if (activeFile) await saveEditorFileWithFeedback(activeFile.uri);
  }, []);

  // Handle menu events from Electron
  useEffect(() => {
    const handleMenuEvent = async (event: string) => {
      switch (event) {
        case 'menu:toggleSidebar':
          setSidebarVisible(prev => !prev);
          break;
        case 'menu:toggleMCPPanel':
          setMcpPanelVisible(prev => !prev);
          break;
        case 'menu:toggleOutput':
          setOutputVisible(prev => !prev);
          break;
        case 'menu:connect':
          connect();
          break;
        case 'menu:disconnect':
          disconnect();
          break;
        case 'menu:save':
          handleSave();
          break;
        case 'menu:refresh':
          window.dispatchEvent(new CustomEvent('enterprise:refresh'));
          break;
        case 'menu:runScript':
          window.dispatchEvent(new CustomEvent('editor:run'));
          break;
        case 'menu:openSCMPackage':
          setShowSCMPackage(true);
          break;
      }
    };

    if (window.electronAPI) {
      window.electronAPI.onMenuEvent(handleMenuEvent);
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeMenuListener();
      }
    };
  }, [connect, disconnect, handleSave]);

  // Handle sidebar resize
  const handleSidebarResize = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.nativeEvent.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const reserved = 44 + 420 + (mcpPanelVisible ? mcpPanelWidth : 0);
      const newWidth = clamp(startWidth + delta, 220, Math.min(520, Math.max(220, window.innerWidth - reserved)));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth, mcpPanelVisible, mcpPanelWidth]);

  // Handle MCP panel resize
  const handleMcpPanelResize = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.nativeEvent.clientX;
    const startWidth = mcpPanelWidth;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const reserved = 44 + 420 + (sidebarVisible ? sidebarWidth : 0);
      const newWidth = clamp(startWidth + delta, 340, Math.min(620, Math.max(340, window.innerWidth - reserved)));
      setMcpPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [mcpPanelWidth, sidebarVisible, sidebarWidth]);

  // Handle output panel resize
  const handleOutputResize = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.nativeEvent.clientY;
    const startHeight = outputHeight;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const newHeight = clamp(startHeight + delta, 180, Math.min(600, Math.max(180, window.innerHeight - 320)));
      setOutputHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [outputHeight]);

  // Show server selector if not connected
  if (!currentServer || !isConnected) {
    return (<>
      <McpRequestBridge />
      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 relative overflow-hidden">
        <ParticleBackground />
        <div className="relative z-10">
          <ServerSelector onConnect={connect} />
        </div>
      </div>
    </>);
  }

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-[#181818]">
      <McpRequestBridge />
      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-10 flex-shrink-0 bg-[#f3f3f3] dark:bg-[#181818] border-r border-[#d4d4d4] dark:border-[#2b2b2b] flex flex-col items-center py-2 gap-1">
          <AppBrandIcon className="mb-1 h-7 w-7" />
          <div className="mb-1 h-px w-6 shrink-0 bg-[#d4d4d4] dark:bg-[#2b2b2b]" />
          <button
            className={`workbench-rail-button ${sidebarVisible ? 'active' : ''}`}
            title={t('app.explorer')}
            aria-label={t('app.explorer')}
            aria-pressed={sidebarVisible}
            onClick={() => setSidebarVisible((value) => !value)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h6l2 2h8v14H4z" strokeWidth="1.5" /></svg>
          </button>
          <button
            className={`workbench-rail-button relative ${outputVisible ? 'active' : ''}`}
            title={t('app.output')}
            aria-label={t('app.output')}
            aria-pressed={outputVisible}
            onClick={() => setOutputVisible((value) => !value)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 7 4 4-4 4m6 0h8" strokeWidth="1.5" /></svg>
            {problemCount > 0 && <span className="absolute bottom-0 right-0 min-w-3.5 rounded-full bg-blue-600 px-1 text-center text-[8px] leading-3.5 text-white">{problemCount > 99 ? '99+' : problemCount}</span>}
          </button>
          <button
            className={`workbench-rail-button ${mcpPanelVisible ? 'active' : ''}`}
            title={t('app.agent')}
            aria-label={t('app.agent')}
            aria-pressed={mcpPanelVisible}
            onClick={() => setMcpPanelVisible((value) => !value)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 9h8M8 13h5M5 19l2-3h11a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1" strokeWidth="1.5" /></svg>
          </button>
          <button
            className={`workbench-rail-button ${showSCMPackage ? 'active' : ''}`}
            title={t('app.scm')}
            aria-label={t('app.scm')}
            aria-pressed={showSCMPackage}
            onClick={() => setShowSCMPackage(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5zM5 7.5l7 3.5 7-3.5M12 11v9" strokeWidth="1.5" /></svg>
          </button>
        </div>
        {/* Left Sidebar - Enterprise Tree and Checked Out */}
        {sidebarVisible && (
          <>
            <div style={{ width: sidebarWidth, flexBasis: sidebarWidth }} className="min-w-0 shrink-0 overflow-hidden bg-[#f3f3f3] dark:bg-[#181818] border-r border-[#d4d4d4] dark:border-[#2b2b2b]">
              <Sidebar />
            </div>
            <div
              className="resize-handle w-1.5 shrink-0 bg-[#e5e5e5] dark:bg-[#2b2b2b] hover:bg-blue-500 cursor-col-resize"
              onMouseDown={handleSidebarResize}
              onDoubleClick={() => setSidebarWidth(DEFAULT_LAYOUT.sidebarWidth)}
            />
          </>
        )}

        {/* Center - Editor and Output */}
        <div className="flex min-w-[420px] flex-1 flex-col overflow-hidden">
          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <EditorPanel />
          </div>

          {/* Output Panel */}
          {outputVisible && (
            <>
              <div
                className="h-1.5 shrink-0 bg-[#e5e5e5] dark:bg-[#2b2b2b] hover:bg-blue-500 cursor-row-resize"
                onMouseDown={handleOutputResize}
                onDoubleClick={() => setOutputHeight(DEFAULT_LAYOUT.outputHeight)}
              />
              <div style={{ height: outputHeight, flexBasis: outputHeight }} className="min-h-0 shrink-0 overflow-hidden bg-[#f3f3f3] dark:bg-[#181818] border-t border-[#d4d4d4] dark:border-[#2b2b2b]">
                <BottomPanel onClose={() => setOutputVisible(false)} />
              </div>
            </>
          )}
        </div>

        {/* Right - MCP integration panel */}
        {mcpPanelVisible && (
          <>
            <div
              className="w-1.5 shrink-0 bg-[#e5e5e5] dark:bg-[#2b2b2b] hover:bg-blue-500 cursor-col-resize"
              onMouseDown={handleMcpPanelResize}
              onDoubleClick={() => setMcpPanelWidth(DEFAULT_LAYOUT.agentWidth)}
            />
            <div style={{ width: mcpPanelWidth, flexBasis: mcpPanelWidth }} className="min-w-0 shrink-0 bg-[#f3f3f3] dark:bg-[#181818] border-l border-[#d4d4d4] dark:border-[#2b2b2b] overflow-hidden">
              <MCPPanel />
            </div>
          </>
        )}
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Source Control Manager panel */}
      <SourceControlPanel
        isOpen={showSCMPackage}
        onClose={() => setShowSCMPackage(false)}
      />
    </div>
  );
}
