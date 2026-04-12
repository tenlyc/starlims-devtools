import React, { useState, useEffect, useCallback } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { EnterpriseItem } from '../../services/iEnterpriseService';
import { useOutputLogStore } from '../../services/outputLogStore';

interface SCMPackageDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CheckoutItem {
  id: string;
  uri: string;
  name: string;
  type: string;
  user: string;
  date: string;
  selected: boolean;
}

export function SCMPackageDialog({ isOpen, onClose }: SCMPackageDialogProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [items, setItems] = useState<CheckoutItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterUser, setFilterUser] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [users, setUsers] = useState<string[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLog, setImportLog] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const addEntry = useOutputLogStore(state => state.addEntry);

  // Load checked in items (items that have been completed and can be exported)
  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const enterpriseService = getEnterpriseService();
      const checkedInItems = await enterpriseService.getCheckedInItems({
        user: filterUser || undefined,
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined
      });

      console.log('Loaded checked in items:', checkedInItems.length);

      const mappedItems: CheckoutItem[] = checkedInItems.map((item: any) => ({
        id: item.uri || item.id,
        uri: item.uri || '',
        name: item.name || item.text || item.id?.split('.').pop() || 'Unknown',
        type: item.type || 'UNKNOWN',
        user: item.checkedOutBy || 'Unknown',
        date: item.checkedOutDate || '',
        selected: false
      }));

      setItems(mappedItems);

      // Extract unique users
      const uniqueUsers = [...new Set(mappedItems.map(item => item.user).filter(Boolean))];
      setUsers(uniqueUsers.sort());
    } catch (err) {
      console.error('Failed to load pending checkins:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filterUser, filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (isOpen && activeTab === 'export') {
      loadItems();
    }
  }, [isOpen, activeTab, loadItems]);

  // Filter items
  const filteredItems = items.filter(item => {
    if (filterUser && item.user !== filterUser) return false;
    if (filterDateFrom) {
      const itemDate = new Date(item.date);
      const fromDate = new Date(filterDateFrom);
      if (itemDate < fromDate) return false;
    }
    if (filterDateTo) {
      const itemDate = new Date(item.date);
      const toDate = new Date(filterDateTo);
      toDate.setHours(23, 59, 59, 999);
      if (itemDate > toDate) return false;
    }
    return true;
  });

  // Toggle select item
  const toggleItem = (id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  // Select all / Deselect all
  const selectAll = (select: boolean) => {
    setItems(prev => prev.map(item => ({ ...item, selected: select })));
  };

  // Export selected items
  const handleExport = async () => {
    const selectedItems = items.filter(item => item.selected);
    if (selectedItems.length === 0) {
      alert('Please select at least one item to export');
      return;
    }

    setIsExporting(true);
    addEntry({
      level: 'info',
      message: `Exporting ${selectedItems.length} items...`,
      source: 'SCM'
    });

    try {
      // Export the selected pending checkins as an SDP package
      const enterpriseService = getEnterpriseService();
      const result = await enterpriseService.exportPackage();

      if (result.success) {
        addEntry({
          level: 'success',
          message: `Package exported: ${result.fileName}`,
          source: 'SCM'
        });

        // Try to download the file
        if (result.fileName) {
          await downloadPackage(result.fileName);
        }
      } else {
        addEntry({
          level: 'error',
          message: `Export failed: ${result.error}`,
          source: 'SCM'
        });
      }
    } catch (err) {
      addEntry({
        level: 'error',
        message: `Export error: ${err instanceof Error ? err.message : String(err)}`,
        source: 'SCM'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Download package from server
  const downloadPackage = async (fileName: string) => {
    try {
      const enterpriseService = getEnterpriseService();
      const result = await enterpriseService.downloadPackage(fileName);

      if (result.success && result.data) {
        // Create download link
        const url = URL.createObjectURL(result.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        addEntry({
          level: 'success',
          message: `Downloaded: ${fileName}`,
          source: 'SCM'
        });
      } else {
        addEntry({
          level: 'error',
          message: `Download failed: ${result.error}`,
          source: 'SCM'
        });
      }
    } catch (err) {
      addEntry({
        level: 'error',
        message: `Download error: ${err instanceof Error ? err.message : String(err)}`,
        source: 'SCM'
      });
    }
  };

  // Import package
  const handleImport = async () => {
    if (!importFile) {
      alert('Please select an SDP file to import');
      return;
    }

    if (!importFile.name.endsWith('.sdp')) {
      alert('Please select a valid .sdp file');
      return;
    }

    setIsImporting(true);
    setImportLog('');
    addEntry({
      level: 'info',
      message: `Importing ${importFile.name}...`,
      source: 'SCM'
    });

    try {
      const enterpriseService = getEnterpriseService();
      const result = await enterpriseService.importPackage(importFile);

      if (result.success) {
        setImportLog(result.log || 'Import completed successfully');
        addEntry({
          level: 'success',
          message: `Import completed: ${importFile.name}`,
          source: 'SCM'
        });
      } else {
        setImportLog(`Import failed: ${result.error}`);
        addEntry({
          level: 'error',
          message: `Import failed: ${result.error}`,
          source: 'SCM'
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setImportLog(`Import error: ${errorMsg}`);
      addEntry({
        level: 'error',
        message: `Import error: ${errorMsg}`,
        source: 'SCM'
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Get type icon
  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      'SS': '🖥️',
      'SERVERSCRIPT': '🖥️',
      'CS': '🖱️',
      'CLIENTSCRIPT': '🖱️',
      'DS': '🗃️',
      'DATASOURCE': '🗃️',
      'HTMLFORMXML': '🌐',
      'HTMLFORMCODE': '📄',
      'XFDFORMXML': '📝',
      'XFDFORMCODE': '📄',
      'DEFAULT': '📄'
    };
    return icons[type] || icons.DEFAULT;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[900px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-300 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
            📦 Source Control Manager - Package Manager
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
          >
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
            📤 Export Package
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium ${activeTab === 'import' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('import')}
          >
            📥 Import Package
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Not Implemented Banner */}
          <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-400 dark:border-amber-600 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <span className="text-xl">⚠️</span>
              <span className="font-medium">功能未实现</span>
            </div>
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
              Source Control Manager - Package Manager 功能正在开发中，敬请期待。
            </p>
          </div>

          {activeTab === 'export' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-4 items-center bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg">
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                >
                  <option value="">All Users</option>
                  {users.map(user => (
                    <option key={user} value={user}>{user}</option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">From:</span>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">To:</span>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                  />
                </div>

                <button
                  onClick={loadItems}
                  className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded"
                >
                  🔄 Refresh
                </button>
              </div>

              {/* Items List */}
              <div className="border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left w-8">
                          <input
                            type="checkbox"
                            checked={filteredItems.length > 0 && filteredItems.every(item => item.selected)}
                            onChange={(e) => selectAll(e.target.checked)}
                            className="rounded"
                          />
                        </th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">User</th>
                        <th className="px-3 py-2 text-left">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {isLoading ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                            Loading...
                          </td>
                        </tr>
                      ) : filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                            No pending checkins found
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={() => toggleItem(item.id)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-3 py-2">{getTypeIcon(item.type)}</td>
                            <td className="px-3 py-2">
                              <div className="truncate max-w-[200px]" title={item.uri}>{item.name}</div>
                            </td>
                            <td className="px-3 py-2">{item.user}</td>
                            <td className="px-3 py-2 text-slate-500">{formatDate(item.date)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selected count */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  Selected: {items.filter(i => i.selected).length} of {items.length} items
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => selectAll(true)}
                    className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => selectAll(false)}
                    className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 rounded"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Export Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleExport}
                  disabled={isExporting || items.filter(i => i.selected).length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-400 text-white rounded font-medium flex items-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Exporting...
                    </>
                  ) : (
                    <>📤 Export Package</>
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Note: Export will include all selected checked-in items as an SDP package.
                Select items using the checkboxes and click Export Package to download.
              </p>
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
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-4xl">📁</div>
                    <div className="text-lg font-medium text-slate-700 dark:text-slate-200">
                      Drag & drop SDP file here
                    </div>
                    <div className="text-sm text-slate-500">or</div>
                    <label className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer inline-block">
                      Browse Files
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
                      Importing...
                    </>
                  ) : (
                    <>📥 Import Package</>
                  )}
                </button>
              </div>

              {/* Import Log */}
              {importLog && (
                <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3">
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Import Log:</div>
                  <pre className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-[200px] overflow-auto">
                    {importLog}
                  </pre>
                </div>
              )}

              <p className="text-xs text-slate-500">
                Import will deploy the SDP package to the current STARLIMS server.
                Make sure to backup your data before importing.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
