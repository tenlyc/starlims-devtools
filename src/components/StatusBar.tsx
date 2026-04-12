import { useState, useEffect } from 'react';
import { useServerStore } from '../stores/serverStore';
import { useThemeStore, Theme } from '../stores/themeStore';

interface StatusBarProps {
  onToggleSidebar: () => void;
  onToggleAI: () => void;
  onToggleOutput: () => void;
  onOpenSCMPackage: () => void;
}

export function StatusBar({ onToggleSidebar, onToggleAI, onToggleOutput, onOpenSCMPackage }: StatusBarProps) {
  const { currentServer, isConnected, isConnecting } = useServerStore();
  const { theme, resolvedTheme, setTheme } = useThemeStore();
  const [gitBranch, setGitBranch] = useState<string>('');
  const [gitHasChanges, setGitHasChanges] = useState(false);
  const [gitIsRepo, setGitIsRepo] = useState(false);

  const cycleTheme = () => {
    const themes: Theme[] = ['dark', 'light', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const getThemeIcon = () => {
    if (theme === 'system') return '💻';
    if (resolvedTheme === 'dark') return '🌙';
    return '☀️';
  };

  // Git status check
  useEffect(() => {
    const checkGitStatus = async () => {
      // Use a default workspace path - in a full implementation, this would be configurable
      const workspacePath = localStorage.getItem('gitWorkspacePath') || '';
      if (!workspacePath) {
        setGitIsRepo(false);
        return;
      }

      try {
        // Check if electronAPI is available (we're in Electron)
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
          const api = (window as any).electronAPI;
          const isAvailable = await api.gitIsAvailable();
          if (!isAvailable) {
            setGitIsRepo(false);
            return;
          }

          const isRepo = await api.gitIsRepository(workspacePath);
          setGitIsRepo(isRepo);

          if (isRepo) {
            const branch = await api.gitGetBranch(workspacePath);
            const hasChanges = await api.gitHasChanges(workspacePath);
            setGitBranch(branch);
            setGitHasChanges(hasChanges);
          }
        } else {
          // Not in Electron, hide git status
          setGitIsRepo(false);
        }
      } catch {
        setGitIsRepo(false);
      }
    };

    checkGitStatus();
    // Check every 30 seconds
    const interval = setInterval(checkGitStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="status-bar flex items-center justify-between text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 border-t border-slate-300 dark:border-slate-700">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-500'}`} />
          <span className="text-xs">
            {isConnecting ? 'Connecting...' : isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Server info */}
        {currentServer && (
          <>
            <span className="text-slate-400 dark:text-slate-600">|</span>
            <span className="text-xs" title={currentServer.url}>
              {currentServer.name}
            </span>
          </>
        )}

        {/* User info */}
        {currentServer?.user && (
          <>
            <span className="text-slate-400 dark:text-slate-600">|</span>
            <span className="text-xs">{currentServer.user}</span>
          </>
        )}

        {/* Git status */}
        {gitIsRepo && (
          <>
            <span className="text-slate-400 dark:text-slate-600">|</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-green-600 dark:text-green-400">⎇ {gitBranch}</span>
              {gitHasChanges && (
                <span className="w-2 h-2 rounded-full bg-yellow-500" title="Uncommitted changes" />
              )}
            </div>
          </>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Panel toggles */}
        <button
          className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          onClick={onToggleSidebar}
          title="Toggle Sidebar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>

        <button
          className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          onClick={onToggleAI}
          title="Toggle AI Panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </button>

        <button
          className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          onClick={onToggleOutput}
          title="Toggle Output Panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </button>

        <button
          className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          onClick={() => alert('⚠️ Source Control Manager - Package Manager 功能正在开发中，敬请期待。')}
          title="Source Control Manager - Package Manager (未实现)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>

        <span className="text-slate-400 dark:text-slate-600">|</span>

        {/* Theme toggle */}
        <button
          className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          onClick={cycleTheme}
          title={`Theme: ${theme} (${resolvedTheme})`}
        >
          <span className="text-sm">{getThemeIcon()}</span>
        </button>

        <span className="text-slate-400 dark:text-slate-600">|</span>

        {/* Version */}
        <span className="text-xs text-slate-500 dark:text-slate-500">v1.0.0</span>
      </div>
    </div>
  );
}
