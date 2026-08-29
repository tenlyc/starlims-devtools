import type { AgentWorkspaceChange, ExternalMcpServerConfig } from './agent';

export type AiConfigLayer = 'team' | 'project' | 'personal';
export type WorkflowRole = 'planner' | 'implementer' | 'reviewer' | 'tester';
export type WorkflowRunStatus = 'idle' | 'running' | 'completed' | 'failed';

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  roles: WorkflowRole[];
  parallelReviewAndTest: boolean;
  instructions?: Partial<Record<WorkflowRole, string>>;
};

export type WorkflowRoleResult = {
  role: WorkflowRole;
  status: WorkflowRunStatus;
  output?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
};

export type WorkflowTask = {
  id: string;
  title: string;
  detail?: string;
};

export type QualityGatePolicy = {
  blockSslErrors: boolean;
  blockDeletedFiles: boolean;
  requireDiffReview: boolean;
  requirePassedTests: boolean;
  warnChangedLines: number;
};

export type QualityTestCase = {
  id: string;
  name: string;
  steps: string;
  expected: string;
  command?: string;
  status: 'pending' | 'passed' | 'failed';
  result?: string;
  updatedAt: number;
};

export type QualityTestRunResult = {
  exitCode: number | null;
  output: string;
  durationMs: number;
};

export type QualityGateFinding = {
  id: string;
  level: 'error' | 'warning' | 'info';
  source: 'ssl' | 'diff' | 'review' | 'test' | 'workspace';
  message: string;
  uri?: string;
};

export type QualityGateReport = {
  passed: boolean;
  findings: QualityGateFinding[];
  changedFiles: number;
  changedLines: number;
};

export type AiExtensionManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled?: boolean;
  contributes?: {
    mcpServers?: Record<string, ExternalMcpServerConfig>;
    workflows?: WorkflowTemplate[];
    languages?: Array<{ id: string; extensions: string[]; aliases?: string[]; itemTypes?: string[]; monacoLanguage?: string }>;
    tools?: Array<{ name: string; description: string; mcpServer?: string }>;
  };
};

export type AiLayerConfig = {
  schemaVersion: 1;
  layer: AiConfigLayer;
  rules?: string;
  quality?: Partial<QualityGatePolicy>;
  workflows?: WorkflowTemplate[];
  extensions?: AiExtensionManifest[];
  updatedAt: number;
};

export type EffectiveAiConfig = {
  rules: Array<{ layer: AiConfigLayer; content: string }>;
  quality: QualityGatePolicy;
  workflows: WorkflowTemplate[];
  extensions: AiExtensionManifest[];
};

export type WorkspaceReviewState = {
  reviewedKeys: string[];
  tests: QualityTestCase[];
};

export type QualityGateInput = {
  changes: AgentWorkspaceChange[];
  reviewState: WorkspaceReviewState;
  policy: QualityGatePolicy;
};
