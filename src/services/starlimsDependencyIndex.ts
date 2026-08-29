import type {
  AgentDependencyEdge,
  AgentDependencyIndex,
  AgentDependencyKind,
  AgentDependencyNode,
  AgentWorkspaceFile
} from '../types/agent';

export const AGENT_DEPENDENCY_INDEX_STORE_KEY = 'agentDependencyIndex.v1';

type ReferencePattern = { kind: AgentDependencyKind; pattern: RegExp };

const REFERENCE_PATTERNS: ReferencePattern[] = [
  { kind: 'include', pattern: /(?:#include|:include)\s+(?:["']([^"']+)["']|([A-Za-z_][\w.]*))/gi },
  { kind: 'server-script', pattern: /\b(?:lims\.CallServer|ExecFunction|CreateUDObject|SubmitToBatch|DoProc)\s*\(\s*["']([^"']+)["']/gi },
  { kind: 'data-source', pattern: /\b(?:lims\.GetData|GetData|GetDataSet)\s*\(\s*["']([^"']+)["']/gi },
  { kind: 'form', pattern: /\b(?:OpenForm|LimsForm|Form)\s*\(\s*["']([^"']+)["']/gi }
];

function normalize(value: string): string {
  return value.trim().replace(/^[/\\]+|[/\\]+$/g, '').replace(/[\\/]+/g, '.').toLowerCase();
}

function displayName(name: string): string {
  return name.replace(/\s+\[[^\]]+\]\s*$/, '').trim();
}

function nodeId(file: Pick<AgentWorkspaceFile, 'uri' | 'language'>): string {
  return `${file.uri}\n${file.language || ''}`;
}

function aliasesFor(node: AgentDependencyNode): string[] {
  const parts = node.uri.split('/').filter(Boolean);
  const leaf = parts[parts.length - 1] || '';
  const aliases = new Set<string>([displayName(node.name), leaf]);
  const typeIndex = parts.findIndex((part) => /^(ServerScripts|ClientScripts|DataSources|HTMLForms|XFDForms)$/i.test(part));
  if (typeIndex >= 0 && parts[typeIndex + 1]) {
    aliases.add(parts.slice(typeIndex + 1).join('.'));
    aliases.add(parts.slice(Math.max(0, typeIndex - 1), typeIndex).concat(parts.slice(typeIndex + 1)).join('.'));
  }
  if (/^Applications$/i.test(parts[0] || '') && parts[2] && leaf) aliases.add(`${parts[2]}.${leaf}`);
  return [...aliases].map(normalize).filter(Boolean);
}

function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index++) if (content.charCodeAt(index) === 10) line++;
  return line;
}

function findTargets(reference: string, aliases: Map<string, Set<string>>): string[] {
  let candidate = normalize(reference);
  while (candidate) {
    const matches = aliases.get(candidate);
    if (matches?.size) return [...matches];
    const separator = candidate.lastIndexOf('.');
    if (separator < 0) break;
    candidate = candidate.slice(0, separator);
  }
  return [];
}

export function buildDependencyIndex(files: AgentWorkspaceFile[], relativePaths: Record<string, string> = {}): AgentDependencyIndex {
  const nodes: AgentDependencyNode[] = files.map(({ content: _content, checkedOutDate: _checkedOutDate, ...file }) => ({
    ...file,
    id: nodeId(file),
    relativePath: relativePaths[nodeId(file)]
  }));
  const aliases = new Map<string, Set<string>>();
  for (const node of nodes) {
    for (const alias of aliasesFor(node)) {
      const ids = aliases.get(alias) || new Set<string>();
      ids.add(node.id);
      aliases.set(alias, ids);
    }
  }

  const edges: AgentDependencyEdge[] = [];
  for (const file of files) {
    for (const { kind, pattern } of REFERENCE_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(file.content))) {
        const reference = String(match[1] || match[2] || '').trim();
        if (!reference || (kind === 'server-script' && reference.startsWith('_'))) continue;
        const targets = findTargets(reference, aliases);
        edges.push({
          id: `${nodeId(file)}:${kind}:${match.index}:${reference}`,
          sourceId: nodeId(file),
          targetId: targets.length === 1 ? targets[0] : undefined,
          ambiguousTargetIds: targets.length > 1 ? targets : undefined,
          reference,
          kind,
          line: lineAt(file.content, match.index)
        });
        if (match.index === pattern.lastIndex) pattern.lastIndex++;
      }
    }
  }
  return { version: 1, generatedAt: new Date().toISOString(), nodes, edges };
}

export async function saveDependencyIndex(index: AgentDependencyIndex): Promise<void> {
  await window.electronAPI?.storeSet(AGENT_DEPENDENCY_INDEX_STORE_KEY, index);
  window.dispatchEvent(new CustomEvent('agent-index:updated', { detail: index }));
}

export async function loadDependencyIndex(): Promise<AgentDependencyIndex | null> {
  const value = await window.electronAPI?.storeGet(AGENT_DEPENDENCY_INDEX_STORE_KEY).catch(() => null);
  if (!value || value.version !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
  return value as AgentDependencyIndex;
}

export function dependencyContextForPrompt(index: AgentDependencyIndex | null, contextUris: string[]): string {
  if (!index) return '';
  const selectedIds = new Set(index.nodes.filter((node) => contextUris.includes(node.uri)).map((node) => node.id));
  const relevant = index.edges.filter((edge) => selectedIds.has(edge.sourceId) || (edge.targetId ? selectedIds.has(edge.targetId) : false)).slice(0, 30);
  if (!relevant.length) {
    return `STARLIMS workspace index: ${index.nodes.length} checked-out files, ${index.edges.length} detected references.`;
  }
  const names = new Map(index.nodes.map((node) => [node.id, node.name]));
  const lines = relevant.map((edge) => {
    const source = names.get(edge.sourceId) || edge.sourceId;
    const target = edge.targetId ? (names.get(edge.targetId) || edge.reference) : `${edge.reference} (unresolved)`;
    return `- ${source}:${edge.line} --${edge.kind}--> ${target}`;
  });
  return [`STARLIMS dependency context (${index.nodes.length} indexed files):`, ...lines].join('\n');
}
