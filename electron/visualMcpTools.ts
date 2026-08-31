import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { STARLIMS_TOOL_CATALOG } from '@tenlyc/starlims-mcp';
import * as z from 'zod/v4';
import type { RendererToolCall } from './mcpServer';
import type { SharedMcpToolInfo } from '../src/types/sharedMcp';

export const VISUAL_MCP_CAPABILITIES = [
  'forms.preview.open',
  'forms.preview.control',
  'forms.preview.capture',
  'forms.preview.inspect',
  'forms.preview.logs'
] as const;

const repository = 'https://github.com/tenlyc/starlims-mcp';

const definitions = [
  { id: 'open_form_preview', title: 'Open form preview', description: 'Open a STARLIMS HTML Form inside the DevTools integrated visual preview.', capability: 'forms.preview.open', schema: z.object({ uri: z.string(), guid: z.string().optional(), language: z.string().optional(), mode: z.enum(['run', 'debug', 'design']).optional() }) },
  { id: 'refresh_form_preview', title: 'Refresh form preview', description: 'Refresh the active integrated STARLIMS HTML Form preview.', capability: 'forms.preview.control', schema: z.object({}) },
  { id: 'set_preview_viewport', title: 'Set preview viewport', description: 'Set the active form preview to responsive, desktop, tablet, or mobile width.', capability: 'forms.preview.control', schema: z.object({ viewport: z.enum(['responsive', 'desktop', 'tablet', 'mobile']) }) },
  { id: 'capture_form_screenshot', title: 'Capture form screenshot', description: 'Capture the active form preview and return a local PNG path for visual review.', capability: 'forms.preview.capture', schema: z.object({}) },
  { id: 'inspect_form_element', title: 'Inspect form element', description: 'Inspect a DOM element in the active form preview by CSS selector or STARLIMS control ID.', capability: 'forms.preview.inspect', schema: z.object({ selector: z.string().optional(), controlId: z.string().optional() }) },
  { id: 'get_preview_console_errors', title: 'Get preview console errors', description: 'Read JavaScript warnings and errors captured from the active form preview.', capability: 'forms.preview.logs', schema: z.object({}) },
  { id: 'get_preview_load_errors', title: 'Get preview load errors', description: 'Read navigation and page-load errors captured from the active form preview.', capability: 'forms.preview.logs', schema: z.object({}) }
] as const;

export const VISUAL_MCP_TOOL_INFO: SharedMcpToolInfo[] = definitions.map((tool) => ({
  id: tool.id,
  title: tool.title,
  description: tool.description,
  origin: 'starlims-mcp',
  repository,
  risk: 'read',
  capability: tool.capability,
  schemaVersion: '1.0',
  profiles: ['unified', 'devtools']
}));

export const VISUAL_GENERIC_TOOLS = definitions.map((tool) => {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  return { name: tool.id, description: tool.description, parameters, readOnly: true };
});

const sharedPackageIncludesVisualTools = (): boolean => {
  const ids = new Set((STARLIMS_TOOL_CATALOG as Array<{ id: string }>).map((tool) => tool.id));
  return definitions.every((tool) => ids.has(tool.id));
};

export function registerLocalVisualMcpTools(server: McpServer, invoke: RendererToolCall, onError?: (tool: string, error: unknown) => void): void {
  if (sharedPackageIncludesVisualTools()) return;
  for (const tool of definitions) {
    server.registerTool(tool.id, {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.schema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async (rawArguments: unknown) => {
      try {
        const value = await invoke(tool.id, (rawArguments || {}) as Record<string, unknown>);
        if (tool.id === 'capture_form_screenshot' && value && typeof value === 'object' && typeof (value as any).imageData === 'string') {
          const { imageData, mimeType, ...metadata } = value as Record<string, unknown>;
          return {
            content: [
              { type: 'image' as const, data: String(imageData), mimeType: String(mimeType || 'image/png') },
              { type: 'text' as const, text: JSON.stringify({ ok: true, ...metadata }, null, 2) }
            ],
            structuredContent: { ok: true, ...metadata }
          };
        }
        const result = value && typeof value === 'object' && !Array.isArray(value)
          ? { ok: true, ...(value as Record<string, unknown>) }
          : { ok: true, data: value };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
      } catch (error) {
        onError?.(tool.id, error);
        return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] };
      }
    });
  }
}
