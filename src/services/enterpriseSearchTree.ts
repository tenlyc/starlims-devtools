export interface SearchTreeItem {
  id: string;
  label: string;
  type: string;
  uri?: string;
  hasChildren?: boolean;
  children?: SearchTreeItem[];
  language?: string;
  guid?: string;
}

const FOLDER_LABELS: Record<string, string> = {
  HTMLForms: 'HTML Forms',
  XFDForms: 'XFD Forms',
  PhoneForms: 'Phone Forms',
  TabletForms: 'Tablet Forms',
  ServerScripts: 'Server Scripts',
  ClientScripts: 'Client Scripts',
  DataSources: 'Data Sources'
};

function leafLabel(item: SearchTreeItem, parts: string[]): string {
  const name = parts[parts.length - 1] || item.label;
  if (parts[0] === 'Applications' && parts.length >= 6 && /Forms$/.test(parts[3])) {
    const part = parts[4];
    const suffix: Record<string, string> = {
      XML: 'XML', CodeBehind: 'Code Behind', Guide: 'Guide', Resources: 'Resources'
    };
    return `${name} [${suffix[part] || part}]`;
  }
  return name;
}

function contextSegments(parts: string[]): string[] {
  if (parts[0] === 'Applications' && parts.length >= 5) {
    return [parts[0], parts[1], parts[2], FOLDER_LABELS[parts[3]] || parts[3]];
  }
  return parts.slice(0, -1).map(part => FOLDER_LABELS[part] || part);
}

/** Build the same compact hierarchy as the VS Code enterprise search:
 * folders provide context, while the leaf only shows its display name and
 * form document suffix. The full URI remains metadata and is never rendered.
 */
export function buildEnterpriseSearchTree(items: SearchTreeItem[]): SearchTreeItem[] {
  const roots: SearchTreeItem[] = [];
  const seen = new Set<string>();

  for (const source of items) {
    if (!source.uri) continue;
    const unique = `${source.type}:${source.uri}`;
    if (seen.has(unique)) continue;
    seen.add(unique);

    const parts = source.uri.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let level = roots;
    let path = '';
    for (const segment of contextSegments(parts)) {
      path += `/${segment}`;
      const id = `search-folder:${path}`;
      let folder = level.find(item => item.id === id);
      if (!folder) {
        folder = { id, label: segment, type: 'CATEGORY', hasChildren: true, children: [] };
        level.push(folder);
      }
      level = folder.children!;
    }

    level.push({ ...source, label: leafLabel(source, parts), hasChildren: false, children: undefined });
  }

  const sort = (nodes: SearchTreeItem[]) => {
    nodes.sort((a, b) => {
      if (!!a.hasChildren !== !!b.hasChildren) return a.hasChildren ? -1 : 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
    nodes.forEach(node => node.children && sort(node.children));
  };
  sort(roots);
  return roots;
}

export function collectSearchFolderIds(items: SearchTreeItem[]): string[] {
  return items.flatMap(item => item.hasChildren
    ? [item.id, ...collectSearchFolderIds(item.children || [])]
    : []);
}
