export type SharedMcpToolRisk = 'read' | 'write' | 'execute' | 'destructive';

export type SharedMcpToolInfo = {
  id: string;
  title: string;
  description: string;
  origin: string;
  repository: string;
  risk: SharedMcpToolRisk;
  capability: string;
  schemaVersion: string;
  profiles: string[];
};

export type SharedMcpVersionInfo = {
  version: string;
  active: boolean;
  bundled: boolean;
  cached: boolean;
};

export type SharedMcpReleaseInfo = {
  version: string;
  releaseUrl: string;
  installable: boolean;
  publishedAt?: string;
};

export type SharedMcpDetails = {
  status: {
    enabled: boolean;
    running: boolean;
    host: string;
    port: number;
    url: string;
    error?: string;
    implementation?: 'shared-process' | 'embedded-fallback';
    sharedPackage?: string;
  };
  packageName: string;
  bundledVersion: string;
  activeVersion: string;
  versions: SharedMcpVersionInfo[];
  tools: SharedMcpToolInfo[];
  latestRelease?: SharedMcpReleaseInfo;
};
