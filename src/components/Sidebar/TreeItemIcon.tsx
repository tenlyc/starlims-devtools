interface TreeItemIconProps {
  type?: string;
  label?: string;
  folder?: boolean;
  expanded?: boolean;
  checkedOut?: boolean;
}

type IconKind = 'application' | 'folder' | 'html' | 'server' | 'client' | 'data' | 'table' | 'guide' | 'resources' | 'log' | 'file';

function resolveIconKind(type = '', label = '', folder = false): IconKind {
  const normalizedType = type.toUpperCase();
  const normalizedLabel = label.toUpperCase();

  if (normalizedType === 'APPLICATION' || normalizedType === 'APP' || normalizedLabel === 'APPLICATIONS') return 'application';
  if (normalizedType === 'SERVERLOG' || normalizedLabel.includes('SERVER LOG')) return 'log';
  if (normalizedType === 'TABLE' || normalizedType.startsWith('ENT_TABLES') || normalizedLabel === 'TABLES') return 'table';
  if (normalizedType.includes('DATASOURCE') || ['DS', 'APPDS'].includes(normalizedType) || normalizedLabel.includes('DATA SOURCE') || normalizedLabel.includes('DATASOURCE')) return 'data';
  if (normalizedType.includes('FORMGUIDE')) return 'guide';
  if (normalizedType.includes('FORMRESOURCES')) return 'resources';
  if (normalizedType.includes('FORMXML') || normalizedLabel.includes('HTML FORM') || normalizedLabel.includes('HTMLFORM')) return 'html';
  if (normalizedType.includes('FORMCODE') || normalizedType.includes('CLIENTSCRIPT') || ['CS', 'APPCS'].includes(normalizedType) || normalizedLabel.includes('CLIENT SCRIPT') || normalizedLabel.includes('CLIENTSCRIPT')) return 'client';
  if (normalizedType.includes('SERVERSCRIPT') || ['SS', 'APPSS'].includes(normalizedType) || normalizedLabel.includes('SERVER SCRIPT') || normalizedLabel.includes('SERVERSCRIPT')) return 'server';
  if (folder || normalizedType === 'CATEGORY') return 'folder';
  return 'file';
}

function IconGlyph({ kind, expanded }: { kind: IconKind; expanded: boolean }) {
  if (kind === 'folder') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={expanded ? 'M1.7 5.2h12.9l-1.8 7H2.5l-.8-7Z' : 'M1.8 3.5h4l1.2 1.4h7.2v7.3H1.8V3.5Z'} fill="currentColor" opacity=".9" />
      </svg>
    );
  }

  if (kind === 'application') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M2.2 4.4 8 1.6l5.8 2.8L8 7.2 2.2 4.4Z" />
        <path d="M2.2 4.5v6.8L8 14.2l5.8-2.9V4.5M8 7.2v7" />
      </svg>
    );
  }

  if (kind === 'data') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25">
        <ellipse cx="8" cy="3.2" rx="5.3" ry="2" />
        <path d="M2.7 3.2v4.7c0 1.1 2.4 2 5.3 2s5.3-.9 5.3-2V3.2M2.7 7.7v4.1c0 1.1 2.4 2 5.3 2s5.3-.9 5.3-2V7.7" />
      </svg>
    );
  }

  if (kind === 'table') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="2" y="2.5" width="12" height="11" rx="1" />
        <path d="M2 6h12M6 2.5v11M10 2.5v11" />
      </svg>
    );
  }

  if (kind === 'html') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 1.8h6.7l3.3 3.3v9.1H3V1.8Z" />
        <path d="M9.7 1.8v3.3H13M7 7 5.3 8.6 7 10.2M9 7l1.7 1.6L9 10.2" />
      </svg>
    );
  }

  if (kind === 'server') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2.2" width="12" height="11.6" rx="1.4" />
        <path d="m4.5 6 2 1.7-2 1.7M8.4 9.4h3" />
      </svg>
    );
  }

  if (kind === 'client') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 1.8h6.7l3.3 3.3v9.1H3V1.8Z" />
        <path d="M9.7 1.8v3.3H13M6.1 7.3 4.8 8.6l1.3 1.3M9.9 7.3l1.3 1.3-1.3 1.3M8.8 6.9 7.2 10.4" />
      </svg>
    );
  }

  if (kind === 'guide') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M6.2 2.2c-1.7 0-2 .9-2 2.1v1.4c0 1.1-.5 1.7-1.5 1.7 1 0 1.5.6 1.5 1.7v1.5c0 1.2.3 2.1 2 2.1M9.8 2.2c1.7 0 2 .9 2 2.1v1.4c0 1.1.5 1.7 1.5 1.7-1 0-1.5.6-1.5 1.7v1.5c0 1.2-.3 2.1-2 2.1" />
      </svg>
    );
  }

  if (kind === 'resources') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
        <path d="m8 1.8 5.7 3L8 7.8l-5.7-3L8 1.8Z" />
        <path d="m2.3 7.6 5.7 3 5.7-3M2.3 10.4l5.7 3 5.7-3" />
      </svg>
    );
  }

  if (kind === 'log') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <rect x="2.2" y="2" width="11.6" height="12" rx="1.2" />
        <path d="M4.5 5.1h7M4.5 8h7M4.5 10.9h4.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
      <path d="M3 1.8h6.7l3.3 3.3v9.1H3V1.8Z" />
      <path d="M9.7 1.8v3.3H13" />
    </svg>
  );
}

export function TreeItemIcon({ type, label, folder = false, expanded = false, checkedOut = false }: TreeItemIconProps) {
  const kind = resolveIconKind(type, label, folder);
  return (
    <span className={`tree-type-icon tree-type-icon--${kind}`} aria-hidden="true">
      <IconGlyph kind={kind} expanded={expanded} />
      {checkedOut && <span className="tree-type-icon__status" />}
    </span>
  );
}
