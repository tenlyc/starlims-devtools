import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { getEnterpriseService } from '../../services/enterpriseService';
import { LanguageOption, SCMItem } from '../../services/iEnterpriseService';
import { useOutputLogStore } from '../../services/outputLogStore';

interface SourceControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_LABEL_KEYS: Record<string, string> = {
  APP_FRM: 'scm.type.appForm', APP_SSC: 'scm.type.appServerScript', APP_CS: 'scm.type.appClientScript',
  APP_DS: 'scm.type.appDataSource', SSC: 'scm.type.serverScript', CSC: 'scm.type.clientScript',
  DS: 'scm.type.dataSource', TBL: 'scm.type.table'
};

function localDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rowKey(item: SCMItem): string {
  return `${item.itemType}:${item.itemId}:${item.versionId || item.checkedInDate || ''}`;
}

interface SCMTreeNode {
  id: string;
  label: string;
  icon: string;
  children: SCMTreeNode[];
  item?: SCMItem;
}

function addTreeItem(nodes: SCMTreeNode[], segments: Array<{ id: string; label: string; icon: string }>, item: SCMItem) {
  let level = nodes;
  let parentId = '';
  for (const segment of segments) {
    const id = `${parentId}/${segment.id}`;
    let node = level.find(candidate => candidate.id === id);
    if (!node) {
      node = { id, label: segment.label, icon: segment.icon, children: [] };
      level.push(node);
    }
    parentId = id;
    level = node.children;
  }
  level.push({ id: `${parentId}/${rowKey(item)}`, label: item.itemName, icon: '📄', children: [], item });
}

function descendantKeys(node: SCMTreeNode): string[] {
  if (node.item) return [rowKey(node.item)];
  return node.children.flatMap(descendantKeys);
}

function branchIds(nodes: SCMTreeNode[]): string[] {
  return nodes.flatMap(node => node.item ? [] : [node.id, ...branchIds(node.children)]);
}

