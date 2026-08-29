import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { EnterpriseItem } from '../../services/iEnterpriseService';
import { useOutputLogStore } from '../../services/outputLogStore';
import { useI18n } from '../../i18n';

interface SCMPackageDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ExportItem {
  uri: string;
  guid: string;
  name: string;
  type: string;
  language: string;
  checkedOutBy: string;
  selected: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  FORM: 'Form', HTMLFORMCODE: 'HTML Form', XFDFORMCODE: 'XFD Form',
  SERVERSCRIPT: 'Server Script', SS: 'Server Script',
  CLIENTSCRIPT: 'Client Script', CS: 'Client Script',
  DATASOURCE: 'Data Source', DS: 'Data Source',
  TABLE: 'Table'
};

/**
 * Source Control Manager - Package Manager.
 *
 * Export mirrors the official STARLIMS Source Control Manager flow
 * (tree selection -> manifest -> Package Manager): the user picks any
 * enterprise items and the server packages their live (checked-in / current)
 * code into an SDP file that can be imported into another STARLIMS
 * environment for deployment. Uses SCM_API.GetAllItems for the item list and
 * the patched SCM_API.ExportItems endpoint for packaging.
 */
export function SCMPackageDialog({ isOpen, onClose }: SCMPackageDialogProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [items, setItems] = useState<ExportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLog, setImportLog] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');

  const addEntry = useOutputLogStore(state => state.addEntry);

  // Load all enterprise items from the server
  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const enterpriseService = getEnterpriseService();
      const allItems = await enterpriseService.getAllItems();

      const mappedItems: ExportItem[] = allItems.map((item: EnterpriseItem) => ({
        uri: item.uri || '',
        guid: item.guid || item.id || '',
        name: item.name || '',
        type: item.type || 'UNKNOWN',
        language: item.language || '',
        checkedOutBy: item.checkedOutBy || '',
        selected: false
      }));

      setItems(mappedItems);
      addEntry({
        level: 'info',
        message: `Loaded ${mappedItems.length} items from server`,
        source: 'SCM'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load items: ${message}`);
      addEntry({ level: 'error', message: `Failed to load items: ${message}`, source: 'SCM' });
    } finally {
      setIsLoading(false);
    }
  }, [addEntry]);

  // Load automatically when the export tab opens the first time
  useEffect(() => {
    if (isOpen && activeTab === 'export' && items.length === 0 && !isLoading) {
      loadItems();
    }
  }, [isOpen, activeTab]);

  // Filter items by text and type
  const filteredItems = useMemo(() => {
    const text = filterText.trim().toLowerCase();
    return items.filter(item => {
      if (filterType !== 'ALL' && item.type !== filterType) return false;
      if (text && !item.name.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [items, filterText, filterType]);

  const typeOptions = useMemo(() => {
    const types = new Set(items.map(item => item.type).filter(Boolean));
    return [...types].sort();
  }, [items]);

  const selectedCount = items.filter(item => item.selected).length;

  const toggleItem = (uri: string) => {
    setItems(prev => prev.map(item =>
      item.uri === uri ? { ...item, selected: !item.selected } : item
    ));
  };

  const selectAllVisible = (select: boolean) => {
    const visibleUris = new Set(filteredItems.map(item => item.uri));
    setItems(prev => prev.map(item =>
      visibleUris.has(item.uri) ? { ...item, selected: select } : item
    ));
  };

  // Export: ask the server to build the SDP package from the selected items
  const handleExport = async () => {
    const selectedItems = items.filter(item => item.selected);
    if (selectedItems.length === 0) {
      alert(t('scm.export.noSelection'));
      return;
    }

    setIsExporting(true);
    setError('');
    addEntry({
      level: 'info',
      message: `Exporting ${selectedItems.length} item(s) as SDP package...`,
      source: 'SCM'
    });

    try {
      const enterpriseService = getEnterpriseService();
      const uris = selectedItems.map(item => item.uri).filter(Boolean);
      const result = await enterpriseService.exportItems(uris);

      if (result.success && result.blob && result.fileName) {
        // Create download link for the validated SDP/ZIP content
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        addEntry({
          level: 'success',
          message: `Package exported and downloaded: ${result.fileName}`,
          source: 'SCM'
        });
      } else {
        const message = result.error || t('scm.export.error');
        setError(message);
        addEntry({ level: 'error', message, source: 'SCM' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`${t('scm.export.error')}: ${message}`);
      addEntry({ level: 'error', message: `${t('scm.export.error')}: ${message}`, source: 'SCM' });
    } finally {
      setIsExporting(false);
    }
  };

  // Import package
  const handleImport = async () => {
    if (!importFile) {
      alert(t('scm.import.selectSdp'));
      return;
    }

    if (!importFile.name.toLowerCase().endsWith('.sdp')) {
      alert(t('scm.import.selectSdp'));
      return;
    }

    setIsImporting(true);
    setImportLog('');
    setError('');
    addEntry({ level: 'info', message: `Importing ${importFile.name}...`, source: 'SCM' });

    try {
      const enterpriseService = getEnterpriseService();
      const result = await enterpriseService.importPackage(importFile);

      if (result.success) {
        setImportLog(result.log || t('scm.import.completed'));
        addEntry({ level: 'success', message: `${t('scm.import.completed')}: ${importFile.name}`, source: 'SCM' });
      } else {
        const message = result.error || t('scm.import.failed');
        setImportLog(`${t('scm.import.failed')}: ${message}`);
        setError(message);
        addEntry({ level: 'error', message: `${t('scm.import.failed')}: ${message}`, source: 'SCM' });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setImportLog(`${t('scm.import.failed')}: ${errorMsg}`);
      setError(errorMsg);
      addEntry({ level: 'error', message: `${t('scm.import.failed')}: ${errorMsg}`, source: 'SCM' });
    } finally {
      setIsImporting(false);
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      'FORM': '📝', 'HTMLFORMCODE': '🌐', 'HTMLFORMXML': '🌐', 'XFDFORMCODE': '📄', 'XFDFORMXML': '📄',
      'SERVERSCRIPT': '🖥️', 'SS': '🖥️', 'CLIENTSCRIPT': '🖱️', 'CS': '🖱️',
      'DATASOURCE': '🗃️', 'DS': '🗃️', 'TABLE': '🗄️'
    };
    return icons[type] || '📄';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[1000px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-300 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
            📦 {t('scm.title')}
          </h2>
          <button onClick={onClose} className="icon-button" title={t('common.close')}>
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-300 dark:border-slate-700">
          <button
            className={`px-4 py-2 text-sm font-medium ${activeTab === 'export' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('export')}
          >
            📤 {t('scm.tab.export')}
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium ${activeTab === 'import' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('import')}
          >
            📥 {t('scm.tab.import')}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg p-3 mb-4 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4">
              {/* Info banner */}
              <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-400 dark:border-blue-600 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
                {t('scm.export.hint')}
              </div>

              {/* Toolbar: load + filter */}
              <div className="flex flex-wrap gap-3 items-center bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg">
                <button
                  onClick={loadItems}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-400 text-white rounded font-medium"
                  title={t('scm.export.loadAllHint')}
                >
                  {isLoading ? t('common.loading') : `🔄 ${t('scm.export.loadAll')}`}
                </button>
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder={t('scm.export.filterPlaceholder')}
                  className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 flex-1 min-w-[180px]"
                />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                >
                  <option value="ALL">{t('scm.export.allTypes')}</option>
                  {typeOptions.map(type => (
                    <option key={type} value={type}>{TYPE_LABELS[type] || type}</option>
                  ))}
                </select>
              </div>

              {/* Items list */}
              <div className="border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="max-h-[320px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left w-8">
                          <input
                            type="checkbox"
                            checked={filteredItems.length > 0 && filteredItems.every(item => item.selected)}
                            onChange={(e) => selectAllVisible(e.target.checked)}
                            className="rounded"
                          />
                        </th>
                        <th className="px-3 py-2 text-left">{t('scm.export.type')}</th>
                        <th className="px-3 py-2 text-left">{t('scm.export.name')}</th>
                        <th className="px-3 py-2 text-left">{t('scm.export.language')}</th>
                        <th className="px-3 py-2 text-left">{t('scm.export.checkedOutBy')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {isLoading ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-slate-500">{t('common.loading')}</td>
                        </tr>
                      ) : filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                            {items.length === 0 ? t('scm.export.noItems') : t('scm.export.noItems')}
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map(item => (
                          <tr key={item.uri || item.name} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="px-3 py-1.5">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => toggleItem(item.uri)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-3 py-1.5">{getTypeIcon(item.type)} {TYPE_LABELS[item.type] || item.type}</td>
                            <td className="px-3 py-1.5">
                              <div className="truncate max-w-[320px]" title={item.uri}>{item.name}</div>
                            </td>
                            <td className="px-3 py-1.5 text-slate-500 text-xs">{item.language || '-'}</td>
                            <td className="px-3 py-1.5 text-slate-500 text-xs">{item.checkedOutBy || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selection controls */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  {t('scm.export.selected', { count: selectedCount, total: items.length })}
                  {filteredItems.length !== items.length ? t('scm.export.filtered', { count: filteredItems.length }) : ''}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => selectAllVisible(true)}
                    className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded"
                  >
                    {t('common.selectAll')}
                  </button>
                  <button
                    onClick={() => selectAllVisible(false)}
                    className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded"
                  >
                    {t('common.deselectAll')}
                  </button>
                </div>
              </div>

              {/* Export button */}
              <div className="flex justify-end">
                <button
                  onClick={handleExport}
                  disabled={isExporting || selectedCount === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-400 text-white rounded font-medium flex items-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('scm.export.exporting')}
                    </>
                  ) : (
                    <>📤 {t('scm.export.button')}</>
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-500">{t('scm.export.verified')}</p>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-4">
              {/* File Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center ${importFile ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-300 dark:border-slate-600'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) setImportFile(file);
                }}
              >
                {importFile ? (
                  <div className="space-y-2">
                    <div className="text-4xl">📦</div>
                    <div className="text-lg font-medium text-slate-700 dark:text-slate-200">{importFile.name}</div>
                    <div className="text-sm text-slate-500">{(importFile.size / 1024).toFixed(2)} KB</div>
                    <button
                      onClick={() => setImportFile(null)}
                      className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded"
                    >
                      {t('scm.import.remove')}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-4xl">📁</div>
                    <div className="text-lg font-medium text-slate-700 dark:text-slate-200">
                      {t('scm.import.drop')}
                    </div>
                    <div className="text-sm text-slate-500">{t('scm.import.or')}</div>
                    <label className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer inline-block">
                      {t('scm.import.browse')}
                      <input
                        type="file"
                        accept=".sdp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setImportFile(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Import Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleImport}
                  disabled={isImporting || !importFile}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-400 text-white rounded font-medium flex items-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('scm.import.importing')}
                    </>
                  ) : (
                    <>📥 {t('scm.import.button')}</>
                  )}
                </button>
              </div>

              {/* Import Log */}
              {importLog && (
                <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3">
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">{t('scm.import.log')}:</div>
                  <pre className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-[200px] overflow-auto">
                    {importLog}
                  </pre>
                </div>
              )}

              <p className="text-xs text-slate-500">{t('scm.import.note')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
