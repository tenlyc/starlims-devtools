import { useState, useEffect } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { editorStore } from '../../stores/editorStore';
import { registerCheckedOutRefresh } from '../../services/checkedOutStore';
import { ContextMenu } from '../ContextMenu';
import { useAiContextStore } from '../../services/aiContextStore';
import { useI18n } from '../../i18n';
import { checkInItemWithGate, undoCheckoutWithGate } from '../../services/writeGateService';
import { TreeItemIcon } from './TreeItemIcon';

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
  guid?: string;
}

interface CheckedOutTreeNode {
  id: string;
  label: string;
  children: CheckedOutTreeNode[];
  item?: CheckedOutItem;
}

const FORM_PART_ORDER: Record<string, number> = {
  HTMLFORMXML: 0,
  XFDFORMXML: 0,
  HTMLFORMCODE: 1,
  XFDFORMCODE: 1,
  HTMLFORMGUIDE: 2,
  HTMLFORMRESOURCES: 3,
  XFDFORMRESOURCES: 3
};

const LOCALIZED_FORM_PART_TYPES = new Set([
  'HTMLFORMXML',
  'HTMLFORMGUIDE',
  'HTMLFORMRESOURCES',
  'XFDFORMXML',
  'XFDFORMRESOURCES'
]);

export function getCheckedOutDisplayLanguage(item: CheckedOutItem): string | undefined {
  if (!LOCALIZED_FORM_PART_TYPES.has(item.type.toUpperCase())) return undefined;
  const language = item.language?.trim();
  return language ? language.toUpperCase() : undefined;
}

function formBaseName(label: string): string {
  return label.replace(/\s*\[(?:XML|Code Behind|Guide|Resources)\]\s*$/i, '');
}

