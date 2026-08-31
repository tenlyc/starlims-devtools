export type FormPreviewMode = 'run' | 'debug' | 'design';
export type FormPreviewViewport = 'responsive' | 'desktop' | 'tablet' | 'mobile';

export type FormPreviewConfig = {
  sourceUri: string;
  formGuid: string;
  formName: string;
  language: string;
  mode: FormPreviewMode;
  url: string;
  serverOrigin: string;
  /** The current HTML Form XML used by the integrated, Runtime-independent layout preview. */
  formXml?: string;
};

export type FormPreviewConsoleEntry = {
  level: number;
  message: string;
  sourceId?: string;
  line?: number;
  timestamp: number;
};

export type FormPreviewElementSnapshot = {
  selector: string;
  tagName: string;
  id: string;
  className: string;
  text: string;
  html: string;
  rect: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
  styles: Record<string, string>;
};

export type FormPreviewScreenshot = {
  dataUrl: string;
  width: number;
  height: number;
};

export type FormPreviewController = {
  config: FormPreviewConfig;
  reload: () => void;
  setViewport: (viewport: FormPreviewViewport) => void;
  capture: () => Promise<FormPreviewScreenshot>;
  inspect: (selector?: string, controlId?: string) => Promise<FormPreviewElementSnapshot>;
  consoleEntries: () => FormPreviewConsoleEntry[];
  loadErrors: () => string[];
};
