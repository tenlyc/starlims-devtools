export type EnterpriseTreeSortable = {
  label: string;
  type: string;
  hasChildren?: boolean;
  children?: EnterpriseTreeSortable[];
};

export const FORM_PART_ORDER: Readonly<Record<string, number>> = {
  HTMLFORMXML: 0,
  XFDFORMXML: 0,
  HTMLFORMCODE: 1,
  XFDFORMCODE: 1,
  HTMLFORMGUIDE: 2,
  HTMLFORMRESOURCES: 3,
  XFDFORMRESOURCES: 3
};

// Keep STARLIMS application contents in the same workflow-oriented order used
// by the Cursor/VS Code extension instead of sorting technical folders by name.
const CATEGORY_ORDER: Readonly<Record<string, number>> = {
  APPLICATIONS: 0,
  HTMLFORMS: 10,
  XFDFORMS: 20,
  SERVERSCRIPTS: 30,
  SERVERSCRIPT: 30,
  APPSERVERSCRIPT: 30,
  CLIENTSCRIPTS: 40,
  CLIENTSCRIPT: 40,
  APPCLIENTSCRIPT: 40,
  DATASOURCES: 50,
  APPDATASOURCESCRIPT: 50,
  TABLES: 60,
  STATICTABLES: 60,
  SERVERLOGS: 70
};

function normalizedCategory(value: string): string {
  return value.replace(/[\s_-]+/g, '').toUpperCase();
}

export function enterpriseCategoryOrder(item: EnterpriseTreeSortable): number {
  return CATEGORY_ORDER[normalizedCategory(item.label)]
    ?? CATEGORY_ORDER[normalizedCategory(item.type)]
    ?? 999;
}

export function formBaseName(label: string): string {
  return label.replace(/\s*\[(?:XML|Code Behind|Guide|Resources)\]\s*$/i, '');
}

export function compareEnterpriseTreeItems(left: EnterpriseTreeSortable, right: EnterpriseTreeSortable): number {
  const leftFolder = Boolean(left.hasChildren || left.children?.length);
  const rightFolder = Boolean(right.hasChildren || right.children?.length);
  if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;

  const leftCategory = enterpriseCategoryOrder(left);
  const rightCategory = enterpriseCategoryOrder(right);
  if (leftCategory !== rightCategory && (leftCategory !== 999 || rightCategory !== 999)) {
    return leftCategory - rightCategory;
  }

  const leftBase = formBaseName(left.label);
  const rightBase = formBaseName(right.label);
  const baseOrder = leftBase.localeCompare(rightBase, undefined, { sensitivity: 'base' });
  if (baseOrder !== 0) return baseOrder;

  const partOrder = (FORM_PART_ORDER[left.type.toUpperCase()] ?? 99) - (FORM_PART_ORDER[right.type.toUpperCase()] ?? 99);
  if (partOrder !== 0) return partOrder;
  return left.label.localeCompare(right.label, undefined, { sensitivity: 'base' });
}

export function sortEnterpriseTreeItems<T extends EnterpriseTreeSortable>(items: T[]): T[] {
  const sorted = [...items].sort(compareEnterpriseTreeItems);
  for (const item of sorted) {
    if (item.children?.length) item.children = sortEnterpriseTreeItems(item.children) as typeof item.children;
  }
  return sorted;
}
