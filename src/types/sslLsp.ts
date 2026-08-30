export type NativeSslDiagnostic = {
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info' | 'hint' | 'unknown';
  message: string;
  source: string;
  code?: string;
};

export type NativeSslValidationResult = {
  available: boolean;
  version?: string;
  valid: boolean;
  diagnostics: NativeSslDiagnostic[];
  error?: string;
};

export type NativeSslFormatResult = {
  available: boolean;
  version?: string;
  content?: string;
  error?: string;
};

export type NativeSslParameter = { name: string; type?: string; required?: boolean; description?: string };
export type NativeSslFunction = { name: string; description?: string; return_type?: string; parameters?: NativeSslParameter[] };
export type NativeSslClass = { name: string; summary?: string };
export type NativeSslInventory = {
  version: string;
  functions: NativeSslFunction[];
  classes: NativeSslClass[];
  keywords: string[];
};

export type NativeLspPosition = { line: number; character: number };
export type NativeLspRange = { start: NativeLspPosition; end: NativeLspPosition };
export type NativeLspLocation = { uri: string; range: NativeLspRange };
export type NativeLspTextEdit = { range: NativeLspRange; newText: string };
export type NativeLspWorkspaceEdit = { changes?: Record<string, NativeLspTextEdit[]> };
export type NativeLspWorkspaceSymbol = {
  name: string;
  kind: number;
  location: NativeLspLocation;
  containerName?: string;
};

export type NativeLspWorkspaceDocument = {
  sourceUri: string;
  documentUri: string;
  name: string;
  type: string;
  language?: string;
};

export type NativeLspSessionStatus = {
  available: boolean;
  running: boolean;
  version: string;
  workspaceRoot?: string;
  documents: number;
  error?: string;
};

export type NativeLspVersionInfo = {
  version: string;
  active: boolean;
  bundled: boolean;
  cached: boolean;
};

export type NativeLspReleaseInfo = {
  version: string;
  releaseUrl: string;
  installable: boolean;
  assetName?: string;
  publishedAt?: string;
  verification?: 'github-digest' | 'checksum-asset';
};

export type NativeLspUpstreamMetadata = {
  repository?: string;
  release?: string;
  commit?: string;
  reviewedAt?: string;
  auditSources?: Record<string, { repository: string; commit: string; reviewedAt?: string }>;
  assets?: Record<string, { name: string; sha256: string }>;
};
