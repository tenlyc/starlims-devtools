import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useServerStore } from '../../stores/serverStore';
import { getEnterpriseService } from '../../services/enterpriseService';
import { editorStore } from '../../stores/editorStore';
import { ContextMenu, ContextMenuItem } from '../ContextMenu';
import { VersionHistoryDialog } from '../SCM/VersionHistoryDialog';
import { useI18n } from '../../i18n';
import { buildEnterpriseSearchTree, collectSearchFolderIds } from '../../services/enterpriseSearchTree';
import { checkInItemWithGate, checkoutItemWithGate, executeDataSourceWithGate, executeServerScriptWithGate, undoCheckoutWithGate } from '../../services/writeGateService';
import { primaryShortcut } from '../../services/platformShortcuts';
import { useOutputLogStore } from '../../services/outputLogStore';
import { TreeItemIcon } from './TreeItemIcon';

export interface TreeItem {
  id: string;
  label: string;
  type: string;
  uri?: string;
  hasChildren?: boolean;
  children?: TreeItem[];
  isLoading?: boolean;
  checkedOutBy?: string;
  language?: string;
  guid?: string;
}

// Generate unique key for tree items
function getItemKey(item: TreeItem, index: number): string {
  return `${item.id || item.uri || item.label}-${item.type}-${index}`;
}

function resultLeafCount(items: TreeItem[]): number {
  return items.reduce((count, item) => count + (item.children?.length
    ? resultLeafCount(item.children)
    : 1), 0);
}

interface TreeNodeProps {
  item: TreeItem;
  level: number;
  onItemClick: (item: TreeItem) => void;
  onItemExpand: (item: TreeItem) => void;
  onContextMenu: (e: React.MouseEvent, item: TreeItem) => void;
  onDoubleClick: (item: TreeItem) => void;
  expandedItems: Set<string>;
  selectedItemId?: string;
}

