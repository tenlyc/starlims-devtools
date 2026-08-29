export type DiagnosticLogChannel =
  | 'starlims-operation'
  | 'starlims-api'
  | 'ssl-language'
  | 'mcp-server'
  | 'mcp-tools'
  | 'ai-runtime';

export interface DiagnosticLogEvent {
  channel: DiagnosticLogChannel;
  level: 'info' | 'warning' | 'error' | 'success';
  source: string;
  message: string;
  timestamp: number;
}
