import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useServerStore } from '../../stores/serverStore';
import { getEnterpriseService } from '../../services/enterpriseService';
import { editorStore } from '../../stores/editorStore';
import { ContextMenu, ContextMenuItem } from '../ContextMenu';

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

// Icon mapping for different item types
const itemTypeIcons: Record<string, string> = {
  'SERVERLOG': '📋',
  'CATEGORY': '📁',
  'APPLICATION': '📦',
  'APP': '📦',
  'HTMLFORMXML': '🌐',
  'HTMLFORMCODE': '📄',
  'XFDFORMXML': '📝',
  'XFDFORMCODE': '📄',
  'SS': '🖥️',
  'APPSS': '🖥️',
  'CS': '🖱️',
  'APPCS': '🖱️',
  'DS': '🗃️',
  'APPDS': '🗃️',
  'TABLE': '📊',
  'ENT_TABLES_DATABASE': '🗄️',
  'ENT_TABLES_DICTIONARY': '📖',
  'DEFAULT': '📄'
};

interface TreeNodeProps {
  item: TreeItem;
  level: number;
  onItemClick: (item: TreeItem) => void;
  onItemExpand: (item: TreeItem) => void;
  onContextMenu: (e: React.MouseEvent, item: TreeItem) => void;
  onDoubleClick: (item: TreeItem) => void;
  expandedItems: Set<string>;
}