export function buildCheckedOutTree(items: CheckedOutItem[]): CheckedOutTreeNode[] {
  const roots: CheckedOutTreeNode[] = [];

  for (const item of items) {
    const folders = (item.path || 'Other').split('/').map((part) => part.trim()).filter(Boolean);
    let level = roots;
    let parentId = '';

    for (const folder of folders) {
      parentId = `${parentId}/${folder}`;
      let node = level.find((candidate) => candidate.id === parentId);
      if (!node) {
        node = { id: parentId, label: folder, children: [] };
        level.push(node);
      }
      level = node.children;
    }

    level.push({
      id: `item:${item.id}`,
      label: item.name,
      children: [],
      item
    });
  }

  const sortNodes = (nodes: CheckedOutTreeNode[]) => {
    nodes.sort((left, right) => {
      if (!!left.item !== !!right.item) return left.item ? 1 : -1;
      if (left.item && right.item) {
        const baseOrder = formBaseName(left.label).localeCompare(formBaseName(right.label), undefined, { sensitivity: 'base' });
        if (baseOrder !== 0) return baseOrder;
        const partOrder = (FORM_PART_ORDER[left.item.type.toUpperCase()] ?? 99) - (FORM_PART_ORDER[right.item.type.toUpperCase()] ?? 99);
        if (partOrder !== 0) return partOrder;
      }
      return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function collectFolderIds(nodes: CheckedOutTreeNode[]): string[] {
  return nodes.flatMap((node) => node.item ? [] : [node.id, ...collectFolderIds(node.children)]);
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
  const { t } = useI18n();
  const [items, setItems] = useState<CheckedOutItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<CheckedOutItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ item: CheckedOutItem; x: number; y: number } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
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

      const mappedItems: CheckedOutItem[] = checkedOutItems.map((item: any) => ({
        id: item.uri || item.id,
        name: item.name,
        type: item.type || 'DEFAULT',
        user: item.checkedOutBy || 'Unknown',
        date: item.checkedOutDate || '',
        uri: item.uri,
        path: item.displayPath,
        language: item.language,
        rawType: item.rawType,
        guid: item.guid
      }));

      setItems(mappedItems);
      setExpandedFolders(new Set(collectFolderIds(buildCheckedOutTree(mappedItems))));
      console.log('Loaded checked out items:', mappedItems.length);
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

      const code = await enterpriseService.getItemCode(uri, item.language);
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
      addAiContext({ id: uri, name: item.name, uri, type: item.type, language: item.language, content, source: 'checkout' });
      window.dispatchEvent(new CustomEvent('ai:show'));
    } catch (error) {
      console.error('Failed to reference checked-out item:', error);
    }
  };

  const handleCheckIn = async (item: CheckedOutItem) => {
    try {
      const uri = await resolveItemUri(item);
      if (!uri) throw new Error('Could not resolve the STARLIMS item URI.');
      const result = await checkInItemWithGate({
        source: 'editor',
        action: 'checkin',
        uri,
        language: item.language,
        approved: true
      });
      if (!result.success) throw new Error(result.message || 'Check in failed.');
      await loadCheckedOutItems();
    } catch (error) {
      console.error('Failed to check in:', error);
      alert(error instanceof Error ? error.message : String(error));
    }
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

      const success = await undoCheckoutWithGate({ source: 'editor', action: 'undo-checkout', uri, language: item.language, approved: true });
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

  const treeNodes = buildCheckedOutTree(items);

  const renderTreeNode = (node: CheckedOutTreeNode, level: number): JSX.Element => {
    const isFolder = !node.item;
    const isExpanded = expandedFolders.has(node.id);
    const item = node.item;
    const displayLanguage = item ? getCheckedOutDisplayLanguage(item) : undefined;
    const checkoutLabel = item
      ? t(displayLanguage ? 'checkout.byWithLanguage' : 'checkout.by', {
          user: item.user,
          language: displayLanguage || ''
        })
      : '';

    return (
      <div key={node.id}>
        <div
          className={`workbench-tree-row ${item && selectedItem?.id === item.id ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 16 + 6}px` }}
          onClick={() => {
            if (isFolder) {
              setExpandedFolders((current) => {
                const next = new Set(current);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              });
            } else if (item) {
              setSelectedItem(item);
            }
          }}
          onDoubleClick={() => item && handleOpenFile(item)}
          onContextMenu={(event) => {
            if (!item) return;
            event.preventDefault();
            setContextMenu({ item, x: event.clientX, y: event.clientY });
          }}
          title={item ? `${item.name}\n${item.uri || ''}\n${t('checkout.byOn', { user: item.user, date: formatDate(item.date) })}${displayLanguage ? `\n${t('checkout.language', { language: displayLanguage })}` : ''}` : node.label}
        >
          <span className={`workbench-tree-chevron ${isFolder ? '' : 'invisible'}`} onClick={(event) => {
            event.stopPropagation();
            if (!isFolder) return;
            setExpandedFolders((current) => {
              const next = new Set(current);
              if (next.has(node.id)) next.delete(node.id);
              else next.add(node.id);
              return next;
            });
          }}>
            <svg viewBox="0 0 12 12" className={isExpanded ? 'rotate-90' : ''} aria-hidden="true">
              <path d="m4 2.5 3.5 3.5L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <TreeItemIcon type={item?.type || 'CATEGORY'} label={node.label} folder={isFolder} expanded={isExpanded} />
          <span className={`workbench-tree-label ${isFolder ? 'font-medium' : 'checked-out'}`}>
            {node.label}{item ? ` ${checkoutLabel}` : ''}
          </span>
        </div>
        {isFolder && isExpanded && node.children.map((child) => renderTreeNode(child, level + 1))}
      </div>
    );
  };

  return (
    <div className="workbench-section">
      {/* Header */}
      <div className="workbench-section-header">
        <span className="workbench-section-title">{t('checkout.title')} <span className="workbench-count-badge">{items.length}</span></span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            className="workbench-toolbar-button"
            title={t('common.refresh')}
            onClick={loadCheckedOutItems}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="workbench-tree-scroll text-slate-700 dark:text-slate-300">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-500 dark:text-slate-400">
            <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {t('common.loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500">
            {t('checkout.empty')}
          </div>
        ) : (
          <div className="relative">
            {treeNodes.map((node) => renderTreeNode(node, 0))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          items={[
            { id: 'open', label: t('context.open'), icon: '📂' },
            { id: 'reference-ai', label: t('context.referenceAi'), icon: '@' },
            { id: 'divider1', label: '', divider: true },
            { id: 'checkin', label: t('context.checkIn'), icon: '📥' },
            { id: 'undo', label: t('context.undoCheckOut'), icon: '↩️', danger: true },
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
