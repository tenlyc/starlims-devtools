import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveFormPreviewLanguage } from '../src/services/formPreviewLanguage';

assert.equal(resolveFormPreviewLanguage('XML', 'CHS'), 'CHS');
assert.equal(resolveFormPreviewLanguage('JavaScript', 'CHS'), 'CHS');
assert.equal(resolveFormPreviewLanguage('ENG', 'CHS'), 'ENG');
assert.equal(resolveFormPreviewLanguage(' chs ', 'ENG'), 'CHS');
assert.equal(resolveFormPreviewLanguage(undefined, 'CHS'), 'CHS');
assert.equal(resolveFormPreviewLanguage('XML', undefined), 'ENG');

const panel = readFileSync('src/components/Editor/FormPreviewPanel.tsx', 'utf8');
const service = readFileSync('src/services/formPreviewService.ts', 'utf8');
const editor = readFileSync('src/components/Editor/EditorPanel.tsx', 'utf8');
const capabilities = readFileSync('electron/mcpCapabilities.ts', 'utf8');
const genericRuntime = readFileSync('electron/genericAgentRuntime.ts', 'utf8');
const main = readFileSync('electron/main.ts', 'utf8');
const enterprise = readFileSync('src/services/enterpriseService.ts', 'utf8');
const layout = readFileSync('src/components/Editor/FormXmlLayoutPreview.tsx', 'utf8');

