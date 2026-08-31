import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
assert.match(editor, /const ENABLE_FORM_PREVIEW_UI = false/, 'Experimental Preview, Debug, and Design editor actions must remain hidden for this beta');

for (const tool of [
  'open_form_preview', 'refresh_form_preview', 'set_preview_viewport', 'capture_form_screenshot',
  'inspect_form_element', 'get_preview_console_errors', 'get_preview_load_errors'
]) {
  assert.ok(service.includes(`'${tool}'`), `Renderer bridge is missing ${tool}`);
  assert.ok(!capabilities.includes(`'forms.preview`), 'Experimental visual capabilities must not be advertised in this beta');
  assert.ok(!genericRuntime.includes('VISUAL_GENERIC_TOOLS'), 'Generic Agent must not expose experimental visual tools in this beta');
}

console.log('Dormant HTML Form preview infrastructure smoke test passed (UI and MCP exposure disabled).');
