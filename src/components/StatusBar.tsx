import { useState, useEffect } from 'react';
import { useServerStore } from '../stores/serverStore';
import { useThemeStore, Theme } from '../stores/themeStore';
import { useI18n } from '../i18n';

export function StatusBar() {
  const { currentServer, isConnected, isConnecting, disconnect } = useServerStore();
  const { theme, resolvedTheme, setTheme } = useThemeStore();
  const { language, toggleLanguage, t } = useI18n();
  const [gitBranch, setGitBranch] = useState<string>('');
  const [gitHasChanges, setGitHasChanges] = useState(false);
  const [gitIsRepo, setGitIsRepo] = useState(false);
  const [appVersion, setAppVersion] = useState('');

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
    window.electronAPI?.getAppVersion().then(setAppVersion).catch(() => undefined);
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
    <div className="status-bar flex items-center justify-between text-slate-700 dark:text-[#bdbdbd] bg-[#f3f3f3] dark:bg-[#181818] border-t border-[#d4d4d4] dark:border-[#2b2b2b]">
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-500'}`} />
          <span className="text-xs">
            {isConnecting ? t('status.connecting') : isConnected ? t('status.connected') : t('status.disconnected')}
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

        {isConnected && (
          <>
            <span className="text-slate-400 dark:text-slate-600">|</span>
            <button
              type="button"
              onClick={disconnect}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-300 hover:text-red-700 dark:text-[#bdbdbd] dark:hover:bg-[#303030] dark:hover:text-red-400"
              title={t('status.logoutHint')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t('status.logout')}</span>
            </button>
          </>
        )}

        {/* Git status */}
        {gitIsRepo && (
          <>
            <span className="text-slate-400 dark:text-slate-600">|</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-green-600 dark:text-green-400">⎇ {gitBranch}</span>
              {gitHasChanges && (
                <span className="w-2 h-2 rounded-full bg-yellow-500" title={t('status.uncommitted')} />
              )}
            </div>
          </>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Language toggle */}
        <button
          className="px-1.5 py-0.5 text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          onClick={toggleLanguage}
          title={t('common.language')}
        >
          {language === 'zh' ? 'EN' : '中文'}
        </button>

        <span className="text-slate-400 dark:text-slate-600">|</span>

        {/* Theme toggle */}
        <button
          className="icon-button h-7 w-7"
          onClick={cycleTheme}
          title={`${t('status.theme')}: ${theme} (${resolvedTheme})`}
        >
          <span className="text-sm">{getThemeIcon()}</span>
        </button>

        <span className="text-slate-400 dark:text-slate-600">|</span>

        {/* Version */}
        {appVersion && <span className="text-xs text-slate-500 dark:text-[#777]">v{appVersion}</span>}
      </div>
    </div>
  );
}