/** User + inclusive check-in date range -> query -> select -> export SDP. */
export function SourceControlPanel({ isOpen, onClose }: SourceControlPanelProps) {
  const { t } = useI18n();
  const addEntry = useOutputLogStore(state => state.addEntry);
  const [users, setUsers] = useState<string[]>([]);
  const [user, setUser] = useState('');
  const [dateFrom, setDateFrom] = useState(localDate());
  const [dateTo, setDateTo] = useState(localDate());
  const [items, setItems] = useState<SCMItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingLanguages, setIsLoadingLanguages] = useState(false);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    setError('');
    try {
      const service = getEnterpriseService();
      const result = await service.getSCMUsers();
      const currentUser = service.getCurrentServer()?.user || '';
      const merged = [...new Set([currentUser, ...result].filter(Boolean))].sort((a, b) => a.localeCompare(b));
      setUsers(merged);
      setUser(previous => previous || currentUser || merged[0] || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setItems([]);
    setSelected(new Set());
    setHasSearched(false);
    setError('');
    setImportNotice('');
    setShowLanguagePicker(false);
    setLanguages([]);
    setSelectedLanguages(new Set());
    void loadUsers();
  }, [isOpen, loadUsers]);

  const handleSearch = async () => {
    if (!user) {
      setError(t('scm.simple.selectUser'));
      return;
    }
    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      setError(t('scm.simple.invalidDates'));
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setError('');
    try {
      const result = await getEnterpriseService().getCheckInHistory({ user, dateFrom, dateTo });
      setItems(result);
      setSelected(new Set(result.map(rowKey)));
      addEntry({ level: 'success', source: 'SCM', message: t('scm.simple.queryDone', { count: result.length, user }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setItems([]);
      setSelected(new Set());
      setError(t('scm.simple.queryFailed', { message }));
      addEntry({ level: 'error', source: 'SCM', message });
    } finally {
      setIsSearching(false);
    }
  };

  const selectedItems = useMemo(() => items.filter(item => selected.has(rowKey(item))), [items, selected]);
  const hasSelectedForms = useMemo(() => selectedItems.some(item => item.itemType === 'APP_FRM'), [selectedItems]);
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(rowKey)));
  const toggleItem = (item: SCMItem) => {
    const key = rowKey(item);
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const treeNodes = useMemo(() => {
    const nodes: SCMTreeNode[] = [];
    const groupLabel = (key: string) => t(`scm.group.${key}`);
    for (const item of items) {
      const typeLabel = TYPE_LABEL_KEYS[item.itemType] ? t(TYPE_LABEL_KEYS[item.itemType]) : item.itemType;
      const typeSegment = { id: `type:${item.itemType}`, label: typeLabel, icon: '📂' };
      if (item.itemType.startsWith('APP_')) {
        addTreeItem(nodes, [
          { id: 'applications', label: groupLabel('applications'), icon: '🗂️' },
          { id: `category:${item.catName}`, label: item.catName, icon: '📁' },
          { id: `application:${item.appName}`, label: item.appName, icon: '📁' },
          typeSegment
        ], item);
      } else {
        const group = item.itemType === 'SSC' ? 'serverScripts'
          : item.itemType === 'CSC' ? 'clientScripts'
            : item.itemType === 'DS' ? 'dataSources'
              : item.itemType === 'TBL' ? 'tables' : 'reports';
        addTreeItem(nodes, [
          { id: group, label: groupLabel(group), icon: '🗂️' },
          ...(item.catName ? [{ id: `category:${item.catName}`, label: item.catName, icon: '📁' }] : []),
          typeSegment
        ], item);
      }
    }
    return nodes;
  }, [items, t]);

  useEffect(() => {
    setExpanded(new Set(branchIds(treeNodes)));
  }, [treeNodes]);

  const toggleBranch = (node: SCMTreeNode) => {
    const keys = descendantKeys(node);
    const isFullySelected = keys.length > 0 && keys.every(key => selected.has(key));
    setSelected(previous => {
      const next = new Set(previous);
      for (const key of keys) isFullySelected ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleExpanded = (nodeId: string) => setExpanded(previous => {
    const next = new Set(previous);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    return next;
  });

  const renderTreeNode = (node: SCMTreeNode, depth = 0): React.ReactNode => {
    const isLeaf = Boolean(node.item);
    const keys = descendantKeys(node);
    const selectedCount = keys.filter(key => selected.has(key)).length;
    const checked = keys.length > 0 && selectedCount === keys.length;
    const partiallyChecked = selectedCount > 0 && !checked;
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div className="group flex min-h-8 items-center gap-1 rounded px-2 text-sm hover:bg-blue-50 dark:hover:bg-slate-700/60" style={{ paddingLeft: `${8 + depth * 20}px` }}>
          {isLeaf ? <span className="w-4" /> : (
            <button type="button" onClick={() => toggleExpanded(node.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-sm text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700">{isExpanded ? '▾' : '▸'}</button>
          )}
          <input
            type="checkbox"
            checked={checked}
            ref={element => { if (element) element.indeterminate = partiallyChecked; }}
            onChange={() => isLeaf && node.item ? toggleItem(node.item) : toggleBranch(node)}
            className="mr-1 rounded"
          />
          <button type="button" onClick={() => isLeaf && node.item ? toggleItem(node.item) : toggleExpanded(node.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <span>{node.icon}</span>
            <span className={isLeaf ? 'truncate text-slate-700 dark:text-slate-200' : 'truncate font-medium text-slate-600 dark:text-slate-300'}>{node.label}</span>
            {!isLeaf && <span className="text-[11px] text-slate-400">({keys.length})</span>}
          </button>
          {node.item && <span className="ml-3 shrink-0 font-mono text-[11px] text-slate-400">{node.item.checkedInDate}</span>}
        </div>
        {!isLeaf && isExpanded && node.children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  const performExport = async (languageIds: string[]) => {
    if (selectedItems.length === 0) {
      setError(t('scm.export.noSelection'));
      return;
    }

    setIsExporting(true);
    setShowLanguagePicker(false);
    setError('');
    try {
      const tokens = [...new Set(selectedItems.map(item => `${item.itemType}:${item.itemId}`))];
      const result = await getEnterpriseService().exportPackage(tokens, true, languageIds);
      if (!result.success || !result.blob || !result.fileName) throw new Error(result.error || t('scm.export.error'));

      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      addEntry({ level: 'success', source: 'SCM', message: t('scm.export.done', { name: result.fileName }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`${t('scm.export.error')}: ${message}`);
      addEntry({ level: 'error', source: 'SCM', message });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async () => {
    if (selectedItems.length === 0) {
      setError(t('scm.export.noSelection'));
      return;
    }
    if (!hasSelectedForms) {
      await performExport([]);
      return;
    }

    setIsLoadingLanguages(true);
    setError('');
    try {
      const service = getEnterpriseService();
      const options = await service.getLanguageOptions();
      const sessionLanguage = service.getSessionInfo()?.langid || 'ENG';
      const defaultLanguage = options.find(option => option.id === sessionLanguage)?.id
        || options.find(option => option.id === 'ENG')?.id
        || options[0]?.id;
      setLanguages(options);
      setSelectedLanguages(new Set(defaultLanguage ? [defaultLanguage] : []));
      setShowLanguagePicker(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingLanguages(false);
    }
  };

  const toggleLanguage = (id: string) => setSelectedLanguages(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allLanguagesSelected = languages.length > 0 && selectedLanguages.size === languages.length;

  const handleImportFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.sdp')) {
      setError(t('scm.import.selectSdp'));
      return;
    }

    const server = getEnterpriseService().getCurrentServer();
    const target = server?.name || server?.url || '';
    if (!window.confirm(t('scm.import.confirm', { file: file.name, server: target }))) return;

    setIsImporting(true);
    setError('');
    setImportNotice('');
    try {
      const result = await getEnterpriseService().importPackage(file);
      if (!result.success) throw new Error(result.error || t('scm.import.failed'));
      const notice = t('scm.import.success', { file: file.name });
      setImportNotice(notice);
      addEntry({ level: 'success', source: 'SCM', message: notice });
      if (result.log) addEntry({ level: 'info', source: 'SCM Import', message: result.log });
      await loadUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`${t('scm.import.failed')}: ${message}`);
      addEntry({ level: 'error', source: 'SCM Import', message });
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[78vh] w-[920px] flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">🗂 {t('scm.nativeTitle')}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('scm.simple.subtitle')}</p>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} title={t('common.close')} className="icon-button">
            <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-[1fr_190px_190px_auto] items-end gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/30">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="mb-1.5 block">{t('scm.checkInBy')}</span>
            <select value={user} onChange={event => setUser(event.target.value)} disabled={isLoadingUsers} className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700">
              {isLoadingUsers && <option>{t('common.loading')}</option>}
              {!isLoadingUsers && users.length === 0 && <option value="">{t('scm.simple.noUsers')}</option>}
              {users.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="mb-1.5 block">{t('scm.simple.dateFrom')}</span>
            <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700" />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="mb-1.5 block">{t('scm.simple.dateTo')}</span>
            <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700" />
          </label>
          <button onClick={handleSearch} disabled={isSearching || isLoadingUsers || !user} className="h-9 rounded bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-500 disabled:bg-slate-400">
            {isSearching ? t('common.loading') : `🔍 ${t('scm.simple.query')}`}
          </button>
        </div>

        {error && <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {importNotice && <div className="border-b border-green-200 bg-green-50 px-5 py-2 text-xs text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">{importNotice}</div>}

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2.5 dark:border-slate-700">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={allSelected} disabled={items.length === 0} onChange={toggleAll} className="rounded" />
              {t('common.selectAll')}
            </label>
            <span className="text-xs text-slate-500">{t('scm.simple.summary', { selected: selectedItems.length, total: items.length })}</span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {isSearching ? (
              <div className="py-16 text-center text-slate-400">{t('common.loading')}</div>
            ) : treeNodes.length > 0 ? (
              <div role="tree" aria-label={t('scm.nativeTitle')}>{treeNodes.map(node => renderTreeNode(node))}</div>
            ) : (
              <div className="py-16 text-center text-sm text-slate-400">{hasSearched ? t('scm.simple.noResults') : t('scm.simple.queryHint')}</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <span className="text-xs text-slate-500 dark:text-slate-400">{t('scm.simple.exportHint')}</span>
          <div className="flex gap-2">
            <input ref={importInputRef} type="file" accept=".sdp,application/octet-stream" className="hidden" onChange={event => void handleImportFile(event.target.files?.[0])} />
            <button onClick={() => importInputRef.current?.click()} disabled={isImporting} className="rounded border border-blue-300 px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:text-slate-400 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30">
              {isImporting ? t('scm.import.importing') : `📥 ${t('scm.import.button')}`}
            </button>
            <button onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">{t('common.cancel')}</button>
            <button onClick={() => void handleExport()} disabled={selectedItems.length === 0 || isExporting || isLoadingLanguages} className="rounded bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:bg-slate-400">
              {isExporting || isLoadingLanguages ? t('common.loading') : `📤 ${t('scm.export.button')} (${selectedItems.length})`}
            </button>
          </div>
        </div>
      </div>

      {showLanguagePicker && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55">
          <div role="dialog" aria-modal="true" aria-labelledby="scm-language-title" className="w-[860px] max-w-[calc(100vw-48px)] overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-slate-800">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h3 id="scm-language-title" className="font-semibold text-slate-800 dark:text-slate-100">🌐 {t('scm.language.title')}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('scm.language.description')}</p>
            </div>
            <div className="max-h-[52vh] overflow-auto p-5">
              <label className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={allLanguagesSelected}
                  onChange={() => setSelectedLanguages(allLanguagesSelected ? new Set() : new Set(languages.map(language => language.id)))}
                  className="rounded"
                />
                {t('scm.language.all')}
              </label>
              <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {languages.map(language => (
                  <label key={language.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700">
                    <input type="checkbox" checked={selectedLanguages.has(language.id)} onChange={() => toggleLanguage(language.id)} className="rounded" />
                    <span className="w-9 font-mono text-xs text-slate-400">{language.id}</span>
                    <span className="whitespace-nowrap">{language.name}</span>
                  </label>
                ))}
              </div>
              {selectedLanguages.size === 0 && <p className="mt-4 text-xs text-red-600 dark:text-red-300">{t('scm.language.none')}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
              <button type="button" onClick={() => setShowLanguagePicker(false)} className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">{t('common.cancel')}</button>
              <button type="button" disabled={selectedLanguages.size === 0 || isExporting} onClick={() => void performExport([...selectedLanguages])} className="rounded bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:bg-slate-400">
                {isExporting ? t('scm.export.exporting') : `📤 ${t('scm.language.confirm')} (${selectedLanguages.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