function TreeNode({ item, level, onItemClick, onItemExpand, onContextMenu, onDoubleClick, expandedItems }: TreeNodeProps) {
  const isExpanded = expandedItems.has(item.id);
  const hasChildren = item.hasChildren || (item.children && item.children.length > 0);
  const icon = itemTypeIcons[item.type] || itemTypeIcons.DEFAULT;
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
        className="tree-item flex items-center py-1 px-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 rounded-sm"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        title={`${item.type}: ${item.uri || item.label}`}
      >
        {/* Expand/collapse arrow */}
        <span
          className={`w-4 h-4 mr-1 flex items-center justify-center text-xs cursor-pointer ${
            hasChildren ? 'text-slate-500 dark:text-slate-400' : 'text-transparent'
          }`}
          onClick={handleExpandClick}
        >
          {isExpanded ? '▼' : '▶'}
        </span>

        {/* Icon with check-out status */}
        <span className="mr-2 text-sm">
          {isCheckedOut ? '🔒' : icon}
        </span>

        {/* Label */}
        <span className={`flex-1 truncate text-sm ${isCheckedOut ? 'text-yellow-500 dark:text-yellow-400' : 'text-slate-800 dark:text-slate-200'}`}>
          {item.label}
        </span>

        {/* Loading indicator */}
        {item.isLoading && (
          <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">Loading...</span>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function EnterpriseTree() {
  const [rootItems, setRootItems] = useState<TreeItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<TreeItem | null>(null);
  const [_isLoading, _setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: TreeItem } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TreeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchType, setSearchType] = useState<'name' | 'global'>('name'); // 'name' = search by name, 'global' = global code search
  const [isSearchLoading, setIsSearchLoading] = useState(false);

  const { currentServer, isConnected } = useServerStore();
  const currentUser = currentServer?.user || '';

  // Refresh function to be called after add/rename/delete/move
  const refreshTree = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // Listen for global search trigger event (from keyboard shortcut in editor)
  useEffect(() => {
    const handleTriggerGlobalSearch = () => {
      // Switch to global code search mode
      setSearchType('global');
      // Focus the search input by scrolling to top and triggering search
      const searchContainer = document.getElementById('enterprise-tree-search');
      if (searchContainer) {
        searchContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Select the search input
      const searchInput = document.querySelector('#enterprise-tree-search input') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    };

    window.addEventListener('trigger-global-search', handleTriggerGlobalSearch);
    return () => {
      window.removeEventListener('trigger-global-search', handleTriggerGlobalSearch);
    };
  }, []);

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
        const code = await enterpriseService.getItemCode(item.uri);
        if (code) {
          editorStore.getState().openFile({
            uri: item.uri,
            name: item.label,
            type: item.type,
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
      const enterpriseService = getEnterpriseService();
      const result = await enterpriseService.checkOut(item.uri);

      if (result.success) {
        console.log('Check out successful');
        // Refresh tree to update status
        const items = await enterpriseService.getEnterpriseItems(selectedItem?.uri || '');
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
      const enterpriseService = getEnterpriseService();
      const reason = ''; // Could prompt user for reason
      const result = await enterpriseService.checkIn(item.uri, reason);

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
      const enterpriseService = getEnterpriseService();
      const success = await enterpriseService.undoCheckOut(item.uri);

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
        label: 'Add New...',
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
      label: 'Add New...',
      icon: '➕'
    });

    // Rename and Delete for checked out items
    if (isCheckedOut && isCheckedOutByMe) {
      items.push({
        id: 'rename',
        label: 'Rename...',
        icon: '✏️'
      });
      items.push({
        id: 'delete',
        label: 'Delete',
        icon: '🗑️'
      });
      items.push({
        id: 'move',
        label: 'Move...',
        icon: '📁'
      });
    }

    // Check Out option
    if (!isCheckedOut) {
      items.push({
        id: 'checkout',
        label: 'Check Out',
        icon: '🔓'
      });
    }

    // Check In and Undo Check Out (only if checked out by current user)
    if (isCheckedOut && isCheckedOutByMe) {
      items.push({
        id: 'checkin',
        label: 'Check In',
        icon: '🔒'
      });
      items.push({
        id: 'undocheckout',
        label: 'Undo Check Out',
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
        label: 'Open',
        icon: '📄'
      });
    }

    // Run Script for SS/APPSS
    if (item.type === 'SS' || item.type === 'APPSS') {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'runscript',
        label: 'Run Script',
        icon: '▶️'
      });
    }

    // Run DataSource for DS/APPDS
    if (item.type === 'DS' || item.type === 'APPDS') {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'rundatasource',
        label: 'Run DataSource',
        icon: '▶️'
      });
    }

    // Generate SQL for TABLE
    if (item.type === 'TABLE') {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'generate-select',
        label: 'Generate SELECT',
        icon: '📤'
      });
      items.push({
        id: 'generate-insert',
        label: 'Generate INSERT',
        icon: '➕'
      });
      items.push({
        id: 'generate-update',
        label: 'Generate UPDATE',
        icon: '✏️'
      });
      items.push({
        id: 'generate-delete',
        label: 'Generate DELETE',
        icon: '🗑️'
      });
    }

    // Form operations for HTML/XFD Forms
    if (item.type === 'HTMLFORMXML' || item.type === 'XFDFORMXML') {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'openform',
        label: 'Open Form',
        icon: '🌐'
      });
      if (item.type === 'HTMLFORMXML') {
        items.push({
          id: 'debugform',
          label: 'Debug Form',
          icon: '🐛'
        });
        items.push({
          id: 'designform',
          label: 'Design Form',
          icon: '✏️'
        });
      }
    }

    // XFD Form launch
    if (item.type === 'XFDFORMXML') {
      items.push({
        id: 'launchxfdform',
        label: 'Launch XFD Form',
        icon: '🚀'
      });
    }

    // GoTo Navigation - for scripts and forms
    if (['SS', 'APPSS', 'CS', 'APPCS', 'DS', 'APPDS', 'HTMLFORMCODE', 'XFDFORMCODE'].includes(item.type)) {
      items.push({ id: 'divider', label: '', divider: true } as ContextMenuItem);
      items.push({
        id: 'goto-item',
        label: 'Go to Item (F11)',
        icon: '🔍'
      });
      if (item.type === 'SS' || item.type === 'APPSS') {
        items.push({
          id: 'goto-serverscript',
          label: 'Go to Server Script',
          icon: '🖥️'
        });
      }
      if (item.type === 'CS' || item.type === 'APPCS') {
        items.push({
          id: 'goto-clientscript',
          label: 'Go to Client Script',
          icon: '🖱️'
        });
      }
      if (item.type === 'DS' || item.type === 'APPDS') {
        items.push({
          id: 'goto-datasource',
          label: 'Go to Data Source',
          icon: '🗃️'
        });
      }
      if (item.type === 'HTMLFORMCODE' || item.type === 'XFDFORMCODE') {
        items.push({
          id: 'goto-form',
          label: 'Go to Form',
          icon: '🌐'
        });
      }
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
          const enterpriseService = getEnterpriseService();
          const result = await enterpriseService.runScript(item.uri);
          console.log('Script result:', result);
        }
        break;
      case 'rundatasource':
        if (item.uri) {
          const enterpriseService = getEnterpriseService();
          const result = await enterpriseService.runDataSource(item.uri);
          console.log('DataSource result:', result);
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
            const code = await enterpriseService.getItemCode(foundItem.uri);
            if (code) {
              editorStore.getState().openFile({
                uri: foundItem.uri,
                name: foundItem.name || foundItem.label,
                type: foundItem.type,
                content: code,
                guid: foundItem.guid
              });
            }
          } else {
            console.log('Could not find item:', itemName, 'types:', searchTypes.join(', '));
          }
        }
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
        hasChildren: enterpriseItem.isFolder ?? enterpriseItem.hasChildren ?? false,
        children: enterpriseItem.children ? enterpriseItem.children.map((child: any) => ({
          id: child.uri || child.id,
          label: child.name,
          type: child.type || 'DEFAULT',
          uri: child.uri,
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
        hasChildren: item.hasChildren || false
      }));
      setSearchResults(items);
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
      const result = await enterpriseService.globalSearch(searchQuery.trim(), ['SS', 'CS', 'DS']);
      const items: TreeItem[] = result.items.map((item: any) => ({
        id: item.uri || item.id,
        label: item.name,
        type: item.type || 'DEFAULT',
        uri: item.uri,
        hasChildren: item.hasChildren || false
      }));
      setSearchResults(items);
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
  };

  // Initial load
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
    <div className="p-2 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-2">
        <span className="text-xs font-medium text-slate-400 uppercase">
          {isSearching ? 'Search Results' : 'Explorer'}
        </span>
        <div className="flex gap-1">
          {isSearching ? (
            <button
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
              title="Back to Tree"
              onClick={handleClearSearch}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          ) : (
            <>
              <button
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                title="Refresh"
                onClick={() => {/* Refresh */}}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                title="Collapse All"
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
      <form onSubmit={handleSearchSubmit} id="enterprise-tree-search" className="mb-2 px-2 mr-2 sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
        <div className="flex gap-1">
          {/* Search Type Toggle */}
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value as 'name' | 'global')}
            className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded px-2 py-1 border border-slate-300 dark:border-slate-600"
          >
            <option value="name">By Name</option>
            <option value="global">In Code</option>
          </select>
          {/* Search Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchType === 'name' ? 'Search items...' : 'Search in code...'}
            className="flex-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded px-2 py-1 border border-slate-300 dark:border-slate-600 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isSearchLoading || !searchQuery.trim()}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title="Search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </form>

      {/* Tree/Search Results content */}
      <div className="text-slate-700 dark:text-slate-300 flex-1 overflow-auto">
        {isSearching ? (
          // Search results view
          isSearchLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Searching...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No results found for "{searchQuery}"
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xs text-slate-500 px-2 mb-2">
                Found {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                {searchType === 'global' && ' in code'}
              </div>
              {searchResults.map((item, index) => (
                <div
                  key={getItemKey(item, index)}
                  className={`p-2 rounded cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 ${
                    selectedItem?.id === item.id ? 'bg-slate-200 dark:bg-slate-700' : ''
                  }`}
                  onClick={() => {
                    handleItemClick(item);
                    // Reveal item in tree
                    if (item.uri) {
                      revealItemInTree(item.uri);
                    }
                  }}
                  onDoubleClick={() => handleDoubleClick(item)}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {itemTypeIcons[item.type] || itemTypeIcons.DEFAULT}
                    </span>
                    <span className="flex-1 truncate text-sm">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    <span>{item.type}</span>
                    {item.uri && <span className="truncate">{item.uri}</span>}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          // Normal tree view
          rootItems.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              {isConnected ? 'No items found' : 'Not connected'}
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
        <div className="mt-2 pt-2 border-t border-slate-700">
          <div className="text-xs text-slate-500 px-2">
            Selected: <span className="text-slate-700 dark:text-slate-300">{selectedItem.label}</span>
            {selectedItem.checkedOutBy && (
              <span className="text-yellow-400 ml-2">(Checked out by {selectedItem.checkedOutBy})</span>
            )}
          </div>
        </div>
      )}
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
