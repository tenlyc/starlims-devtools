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
  getURL: () => string;
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
  let element;
  let lookupError = '';
  try {
    element = requestedControlId
      ? (document.getElementById(requestedControlId) || Array.from(document.querySelectorAll('[data-control-id],[automation-id]')).find((item) => item.getAttribute('data-control-id') === requestedControlId || item.getAttribute('automation-id') === requestedControlId))
      : document.querySelector(requestedSelector || 'body');
    if (!element && requestedControlId && window.Ext?.ComponentQuery) {
      const component = window.Ext.ComponentQuery.query('*').find((item) => [item.id, item.itemId, item.reference, item.name].includes(requestedControlId));
      element = component?.getEl?.()?.dom;
    }
  } catch (error) { lookupError = String(error.message || error); }
  if (!element) return {
    found: false, error: lookupError || 'No element matched. The preview may still be showing its login shell; inspect body or capture a screenshot before claiming form acceptance.',
    selector: requestedSelector || requestedControlId, tagName: '', id: '', className: '', text: '', html: '',
    rect: {x:0,y:0,width:0,height:0}, attributes: {}, styles: {}
  };
  const rect = element.getBoundingClientRect();
  const styles = getComputedStyle(element);
  const attributes = {};
  for (const attribute of element.attributes || []) attributes[attribute.name] = attribute.value;
  const uniqueSelector = element.id ? '#' + CSS.escape(element.id) : requestedSelector || element.tagName.toLowerCase();
  return {
    found: true,
    selector: uniqueSelector,
    tagName: element.tagName,
    id: element.id || '',
    className: typeof element.className === 'string' ? element.className : '',
    text: (element.innerText || element.textContent || '').trim().slice(0, 2000),
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
    try { return component.isVisible?.(true) !== false && !component.isHidden?.(); } catch { return true; }
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
          component.emptyText, component.inputType, component.getXType?.(), component.getEl?.()?.getAttribute?.('automation-id')
        ].join(' '));
        // The user chooses the first available site and the Lims_Admin role during preview login.
        const combos = ExtRuntime.ComponentQuery.query('combobox').filter(isVisible);
        const site = combos.find((field) => /site|站点/.test(describe(field)));
        const role = combos.find((field) => /role|角色/.test(describe(field)));
        const confirm = buttons.find((button) => /^(ok|confirm|确定)$/i.test(String(button.getText?.() || button.text || '').trim()));
        const loginShell = document.querySelector('[automation-id="LoginViewsContainerView"]');
        if (site && role && confirm && loginShell && loginShell.getBoundingClientRect().height > 0) {
          const selectOption = (combo, preferredRole) => {
            const store = combo.getStore?.();
            if (!store || store.isLoading?.()) return 'waiting';
            const records = store.getRange?.() || [store.getAt?.(0)];
            const record = records.find((item) => item && item.get(combo.valueField || 'id') != null && item.get(combo.valueField || 'id') !== '' && item.get('disabled') !== true
              && (!preferredRole || [item.get(combo.valueField || 'id'), item.get(combo.displayField || 'text')].some((value) => normalize(value) === normalize(preferredRole))));
            if (!record) return 'waiting';
            const value = record.get(combo.valueField || 'id');
            if (value === undefined || value === null || value === '') return 'waiting';
            if (combo.getValue?.() === value) return 'ready';
            combo.setValue(value);
            combo.fireEvent?.('select', combo, record);
            return 'changed';
          };
          // Selecting a site reloads the role store; choose the role on a later tick.
          const siteState = selectOption(site);
          const roleState = siteState === 'ready' ? selectOption(role, 'Lims_Admin') : 'waiting';
          if (siteState === 'ready' && roleState === 'ready' && !confirm.isDisabled?.()) {
            if (typeof confirm.fireHandler === 'function') confirm.fireHandler();
            else confirm.getEl?.()?.dom?.click?.();
            finish('site-role-submitted');
            return;
          }
          if (Date.now() - startedAt >= 12000) { finish('selection-unavailable'); return; }
          setTimeout(tryLogin, 250);
          return;
        }
        const passwordFields = fields.filter((field) => /pass|密码/.test(describe(field)));
        const userField = fields.find((field) => /user|用户名|账号|login/.test(describe(field)) && !/pass|密码/.test(describe(field)));
        const loginButton = buttons.find((button) => /^(login|log in|sign in|登录|登入|确定|连接)$/i.test(String(button.getText?.() || button.text || '').trim()))
          || buttons.find((button) => /login|sign in|登录|登入/.test(normalize(button.getText?.() || button.text)));
        if (passwordFields.length && loginButton && !window.__devtoolsPreviewCredentialsSubmitted) {
          window.__devtoolsPreviewCredentialsSubmitted = true;
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
    const button = Array.from(document.querySelectorAll('button,a[role="button"],input[type="submit"],input[type="button"]')).find((element) => /login|log in|sign in|登录|登入|确定/i.test(String(element.textContent || element.value || '')));
    if (passwordInput && button && !window.__devtoolsPreviewCredentialsSubmitted) {
      window.__devtoolsPreviewCredentialsSubmitted = true;
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
      const loginView = document.querySelector('[automation-id="loginView"]');
      const looksLikeLogin = inputs.some((input) => input.type === 'password' && input.getBoundingClientRect().height > 0)
        || Boolean(loginView && loginView.getBoundingClientRect().height > 0);
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
    consoleRef.current = [];
    loadErrorsRef.current = [];
    runtimeLoginAttemptedRef.current = false;
    setSurface(nextConfig.mode === 'design' ? 'layout' : 'runtime');
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
    if (!webview || surface !== 'runtime') throw new Error('Runtime preview unavailable; local layout cannot certify runtime behavior.');
    const result = await webview.executeJavaScript(inspectionScript(requestedSelector, controlId), true) as FormPreviewElementSnapshot;
    setInspection(result);
    return result;
  }, [surface]);

  const capture = useCallback(async () => {
    const webview = webviewRef.current;
    if (!webview || surface !== 'runtime') throw new Error('Runtime preview unavailable; local layout cannot certify runtime behavior.');
    const image = await webview.capturePage();
    const size = image.getSize();
    return { dataUrl: image.toDataURL(), width: size.width, height: size.height };
  }, [surface]);

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
        runtimeLoginAttemptedRef.current = false;
        await window.electronAPI.formPreviewClick(webview.getWebContentsId(), x, y);
        setLoading(false);
        return true;
      }
      if (result?.status === 'site-role-submitted') {
        runtimeLoginAttemptedRef.current = true;
      } else if (result?.status === 'selection-unavailable') {
        runtimeLoginAttemptedRef.current = true;
        loadErrorsRef.current = [...loadErrorsRef.current, 'Could not select the first available site and Lims_Admin role. Check that Lims_Admin is assigned to this account for the selected site.'].slice(-50);
        setErrorRevision((value) => value + 1);
      } else if (result?.status === 'unauthorized' || result?.status === 'login-not-recognized') {
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
    const retryTimers = [1500, 5000, 10000, 20000, 30000].map((delay) => window.setTimeout(() => {
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
      status: () => ({ surface, loading, url: webviewRef.current?.getURL() || config.url }),
      reload: () => void loadPreview(config),
      setViewport,
      capture,
      inspect,
      consoleEntries: () => [...consoleRef.current],
      loadErrors: () => [...loadErrorsRef.current]
    });
  }, [capture, config, inspect, loadPreview, surface, loading]);

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
          <option value="run">{t('preview.run')}</option><option value="debug">{t('preview.debug')}</option>
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
