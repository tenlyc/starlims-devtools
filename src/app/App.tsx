import { useState, useEffect, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { EditorPanel } from '../components/Editor/EditorPanel';
import { OutputPanel } from '../components/Output/OutputPanel';
import { AIAssistantPanel } from '../components/AIAssistant/AIAssistantPanel';
import { ServerSelector } from '../components/ServerSelector/ServerSelector';
import { StatusBar } from '../components/StatusBar';
import { ParticleBackground } from '../components/ParticleBackground';
import { SCMPackageDialog } from '../components/SCM/SCMPackageDialog';
import { useServerStore } from '../stores/serverStore';
import { useAIStore } from '../stores/aiStore';
import { useThemeStore } from '../stores/themeStore';
import { editorStore } from '../stores/editorStore';
import { getEnterpriseService } from '../services/enterpriseService';

export default function App() {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [aiPanelVisible, setAIPanelVisible] = useState(true);
  const [outputVisible, setOutputVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showSCMPackage, setShowSCMPackage] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [aiPanelWidth, setAIPanelWidth] = useState(350);
  const [outputHeight, setOutputHeight] = useState(200);

  const { currentServer, isConnected, connect, disconnect } = useServerStore();
  const { isConfigured } = useAIStore();
  const { initTheme, resolvedTheme } = useThemeStore();

  // Initialize theme on mount
  useEffect(() => {
    initTheme();
  }, []);

  // Handle save
  const handleSave = useCallback(async () => {
    const activeFile = editorStore.getState().getActiveFile();
    if (activeFile && activeFile.isDirty) {
      try {
        const enterpriseService = getEnterpriseService();
        const success = await enterpriseService.saveItemCode(activeFile.uri, activeFile.content, activeFile.type);
        if (success) {
          editorStore.getState().markFileAsSaved(activeFile.uri);
          console.log('File saved successfully');
        } else {
          console.error('Failed to save file');
        }
      } catch (err) {
        console.error('Error saving file:', err);
      }
    }
  }, []);

  // Handle menu events from Electron
  useEffect(() => {
    const handleMenuEvent = async (event: string) => {
      switch (event) {
        case 'menu:toggleSidebar':
          setSidebarVisible(prev => !prev);
          break;
        case 'menu:toggleAIPanel':
          setAIPanelVisible(prev => !prev);
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
        case 'menu:openAISettings':
          setShowSettings(true);
          setAIPanelVisible(true);
          break;
        case 'menu:save':
          handleSave();
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
  }, [connect, disconnect]);

  // Handle sidebar resize
  const handleSidebarResize = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.nativeEvent.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(200, Math.min(500, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  // Handle AI panel resize
  const handleAIPanelResize = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.nativeEvent.clientX;
    const startWidth = aiPanelWidth;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(250, Math.min(600, startWidth + delta));
      setAIPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [aiPanelWidth]);

  // Handle output panel resize
  const handleOutputResize = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.nativeEvent.clientY;
    const startHeight = outputHeight;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const newHeight = Math.max(100, Math.min(400, startHeight + delta));
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
    return (
      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-blue-950 dark:to-indigo-950 relative overflow-hidden">
        <ParticleBackground />
        <div className="relative z-10">
          <ServerSelector onConnect={connect} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-100 dark:bg-slate-900">
      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Enterprise Tree and Checked Out */}
        {sidebarVisible && (
          <>
            <div style={{ width: sidebarWidth }} className="bg-slate-200 dark:bg-slate-800 border-r border-slate-300 dark:border-slate-700">
              <Sidebar />
            </div>
            <div
              className="resize-handle w-1 bg-slate-300 dark:bg-slate-700 hover:bg-blue-500 cursor-col-resize"
              onMouseDown={handleSidebarResize}
            />
          </>
        )}

        {/* Center - Editor and Output */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <EditorPanel />
          </div>

          {/* Output Panel */}
          {outputVisible && (
            <>
              <div
                className="h-1 bg-slate-300 dark:bg-slate-700 hover:bg-blue-500 cursor-row-resize"
                onMouseDown={handleOutputResize}
              />
              <div style={{ height: outputHeight }} className="bg-slate-200 dark:bg-slate-800 border-t border-slate-300 dark:border-slate-700">
                <OutputPanel />
              </div>
            </>
          )}
        </div>

        {/* Right - AI Assistant Panel */}
        {aiPanelVisible && (
          <>
            <div
              className="w-1 bg-slate-300 dark:bg-slate-700 hover:bg-blue-500 cursor-col-resize"
              onMouseDown={handleAIPanelResize}
            />
            <div style={{ width: aiPanelWidth }} className="bg-slate-200 dark:bg-slate-800 border-l border-slate-300 dark:border-slate-700 overflow-hidden">
              <AIAssistantPanel
                embeddedSettings={showSettings}
                onCloseSettings={() => setShowSettings(false)}
              />
            </div>
          </>
        )}
      </div>

      {/* Status Bar */}
      <StatusBar
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        onToggleAI={() => setAIPanelVisible(!aiPanelVisible)}
        onToggleOutput={() => setOutputVisible(!outputVisible)}
        onOpenSCMPackage={() => setShowSCMPackage(true)}
      />

      {/* SCM Package Manager Dialog */}
      <SCMPackageDialog
        isOpen={showSCMPackage}
        onClose={() => setShowSCMPackage(false)}
      />
    </div>
  );
}
