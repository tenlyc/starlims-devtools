import { useState, useEffect, useCallback, MouseEvent as ReactMouseEvent } from 'react';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { EditorPanel } from '../components/Editor/EditorPanel';
import { OutputPanel } from '../components/Output/OutputPanel';
import { MCPPanel } from '../components/MCP/MCPPanel';
import { McpRequestBridge } from '../components/MCP/McpRequestBridge';
import { ServerSelector } from '../components/ServerSelector/ServerSelector';
import { StatusBar } from '../components/StatusBar';
import { ParticleBackground } from '../components/ParticleBackground';
import { SCMPackageDialog } from '../components/SCM/SCMPackageDialog';
import { useServerStore } from '../stores/serverStore';
import { useThemeStore } from '../stores/themeStore';
import { editorStore } from '../stores/editorStore';
import { getEnterpriseService } from '../services/enterpriseService';

export default function App() {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mcpPanelVisible, setMcpPanelVisible] = useState(true);
  const [outputVisible, setOutputVisible] = useState(false);
  const [showSCMPackage, setShowSCMPackage] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [mcpPanelWidth, setMcpPanelWidth] = useState(390);
  const [outputHeight, setOutputHeight] = useState(180);

  const { currentServer, isConnected, connect, disconnect } = useServerStore();
  const { initTheme, resolvedTheme } = useThemeStore();

  // Initialize theme on mount
  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    const showAgent = () => setMcpPanelVisible(true);
    window.addEventListener('ai:show', showAgent);
    return () => window.removeEventListener('ai:show', showAgent);
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

  // Handle MCP panel resize
  const handleMcpPanelResize = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.nativeEvent.clientX;
    const startWidth = mcpPanelWidth;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(250, Math.min(600, startWidth + delta));
      setMcpPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [mcpPanelWidth]);

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
    <div className="h-full w-full flex flex-col bg-slate-100 dark:bg-[#181818]">
      <McpRequestBridge />
      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-10 flex-shrink-0 bg-slate-200 dark:bg-[#181818] border-r border-slate-300 dark:border-[#2b2b2b] flex flex-col items-center py-2 gap-1">
          <button className={`workbench-rail-button ${sidebarVisible ? 'active' : ''}`} title="Explorer" onClick={() => setSidebarVisible((value) => !value)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h6l2 2h8v14H4z" strokeWidth="1.5" /></svg>
          </button>
          <button className={`workbench-rail-button ${outputVisible ? 'active' : ''}`} title="Output" onClick={() => setOutputVisible((value) => !value)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 7 4 4-4 4m6 0h8" strokeWidth="1.5" /></svg>
          </button>
          <button className={`workbench-rail-button ${mcpPanelVisible ? 'active' : ''}`} title="AI Agent" onClick={() => setMcpPanelVisible((value) => !value)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 9h8M8 13h5M5 19l2-3h11a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1" strokeWidth="1.5" /></svg>
          </button>
          <div className="flex-1" />
          <button className="workbench-rail-button" title="SCM Package Manager" onClick={() => setShowSCMPackage(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5zM5 7.5l7 3.5 7-3.5M12 11v9" strokeWidth="1.5" /></svg>
          </button>
        </div>
        {/* Left Sidebar - Enterprise Tree and Checked Out */}
        {sidebarVisible && (
          <>
            <div style={{ width: sidebarWidth }} className="bg-slate-200 dark:bg-[#181818] border-r border-slate-300 dark:border-[#2b2b2b]">
              <Sidebar />
            </div>
            <div
              className="resize-handle w-px bg-slate-300 dark:bg-[#2b2b2b] hover:bg-blue-500 cursor-col-resize"
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
                className="h-px bg-slate-300 dark:bg-[#2b2b2b] hover:bg-blue-500 cursor-row-resize"
                onMouseDown={handleOutputResize}
              />
              <div style={{ height: outputHeight }} className="bg-slate-200 dark:bg-[#181818] border-t border-slate-300 dark:border-[#2b2b2b]">
                <OutputPanel />
              </div>
            </>
          )}
        </div>

        {/* Right - MCP integration panel */}
        {mcpPanelVisible && (
          <>
            <div
              className="w-px bg-slate-300 dark:bg-[#2b2b2b] hover:bg-blue-500 cursor-col-resize"
              onMouseDown={handleMcpPanelResize}
            />
            <div style={{ width: mcpPanelWidth }} className="bg-slate-200 dark:bg-[#181818] border-l border-slate-300 dark:border-[#2b2b2b] overflow-hidden">
              <MCPPanel />
            </div>
          </>
        )}
      </div>

      {/* Status Bar */}
      <StatusBar
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        onToggleMCP={() => setMcpPanelVisible(!mcpPanelVisible)}
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
