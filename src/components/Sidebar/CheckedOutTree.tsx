import { useState, useEffect } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { editorStore } from '../../stores/editorStore';
import { registerCheckedOutRefresh } from '../../services/checkedOutStore';
import { ContextMenu } from '../ContextMenu';
import { useAiContextStore } from '../../services/aiContextStore';

export interface CheckedOutItem {
  id: string;
  name: string;
  type: string;
  user: string;
  date: string;
  uri?: string;
  path?: string;
  language?: string;
  rawType?: string;
}

// Format date to readable format
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return dateStr;
  }
}

export function CheckedOutTree() {
  const [items, setItems] = useState<CheckedOutItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CheckedOutItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ item: CheckedOutItem; x: number; y: number } | null>(null);
  const addAiContext = useAiContextStore((state) => state.addItem);

  // Load checked out items
  useEffect(() => {
    loadCheckedOutItems();
    registerCheckedOutRefresh(loadCheckedOutItems);
  }, []);

  const loadCheckedOutItems = async () => {
    setIsLoading(true);
    try {
      const enterpriseService = getEnterpriseService();
      const checkedOutItems = await enterpriseService.getCheckedOutItems();

      const items: CheckedOutItem[] = checkedOutItems.map((item: any) => ({
        id: item.uri || item.id,
        name: item.name,
        type: item.type || 'DEFAULT',
        user: item.checkedOutBy || 'Unknown',
        date: item.checkedOutDate || '',
        uri: item.uri,
        path: item.displayPath,
        language: item.language,
        rawType: item.rawType
      }));

      setItems(items);
      console.log('Loaded checked out items:', items.length);
    } catch (err) {
      console.error('Failed to load checked out items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const resolveItemUri = async (item: CheckedOutItem): Promise<string | null> => {
    const enterpriseService = getEnterpriseService();
    let uri = item.uri || item.id;

    if (uri && !uri.startsWith('/') && item.type) {
        console.log('URI is a GUID, resolving to full path...');
        // Map the type from database format to API format
        const typeMap: Record<string, string> = {
          'AppServerScript': 'APPSS',
          'AppClientScript': 'APPCS',
          'AppDataSourceScript': 'APPDS',
          'ServerScript': 'SS',
          'ClientScript': 'CS',
          'DataSourceScript': 'DS',
          'HTMLForm': 'HTMLFORMXML',
          'XFDForm': 'XFDFORMXML'
        };
        const apiType = typeMap[item.type] || item.type;
        console.log('Mapped type:', item.type, '->', apiType);

      const resolvedItem = await enterpriseService.getItemByGuid(uri, apiType);
      if (resolvedItem?.uri) uri = resolvedItem.uri;
      else return null;
    }
    return uri;
  };

  const handleOpenFile = async (item: CheckedOutItem) => {
    console.log('Opening file:', item.uri || item.id, 'type:', item.type);
    try {
      const enterpriseService = getEnterpriseService();
      const uri = await resolveItemUri(item);
      if (!uri) {
        console.error('Failed to resolve GUID to URI');
        return;
      }

      const code = await enterpriseService.getItemCode(uri);
      if (code) {
        editorStore.getState().openFile({
          uri,
          name: item.name,
          type: item.type,
          language: item.language,
          content: code
        });
      } else {
        console.error('No code returned for URI:', uri);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const handleReferenceForAi = async (item: CheckedOutItem) => {
    try {
      const uri = await resolveItemUri(item);
      if (!uri) throw new Error('Could not resolve the STARLIMS item URI.');
      const content = await getEnterpriseService().getItemCode(uri, item.language);
      addAiContext({ id: uri, name: item.name, uri, type: item.type, content, source: 'checkout' });
      window.dispatchEvent(new CustomEvent('ai:show'));
    } catch (error) {
      console.error('Failed to reference checked-out item:', error);
    }
  };

  const handleCheckIn = async (item: CheckedOutItem) => {
    console.log('Check in:', item);
  };

  const handleUndoCheckOut = async (item: CheckedOutItem) => {
    console.log('Undo check out:', item);
    try {
      const enterpriseService = getEnterpriseService();
      let uri = item.uri || item.id;

      // If URI is a GUID, resolve it to a full URI first
      if (uri && !uri.startsWith('/') && item.type) {
        console.log('URI is a GUID, resolving to full path...');
        const typeMap: Record<string, string> = {
          'AppServerScript': 'APPSS',
          'AppClientScript': 'APPCS',
          'AppDataSourceScript': 'APPDS',
          'ServerScript': 'SS',
          'ClientScript': 'CS',
          'DataSourceScript': 'DS'
        };
        const apiType = typeMap[item.type] || item.type;
        const resolvedItem = await enterpriseService.getItemByGuid(uri, apiType);
        if (resolvedItem && resolvedItem.uri) {
          uri = resolvedItem.uri;
          console.log('Resolved URI:', uri);
        } else {
          console.error('Failed to resolve GUID to URI');
          return;
        }
      }

      const success = await enterpriseService.undoCheckOut(uri);
      if (success) {
        // Remove the item from the list
        setItems(items.filter(i => i.id !== item.id));
        console.log('Undo check out successful');
      } else {
        console.error('Failed to undo check out');
      }
    } catch (err) {
      console.error('Failed to undo check out:', err);
    }
  };

  const itemTypeIcons: Record<string, string> = {
    'SS': '🖥️',
    'CS': '🖱️',
    'DS': '🗃️',
    'HTMLFORMXML': '🌐',
    'HTMLFORMCODE': '📄',
    'XFDFORMXML': '📝',
    'XFDFORMCODE': '📄',
    'TABLE': '📊',
    'AppServerScript': 'S',
    'ServerScript': 'S',
    'AppClientScript': 'JS',
    'ClientScript': 'JS',
    'AppDataSourceScript': 'SQL',
    'DataSourceScript': 'SQL',
    'HTMLForm': 'HTML',
    'DEFAULT': '•'
  };

  return (
    <div className="p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-2 min-h-[28px]">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-[#bbbbbb] uppercase tracking-wide truncate">Checked Out <span className="text-slate-400 dark:text-[#777]">{items.length}</span></span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {items.length > 0 && (
            <>
              <button
                className="px-1.5 py-0.5 text-xs hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-white"
                title="Check In All"
                onClick={async () => {
                  if (!confirm(`Check in all ${items.length} items?`)) return;
                  const enterpriseService = getEnterpriseService();
                  const success = await enterpriseService.checkInAll();
                  if (success) {
                    loadCheckedOutItems();
                  } else {
                    alert('Failed to check in all items');
                  }
                }}
              >
                Check In All
              </button>
              <button
                className="px-1.5 py-0.5 text-xs hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-white"
                title="Export All"
                onClick={async () => {
                  const enterpriseService = getEnterpriseService();
                  const success = await enterpriseService.exportCheckouts();
                  if (success) {
                    alert('Export successful');
                  } else {
                    alert('Export failed');
                  }
                }}
              >
                Export
              </button>
            </>
          )}
          <button
            className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            title="Refresh"
            onClick={loadCheckedOutItems}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="text-slate-700 dark:text-slate-300">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-500 dark:text-slate-400">
            <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            No checked out items
          </div>
        ) : (
          <div className="space-y-px relative">
            {items.map(item => (
              <div
                key={item.id}
                className={`px-2 py-1.5 cursor-pointer hover:bg-slate-200 dark:hover:bg-[#2a2d2e] group border-l-2 ${
                  selectedItem?.id === item.id ? 'bg-slate-200 dark:bg-[#37373d] border-[#4daafc]' : 'border-transparent'
                }`}
                onClick={() => setSelectedItem(item)}
                onDoubleClick={() => handleOpenFile(item)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ item, x: e.clientX, y: e.clientY });
                }}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="mt-0.5 min-w-[27px] h-[18px] px-1 rounded-sm flex items-center justify-center bg-slate-300 dark:bg-[#333] text-[9px] font-bold text-slate-600 dark:text-[#c5c5c5]">
                    {itemTypeIcons[item.type] || itemTypeIcons.DEFAULT}
                  </span>
                  <div className="flex-1 min-w-0" title={`${item.name}\n${item.path || item.uri || ''}\nChecked out by ${item.user} on ${formatDate(item.date)}`}>
                    <div className="truncate text-[12px] text-slate-700 dark:text-[#d4d4d4]">{item.name}</div>
                    <div className="truncate text-[10px] text-slate-400 dark:text-[#858585]">{item.path || item.rawType || item.type}{item.language ? ` · ${item.language}` : ''}</div>
                  </div>
                  <span className="text-[9px] text-slate-400 dark:text-[#6f9e6f] flex-shrink-0">{item.user}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          items={[
            { id: 'open', label: '打开 (Open)', icon: '📂' },
            { id: 'reference-ai', label: '引用到 AI (@ Context)', icon: '@' },
            { id: 'divider1', label: '', divider: true },
            { id: 'checkin', label: '签入 (Check In)', icon: '📥' },
            { id: 'undo', label: '撤销签出 (Undo)', icon: '↩️', danger: true },
          ]}
          onClose={() => setContextMenu(null)}
          onSelect={(id) => {
            if (id === 'open') {
              handleOpenFile(contextMenu.item);
            } else if (id === 'reference-ai') {
              void handleReferenceForAi(contextMenu.item);
            } else if (id === 'checkin') {
              handleCheckIn(contextMenu.item);
            } else if (id === 'undo') {
              handleUndoCheckOut(contextMenu.item);
            }
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
}