function TreeNode({ item, level, onItemClick, onItemExpand, onContextMenu, onDoubleClick, expandedItems, selectedItemId }: TreeNodeProps) {
  const isExpanded = expandedItems.has(item.id);
  const hasChildren = item.hasChildren || (item.children && item.children.length > 0);
  const isCheckedOut = !!item.checkedOutBy;

  const handleClick = () => {
    onItemClick(item);
  };

  const handleDoubleClick = () => {
    onDoubleClick(item);
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onItemExpand(item);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    onContextMenu(e, item);
  };

  return (
    <div>
      <div
        className={`workbench-tree-row ${selectedItemId === item.id ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 6}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        title={`${item.type}: ${item.uri || item.label}`}
      >
        {/* Expand/collapse arrow */}
        <span
          className={`workbench-tree-chevron ${hasChildren ? '' : 'invisible'}`}
          onClick={handleExpandClick}
        >
          <svg viewBox="0 0 12 12" className={isExpanded ? 'rotate-90' : ''} aria-hidden="true">
            <path d="m4 2.5 3.5 3.5L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        {/* Icon with check-out status */}
        <TreeItemIcon type={item.type} label={item.label} folder={!!hasChildren} expanded={isExpanded} checkedOut={isCheckedOut} />

        {/* Label */}
        <span className={`workbench-tree-label ${isCheckedOut ? 'checked-out' : ''}`}>
          {item.label}
        </span>

        {/* Loading indicator */}
        {item.isLoading && (
          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">…</span>
        )}
      </div>

      {/* Children */}
      {isExpanded && item.children && (
        <div>
          {item.children.map((child, index) => (
            <TreeNode
              key={getItemKey(child, index)}
              item={child}
              level={level + 1}
              onItemClick={onItemClick}
              onItemExpand={onItemExpand}
              onContextMenu={onContextMenu}
              onDoubleClick={onDoubleClick}
              expandedItems={expandedItems}
              selectedItemId={selectedItemId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function EnterpriseTree() {
  const { t } = useI18n();
  const [rootItems, setRootItems] = useState<TreeItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<TreeItem | null>(null);
  const [_isLoading, _setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: TreeItem } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [historyItem, setHistoryItem] = useState<TreeItem | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TreeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchType, setSearchType] = useState<'name' | 'global'>('name'); // 'name' = search by name, 'global' = global code search
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isSearchBarOpen, setIsSearchBarOpen] = useState(false);

  const { currentServer, isConnected } = useServerStore();
  const currentUser = currentServer?.user || '';

  // Refresh function to be called after add/rename/delete/move
  const refreshTree = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const openSearch = useCallback((type: 'name' | 'global') => {
    setSearchType(type);
    setIsSearchBarOpen(true);
    window.setTimeout(() => {
      const searchInput = document.querySelector('#enterprise-tree-search input') as HTMLInputElement | null;
      searchInput?.focus();
      searchInput?.select();
    }, 0);
  }, []);

  // Listen for global search trigger event (from keyboard shortcut in editor)
  useEffect(() => {
    const handleTriggerGlobalSearch = () => {
      openSearch('global');
    };

    window.addEventListener('trigger-global-search', handleTriggerGlobalSearch);
    return () => {
      window.removeEventListener('trigger-global-search', handleTriggerGlobalSearch);
    };
  }, [openSearch]);

  // Reveal item in tree by expanding path to it
  const revealItemInTree = useCallback(async (itemUri: string) => {
    console.log('Revealing item in tree:', itemUri);

    // Parse URI to build path
    // URI format: /Applications/AppName/Category/ScriptType/ItemName
    // or /ServerScripts/Category/ItemName
    // or /DataSources/Category/ItemName
    // etc.

    const parts = itemUri.split('/').filter(p => p);
    console.log('URI parts:', parts);

    if (parts.length < 2) return;

    // Build path segments to expand
    // For /Applications/AppName/Category/ScriptType/ItemName
    // We need to expand: /Applications, /Applications/AppName, etc.

    let pathToExpand = '';
    for (let i = 0; i < parts.length - 1; i++) {
      pathToExpand = '/' + parts.slice(0, i + 1).join('/');
      console.log('Expanding path:', pathToExpand);

      // Check if already expanded
      if (!expandedItems.has(pathToExpand)) {
        // Find the item at this path
        const findItem = (items: TreeItem[], path: string): TreeItem | null => {
          for (const item of items) {
            if (item.uri === path || item.id === path) {
              return item;
            }
            if (item.children) {
              const found = findItem(item.children, path);
              if (found) return found;
            }
          }
          return null;
        };

        const itemToExpand = findItem(rootItems, pathToExpand);
        if (itemToExpand && !itemToExpand.children?.length) {
          // Load children first
          const children = await loadChildren(itemToExpand);
          setRootItems(prev => updateItemWithChildren(prev, itemToExpand.id, children));
        }

        // Mark as expanded
        setExpandedItems(prev => {
          const next = new Set(prev);
          next.add(pathToExpand);
          return next;
        });
      }
    }

    // Finally select the target item
    const findTargetItem = (items: TreeItem[], uri: string): TreeItem | null => {
      for (const item of items) {
        if (item.uri === uri || item.id === uri) {
          return item;
        }
        if (item.children) {
          const found = findTargetItem(item.children, uri);
          if (found) return found;
        }
      }
      return null;
    };

    const targetItem = findTargetItem(rootItems, itemUri);
    if (targetItem) {
      setSelectedItem(targetItem);
    }
  }, [expandedItems, rootItems]);

  // Handle context menu (right-click)
  const handleContextMenu = (e: React.MouseEvent, item: TreeItem) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedItem(item);
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  // Handle double-click to open file
  const handleDoubleClick = async (item: TreeItem) => {
    // If it has children, expand it instead of opening
    if (item.hasChildren) {
      handleItemExpand(item);
      return;
    }

    // Open file in editor
    if (item.uri && !item.hasChildren) {
      try {
        const enterpriseService = getEnterpriseService();
        const code = await enterpriseService.getItemCode(item.uri, item.language);
        if (code) {
          editorStore.getState().openFile({
            uri: item.uri,
            name: item.label,
            type: item.type,
            language: item.language,
            content: code,
            guid: item.guid
          });
        }
      } catch (err) {
        console.error('Failed to open file:', err);
      }
    }
  };

  // Check Out item
  const handleCheckOut = async (item: TreeItem) => {
    if (!item.uri) return;

    try {
      const result = await checkoutItemWithGate({ source: 'editor', action: 'checkout', uri: item.uri, language: item.language, approved: true });

      if (result.success) {
        console.log('Check out successful');
        // Update the specific item's status
        refreshItemStatus(item.uri, true, currentUser);
      }
    } catch (err) {
      console.error('Failed to check out:', err);
    }
  };

  // Check In item
  const handleCheckIn = async (item: TreeItem) => {
    if (!item.uri) return;

    try {
      const reason = ''; // Could prompt user for reason
      const result = await checkInItemWithGate({ source: 'editor', action: 'checkin', uri: item.uri, reason, language: item.language, approved: true });

      if (result.success) {
        console.log('Check in successful');
        // Refresh tree
        refreshItemStatus(item.uri, false);
      }
    } catch (err) {
      console.error('Failed to check in:', err);
    }
  };

  // Undo Check Out
  const handleUndoCheckOut = async (item: TreeItem) => {
    if (!item.uri) return;

    try {
      const success = await undoCheckoutWithGate({ source: 'editor', action: 'undo-checkout', uri: item.uri, language: item.language, approved: true });

      if (success) {
        console.log('Undo check out successful');
        refreshItemStatus(item.uri, false);
      }
    } catch (err) {
      console.error('Failed to undo check out:', err);
    }
  };

  // Refresh item status in tree
  const refreshItemStatus = (uri: string, isCheckedOut: boolean, checkedOutBy?: string) => {
    const updateItem = (items: TreeItem[]): TreeItem[] => {
      return items.map(item => {
        if (item.uri === uri) {
          return { ...item, checkedOutBy: checkedOutBy };
        }
        if (item.children) {
          return { ...item, children: updateItem(item.children) };
        }
        return item;
      });
    };
    setRootItems(updateItem);
  };

  // Get context menu items based on item type
  const getContextMenuItems = (item: TreeItem): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    // Determine if item is a folder or category
    const isFolder = item.hasChildren || ['CATEGORY', 'APP', 'ENT_TABLES_DATABASE', 'ENT_TABLES_DICTIONARY', 'FOLDER'].includes(item.type);
    const isServerLog = item.type === 'SERVERLOG';

    // Folders can have Add, but no checkout/runscript operations
    if (isFolder && !isServerLog) {
      items.push({
        id: 'add',
        label: t('context.add'),
        icon: '➕'
      });
      return items;
    }

    if (isServerLog) {
      return []; // No context menu for server logs
    }

    const isCheckedOut = !!item.checkedOutBy;
    const isCheckedOutByMe = item.checkedOutBy === currentUser;

    // Add New for non-folders
    items.push({
      id: 'add',
      label: t('context.add'),
      icon: '➕'
    });

    // Rename and Delete for checked out items
    if (isCheckedOut && isCheckedOutByMe) {
      items.push({
        id: 'rename',
        label: t('context.rename'),
        icon: '✏️'
      });
      items.push({
        id: 'delete',
        label: t('common.delete'),
        icon: '🗑️'
      });
      items.push({
        id: 'move',
        label: t('context.move'),
        icon: '📁'
      });
    }

    // Check Out option
    if (!isCheckedOut) {
      items.push({
        id: 'checkout',
        label: t('context.checkOut'),
        icon: '🔓'
      });
    }

    // Check In and Undo Check Out (only if checked out by current user)
    if (isCheckedOut && isCheckedOutByMe) {
      items.push({
        id: 'checkin',
        label: t('context.checkIn'),
        icon: '🔒'
      });
      items.push({
        id: 'undocheckout',
        label: t('context.undoCheckOut'),
        icon: '↩️'
      });
    }

    // Add divider and open option for non-folders
    if (items.length > 0 && !isFolder) {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
    }

    // Open file option
    if (!isFolder && item.uri) {
      items.push({
        id: 'open',
        label: t('context.open'),
        icon: '📄'
      });
    }

    // Run Script for SS/APPSS
    if (item.type === 'SS' || item.type === 'APPSS') {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'runscript',
        label: t('context.runScript'),
        icon: '▶️'
      });
    }

    // Run DataSource for DS/APPDS
    if (item.type === 'DS' || item.type === 'APPDS') {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'rundatasource',
        label: t('context.runDataSource'),
        icon: '▶️'
      });
    }

    // Generate SQL for TABLE
    if (item.type === 'TABLE') {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'generate-select',
        label: t('context.generateSelect'),
        icon: '📤'
      });
      items.push({
        id: 'generate-insert',
        label: t('context.generateInsert'),
        icon: '➕'
      });
      items.push({
        id: 'generate-update',
        label: t('context.generateUpdate'),
        icon: '✏️'
      });
      items.push({
        id: 'generate-delete',
        label: t('context.generateDelete'),
        icon: '🗑️'
      });
    }

    // Form operations for HTML/XFD Forms
    if (item.type === 'HTMLFORMXML' || item.type === 'XFDFORMXML') {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'openform',
        label: t('context.openForm'),
        icon: '🌐'
      });
      if (item.type === 'HTMLFORMXML') {
        items.push({
          id: 'debugform',
          label: t('editor.debugForm'),
          icon: '🐛'
        });
        items.push({
          id: 'designform',
          label: t('editor.designForm'),
          icon: '✏️'
        });
      }
    }

    // XFD Form launch
    if (item.type === 'XFDFORMXML') {
      items.push({
        id: 'launchxfdform',
        label: t('context.launchXfdForm'),
        icon: '🚀'
      });
    }

    // GoTo Navigation - for scripts and forms
    if (['SS', 'APPSS', 'CS', 'APPCS', 'DS', 'APPDS', 'HTMLFORMCODE', 'XFDFORMCODE'].includes(item.type)) {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'goto-item',
        label: t('context.goToItem'),
        icon: '🔍'
      });
      if (item.type === 'SS' || item.type === 'APPSS') {
        items.push({
          id: 'goto-serverscript',
          label: t('context.goToServerScript'),
          icon: '🖥️'
        });
      }
      if (item.type === 'CS' || item.type === 'APPCS') {
        items.push({
          id: 'goto-clientscript',
          label: t('context.goToClientScript'),
          icon: '🖱️'
        });
      }
      if (item.type === 'DS' || item.type === 'APPDS') {
        items.push({
          id: 'goto-datasource',
          label: t('context.goToDataSource'),
          icon: '🗃️'
        });
      }
      if (item.type === 'HTMLFORMCODE' || item.type === 'XFDFORMCODE') {
        items.push({
          id: 'goto-form',
          label: t('context.goToForm'),
          icon: '🌐'
        });
      }
    }

    // Version History & Labels (official SCM feature) for code items and forms
    if (!isFolder && item.uri && ['SS', 'APPSS', 'CS', 'APPCS', 'DS', 'APPDS',
      'HTMLFORMXML', 'HTMLFORMCODE', 'HTMLFORMGUIDE', 'HTMLFORMRESOURCES',
      'XFDFORMXML', 'XFDFORMCODE', 'XFDFORMRESOURCES'].includes(item.type)) {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'version-history',
        label: t('history.title'),
        icon: '📜'
      });
    }

    return items;
  };

  // Handle context menu selection
  const handleContextMenuSelect = async (actionId: string) => {
    if (!contextMenu) return;

    const item = contextMenu.item;

    switch (actionId) {
      case 'add':
        // Show add dialog
        {
          const name = prompt('Enter item name:');
          if (!name) return;

          // Show type selection dialog
          const type = prompt('Enter item type (e.g., SS for ServerScript, CS for ClientScript, DS for DataSource):');
          if (!type) return;

          const enterpriseService = getEnterpriseService();
          const success = await enterpriseService.addItem(item.uri || item.id, name, type);
          if (success) {
            alert('Item added successfully');
            // Refresh tree
            if (rootItems.length > 0) {
              refreshTree();
            }
          } else {
            alert('Failed to add item');
          }
        }
        break;
      case 'rename':
        {
          const newName = prompt('Enter new name:', item.label);
          if (!newName || newName === item.label) return;

          const enterpriseService = getEnterpriseService();
          const success = await enterpriseService.renameItem(item.uri || item.id, newName);
          if (success) {
            // Refresh tree
            refreshTree();
          } else {
            alert('Failed to rename item');
          }
        }
        break;
      case 'delete':
        {
          if (!confirm(`Are you sure you want to delete "${item.label}"?`)) return;

          const enterpriseService = getEnterpriseService();
          const success = await enterpriseService.deleteItem(item.uri || item.id);
          if (success) {
            // Refresh tree
            refreshTree();
          } else {
            alert('Failed to delete item');
          }
        }
        break;
      case 'move':
        {
          const destination = prompt('Enter destination folder URI:');
          if (!destination) return;

          const enterpriseService = getEnterpriseService();
          const success = await enterpriseService.moveItem(item.uri || item.id, destination);
          if (success) {
            // Refresh tree
            refreshTree();
          } else {
            alert('Failed to move item');
          }
        }
        break;
      case 'checkout':
        await handleCheckOut(item);
        break;
      case 'checkin':
        await handleCheckIn(item);
        break;
      case 'undocheckout':
        await handleUndoCheckOut(item);
        break;
      case 'open':
        await handleDoubleClick(item);
        break;
      case 'runscript':
        if (item.uri) {
          const result = await executeServerScriptWithGate({ source: 'editor', action: 'execute-script', uri: item.uri, language: item.language, approved: true });
          console.log('Script result:', result);
        }
        break;
      case 'rundatasource':
        if (item.uri) {
          const result = await executeDataSourceWithGate({ source: 'editor', action: 'execute-data-source', uri: item.uri, language: item.language, approved: true });
          const output = useOutputLogStore.getState();
          if (result.success) {
            output.addEntry({ level: 'success', source: 'Editor', message: `Data source executed successfully: ${result.rowCount} row${result.rowCount === 1 ? '' : 's'}` });
            output.addQueryResult(`Results for: ${item.label}`, { columns: result.columns, rows: result.rows, rowCount: result.rowCount });
          } else {
            output.addEntry({ level: 'error', source: 'Editor', message: `Data source execution failed: ${result.error || 'Unknown error'}` });
          }
        }
        break;
      case 'generate-select':
      case 'generate-insert':
      case 'generate-update':
      case 'generate-delete':
        if (item.uri) {
          const enterpriseService = getEnterpriseService();
          const tableUri = item.uri;
          let sql = '';
          switch (actionId) {
            case 'generate-select':
              sql = await enterpriseService.generateTableSelect(tableUri);
              break;
            case 'generate-insert':
              sql = await enterpriseService.generateTableInsert(tableUri);
              break;
            case 'generate-update':
              sql = await enterpriseService.generateTableUpdate(tableUri);
              break;
            case 'generate-delete':
              sql = await enterpriseService.generateTableDelete(tableUri);
              break;
          }
          if (sql) {
            // Open in editor
            editorStore.getState().openFile({
              uri: `generated-sql-${actionId}`,
              name: `${item.label}_${actionId.replace('generate-', '')}.sql`,
              type: 'DS',
              content: sql
            });
          }
        }
        break;
      case 'openform':
      case 'debugform':
      case 'designform':
      case 'launchxfdform':
        if (item.uri) {
          const enterpriseService = getEnterpriseService();
          const starlimsUrl = useServerStore.getState().currentServer?.url || '';

          if (item.type === 'HTMLFORMXML' || item.type === 'HTMLFORMCODE') {
            // Use GUID from tree data directly
            const guid = item.guid || await enterpriseService.getGUID(item.uri);
            if (guid) {
              // Get langid from enterpriseService session
              const sessionLangId = enterpriseService.getSessionInfo()?.langid || 'ENG';
              // Build URL based on action
              let formUrl: string;
              if (actionId === 'designform') {
                // DesignForm: Open FormDesigner with target form as argument
                // FormDesigner GUID: 1D09BB79-2D28-4594-8B03-26306F5C8AEC
                // Use ENG like VS Code plugin
                formUrl = `${starlimsUrl}/starthtml.lims?FormId=1D09BB79-2D28-4594-8B03-26306F5C8AEC&LangId=ENG&Debug=true&FormArgs=%22${guid}%22`;
              } else {
                formUrl = `${starlimsUrl}/starthtml.lims?FormId=${guid}&LangId=${sessionLangId}`;
                if (actionId === 'debugform') {
                  formUrl += '&Debug=true';
                }
              }
              // Open in system browser using electronAPI
              if (window.electronAPI && window.electronAPI.openSystemBrowser) {
                window.electronAPI.openSystemBrowser(formUrl);
              } else {
                window.open(formUrl, '_blank');
              }
            }
          } else if (item.type === 'XFDFORMXML') {
            // Launch XFD Form via bridge
            if (actionId === 'launchxfdform') {
              const success = await enterpriseService.runXFDForm(item.uri);
              if (success) {
                console.log('XFD Form launched successfully');
              }
            } else {
              // Open in system browser - use GUID from tree data
              const guid = item.guid || await enterpriseService.getGUID(item.uri);
              if (guid) {
                const sessionLangId = enterpriseService.getSessionInfo()?.langid || 'ENG';
                let formUrl: string;
                if (actionId === 'designform') {
                  // DesignForm: Open FormDesigner with target form as argument
                  // Use ENG like VS Code plugin
                  formUrl = `${starlimsUrl}/starthtml.lims?FormId=1D09BB79-2D28-4594-8B03-26306F5C8AEC&LangId=ENG&Debug=true&FormArgs=%22${guid}%22`;
                } else {
                  formUrl = `${starlimsUrl}/starthtml.lims?FormId=${guid}&LangId=${sessionLangId}`;
                  if (actionId === 'debugform') {
                    formUrl += '&Debug=true';
                  }
                }
                if (window.electronAPI && window.electronAPI.openSystemBrowser) {
                  window.electronAPI.openSystemBrowser(formUrl);
                } else {
                  window.open(formUrl, '_blank');
                }
              }
            }
          }
        }
        break;
      case 'goto-item':
      case 'goto-serverscript':
      case 'goto-clientscript':
      case 'goto-datasource':
      case 'goto-form':
        // Navigate to related item
        {
          const enterpriseService = getEnterpriseService();

          // Extract script name from label (remove file extension like .ssl, .slsql, etc.)
          let itemName = item.label;
          // Remove common extensions
          itemName = itemName.replace(/\.(ssl|slsql|xml|html|xfd|ds|cs|ss|js)$/i, '');
          // For forms, also remove CodeBehind/XML suffixes if present
          itemName = itemName.replace(/(CodeBehind|XML|Guide)$/i, '');

          console.log('GoTo searching for:', itemName, 'from label:', item.label);

          // Determine search types to try
          let searchTypes: string[] = [];
          switch (actionId) {
            case 'goto-serverscript':
              searchTypes = ['SS', 'APPSS'];
              break;
            case 'goto-clientscript':
              searchTypes = ['CS', 'APPCS'];
              break;
            case 'goto-datasource':
              searchTypes = ['DS', 'APPDS'];
              break;
            case 'goto-form':
              searchTypes = ['HTMLFORMCODE', 'XFDFORMCODE', 'HTMLFORMXML', 'XFDFORMXML'];
              break;
            default:
              // Auto-detect based on current item type
              searchTypes = [item.type];
          }

          // Search with broader match (exactMatch=false for more results)
          let foundItem: any = null;
          for (const searchType of searchTypes) {
            console.log('Searching for:', itemName, 'type:', searchType);
            const result = await enterpriseService.search(itemName, searchType, false);
            console.log('Search result:', result.items.length, 'items');
            if (result.items.length > 0) {
              foundItem = result.items[0];
              console.log('Found item:', foundItem.name || foundItem.label, 'type:', foundItem.type, 'uri:', foundItem.uri);
              break;
            }
          }

          if (foundItem && foundItem.uri) {
            // Reveal in tree and open
            await revealItemInTree(foundItem.uri);
            const code = await enterpriseService.getItemCode(
              foundItem.uri,
              foundItem.scriptLanguage || foundItem.language
            );
            if (code) {
              editorStore.getState().openFile({
                uri: foundItem.uri,
                name: foundItem.name || foundItem.label,
                type: foundItem.type,
                language: foundItem.scriptLanguage || foundItem.language,
                content: code,
                guid: foundItem.guid
              });
            }
          } else {
            console.log('Could not find item:', itemName, 'types:', searchTypes.join(', '));
          }
        }
        break;
      case 'version-history':
        setHistoryItem(item);
        break;
    }
  };

  const loadChildren = useCallback(async (item: TreeItem): Promise<TreeItem[]> => {
    try {
      const enterpriseService = getEnterpriseService();
      const uri = item.uri || item.id;
      console.log('Loading children for URI:', uri);
      const items = await enterpriseService.getEnterpriseItems(uri);

      console.log('Children response:', items.length, 'items');

      // Convert EnterpriseItem to TreeItem
      return items.map((enterpriseItem: any) => ({
        id: enterpriseItem.uri || enterpriseItem.id,
        label: enterpriseItem.name,
        type: enterpriseItem.type || 'DEFAULT',
        uri: enterpriseItem.uri,
        language: enterpriseItem.scriptLanguage || enterpriseItem.language,
        hasChildren: enterpriseItem.isFolder ?? enterpriseItem.hasChildren ?? false,
        children: enterpriseItem.children ? enterpriseItem.children.map((child: any) => ({
          id: child.uri || child.id,
          label: child.name,
          type: child.type || 'DEFAULT',
          uri: child.uri,
          language: child.scriptLanguage || child.language,
          hasChildren: child.isFolder ?? child.hasChildren ?? false,
          guid: child.guid
        })) : undefined,
        guid: enterpriseItem.guid
      }));
    } catch (err) {
      console.error('Failed to load children:', err);
      return [];
    }
  }, []);

  const handleItemClick = (item: TreeItem) => {
    setSelectedItem(item);
  };

  const handleItemExpand = async (item: TreeItem) => {
    const isExpanded = expandedItems.has(item.id);

    if (isExpanded) {
      // Collapse
      setExpandedItems(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } else {
      // Expand - load children if not already loaded
      if (!item.children || item.children.length === 0) {
        setRootItems(prev => updateItemWithLoading(prev, item.id, true));
        try {
          const children = await loadChildren(item);
          setRootItems(prev => updateItemWithChildren(prev, item.id, children));
        } catch (err) {
          console.error('Failed to load children:', err);
          setRootItems(prev => updateItemWithLoading(prev, item.id, false));
        }
      }

      setExpandedItems(prev => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
    }
  };

  // Handle search by name
  const handleSearchByName = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchLoading(true);
    setIsSearching(true);
    try {
      const enterpriseService = getEnterpriseService();
      const result = await enterpriseService.search(searchQuery.trim(), '', false);
      const items: TreeItem[] = result.items.map((item: any) => ({
        id: item.uri || item.id,
        label: item.name,
        type: item.type || 'DEFAULT',
        uri: item.uri,
        language: item.scriptLanguage || item.language,
        hasChildren: false,
        guid: item.guid
      }));
      const tree = buildEnterpriseSearchTree(items);
      setSearchResults(tree);
      setExpandedItems(new Set(collectSearchFolderIds(tree)));
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setIsSearchLoading(false);
    }
  };

  // Handle global code search
  const handleGlobalSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchLoading(true);
    setIsSearching(true);
    try {
      const enterpriseService = getEnterpriseService();
      const result = await enterpriseService.globalSearch(searchQuery.trim(), ['ALL']);
      const items: TreeItem[] = result.items.map((item: any) => ({
        id: item.uri || item.id,
        label: item.name,
        type: item.type || 'DEFAULT',
        uri: item.uri,
        language: item.scriptLanguage || item.language,
        hasChildren: false,
        guid: item.guid
      }));
      const tree = buildEnterpriseSearchTree(items);
      setSearchResults(tree);
      setExpandedItems(new Set(collectSearchFolderIds(tree)));
    } catch (err) {
      console.error('Global search failed:', err);
      setSearchResults([]);
    } finally {
      setIsSearchLoading(false);
    }
  };

  // Handle search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchType === 'name') {
      handleSearchByName();
    } else {
      handleGlobalSearch();
    }
  };

  // Clear search and return to tree
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    setIsSearchBarOpen(false);
  };

  // Initial load
  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener('enterprise:refresh', refresh);
    return () => window.removeEventListener('enterprise:refresh', refresh);
  }, []);

  useEffect(() => {
    if (isConnected && currentServer) {
      // Load root items from STARLIMS
      const loadRootItems = async () => {
        try {
          const enterpriseService = getEnterpriseService();
          const items = await enterpriseService.getEnterpriseItems('');

          const treeItems: TreeItem[] = items.map((item: any) => ({
            id: item.uri || item.id,
            label: item.name,
            type: item.type || 'DEFAULT',
            uri: item.uri,
            language: item.scriptLanguage || item.language,
            hasChildren: item.isFolder ?? item.hasChildren ?? false
          }));

          setRootItems(treeItems);
          console.log('Loaded root items:', treeItems.length);
        } catch (err) {
          console.error('Failed to load root items:', err);
          setRootItems([]);
        }
      };
      loadRootItems();
    } else {
      setRootItems([]);
    }
  }, [isConnected, currentServer, refreshKey]);

  return (
    <div className="workbench-section">
      {/* Header */}
      <div className="workbench-section-header">
        <span className="workbench-section-title">
          {isSearching ? t('sidebar.searchResults') : t('sidebar.enterprise')}
        </span>
        <div className="flex gap-1">
          {isSearching ? (
            <button
              className="workbench-toolbar-button"
              title={t('sidebar.backToTree')}
              onClick={handleClearSearch}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          ) : (
            <>
              <button
                className="workbench-toolbar-button"
                title={t('sidebar.refreshTree')}
                onClick={refreshTree}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                className={`workbench-toolbar-button ${searchType === 'name' && isSearchBarOpen ? 'active' : ''}`}
                title={t('sidebar.searchByName')}
                onClick={() => openSearch('name')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              <button
                className={`workbench-toolbar-button ${searchType === 'global' && isSearchBarOpen ? 'active' : ''}`}
                title={`${t('sidebar.searchCode')} (${primaryShortcut('CtrlOrCmd+Shift+F')})`}
                onClick={() => openSearch('global')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h3m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v4M15 3v5h5m1 13l-3-3m0 0a3 3 0 10-4.243-4.243A3 3 0 0018 18z" />
                </svg>
              </button>
              <button
                className="workbench-toolbar-button"
                title={t('sidebar.collapseAll')}
                onClick={() => setExpandedItems(new Set())}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8 8-8-8" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {isSearchBarOpen && <form onSubmit={handleSearchSubmit} id="enterprise-tree-search" className="workbench-search-bar">
        <div className="flex min-w-0 gap-1">
          <span className="workbench-search-kind">
            {searchType === 'name' ? t('sidebar.searchName') : t('sidebar.searchCodeShort')}
          </span>
          {/* Search Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchType === 'name' ? t('sidebar.searchPlaceholder') : t('sidebar.searchCodePlaceholder')}
            className="workbench-search-input"
          />
          <button
            type="submit"
            disabled={isSearchLoading || !searchQuery.trim()}
            className="workbench-toolbar-button"
            title={t('common.search')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button
            type="button"
            className="workbench-toolbar-button"
            title={t('sidebar.closeSearch')}
            onClick={handleClearSearch}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </form>}

      {/* Tree/Search Results content */}
      <div className="workbench-tree-scroll text-slate-700 dark:text-slate-300">
        {isSearching ? (
          // Search results view
          isSearchLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {t('sidebar.searching')}
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              {t('sidebar.noResults')}: “{searchQuery}”
            </div>
          ) : (
            <div>
              <div className="text-xs text-slate-500 px-2 mb-2">
                {t(searchType === 'global' ? 'sidebar.foundInCode' : 'sidebar.found', {
                  count: resultLeafCount(searchResults)
                })}
              </div>
              {searchResults.map((item, index) => (
                <TreeNode
                  key={getItemKey(item, index)}
                  item={item}
                  level={0}
                  onItemClick={handleItemClick}
                  onItemExpand={handleItemExpand}
                  onContextMenu={handleContextMenu}
                  onDoubleClick={handleDoubleClick}
                  expandedItems={expandedItems}
                  selectedItemId={selectedItem?.id}
                />
              ))}
            </div>
          )
        ) : (
          // Normal tree view
          rootItems.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              {isConnected ? t('sidebar.noResults') : t('sidebar.notConnected')}
            </div>
          ) : (
            rootItems.map((item, index) => (
              <TreeNode
                key={getItemKey(item, index)}
                item={item}
                level={0}
                onItemClick={handleItemClick}
                onItemExpand={handleItemExpand}
                onContextMenu={handleContextMenu}
                onDoubleClick={handleDoubleClick}
                expandedItems={expandedItems}
                selectedItemId={selectedItem?.id}
              />
            ))
          )
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          items={getContextMenuItems(contextMenu.item)}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onSelect={handleContextMenuSelect}
        />
      )}

      {/* Selected item info */}
      {selectedItem && (
        <div className="workbench-selection-footer">
          <div className="min-w-0 truncate text-[11px] text-slate-500 dark:text-[#8f8f8f]">
            <span className="text-slate-700 dark:text-[#cccccc]">{selectedItem.label}</span>
            {selectedItem.checkedOutBy && (
              <span className="ml-2 text-green-700 dark:text-[#73c991]">· {selectedItem.checkedOutBy}</span>
            )}
          </div>
        </div>
      )}

      {/* Version History dialog */}
      <VersionHistoryDialog
        isOpen={!!historyItem}
        onClose={() => setHistoryItem(null)}
        uri={historyItem?.uri || ''}
        itemName={historyItem?.label}
      />
    </div>
  );
}

// Helper functions
function updateItemWithLoading(items: TreeItem[], id: string, isLoading: boolean): TreeItem[] {
  return items.map(item => {
    if (item.id === id) {
      return { ...item, isLoading };
    }
    if (item.children) {
      return { ...item, children: updateItemWithLoading(item.children, id, isLoading) };
    }
    return item;
  });
}

function updateItemWithChildren(items: TreeItem[], id: string, children: TreeItem[]): TreeItem[] {
  return items.map(item => {
    if (item.id === id) {
      return { ...item, children, isLoading: false };
    }
    if (item.children) {
      return { ...item, children: updateItemWithChildren(item.children, id, children) };
    }
    return item;
  });
}
