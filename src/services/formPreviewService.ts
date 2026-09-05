import { editorStore } from '../stores/editorStore';
import type { FormPreviewConfig, FormPreviewController, FormPreviewMode, FormPreviewViewport } from '../types/formPreview';
import { getEnterpriseService } from './enterpriseService';

export const FORM_PREVIEW_TYPE = 'FORM_PREVIEW';
export const FORM_PREVIEW_REFRESH_EVENT = 'form-preview:refresh';

let activeController: FormPreviewController | null = null;

export function formPreviewEditorUri(sourceUri: string): string {
  return `starlims-devtools://form-preview/${encodeURIComponent(sourceUri)}`;
}

export function openFormPreviewEditor(config: FormPreviewConfig): void {
  const uri = formPreviewEditorUri(config.sourceUri);
  const existing = editorStore.getState().openFiles.find((file) => file.uri === uri);
  if (existing) editorStore.getState().closeFile(uri);
  editorStore.getState().openFile({
    uri,
    name: `${config.formName} Preview`,
    type: FORM_PREVIEW_TYPE,
    language: config.language,
    // React batches close/open of the same tab. A new identity must remount
    // its controller even when the requested URL and options are unchanged.
    content: JSON.stringify({ ...config, previewInstanceId: crypto.randomUUID() })
  });
}

export function parseFormPreviewConfig(content: string): FormPreviewConfig | null {
  try {
    const value = JSON.parse(content) as Partial<FormPreviewConfig>;
    if (!value.sourceUri || !value.formGuid || !value.url || !value.serverOrigin) return null;
    return {
      sourceUri: value.sourceUri,
      formGuid: value.formGuid,
      formName: value.formName || value.formGuid,
      language: value.language || 'ENG',
      mode: value.mode === 'design' || value.mode === 'debug' ? value.mode : 'run',
      url: value.url,
      serverOrigin: value.serverOrigin,
      formXml: value.formXml
    };
  } catch {
    return null;
  }
}

export function registerFormPreviewController(controller: FormPreviewController): () => void {
  activeController = controller;
  return () => { if (activeController === controller) activeController = null; };
}

export function activeFormPreview(): FormPreviewController | null {
  return activeController;
}

export function refreshFormPreview(sourceUri?: string): boolean {
  if (activeController && (!sourceUri || activeController.config.sourceUri === sourceUri)) {
    activeController.reload();
    return true;
  }
  window.dispatchEvent(new CustomEvent(FORM_PREVIEW_REFRESH_EVENT, { detail: { sourceUri } }));
  return false;
}

export function normalizePreviewMode(value: unknown): FormPreviewMode {
  return value === 'design' || value === 'debug' ? value : 'run';
}

export function normalizePreviewViewport(value: unknown): FormPreviewViewport {
  return value === 'desktop' || value === 'tablet' || value === 'mobile' ? value : 'responsive';
}

export const FORM_PREVIEW_MCP_TOOLS = [
  'open_form_preview',
  'refresh_form_preview',
  'capture_form_screenshot',
  'inspect_form_element',
  'get_preview_console_errors',
  'get_preview_load_errors',
  'set_preview_viewport'
] as const;

export function isFormPreviewMcpTool(tool: string): boolean {
  return (FORM_PREVIEW_MCP_TOOLS as readonly string[]).includes(tool);
}

function requireActivePreview(): FormPreviewController {
  const controller = activeFormPreview();
  if (!controller) throw new Error('No active HTML Form preview. Call open_form_preview first and wait for the preview tab to open.');
  return controller;
}

export async function executeFormPreviewMcpTool(tool: string, args: Record<string, unknown>, provider?: 'codex' | 'generic'): Promise<unknown> {
  if (tool === 'open_form_preview') {
    const uri = String(args.uri || '').trim();
    if (!/\/HTMLForms\/(?:XML|CodeBehind|Guide|Resources)\//i.test(uri)) throw new Error('open_form_preview requires a STARLIMS HTML Form URI.');
    if (args.mode && !['run', 'debug'].includes(String(args.mode))) throw new Error('MCP preview supports run or debug mode only.');
    const config = await getEnterpriseService().getHTMLFormPreviewConfig(
      uri,
      args.guid ? String(args.guid) : undefined,
      normalizePreviewMode(args.mode),
      args.language ? String(args.language) : undefined
    );
    if (!config) throw new Error('Could not resolve the HTML Form GUID or active STARLIMS session.');
    activeController = null;
    openFormPreviewEditor(config);
    return { opened: true, runtimeVerified: false, loading: true, formName: config.formName, mode: config.mode, language: config.language, uri: config.sourceUri };
  }

  const preview = requireActivePreview();
  const status = preview.status();
  switch (tool) {
    case 'refresh_form_preview':
      preview.reload();
      return { status: { ...status, loading: true }, refreshed: true, uri: preview.config.sourceUri };
    case 'set_preview_viewport': {
      const viewport = normalizePreviewViewport(args.viewport);
      preview.setViewport(viewport);
      return { viewport, status };
    }
    case 'inspect_form_element':
      return { ...await preview.inspect(args.selector ? String(args.selector) : undefined, args.controlId ? String(args.controlId) : undefined), status };
    case 'get_preview_console_errors': {
      const entries = preview.consoleEntries().filter((entry) => entry.level >= 2);
      return { status, entries, totalItems: entries.length };
    }
    case 'get_preview_load_errors': {
      const errors = preview.loadErrors();
      return { status, errors, totalItems: errors.length };
    }
    case 'capture_form_screenshot': {
      const screenshot = await preview.capture();
      const filePath = await window.electronAPI.formPreviewSaveScreenshot(screenshot.dataUrl, preview.config.formName);
      return {
        filePath,
        status,
        width: screenshot.width,
        height: screenshot.height,
        uri: preview.config.sourceUri,
        ...(provider === 'generic' ? {} : { mimeType: 'image/png', imageData: screenshot.dataUrl.slice('data:image/png;base64,'.length) })
      };
    }
    default:
      throw new Error(`Unsupported form preview MCP tool: ${tool}`);
  }
}