assert.match(panel, /webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"/, 'Preview WebView must remain isolated from Node and the host renderer');
assert.match(panel, /new URL\(detail\.url\)\.origin !== configRef\.current\?\.serverOrigin/, 'Cross-origin preview navigation must be blocked');
assert.match(panel, /\['responsive', 'desktop', 'tablet', 'mobile'\]/, 'Responsive preview viewports are missing');
assert.match(panel, /capturePage\(\)/, 'Preview screenshot capture is missing');
assert.match(panel, /executeJavaScript\(inspectionScript/, 'DOM inspection is missing');
assert.match(panel, /AGENT_REMOTE_CHANGE_EVENT/, 'Agent saves must refresh the matching preview');
assert.match(panel, /addEventListener\('dom-ready', onDomReady, \{ once: true \}\)/, 'Preview navigation must register the initial WebView dom-ready event during ref attachment');
assert.match(panel, /ref=\{attachWebView\}/, 'Preview WebView must use the race-safe callback ref');
assert.match(panel, /src="about:blank"/, 'Preview WebView must create its guest before a header-aware loadURL call');
assert.match(panel, /formPreviewConfigureSession\(webview\.getWebContentsId\(\)/, 'Preview must bind STARLIMS authentication to the full WebView session');
assert.match(main, /previewSession\.webRequest\.onBeforeSendHeaders/, 'Preview session headers must apply to subresources and subsequent navigation');
assert.match(main, /name: 'ASP\.NET_SessionId'/, 'Preview must seed the ASP.NET session cookie used by the HTML runtime');
assert.match(main, /STARLIMSUser: String\(options\.user\)/, 'Preview must bootstrap HTML runtime authorization using the active STARLIMS identity');
assert.match(main, /STARLIMSPass: String\(options\.password\)/, 'Preview must bootstrap HTML runtime authorization without persisting the password');
assert.match(panel, /!webview\.isConnected \|\| !webviewReadyRef\.current/, 'Preview navigation must not call loadURL before the WebView is attached');
assert.match(panel, /pendingConfigRef\.current = nextConfig/, 'A preview requested before dom-ready must be queued');
assert.match(editor, /FORM_PREVIEW_TYPE \? <FormPreviewPanel/, 'The editor does not render the integrated preview tab');
assert.match(main, /data:image\/png;base64,/, 'Screenshot IPC must validate PNG data URLs');
assert.match(enterprise, /GetItemGUID\?URI=/, 'Form preview GUID lookup must call the SCM_API.GetItemGUID script shipped in the unified SDP');
assert.doesNotMatch(enterprise, /`GetGUID\?URI=/, 'The nonexistent SCM_API.GetGUID endpoint must not be used');
assert.match(editor, /<Guid>\\s\*\(\[\^<\]\+\?\)/, 'HTML Form XML should reuse its embedded GUID without an unnecessary server lookup');
assert.match(editor, /const runtimeFormGuid = embeddedGuid \|\| activeFile\.guid/, 'HTML Form preview must prefer the runtime GUID embedded in the Form XML over the SCM item GUID');
assert.match(editor, /getHTMLFormPreviewConfig\(\s*activeFile\.uri,\s*runtimeFormGuid/, 'Resolved runtime FormId must be passed to all integrated preview modes');
assert.match(editor, /activeFile\.type === 'HTMLFORMXML' \? activeFile\.content/, 'The integrated preview must receive the current unsaved Form XML');
assert.match(panel, /cache error:\\s\*no cache item id provided/i, 'Runtime cache failures must switch to the local XML layout preview');
assert.match(panel, /FormXmlLayoutPreview/, 'The Runtime-independent Form XML layout preview is not connected');
assert.match(layout, /__array__Controls/, 'The local layout preview must render STARLIMS control collections');
assert.match(editor, /const ENABLE_FORM_PREVIEW_UI = true/, 'Preview and Debug actions must be visible');
assert.match(editor, /const ENABLE_FORM_DESIGN_UI = false/, 'Unverified Designer actions must remain hidden');
assert.match(editor, /<FormPreviewPanel key=\{activeFile.content\}/);
assert.match(service, /previewInstanceId: crypto.randomUUID\(\)/);
assert.doesNotMatch(panel, /<option value="design">/, 'Do not expose Designer through the preview mode selector');

for (const tool of [
  'open_form_preview', 'refresh_form_preview', 'set_preview_viewport', 'capture_form_screenshot',
  'inspect_form_element', 'get_preview_console_errors', 'get_preview_load_errors'
]) {
  assert.ok(service.includes(`'${tool}'`), `Renderer bridge is missing ${tool}`);
  assert.ok(capabilities.includes('...VISUAL_MCP_CAPABILITIES'), 'Visual capabilities must be advertised');
  assert.ok(genericRuntime.includes('BUILTIN_TOOLS.push(...VISUAL_GENERIC_TOOLS)'), 'Generic Agent must expose visual tools');
}

console.log('HTML Form preview infrastructure smoke test passed (MCP and runtime editor toolbar enabled).');

// Exercise the real login script against a disabled-until-filled ExtJS login button.
const loginBody = panel.match(/const runtimeLoginScript = .*?=> `([\s\S]*?)`;\n\nexport function/)?.[1];
assert.ok(loginBody);
const buildLogin = new Function('user', 'password', 'return `' + loginBody + '`;') as (user: string, password: string) => string;
void import('jsdom').then(async ({ JSDOM }) => {
  const inspectionBody = panel.match(/const inspectionScript = .*?=> `([\s\S]*?)`;\n\nconst runtimeLoginScript/)?.[1];
  assert.ok(inspectionBody);
  const buildInspection = new Function('selector', 'controlId', 'return `' + inspectionBody + '`;');
  const inspected = new JSDOM('<body><div automation-id="dgdClasses">材料大类</div></body>', { runScripts: 'outside-only' });
  const found = inspected.window.eval(buildInspection(undefined, 'dgdClasses'));
  assert.equal(found.found, true); assert.equal(found.text, '材料大类');
  const missing = inspected.window.eval(buildInspection(undefined, 'missing'));
  assert.equal(missing.found, false); assert.match(missing.error, /login shell/);
  const invalid = inspected.window.eval(buildInspection('[', undefined));
  assert.equal(invalid.found, false); assert.ok(invalid.error);
  inspected.window.close();
  const dom = new JSDOM('<body>用户名 密码 登录</body>', { url: 'https://example.test/login', runScripts: 'outside-only' });
  let user = '', password = '', submitted = false;
  const visible = { isVisible: () => true, isHidden: () => false };
  const userField = { ...visible, name: 'username', setValue: (value: string) => { user = value; } };
  const passwordField = { ...visible, inputType: 'password', setValue: (value: string) => { password = value; } };
  const button = { ...visible, isDisabled: () => !user || !password, getText: () => '登录', fireHandler: () => { submitted = Boolean(user && password); } };
  Object.assign(dom.window, { Ext: { ComponentQuery: { query: (type: string) => type === 'textfield' ? [userField, passwordField] : [button] } } });
  const result = await dom.window.eval(buildLogin('test-user', 'test-password'));
  assert.equal(result.status, 'submitted');
  assert.equal(submitted, true);
  dom.window.close();
  const form = new JSDOM('<body>用户名 姓名 基本信息</body>', { url: 'https://example.test/form', runScripts: 'outside-only' });
  let clock = 0;
  form.window.Date.now = () => { clock += 13000; return clock; };
  assert.equal((await form.window.eval(buildLogin('test-user', 'test-password'))).status, 'not-login');
  form.window.close();
  const selection = new JSDOM('<body><div automation-id="LoginViewsContainerView">站点 角色 确定</div></body>', { url: 'https://example.test/login', runScripts: 'outside-only' });
  selection.window.document.querySelector('div')!.getBoundingClientRect = () => ({ height: 10 } as DOMRect);
  const record = (id: string, text = id) => ({ get: (field: string) => field === 'id' ? id : field === 'text' ? text : undefined });
  let siteValue = '', roleValue = '', confirmed = false;
  const site = { ...visible, name: 'site', valueField: 'id', getValue: () => siteValue, setValue: (value: string) => { siteValue = value; roleValue = ''; }, getStore: () => ({ getAt: () => record('first-site') }) };
  const role = { ...visible, name: 'role', valueField: 'id', getValue: () => roleValue, setValue: (value: string) => { roleValue = value; }, getStore: () => ({ getRange: () => siteValue ? [record('first-role', 'Analyst'), record('admin-role-id', 'Lims_Admin')] : [] }) };
  const confirm = { ...visible, getText: () => '确定', isDisabled: () => !siteValue || !roleValue, fireHandler: () => { confirmed = true; } };
  Object.assign(selection.window, { Ext: { ComponentQuery: { query: (type: string) => type === 'combobox' ? [site, role] : type === 'button' ? [confirm] : [] } } });
  assert.equal((await selection.window.eval(buildLogin('test-user', 'test-password'))).status, 'site-role-submitted');
  assert.equal(siteValue, 'first-site'); assert.equal(roleValue, 'admin-role-id'); assert.equal(confirmed, true);
  confirmed = false; roleValue = '';
  role.getStore = () => ({ getRange: () => [record('first-role', 'Analyst')] });
  let selectionClock = 0;
  selection.window.Date.now = () => { selectionClock += 13000; return selectionClock; };
  assert.equal((await selection.window.eval(buildLogin('test-user', 'test-password'))).status, 'selection-unavailable');
  assert.equal(confirmed, false);
  assert.equal(roleValue, '');
  selection.window.close();
  console.log('Disabled-until-filled runtime login regression passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
