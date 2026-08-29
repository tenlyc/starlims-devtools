import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { hasServerLogContent, parseServerLog, ServerLogEntry, ServerLogLevel } from '../../services/serverLogParser';
import { useServerStore } from '../../stores/serverStore';
import { useI18n } from '../../i18n';

type LogFilter = 'all' | 'info' | 'warning' | 'error';

const colors: Record<ServerLogLevel, string> = {
  info: 'border-blue-500/30 text-blue-700 dark:text-[#9cdcfe]',
  warning: 'border-amber-500/40 text-amber-700 dark:text-[#d7ba7d]',
  error: 'border-red-500/40 text-red-700 dark:text-[#f48771]',
  success: 'border-emerald-500/40 text-emerald-700 dark:text-[#89d185]'
};

const icons: Record<ServerLogLevel, string> = {
  info: 'ℹ', warning: '⚠', error: '●', success: '✓'
};

export function ServerLogPanel() {
  const { t } = useI18n();
  const currentUser = useServerStore((state) => state.currentServer?.user || '');
  const [users, setUsers] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [entries, setEntries] = useState<ServerLogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingLog, setLoadingLog] = useState(false);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const prefetchedLogs = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const service = getEnterpriseService();
        const logItems = await service.getEnterpriseItems('/ServerLogs');
        if (cancelled) return;
        const candidates = [...new Set(logItems
          .filter((item) => item.type.toUpperCase() === 'SERVERLOG' || item.uri?.toLowerCase().startsWith('/serverlogs/'))
          .map((item) => item.name.replace(/\.log$/i, '').trim())
          .filter(Boolean))]
          .sort((a, b) => a.localeCompare(b));
        const availableLogs = await Promise.all(candidates.map(async (user) => {
          const content = await service.getServerLog(user);
          return { user, content };
        }));
        if (cancelled) return;
        const activeLogs = availableLogs.filter(({ content }) => hasServerLogContent(content));
        const logUsers = activeLogs.map(({ user }) => user);
        prefetchedLogs.current = new Map(activeLogs.map(({ user, content }) => [user, content]));
        setUsers(logUsers);
        setSelectedUser((previous) => {
          if (previous && logUsers.includes(previous)) return previous;
          if (currentUser && logUsers.includes(currentUser)) return currentUser;
          return logUsers[0] || '';
        });
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    };
    void loadUsers();
    return () => { cancelled = true; };
  }, [currentUser]);

  const loadLog = useCallback(async (force = false) => {
    if (!selectedUser) return;
    setLoadingLog(true);
    setError('');
    try {
      let content = force ? undefined : prefetchedLogs.current.get(selectedUser);
      if (content === undefined) content = await getEnterpriseService().getServerLog(selectedUser);
      prefetchedLogs.current.set(selectedUser, content);
      setEntries(parseServerLog(content, selectedUser));
      setLoadedAt(new Date());
    } catch (reason) {
      setEntries([]);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoadingLog(false);
    }
  }, [selectedUser]);

  useEffect(() => { void loadLog(); }, [loadLog]);

  const counts = useMemo(() => ({
    all: entries.length,
    info: entries.filter((entry) => entry.level === 'info' || entry.level === 'success').length,
    warning: entries.filter((entry) => entry.level === 'warning').length,
    error: entries.filter((entry) => entry.level === 'error').length
  }), [entries]);

  const visibleEntries = entries.filter((entry) =>
    filter === 'all' || entry.level === filter || (filter === 'info' && entry.level === 'success')
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-10 items-center gap-2 border-b border-slate-300 px-3 dark:border-[#2b2b2b]">
        <label className="text-xs text-slate-500 dark:text-[#969696]" htmlFor="server-log-user">{t('serverLog.user')}</label>
        <select
          id="server-log-user"
          value={selectedUser}
          onChange={(event) => setSelectedUser(event.target.value)}
          disabled={loadingUsers}
          className="h-7 min-w-40 rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-[#3c3c3c] dark:bg-[#252526] dark:text-[#cccccc]"
        >
          {users.map((user) => <option key={user} value={user}>{user}{user === currentUser ? ` (${t('serverLog.currentUser')})` : ''}</option>)}
        </select>

        <div className="ml-2 flex items-center gap-1">
          {(['all', 'info', 'warning', 'error'] as const).map((level) => (
            <button key={level} className={`rounded px-2 py-1 text-xs ${filter === level ? 'bg-slate-300 text-slate-900 dark:bg-[#37373d] dark:text-white' : 'text-slate-500 dark:text-[#969696]'}`} onClick={() => setFilter(level)}>
              {t(`output.${level}`)} <span className="ml-1 opacity-70">{counts[level]}</span>
            </button>
          ))}
        </div>

        <span className="ml-auto text-[11px] text-slate-400 dark:text-[#858585]">
          {loadingLog ? t('serverLog.loading') : loadedAt ? `${t('serverLog.updated')} ${loadedAt.toLocaleTimeString()}` : ''}
        </span>
        <button className="icon-button text-lg" onClick={() => void loadLog(true)} disabled={loadingLog || !selectedUser} title={t('serverLog.refresh')}>↻</button>
      </div>

      {error && <div className="border-b border-red-800 bg-red-950/30 px-3 py-1 text-xs text-red-400">{error}</div>}

      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {visibleEntries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-500 dark:text-[#858585]">{loadingLog ? t('serverLog.loading') : t('serverLog.empty')}</div>
        ) : visibleEntries.map((entry) => (
          <div key={entry.id} className={`mb-1 flex gap-2 border-l-2 px-2 py-1.5 hover:bg-slate-200 dark:hover:bg-[#2a2d2e] ${colors[entry.level]}`}>
            <span className="w-4 shrink-0 text-center">{icons[entry.level]}</span>
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs leading-5">{entry.message}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
