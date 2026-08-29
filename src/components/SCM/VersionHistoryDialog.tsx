import React, { useState, useEffect, useCallback } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { ItemHistoryEntry, ItemLabelEntry, ItemVersionCode } from '../../services/iEnterpriseService';
import { useOutputLogStore } from '../../services/outputLogStore';
import { useI18n } from '../../i18n';
import { lineDiff, DiffLine } from '../../utils/lineDiff';

interface VersionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  uri: string;
  itemName?: string;
}

interface CompareState {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
  lines: DiffLine[];
  tab: 'code' | 'xfd' | 'resources';
}

/**
 * Version History, Labels, Compare & Recover.
 *
 * Mirrors the official STARLIMS Source Control Manager main form
 * (frmSourceControlMgmt): the history grid reads LIMSSOURCECONTROL +
 * LIMSVERSIONS, labels read VERSIONSLABELS / VERSIONSLABELS_ITEMS, version
 * comparison and recovery map to the official ItemsCompare UI and
 * scRecoverOldVersion script.
 *
 * Requires the SCM_API History patch (SCM_API_History.sdp) to be imported
 * into STARLIMS so the GetItemHistory / GetItemLabels / GetItemVersionCode /
 * RecoverVersion endpoints are available.
 */
export function VersionHistoryDialog({ isOpen, onClose, uri, itemName }: VersionHistoryDialogProps) {
  const { t } = useI18n();
  const [history, setHistory] = useState<ItemHistoryEntry[]>([]);
  const [labels, setLabels] = useState<ItemLabelEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Single selection: version code viewer + recovery target
  const [selectedVersion, setSelectedVersion] = useState<ItemHistoryEntry | null>(null);
  const [versionCode, setVersionCode] = useState<ItemVersionCode | null>(null);
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [codeTab, setCodeTab] = useState<'code' | 'xfd' | 'resources'>('code');

  // Multi selection: compare targets (max 2)
  const [compareSelection, setCompareSelection] = useState<ItemHistoryEntry[]>([]);
  const [compare, setCompare] = useState<CompareState | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const [isRecovering, setIsRecovering] = useState(false);

  const addEntry = useOutputLogStore(state => state.addEntry);

  const loadHistory = useCallback(async () => {
    if (!uri) return;
    setIsLoading(true);
    setError('');
    setHistory([]);
    setLabels([]);
    setSelectedVersion(null);
    setVersionCode(null);
    setCompareSelection([]);
    setCompare(null);
    try {
      const enterpriseService = getEnterpriseService();
      const [historyRows, labelRows] = await Promise.all([
        enterpriseService.getItemHistory(uri),
        enterpriseService.getItemLabels(uri)
      ]);
      setHistory(historyRows);
      setLabels(labelRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      addEntry({ level: 'error', message: `Failed to load version history: ${message}`, source: 'SCM' });
    } finally {
      setIsLoading(false);
    }
  }, [uri, addEntry]);

  useEffect(() => {
    if (isOpen && uri) {
      loadHistory();
    }
  }, [isOpen, uri, loadHistory]);

  const handleRowSelect = async (entry: ItemHistoryEntry) => {
    setSelectedVersion(entry);
    setVersionCode(null);
    if (!entry.versionId) return;
    setIsLoadingCode(true);
    try {
      const enterpriseService = getEnterpriseService();
      const code = await enterpriseService.getItemVersionCode(entry.versionId);
      setVersionCode(code);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addEntry({ level: 'error', message: `Failed to load version code: ${message}`, source: 'SCM' });
    } finally {
      setIsLoadingCode(false);
    }
  };

  const toggleCompare = (entry: ItemHistoryEntry) => {
    setCompareSelection(prev => {
      const exists = prev.some(e => e.versionId === entry.versionId);
      if (exists) return prev.filter(e => e.versionId !== entry.versionId);
      if (prev.length >= 2) {
        addEntry({ level: 'info', message: 'Select at most two versions to compare', source: 'SCM' });
        return prev;
      }
      return [...prev, entry];
    });
  };

  const handleCompare = async () => {
    if (compareSelection.length !== 2) return;
    const [a, b] = compareSelection;
    if (!a.versionId || !b.versionId) return;
    setIsComparing(true);
    setCompare(null);
    try {
      const enterpriseService = getEnterpriseService();
      const [codeA, codeB] = await Promise.all([
        enterpriseService.getItemVersionCode(a.versionId),
        enterpriseService.getItemVersionCode(b.versionId)
      ]);
      const tab = codeTab;
      const leftDoc = codeA ? (tab === 'xfd' ? codeA.xfdDocument : tab === 'resources' ? codeA.resourceDocument : codeA.code) : '';
      const rightDoc = codeB ? (tab === 'xfd' ? codeB.xfdDocument : tab === 'resources' ? codeB.resourceDocument : codeB.code) : '';
      setCompare({
        left: leftDoc,
        right: rightDoc,
        leftLabel: `${versionLabel(a)} (${formatDate(a.checkedInDate) || 'current'})`,
        rightLabel: `${versionLabel(b)} (${formatDate(b.checkedInDate) || 'current'})`,
        lines: lineDiff(leftDoc, rightDoc),
        tab
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Compare failed: ${message}`);
      addEntry({ level: 'error', message: `Compare failed: ${message}`, source: 'SCM' });
    } finally {
      setIsComparing(false);
    }
  };

  const handleRecover = async () => {
    if (!selectedVersion?.versionId) return;
    const confirmed = window.confirm(
      `Recover version ${versionLabel(selectedVersion)} into the current version of "${itemName || uri}"?\n\n` +
      'This creates a new version from the selected one and overwrites the current code. This cannot be undone easily.'
    );
    if (!confirmed) return;

    const reason = window.prompt('Reason for recovery (optional):') || '';
    setIsRecovering(true);
    setError('');
    try {
      const enterpriseService = getEnterpriseService();
      const result = await enterpriseService.recoverVersion(uri, selectedVersion.versionId, reason);
      if (result.success) {
        addEntry({ level: 'success', message: result.message || t('history.recovered'), source: 'SCM' });
        alert(result.message || t('history.recovered'));
        loadHistory();
      } else {
        setError(result.error || 'Version recovery failed');
        addEntry({ level: 'error', message: result.error || 'Version recovery failed', source: 'SCM' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Recovery error: ${message}`);
      addEntry({ level: 'error', message: `Recovery error: ${message}`, source: 'SCM' });
    } finally {
      setIsRecovering(false);
    }
  };

  const formatDate = (value: string) => {
    if (!value) return '';
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      return date.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return value;
    }
  };

  const statusLabel = (entry: ItemHistoryEntry) => {
    if (entry.isCurrentCheckout) return t('history.status.checkedOut');
    if (entry.done === '1' || entry.done === true || entry.done === 'true') return t('history.status.checkedIn');
    return entry.status || 'History';
  };

  const versionLabel = (entry: ItemHistoryEntry) => {
    const parts = [entry.factory, entry.dealer, entry.client].filter(Boolean);
    return parts.length > 0 ? parts.join('.') : (entry.versionId ? entry.versionId.slice(0, 8) : '');
  };

  if (!isOpen) return null;

  const selectedVersionText = (entry: ItemVersionCode | null, tab: 'code' | 'xfd' | 'resources') => {
    if (!entry) return '';
    return entry[tab === 'xfd' ? 'xfdDocument' : tab === 'resources' ? 'resourceDocument' : 'code'] || '(empty)';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[1100px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-300 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
            📜 {t('history.title')}{itemName ? ` - ${itemName}` : ''}
          </h2>
          <button
            onClick={onClose}
            className="icon-button"
            title={t('common.close')}
          >
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {error && (
            <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-400 dark:border-amber-600 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300">
              {error}
              <div className="text-xs mt-1 opacity-80">
                {t('history.patchHint')}
              </div>
            </div>
          )}

          {/* History table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {t('history.title')} <span className="text-xs text-slate-400">(LIMSSOURCECONTROL)</span>
              </h3>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">{t('history.viewCodeHint')}</span>
                {isLoading && <span className="text-slate-400">{t('common.loading')}</span>}
              </div>
            </div>
            <div className="border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
              <div className="max-h-[240px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-700 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left w-8">⚖️</th>
                      <th className="px-3 py-2 text-left">{t('history.status')}</th>
                      <th className="px-3 py-2 text-left">{t('history.version')}</th>
                      <th className="px-3 py-2 text-left">{t('history.checkedOutBy')}</th>
                      <th className="px-3 py-2 text-left">{t('history.checkedOut')}</th>
                      <th className="px-3 py-2 text-left">{t('history.checkedInBy')}</th>
                      <th className="px-3 py-2 text-left">{t('history.checkedIn')}</th>
                      <th className="px-3 py-2 text-left">{t('history.reason')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {history.length === 0 && !isLoading ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                          {t('history.noHistory')}
                        </td>
                      </tr>
                    ) : (
                      history.map((entry, index) => {
                        const inCompare = compareSelection.some(e => e.versionId === entry.versionId);
                        return (
                          <tr
                            key={entry.versionId || index}
                            onClick={() => handleRowSelect(entry)}
                            className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                              selectedVersion?.versionId === entry.versionId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                            } ${inCompare ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                          >
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={inCompare}
                                onChange={() => toggleCompare(entry)}
                                className="rounded"
                                title="Select for compare"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                entry.isCurrentCheckout
                                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                  : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                              }`}>
                                {statusLabel(entry)}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{versionLabel(entry)}</td>
                            <td className="px-3 py-2">{entry.checkedOutBy || '-'}</td>
                            <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(entry.checkedOutDate)}</td>
                            <td className="px-3 py-2">{entry.checkedInBy || '-'}</td>
                            <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(entry.checkedInDate)}</td>
                            <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate" title={entry.reasonForCheckout}>
                              {entry.reasonForCheckout || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Action bar */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleCompare}
                disabled={compareSelection.length !== 2 || isComparing}
                className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-400 text-white rounded font-medium"
              >
                {isComparing ? t('history.comparing') : `⚖️ ${t('history.compareCount', { count: compareSelection.length })}`}
              </button>
              <button
                onClick={handleRecover}
                disabled={!selectedVersion || isRecovering}
                className="px-3 py-1 text-sm bg-red-600 hover:bg-red-500 disabled:bg-slate-400 text-white rounded font-medium"
              >
                {isRecovering ? t('history.recovering') : `♻️ ${t('history.recover')}`}
              </button>
              <span className="text-xs text-slate-400">
                {compareSelection.length === 2
                  ? t('history.viewCodeHint')
                  : compareSelection.length === 1
                    ? t('history.selectMore')
                    : t('history.selectCompare')}
              </span>
            </div>
          </div>

          {/* Compare view */}
          {compare && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {t('history.compare')}: <span className="font-mono text-xs">{compare.leftLabel}</span>
                  <span className="mx-2 text-slate-400">{t('history.compare.vs')}</span>
                  <span className="font-mono text-xs">{compare.rightLabel}</span>
                </h3>
                <button
                  onClick={() => setCompare(null)}
                  className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded"
                >
                  {t('history.closeCompare')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-0 border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="border-r border-slate-300 dark:border-slate-600">
                  <div className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-500 truncate">
                    {compare.leftLabel}
                  </div>
                  <pre className="max-h-[280px] overflow-auto text-xs font-mono leading-4 p-2 bg-slate-50 dark:bg-slate-900">
                    {compare.lines.filter(l => l.type !== 'add').map((l, i) => (
                      <div key={i} className={l.type === 'del' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : ''}>
                        {l.type === 'del' ? '− ' : '  '}{l.text}
                      </div>
                    ))}
                  </pre>
                </div>
                <div>
                  <div className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-500 truncate">
                    {compare.rightLabel}
                  </div>
                  <pre className="max-h-[280px] overflow-auto text-xs font-mono leading-4 p-2 bg-slate-50 dark:bg-slate-900">
                    {compare.lines.filter(l => l.type !== 'del').map((l, i) => (
                      <div key={i} className={l.type === 'add' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : ''}>
                        {l.type === 'add' ? '+ ' : '  '}{l.text}
                      </div>
                    ))}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Selected version code */}
          {selectedVersion && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {t('history.code')} <span className="text-xs text-slate-400">({versionLabel(selectedVersion)})</span>
                </h3>
                <div className="flex gap-1 text-xs">
                  {(['code', 'xfd', 'resources'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setCodeTab(tab)}
                      className={`px-2 py-1 rounded ${
                        codeTab === tab
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500'
                      }`}
                    >
                      {tab === 'code' ? t('history.code') : tab === 'xfd' ? t('history.xfd') : t('history.resources')}
                    </button>
                  ))}
                </div>
              </div>
              <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs overflow-auto max-h-[240px] whitespace-pre-wrap font-mono">
                {isLoadingCode ? t('common.loading') : (versionCode ? selectedVersionText(versionCode, codeTab) : t('history.noHistory'))}
              </pre>
            </div>
          )}

          {/* Labels table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {t('history.labels')} <span className="text-xs text-slate-400">(VERSIONSLABELS)</span>
              </h3>
            </div>
            <div className="border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
              <div className="max-h-[200px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-700 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('history.labels')}</th>
                      <th className="px-3 py-2 text-left">{t('history.labelDesc')}</th>
                      <th className="px-3 py-2 text-left">{t('history.createdBy')}</th>
                      <th className="px-3 py-2 text-left">{t('history.created')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {labels.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          {t('history.noLabels')}
                        </td>
                      </tr>
                    ) : (
                      labels.map((label, index) => (
                        <tr key={`${label.labelTitle}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="px-3 py-2 font-medium">{label.labelTitle}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-[260px] truncate" title={label.labelDesc}>
                            {label.labelDesc || '-'}
                          </td>
                          <td className="px-3 py-2">{label.createdBy || '-'}</td>
                          <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(label.createdDate)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-300 dark:border-slate-700">
          <span className="text-xs text-slate-500">
            {uri ? `${t('history.uri')}: ${uri}` : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={loadHistory}
              className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded"
            >
              🔄 {t('common.refresh')}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
