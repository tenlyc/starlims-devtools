import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { AGENT_REMOTE_CHANGE_EVENT, type AgentRemoteChange } from '../../services/agentRemoteChange';
import {
  FORM_PREVIEW_REFRESH_EVENT,
  parseFormPreviewConfig,
  registerFormPreviewController
} from '../../services/formPreviewService';
import type {
  FormPreviewConfig,
  FormPreviewConsoleEntry,
  FormPreviewElementSnapshot,
  FormPreviewMode,
  FormPreviewViewport
} from '../../types/formPreview';
import { useI18n } from '../../i18n';
import { useOutputLogStore } from '../../services/outputLogStore';
import { FormXmlLayoutPreview } from './FormXmlLayoutPreview';

type PreviewWebView = HTMLElement & {
  loadURL: (url: string, options?: { extraHeaders?: string }) => Promise<void>;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  capturePage: () => Promise<{ toDataURL: () => string; getSize: () => { width: number; height: number } }>;
  getWebContentsId: () => number;
  openDevTools: () => void;
};

const viewportWidths: Record<FormPreviewViewport, string> = {
  responsive: '100%',
  desktop: '1440px',
  tablet: '768px',
  mobile: '390px'
};

const canonicalFormUri = (uri: string): string => uri
  .replace(/\/(?:XML|CodeBehind|Guide|Resources)\//i, '/')
  .replace(/\.(?:xml|js)$/i, '')
  .toLowerCase();

const inspectionScript = (selector?: string, controlId?: string): string => `(() => {
  const requestedSelector = ${JSON.stringify(selector || '')};
  const requestedControlId = ${JSON.stringify(controlId || '')};
  const element = requestedControlId
    ? (document.getElementById(requestedControlId) || document.querySelector('[data-control-id="' + CSS.escape(requestedControlId) + '"]'))
    : document.querySelector(requestedSelector || 'body');
  if (!element) throw new Error('No element matched the requested selector or control ID.');
  const rect = element.getBoundingClientRect();
  const styles = getComputedStyle(element);
  const attributes = {};
  for (const attribute of element.attributes || []) attributes[attribute.name] = attribute.value;
  const uniqueSelector = element.id ? '#' + CSS.escape(element.id) : requestedSelector || element.tagName.toLowerCase();
  return {
    selector: uniqueSelector,
    tagName: element.tagName,
    id: element.id || '',
    className: typeof element.className === 'string' ? element.className : '',
    text: (element.textContent || '').trim().slice(0, 2000),
    html: element.outerHTML.slice(0, 20000),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    attributes,
    styles: {
      display: styles.display, position: styles.position, visibility: styles.visibility,
      color: styles.color, backgroundColor: styles.backgroundColor,
      fontSize: styles.fontSize, fontFamily: styles.fontFamily,
      width: styles.width, height: styles.height, margin: styles.margin, padding: styles.padding
    }
  };
})()`;

const runtimeLoginScript = (user: string, password: string): string => `(() => new Promise((resolve) => {
  const username = ${JSON.stringify(user)};
  const password = ${JSON.stringify(password)};
  const startedAt = Date.now();
  const normalize = (value) => String(value == null ? '' : value).trim().toLowerCase();
  const isVisible = (component) => {
    try { return !component.isHidden?.() && !component.isDisabled?.(); } catch { return true; }
  };
  const finish = (status, detail) => resolve({ status, detail: detail || '' });
  const tryLogin = () => {
    if (location.href === 'about:blank') {
      finish('not-ready');
      return;
    }
    const bodyText = document.body?.innerText || '';
    if (/current session is not authorized to access the application/i.test(bodyText)) {
      finish('unauthorized');
      return;
    }

    try {
      const ExtRuntime = window.Ext;
      if (ExtRuntime?.ComponentQuery) {
        const fields = ExtRuntime.ComponentQuery.query('textfield').filter(isVisible);
        const buttons = ExtRuntime.ComponentQuery.query('button').filter(isVisible);
        const describe = (component) => normalize([
          component.reference, component.itemId, component.name, component.fieldLabel,
          component.emptyText, component.inputType, component.getXType?.()
        ].join(' '));
        const passwordFields = fields.filter((field) => /pass|密码/.test(describe(field)));
        const userField = fields.find((field) => /user|用户名|账号|login/.test(describe(field)) && !/pass|密码/.test(describe(field)));
        const loginButton = buttons.find((button) => /^(login|log in|sign in|登录|登入|确定|连接)$/i.test(String(button.getText?.() || button.text || '').trim()))
          || buttons.find((button) => /login|sign in|登录|登入/.test(normalize(button.getText?.() || button.text)));
        if (passwordFields.length && loginButton) {
          if (userField?.setValue) userField.setValue(username);
          passwordFields.forEach((field) => field.setValue?.(password));
          // STARLIMS declares the ExtJS handler by name (onLoginClick), so a
          // synthetic DOM click is ignored by some Runtime versions. Invoke
          // ExtJS' resolved handler path first; it is the same path used by a
          // trusted user click and works across those versions.
          if (typeof loginButton.fireHandler === 'function') {
            loginButton.fireHandler();
            finish('submitted', String(loginButton.getText?.() || loginButton.text || 'login'));
            return;
          }
          const buttonElements = [loginButton.btnEl?.dom, loginButton.getEl?.()?.dom, loginButton.el?.dom].filter(Boolean);
          const clickable = buttonElements.find((element) => typeof element.click === 'function');
          // Some ExtJS releases accept DOM click(), while others require a
          // trusted Electron input event. Try both against the same target.
          clickable?.click();
          const rect = buttonElements.map((element) => element.getBoundingClientRect?.()).find((box) => box && box.width > 0 && box.height > 0);
          if (rect && rect.width > 0 && rect.height > 0) {
            resolve({ status: 'submit-ready', x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) });
          } else {
            finish('login-not-recognized');
          }
          return;
        }
      }
    } catch (error) {
      // Fall through to the native DOM form fallback.
    }

    const inputs = Array.from(document.querySelectorAll('input'));
    const passwordInput = inputs.find((input) => input.type === 'password' || /pass|密码/i.test([input.name, input.id, input.placeholder, input.getAttribute('aria-label')].join(' ')));
    const userInput = inputs.find((input) => /user|用户名|账号|login/i.test([input.name, input.id, input.placeholder, input.getAttribute('aria-label')].join(' ')) && input !== passwordInput);
    const button = Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"]')).find((element) => /login|log in|sign in|登录|登入|确定/i.test(String(element.textContent || element.value || '')));
    if (passwordInput && button) {
      const setValue = (input, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      if (userInput) setValue(userInput, username);
      setValue(passwordInput, password);
      button.click();
      finish('submitted', String(button.textContent || button.value || 'login'));
      return;
    }

    if (Date.now() - startedAt >= 12000) {
      const looksLikeLogin = /login|log in|sign in|登录|用户名|密码/i.test(bodyText);
      finish(looksLikeLogin ? 'login-not-recognized' : 'not-login');
      return;
    }
    setTimeout(tryLogin, 250);
  };
  tryLogin();
}))()`;

export function FormPreviewPanel({ content }: { content: string }) {
  const { t } = useI18n();
  const initialConfig = useMemo(() => parseFormPreviewConfig(content), [content]);
  const webviewRef = useRef<PreviewWebView | null>(null);
  const webviewReadyRef = useRef(false);
  const pendingConfigRef = useRef<FormPreviewConfig | null>(initialConfig);
  const configRef = useRef<FormPreviewConfig | null>(initialConfig);
  const consoleRef = useRef<FormPreviewConsoleEntry[]>([]);
  const loadErrorsRef = useRef<string[]>([]);
  const runtimeLoginAttemptedRef = useRef(false);
  const runtimeLoginInFlightRef = useRef(false);
  const [config, setConfig] = useState<FormPreviewConfig | null>(initialConfig);
  const [viewport, setViewport] = useState<FormPreviewViewport>('responsive');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [languages, setLanguages] = useState<string[]>([]);
  const [selector, setSelector] = useState('body');
  const [inspection, setInspection] = useState<FormPreviewElementSnapshot | null>(null);
  const [errorsVisible, setErrorsVisible] = useState(false);
  const [surface, setSurface] = useState<'runtime' | 'layout'>(initialConfig?.mode === 'design' ? 'layout' : 'runtime');
  const [, setErrorRevision] = useState(0);
  configRef.current = config;

  const loadPreview = useCallback(async (requestedConfig?: FormPreviewConfig | null) => {
    const nextConfig = requestedConfig || configRef.current;
    const webview = webviewRef.current;
    if (!webview || !nextConfig) return;
    if (!webview.isConnected || !webviewReadyRef.current) {
      pendingConfigRef.current = nextConfig;
      setLoading(true);
      return;
    }
    pendingConfigRef.current = null;
    setLoading(true);
    try {
      await webview.loadURL(nextConfig.url);
    } catch (error) {
      loadErrorsRef.current = [...loadErrorsRef.current, error instanceof Error ? error.message : String(error)].slice(-50);
      setErrorRevision((value) => value + 1);
      setLoading(false);
    }
  }, []);

  const attachWebView = useCallback((webview: PreviewWebView | null) => {
    webviewRef.current = webview;
    webviewReadyRef.current = false;
    if (!webview) return;

    const onDomReady = async () => {
      if (webviewRef.current !== webview || webviewReadyRef.current) return;
      const previewConfig = pendingConfigRef.current || configRef.current;
      if (previewConfig) {
        await window.electronAPI.formPreviewConfigureSession(webview.getWebContentsId(), {
          serverOrigin: previewConfig.serverOrigin,
          runtimeAuthentication: true
        });
      }
      webviewReadyRef.current = true;
      const pendingConfig = pendingConfigRef.current || previewConfig;
      pendingConfigRef.current = null;
      if (pendingConfig) void loadPreview(pendingConfig);
    };

    // Register during the ref commit so the initial about:blank dom-ready event
    // cannot race ahead of a later React effect.
    webview.addEventListener('dom-ready', onDomReady, { once: true });
    queueMicrotask(() => {
      try {
        if (webview.getWebContentsId() > 0) void onDomReady();
      } catch {
        // The initial dom-ready listener will complete setup.
      }
    });
  }, [loadPreview]);

  const changePreview = useCallback(async (mode: FormPreviewMode, language: string) => {
    if (!config) return;
    const next = await getEnterpriseService().getHTMLFormPreviewConfig(
      config.sourceUri,
      config.formGuid,
      mode,
      language,
      config.formXml
    );
    if (!next) return;
    setSurface(mode === 'design' ? 'layout' : 'runtime');
    setConfig(next);
  }, [config]);

  const inspect = useCallback(async (requestedSelector?: string, controlId?: string) => {
    const webview = webviewRef.current;
    if (!webview) throw new Error('The form preview is not ready.');
    const result = await webview.executeJavaScript(inspectionScript(requestedSelector, controlId), true) as FormPreviewElementSnapshot;
    setInspection(result);
    return result;
  }, []);

  const capture = useCallback(async () => {
    const webview = webviewRef.current;
    if (!webview) throw new Error('The form preview is not ready.');
    const image = await webview.capturePage();
    const size = image.getSize();
    return { dataUrl: image.toDataURL(), width: size.width, height: size.height };
  }, []);

  const saveScreenshot = useCallback(async () => {
    if (!config) return;
    try {
      const screenshot = await capture();
      const filePath = await window.electronAPI.formPreviewSaveScreenshot(screenshot.dataUrl, config.formName);
      useOutputLogStore.getState().addEntry({ level: 'success', source: 'Form Preview', message: `${t('preview.screenshotSaved')}: ${filePath}` });
    } catch (error) {
      useOutputLogStore.getState().addEntry({ level: 'error', source: 'Form Preview', message: error instanceof Error ? error.message : String(error) });
    }
  }, [capture, config, t]);

  useEffect(() => {
    void getEnterpriseService().getLanguages().then(setLanguages).catch(() => setLanguages([]));
  }, []);

  const attemptRuntimeLogin = useCallback(async (webview: PreviewWebView) => {
    if (runtimeLoginAttemptedRef.current || runtimeLoginInFlightRef.current) return false;
    const credentials = getEnterpriseService().getPreviewCredentials();
    if (!credentials?.user || !credentials.password) return false;

    runtimeLoginInFlightRef.current = true;
    try {
      const result = await webview.executeJavaScript(runtimeLoginScript(credentials.user, credentials.password), true) as {
        status?: string;
        detail?: string;
        x?: number;
        y?: number;
      };
      if (result?.status === 'submit-ready' && Number.isFinite(result.x) && Number.isFinite(result.y)) {
        const x = Number(result.x);
        const y = Number(result.y);
        runtimeLoginAttemptedRef.current = true;
        await window.electronAPI.formPreviewClick(webview.getWebContentsId(), x, y);
        setLoading(false);
        return true;
      }
      if (result?.status === 'unauthorized' || result?.status === 'login-not-recognized') {
        runtimeLoginAttemptedRef.current = true;
        loadErrorsRef.current = [...loadErrorsRef.current, result.status === 'unauthorized'
          ? 'STARLIMS Runtime rejected the preview session.'
          : 'STARLIMS Runtime login form could not be recognized.'].slice(-50);
        setErrorRevision((value) => value + 1);
      } else if (result?.status === 'not-login') {
        // A persisted Runtime session may already be authenticated.
        runtimeLoginAttemptedRef.current = true;
      }
    } catch (error) {
      // Navigation can destroy the JavaScript execution context while the
      // Runtime login redirects. Leave the attempt retryable in that case.
      const message = error instanceof Error ? error.message : String(error);
      if (!/execution context|script failed to execute|object has been destroyed/i.test(message)) {
        loadErrorsRef.current = [...loadErrorsRef.current, message].slice(-50);
        setErrorRevision((value) => value + 1);
      }
    } finally {
      runtimeLoginInFlightRef.current = false;
    }
    return false;
  }, []);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !config) return;
    const onStart = () => setLoading(true);
    const onStop = async () => {
      await attemptRuntimeLogin(webview);
      setLoading(false);
    };
    const onDomReady = () => { void attemptRuntimeLogin(webview); };
    const onFail = (event: Event) => {
      const detail = event as Event & { errorCode?: number; errorDescription?: string; validatedURL?: string };
      if (detail.errorCode === -3) return;
      loadErrorsRef.current = [...loadErrorsRef.current, `${detail.errorDescription || 'Page load failed'}${detail.validatedURL ? ` · ${detail.validatedURL}` : ''}`].slice(-50);
      setErrorRevision((value) => value + 1);
      setLoading(false);
    };
    const onConsole = (event: Event) => {
      const detail = event as Event & { level?: number; message?: string; sourceId?: string; line?: number };
      consoleRef.current = [...consoleRef.current, {
        level: detail.level || 1,
        message: detail.message || '',
        sourceId: detail.sourceId,
        line: detail.line,
        timestamp: Date.now()
      }].slice(-200);
      if (/cache error:\s*no cache item id provided/i.test(detail.message || '') && configRef.current?.formXml) {
        setSurface('layout');
        loadErrorsRef.current = [...loadErrorsRef.current,
          'STARLIMS Runtime rejected its cache item. Switched to the local XML layout preview.'
        ].slice(-50);
      }
      if ((detail.level || 1) >= 2) setErrorRevision((value) => value + 1);
    };
    const onNavigate = (event: Event) => {
      const detail = event as Event & { url?: string };
      if (!detail.url) return;
      try {
        if (new URL(detail.url).origin !== configRef.current?.serverOrigin) {
          event.preventDefault();
          void window.electronAPI.shellOpenExternal(detail.url);
        }
      } catch { event.preventDefault(); }
    };
    const onNewWindow = (event: Event) => {
      const detail = event as Event & { url?: string };
      event.preventDefault();
      if (detail.url) void window.electronAPI.shellOpenExternal(detail.url);
    };
    webview.addEventListener('did-start-loading', onStart);
    webview.addEventListener('did-stop-loading', onStop);
    webview.addEventListener('dom-ready', onDomReady);
    webview.addEventListener('did-fail-load', onFail);
    webview.addEventListener('console-message', onConsole);
    webview.addEventListener('will-navigate', onNavigate);
    webview.addEventListener('new-window', onNewWindow);
    // Some STARLIMS Runtime builds render their ExtJS login shell after the
    // navigation events have completed. These retries make that late-rendered
    // form deterministic without submitting more than once.
    const retryTimers = [1500, 5000, 10000].map((delay) => window.setTimeout(() => {
      void attemptRuntimeLogin(webview);
    }, delay));
    void loadPreview(config);
    return () => {
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      webview.removeEventListener('did-start-loading', onStart);
      webview.removeEventListener('did-stop-loading', onStop);
      webview.removeEventListener('dom-ready', onDomReady);
      webview.removeEventListener('did-fail-load', onFail);
      webview.removeEventListener('console-message', onConsole);
      webview.removeEventListener('will-navigate', onNavigate);
      webview.removeEventListener('new-window', onNewWindow);
    };
  }, [attemptRuntimeLogin, config, loadPreview]);

  useEffect(() => {
    if (!config) return;
    return registerFormPreviewController({
      config,
      reload: () => void loadPreview(config),
      setViewport,
      capture,
      inspect,
      consoleEntries: () => [...consoleRef.current],
      loadErrors: () => [...loadErrorsRef.current]
    });
  }, [capture, config, inspect, loadPreview]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const sourceUri = (event as CustomEvent<{ sourceUri?: string }>).detail?.sourceUri;
      if (!sourceUri || sourceUri === config?.sourceUri) void loadPreview(config);
    };
    const remoteChange = (event: Event) => {
      if (!autoRefresh || !config) return;
      const change = (event as CustomEvent<AgentRemoteChange>).detail;
      if (canonicalFormUri(change.uri) === canonicalFormUri(config.sourceUri)) void loadPreview(config);
    };
    window.addEventListener(FORM_PREVIEW_REFRESH_EVENT, refresh);
    window.addEventListener(AGENT_REMOTE_CHANGE_EVENT, remoteChange);
    return () => {
      window.removeEventListener(FORM_PREVIEW_REFRESH_EVENT, refresh);
      window.removeEventListener(AGENT_REMOTE_CHANGE_EVENT, remoteChange);
    };
  }, [autoRefresh, config, loadPreview]);

  if (!config) return <div className="flex h-full items-center justify-center text-sm text-red-500">Invalid form preview configuration.</div>;

  // Use an ephemeral, origin-scoped session. SCM_API sessions are not valid
  // HTML Runtime sessions; the preview logs in to Runtime once inside this
  // isolated partition and keeps that session while the tab remains open.
  const partition = `persist:starlims-runtime-preview-v4-${config.serverOrigin.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
  const errorCount = loadErrorsRef.current.length + consoleRef.current.filter((entry) => entry.level >= 2).length;
  // Electron's <webview> tag is injected at runtime and is not part of React's
  // standard JSX intrinsic element declarations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebView = 'webview' as any;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100 dark:bg-[#181818]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-slate-300 bg-white px-2 dark:border-[#343434] dark:bg-[#202020]">
        <select className="h-7 rounded border border-slate-300 bg-transparent px-2 text-xs dark:border-[#4a4a4a]" value={config.mode} onChange={(event) => void changePreview(event.target.value as FormPreviewMode, config.language)}>
          <option value="run">{t('preview.run')}</option><option value="debug">{t('preview.debug')}</option><option value="design">{t('preview.design')}</option>
        </select>
        <select className="h-7 rounded border border-slate-300 bg-transparent px-2 text-xs dark:border-[#4a4a4a]" value={config.language} onChange={(event) => void changePreview(config.mode, event.target.value)}>
          {Array.from(new Set([config.language, ...languages])).map((language) => <option key={language} value={language}>{language}</option>)}
        </select>
        <div className="flex rounded border border-slate-300 dark:border-[#4a4a4a]">
          {(['responsive', 'desktop', 'tablet', 'mobile'] as FormPreviewViewport[]).map((item) => <button key={item} className={`h-7 px-2 text-xs ${viewport === item ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-[#333]'}`} onClick={() => setViewport(item)}>{item[0].toUpperCase()}</button>)}
        </div>
        <button className="icon-button h-7 px-2 text-xs" onClick={() => void loadPreview(config)} title={t('preview.refresh')}>↻</button>
        <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} /> {t('preview.autoRefresh')}</label>
        {config.formXml && <div className="flex rounded border border-slate-300 dark:border-[#4a4a4a]">
          <button className={`h-7 px-2 text-xs ${surface === 'layout' ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-[#333]'}`} onClick={() => setSurface('layout')}>{t('preview.layout')}</button>
          <button className={`h-7 px-2 text-xs ${surface === 'runtime' ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-[#333]'}`} onClick={() => setSurface('runtime')}>{t('preview.runtime')}</button>
        </div>}
        <div className="ml-auto flex items-center gap-1">
          <input className="h-7 w-44 rounded border border-slate-300 bg-transparent px-2 text-xs dark:border-[#4a4a4a]" value={selector} onChange={(event) => setSelector(event.target.value)} placeholder="CSS selector or #id" />
          <button className="h-7 rounded px-2 text-xs hover:bg-slate-200 dark:hover:bg-[#333]" onClick={() => void inspect(selector)}>{t('preview.inspect')}</button>
          <button className="h-7 rounded px-2 text-xs hover:bg-slate-200 dark:hover:bg-[#333]" onClick={() => void saveScreenshot()}>{t('preview.screenshot')}</button>
          <button className="h-7 rounded px-2 text-xs hover:bg-slate-200 dark:hover:bg-[#333]" onClick={() => webviewRef.current?.openDevTools()}>DevTools</button>
          <button className="h-7 rounded px-2 text-xs hover:bg-slate-200 dark:hover:bg-[#333]" onClick={() => void window.electronAPI.shellOpenExternal(config.url)}>{t('preview.external')}</button>
          <button className={`h-7 rounded px-2 text-xs ${errorCount ? 'text-red-500' : ''} hover:bg-slate-200 dark:hover:bg-[#333]`} onClick={() => setErrorsVisible((value) => !value)}>{t('preview.errors')} {errorCount}</button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto p-3">
        {loading && <div className="absolute left-1/2 top-5 z-10 -translate-x-1/2 rounded bg-blue-600 px-3 py-1 text-xs text-white shadow">{t('preview.loading')}</div>}
        <div className="mx-auto h-full min-h-[600px] overflow-hidden rounded border border-slate-300 bg-white shadow-sm dark:border-[#3c3c3c]" style={{ width: viewportWidths[viewport], maxWidth: viewport === 'responsive' ? '100%' : 'none' }}>
          <div className={surface === 'runtime' ? 'h-full w-full' : 'hidden'}>
            <WebView
              ref={attachWebView}
              src="about:blank"
              className="h-full w-full"
              partition={partition}
              webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
            />
          </div>
          {surface === 'layout' && config.formXml && <FormXmlLayoutPreview xml={config.formXml} mode={config.mode} />}
        </div>
      </div>
      {(errorsVisible || inspection) && <div className="max-h-48 shrink-0 overflow-auto border-t border-slate-300 bg-white p-2 font-mono text-xs dark:border-[#343434] dark:bg-[#1e1e1e]">
        {inspection && <pre className="mb-2 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{JSON.stringify(inspection, null, 2)}</pre>}
        {errorsVisible && loadErrorsRef.current.map((error, index) => <div key={`load-${index}`} className="text-red-500">{error}</div>)}
        {errorsVisible && consoleRef.current.filter((entry) => entry.level >= 2).map((entry, index) => <div key={`console-${index}`} className="text-red-500">{entry.message}</div>)}
      </div>}
    </div>
  );
}
