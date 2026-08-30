/**
 * STARLIMS Enterprise Service Implementation
 * Handles all communication with STARLIMS REST API
 */

// Using native browser fetch
import { IEnterpriseService, ServerConfig, SessionInfo, EnterpriseItem, CheckOutResult, CheckInResult, ScriptResult, DataSourceResult, SearchResult, QueryResult, ItemHistoryEntry, ItemLabelEntry, ItemVersionCode, SCMItem, LanguageOption } from './iEnterpriseService';
import { normalizeDataSourceOutput } from './dataSourceResult';
import { cleanUrl, isJson, getErrorMessage } from './miscUtils';
import { isBridgeRunning, launchXFDForm, launchHTMLForm } from './bridge';
import { useOutputLogStore } from './outputLogStore';
import { decodeFormResourcePayload } from './formResources';

export function isEnterpriseItemCheckedOut(item: Record<string, unknown>): boolean {
  const flag = item.isCheckedOut ?? item.checkedOut;
  const normalizedFlag = typeof flag === 'string' ? flag.trim().toLowerCase() : flag;
  const checkedOutBy = item.checkedOutBy ?? item.checkedoutby ?? item.CHECKEDOUTBY;
  return normalizedFlag === true
    || normalizedFlag === 'true'
    || normalizedFlag === '1'
    || (typeof checkedOutBy === 'string' && checkedOutBy.trim().length > 0);
}

export class EnterpriseService implements IEnterpriseService {
  private config: ServerConfig | null = null;
  private password = '';
  private baseUrl = '';
  private urlSuffix = 'lims';
  private sessionInfo: SessionInfo | null = null;
  private refreshSessionInterval: NodeJS.Timeout | null = null;
  private checkedOutDocuments: Map<string, string> = new Map();

  constructor() {
    // Initialize
  }

  /**
   * HTTP request via Electron IPC (to avoid CORS)
   */
  private async httpRequest(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    bodyBase64?: string;
    binary?: boolean;
  }): Promise<{ ok: boolean; status: number; statusText: string; headers: Record<string, string>; data: string }> {
    // In browser context, use IPC to proxy request
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.httpRequest(options);
    }
    // Fallback to native fetch (shouldn't happen in Electron)
    const response = await fetch(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.bodyBase64 ? this.base64ToBytes(options.bodyBase64).buffer as ArrayBuffer : options.body
    });
    let data = '';
    if (options.binary) {
      const buffer = await response.arrayBuffer();
      data = this.arrayBufferToBase64(buffer);
    } else {
      data = await response.text();
    }
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers,
      data
    };
  }

  /** Convert an ArrayBuffer to a base64 string (browser helper). */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    return btoa(binary);
  }

  /**
   * Update server configuration
   */
  public updateConfig(config: ServerConfig, password: string): void {
    this.config = config;
    this.password = password;
    this.baseUrl = cleanUrl(config.url);
    this.urlSuffix = config.urlSuffix || 'lims';
    this.sessionInfo = null;
  }

  /**
   * Connect to STARLIMS server
   */
  async connect(config: ServerConfig, password: string): Promise<boolean> {
    try {
      this.updateConfig(config, password);

      // Get session info by calling the API
      const sessionResult = await this.getSessionInfoInternal();

      if (!sessionResult) {
        console.error('Failed to establish session with STARLIMS');
        return false;
      }

      this.sessionInfo = sessionResult;

      // Start session refresh interval (90 seconds)
      this.startSessionRefresh();

      console.log('Successfully connected to STARLIMS');
      return true;
    } catch (error) {
      console.error('Failed to connect to STARLIMS:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Disconnect from STARLIMS server
   */
  disconnect(): void {
    this.stopSessionRefresh();
    this.sessionInfo = null;
    this.config = null;
    this.password = '';
    this.checkedOutDocuments.clear();
    console.log('Disconnected from STARLIMS');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.sessionInfo !== null;
  }

  /**
   * Get current server config
   */
  getCurrentServer(): ServerConfig | null {
    return this.config;
  }

  /**
   * Get session info (internal method)
   */
  private async getSessionInfoInternal(): Promise<SessionInfo | null> {
    try {
      const authUrl = `${this.baseUrl}/SCM_API.GetSessions.${this.urlSuffix}`;
      const user = this.config?.user || '';
      const pass = this.password;

      console.log('=== STARLIMS Auth Debug ===');
      console.log('Auth URL:', authUrl);
      console.log('User:', user);

      // Try with STARLIMS headers only
      const authResponse = await this.httpRequest({
        url: authUrl,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'STARLIMSUser': user,
          'STARLIMSPass': pass
        }
      });

      console.log('Auth response status:', authResponse.status);
      console.log('Auth response headers:', JSON.stringify(authResponse.headers));
      console.log('Auth response data (first 500):', authResponse.data.substring(0, 500));

      let authData: any;
      try {
        authData = JSON.parse(authResponse.data);
      } catch {
        console.error('Failed to parse auth response (not JSON)');
        return null;
      }

      // Response format: { data: { aspnetsessionid, langid, starlimssessionid }, success: true }
      if (!authData || !authData.success || !authData.data) {
        console.error('Authentication failed - invalid response');
        return null;
      }

      console.log('Auth successful!');
      return {
        aspnetSessionId: authData.data.aspnetsessionid || '',
        starlimsSessionId: authData.data.starlimssessionid,
        langid: authData.data.langid || 'ENG'
      };
    } catch (error) {
      console.error('Failed to get session info:', getErrorMessage(error));
      return null;
    }
  }

  /**
   * Refresh session to prevent timeout
   */
  private startSessionRefresh(): void {
    this.stopSessionRefresh();
    this.refreshSessionInterval = setInterval(async () => {
      await this.refreshSession();
    }, 90000); // 90 seconds
  }

  private stopSessionRefresh(): void {
    if (this.refreshSessionInterval) {
      clearInterval(this.refreshSessionInterval);
      this.refreshSessionInterval = null;
    }
  }

  /**
   * Refresh session
   */
  async refreshSession(): Promise<boolean> {
    try {
      if (!this.sessionInfo) return false;

      // Re-authenticate to refresh session
      const sessionResult = await this.getSessionInfoInternal();
      if (sessionResult) {
        this.sessionInfo = sessionResult;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get current session info
   */
  getSessionInfo(): SessionInfo | null {
    return this.sessionInfo;
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest<T = any>(
    endpoint: string,
    options: { method?: string; body?: string } = {},
    apiCategory = 'SCM_API'
  ): Promise<T | null> {
    if (!this.sessionInfo) {
      console.error('Not connected to STARLIMS');
      return null;
    }

    // endpoint format: GetEnterpriseItems or GetEnterpriseItems?URI=xxx
    const [endpointName, queryString] = endpoint.split('?');
    const baseApiUrl = `${this.baseUrl}/${apiCategory}.${endpointName}.${this.urlSuffix}`;
    const url = queryString ? `${baseApiUrl}?${queryString}` : baseApiUrl;
    const requestStarted = performance.now();
    const requestLabel = `${apiCategory}.${endpointName}`;
    useOutputLogStore.getState().addEntry({
      channel: 'starlims-api', level: 'info', source: 'STARLIMS API',
      message: `${options.method || 'GET'} ${requestLabel}`
    });
    console.log('API Request URL:', url);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'STARLIMSUser': this.config?.user || '',
      'STARLIMSPass': this.password
    };

    try {
      const response = await this.httpRequest({
        url,
        method: options.method || 'GET',
        headers,
        body: options.body
      });

      if (!response.ok) {
        console.error(`API request failed: ${response.status} ${response.statusText}`);
        console.error('Response:', response.data.substring(0, 500));
        const detail = response.data.trim().substring(0, 2000);
        throw new Error(`STARLIMS API ${apiCategory}.${endpointName} returned ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
      }

      useOutputLogStore.getState().addEntry({
        channel: 'starlims-api', level: 'success', source: 'STARLIMS API',
        message: `${options.method || 'GET'} ${requestLabel} → ${response.status} (${Math.round(performance.now() - requestStarted)} ms)`
      });

      if (isJson(response.data)) {
        return JSON.parse(response.data);
      }

      return response.data as any;
    } catch (error) {
      useOutputLogStore.getState().addEntry({
        channel: 'starlims-api', level: 'error', source: 'STARLIMS API',
        message: `${options.method || 'GET'} ${requestLabel} failed after ${Math.round(performance.now() - requestStarted)} ms: ${getErrorMessage(error)}`
      });
      console.error(`API request error for ${endpoint}:`, getErrorMessage(error));
      throw error;
    }
  }

  /**
   * Get enterprise items tree
   * Uses GET with URI parameter like VS Code extension
   */
  async getEnterpriseItems(uri?: string): Promise<EnterpriseItem[]> {
    try {
      // Use GET with URI parameter (like VS Code extension)
      const uriParam = uri || '';
      const data = await this.apiRequest<any>(`GetEnterpriseItems?URI=${encodeURIComponent(uriParam)}`, {
        method: 'GET'
      });

      console.log('GetEnterpriseItems response:', JSON.stringify(data).substring(0, 500));

      // Try different response structures
      if (!data) return [];

      // VS Code extension uses: { success: true, data: { items: [...] } }
      if (data.data?.items) {
        return this.parseEnterpriseItems(data.data.items);
      }
      // Some APIs return: { success: true, data: [...] }
      if (data.data) {
        return this.parseEnterpriseItems(Array.isArray(data.data) ? data.data : []);
      }
      // Fallback: data itself might be the array
      if (Array.isArray(data)) {
        return this.parseEnterpriseItems(data);
      }

      return [];
    } catch (error) {
      console.error('Failed to get enterprise items:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Parse enterprise items from API response
   */
  private parseEnterpriseItems(data: any[]): EnterpriseItem[] {
    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      id: item.uri || item.id || `${Date.now()}-${Math.random()}`,
      name: item.name || item.text || 'Unknown',
      type: item.type || item.itemType || 'UNKNOWN',
      uri: item.uri || item.ID || '',
      hasChildren: item.isFolder ?? item.hasChildren ?? false,
      children: item.children ? this.parseEnterpriseItems(item.children) : undefined,
      isCheckedOut: isEnterpriseItemCheckedOut(item),
      checkedOutBy: item.checkedOutBy || item.checkedoutby || item.CHECKEDOUTBY,
      checkedOutDate: item.checkedOutDate || item.checkedoutdate || item.CHECKEDOUTDATE,
      version: item.ver || item.version,
      guid: item.guid || item.GUID || undefined,
      // LANGID is the selected STARLIMS form language (for example CHS/ENG).
      // Keep it separate from SCRIPTLANGUAGE, which describes the item family
      // (HTML/XFD) and is not a language that should be shown to the user.
      language: item.language || item.langid || item.LANGID || item.userLang || item.UserLang || undefined,
      scriptLanguage: item.scriptLanguage || item.scriptlanguage || item.SCRIPTLANGUAGE || undefined,
      rawType: item.rawType || item.rawtype || item.CHILDTYPE || undefined,
      displayPath: item.displayPath || item.displaypath || item.DISPLAYPATH || undefined
    }));
    console.log('Parsed enterprise items, checking for guid field:', data.map(item => ({ name: item.name, guid: item.guid || item.GUID })));
  }

  /**
   * Parse checked out items from XML response
   */
  private parseCheckedOutItemsXml(xmlString: string): EnterpriseItem[] {
    try {
      console.log('Full XML response length:', xmlString.length);

      // Try to extract row data from XML
      const items: EnterpriseItem[] = [];

      // Look for PendingCheckins elements directly (they appear after the schema)
      const rowMatches = xmlString.match(/<PendingCheckins>[\s\S]*?<\/PendingCheckins>/g);
      if (rowMatches) {
        console.log('Found rows:', rowMatches.length);
        for (const row of rowMatches) {
          const childIdMatch = row.match(/<CHILDID>([^<]*)<\/CHILDID>/);
          const childNameMatch = row.match(/<CHILDNAME>([^<]*)<\/CHILDNAME>/);
          const userMatch = row.match(/<CHECKEDOUTBY>([^<]*)<\/CHECKEDOUTBY>/);
          const typeMatch = row.match(/<CHILDTYPE>([^<]*)<\/CHILDTYPE>/);
          const parentNameMatch = row.match(/<ParentName>([^<]*)<\/ParentName>/);
          const parentNameUpperMatch = row.match(/<PARENTNAME>([^<]*)<\/PARENTNAME>/);
          const parentTypeMatch = row.match(/<PARENTTYPE>([^<]*)<\/PARENTTYPE>/);
          const appCatNameMatch = row.match(/<APPCATNAME>([^<]*)<\/APPCATNAME>/);
          const scriptLanguageMatch = row.match(/<SCRIPTLANGUAGE>([^<]*)<\/SCRIPTLANGUAGE>/);
          const languageMatch = row.match(/<LANGID>([^<]*)<\/LANGID>/);
          const dateMatch = row.match(/<CHECKEDOUTDATE>([^<]*)<\/CHECKEDOUTDATE>/);

          if (childNameMatch) {
            const rawType = typeMatch?.[1] || 'UNKNOWN';
            const parentType = parentTypeMatch?.[1] || '';
            const parentName = parentNameMatch?.[1] || parentNameUpperMatch?.[1] || '';
            const appCategory = appCatNameMatch?.[1] || '';
            const scriptLanguage = (scriptLanguageMatch?.[1] || '').toUpperCase();
            const isApplicationItem = parentType === 'APP';
            const normalizedType = rawType === 'SERVERSCRIPT'
                ? (isApplicationItem ? 'AppServerScript' : 'ServerScript')
                : rawType === 'CLIENTSCRIPT'
                  ? (isApplicationItem ? 'AppClientScript' : 'ClientScript')
                  : rawType === 'DATASOURCE'
                    ? (isApplicationItem ? 'AppDataSourceScript' : 'DataSourceScript')
                    : rawType;
            const typeFolder = scriptLanguage === 'HTML'
              ? 'HTML Forms'
              : scriptLanguage === 'XFD'
                ? 'XFD Forms'
              : rawType === 'SERVERSCRIPT' ? 'Server Scripts'
                : rawType === 'CLIENTSCRIPT' ? 'Client Scripts'
                  : rawType === 'DATASOURCE' ? 'Data Sources' : rawType;
            const pathParts = isApplicationItem
              ? ['Applications', appCategory, parentName, typeFolder]
              : [typeFolder, parentName];
            const commonItem = {
              hasChildren: false,
              isCheckedOut: true,
              checkedOutBy: userMatch?.[1] || 'Unknown',
              checkedOutDate: dateMatch?.[1],
              displayPath: pathParts.filter(Boolean).join(' / '),
              guid: childIdMatch?.[1] || undefined,
              rawType
            };

            if (isApplicationItem && (scriptLanguage === 'HTML' || scriptLanguage === 'XFD')) {
              const formName = childNameMatch[1];
              const formRoot = `/Applications/${appCategory}/${parentName}/${scriptLanguage === 'HTML' ? 'HTMLForms' : 'XFDForms'}`;
              const formLanguage = languageMatch?.[1] || this.sessionInfo?.langid || 'ENG';
              const formParts = scriptLanguage === 'HTML'
                ? [
                    { suffix: 'XML', label: 'XML', type: 'HTMLFORMXML', language: formLanguage },
                    { suffix: 'CodeBehind', label: 'Code Behind', type: 'HTMLFORMCODE', language: formLanguage },
                    { suffix: 'Guide', label: 'Guide', type: 'HTMLFORMGUIDE', language: formLanguage },
                    { suffix: 'Resources', label: 'Resources', type: 'HTMLFORMRESOURCES', language: formLanguage }
                  ]
                : [
                    { suffix: 'XML', label: 'XML', type: 'XFDFORMXML', language: formLanguage },
                    { suffix: 'CodeBehind', label: 'Code Behind', type: 'XFDFORMCODE', language: formLanguage },
                    { suffix: 'Resources', label: 'Resources', type: 'XFDFORMRESOURCES', language: formLanguage }
                  ];

              for (const part of formParts) {
                items.push({
                  ...commonItem,
                  id: `${childIdMatch?.[1] || formName}:${part.type}`,
                  name: `${formName} [${part.label}]`,
                  type: part.type,
                  uri: `${formRoot}/${part.suffix}/${formName}`,
                  language: part.language,
                  scriptLanguage
                });
              }
              continue;
            }

            items.push({
              ...commonItem,
              id: childIdMatch?.[1] || childNameMatch[1],
              name: childNameMatch[1],
              type: normalizedType,
              uri: childIdMatch?.[1] || '',
              language: scriptLanguage || languageMatch?.[1] || undefined,
              scriptLanguage: scriptLanguage || undefined
            });
          }
        }
      } else {
        console.log('No PendingCheckins rows found');
      }

      console.log('Parsed checked out items:', items.length);
      return items;
    } catch (error) {
      console.error('Failed to parse checked out items XML:', error);
      return [];
    }
  }

  /**
   * Get item code from STARLIMS
   */
  async getItemCode(uri: string, language?: string): Promise<string> {
    try {
      // GetCode API expects URI as query parameter
      const data = await this.apiRequest<any>(`GetCode?URI=${encodeURIComponent(uri)}&UserLang=${language || this.sessionInfo?.langid || 'ENG'}`, {
        method: 'GET'
      });

      if (data && data.success !== false) {
        const code = data.data?.code || '';
        return /\/(?:HTMLForms|XFDForms)\/Resources\//i.test(uri) ? decodeFormResourcePayload(code) : code;
      }
      return '';
    } catch (error) {
      console.error('Failed to get item code:', getErrorMessage(error));
      return '';
    }
  }

  /**
   * Save item code to STARLIMS
   */
  async saveItemCode(uri: string, code: string, language?: string): Promise<boolean> {
    try {
      const data = await this.apiRequest<any>('SaveCode', {
        method: 'POST',
        body: JSON.stringify({
          URI: uri,
          Code: code,
          UserLang: language || this.sessionInfo?.langid || 'ENG'
        })
      });

      return data?.success === true;
    } catch (error) {
      console.error('Failed to save item code:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Check out an item
   */
  async checkOut(uri: string, language?: string): Promise<CheckOutResult> {
    try {
      const lang = language || this.sessionInfo?.langid || 'ENG';
      const data = await this.apiRequest<any>(`CheckOut?URI=${encodeURIComponent(uri)}&UserLang=${lang}`, {
        method: 'GET'
      });

      if (data?.success === true) {
        this.checkedOutDocuments.set(uri, data.localPath || uri);
        return { success: true, localPath: data.localPath };
      }

      return { success: false, message: data?.message || 'Check out failed' };
    } catch (error) {
      console.error('Failed to check out:', getErrorMessage(error));
      return { success: false, message: getErrorMessage(error) };
    }
  }

  /**
   * Check in an item
   */
  async checkIn(uri: string, reason?: string, language?: string): Promise<CheckInResult> {
    try {
      const lang = language || this.sessionInfo?.langid || 'ENG';
      const data = await this.apiRequest<any>(`CheckIn?URI=${encodeURIComponent(uri)}&UserLang=${lang}&Reason=${encodeURIComponent(reason || '')}`, {
        method: 'GET'
      });

      if (data?.success === true) {
        this.checkedOutDocuments.delete(uri);
        return { success: true };
      }

      return { success: false, message: data?.message || 'Check in failed' };
    } catch (error) {
      console.error('Failed to check in:', getErrorMessage(error));
      return { success: false, message: getErrorMessage(error) };
    }
  }

  /**
   * Undo check out
   */
  async undoCheckOut(uri: string): Promise<boolean> {
    try {
      const data = await this.apiRequest<any>(`UndoCheckOut?URI=${encodeURIComponent(uri)}`, {
        method: 'GET'
      });

      if (data?.success === true) {
        this.checkedOutDocuments.delete(uri);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to undo check out:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Check in all checked out items
   */
  async checkInAll(reason?: string): Promise<boolean> {
    try {
      const data = await this.apiRequest<any>(`CheckInAll?Reason=${encodeURIComponent(reason || '')}`, {
        method: 'GET'
      });

      if (data?.success === true) {
        this.checkedOutDocuments.clear();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to check in all items:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Export all checked out items as a package
   */
  async exportCheckouts(): Promise<boolean> {
    try {
      const data = await this.apiRequest<any>('ExportPackage', {
        method: 'GET'
      });

      return data?.success === true;
    } catch (error) {
      console.error('Failed to export checkouts:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Export checked out items as an SDP package and download it.
   *
   * STARLIMS_DEVTOOLS_API.DevToolsExportPackage is executed through the
   * established SCM_API.RunScript endpoint and returns a file name with base64
   * SDP content. The result is validated to be a ZIP before it is downloaded.
   *
   * When `items` is provided (item GUIDs / CHILDIDs) only those items are
   * included in the package.
   */
  async exportPackage(items?: string[], history = false, languages: string[] = []): Promise<{ success: boolean; fileName?: string; blob?: Blob; error?: string }> {
    try {
      const invocation = await this.apiRequest<any>('RunScript', {
        method: 'POST',
        body: JSON.stringify({
          URI: '/ServerScripts/STARLIMS_DEVTOOLS_API/DevToolsExportPackage',
          Parameters: [items?.join(',') || '', history, languages.join(',')]
        })
      });
      const data = invocation?.data;

      if (!data || data.success !== true) {
        const message = data?.data ? String(data.data) : 'Export failed: server did not return success';
        return { success: false, error: message };
      }

      const payload = data.data as unknown;

      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const direct = payload as { fileName?: unknown; content?: unknown };
        if (typeof direct.fileName === 'string' && typeof direct.content === 'string') {
          const bytes = this.base64ToBytes(direct.content);
          if (!this.isZipBytes(bytes)) {
            return { success: false, error: `Export succeeded, but returned content is not a valid SDP/ZIP file (${direct.fileName})` };
          }
          return { success: true, fileName: direct.fileName, blob: this.bytesToBlob(bytes) };
        }
      }

      return { success: false, error: 'Export failed: unexpected server response' };
    } catch (error) {
      console.error('Failed to export package:', getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /** Load the check-in user drop-down used by the simplified SCM window. */
  async getSCMUsers(): Promise<string[]> {
    try {
      const data = await this.apiRequest<any>('RunScript', {
        method: 'POST',
        body: JSON.stringify({ URI: '/ServerScripts/STARLIMS_DEVTOOLS_API/DevToolsGetSCMUsers' })
      });
      const users = data?.data?.users;
      if (Array.isArray(users)) {
        return users.map((user: unknown) => String(user || '').trim()).filter(Boolean);
      }
    } catch (error) {
      console.error('Failed to get SCM users:', getErrorMessage(error));
    }

    const currentUser = this.config?.user?.trim();
    return currentUser ? [currentUser] : [];
  }

  /** Find the items checked in by a user during an inclusive date range. */
  async getCheckInHistory(filter: { user: string; dateFrom: string; dateTo: string }): Promise<SCMItem[]> {
    const data = await this.apiRequest<any>('RunScript', {
      method: 'POST',
      body: JSON.stringify({
        URI: '/ServerScripts/STARLIMS_DEVTOOLS_API/DevToolsGetCheckInHistory',
        Parameters: [filter.user, filter.dateFrom, filter.dateTo]
      })
    });
    if (!data) {
      throw new Error('STARLIMS check-in history request failed or timed out.');
    }
    if (data.success === false) {
      throw new Error(String(data.error || data.data || 'Source Control Manager query failed.'));
    }
    const payload = data?.data;
    if (payload?.success === false) {
      throw new Error(String(payload.error || 'Source Control Manager query failed.'));
    }
    const items = payload?.items;
    if (!Array.isArray(items)) {
      throw new Error('STARLIMS check-in history returned an invalid response.');
    }

    return items.map((item: any) => ({
      itemType: String(item.itemType || ''),
      catName: String(item.catName || ''),
      appName: String(item.appName || ''),
      itemName: String(item.itemName || ''),
      itemId: String(item.itemId || ''),
      uri: String(item.uri || ''),
      state: 'History',
      isCheckedOut: false,
      checkedInBy: String(item.checkedInBy || ''),
      checkedInDate: String(item.checkedInDate || ''),
      versionId: String(item.versionId || '')
    }));
  }

  /** Decode a base64 string into bytes (renderer has no Node Buffer). */
  private base64ToBytes(base64: string): Uint8Array {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /** Wrap bytes in a Blob with an ArrayBuffer-backed view (TS-safe BlobPart). */
  private bytesToBlob(bytes: Uint8Array): Blob {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Blob([copy.buffer as ArrayBuffer]);
  }

  /** SDP packages are ZIP containers: validate the PK magic number. */
  private isZipBytes(bytes: Uint8Array): boolean {
    if (bytes.length < 4) return false;
    return bytes[0] === 0x50 && bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
      (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
  }

  private bytesToPreview(bytes: Uint8Array): string {
    try {
      return new TextDecoder().decode(bytes.slice(0, 500)).trim();
    } catch {
      return '';
    }
  }

  /** Turn verbose ASP.NET customErrors pages into a short actionable message. */
  private summarizeHttpError(text: string, status: number, statusText: string): string {
    const title = text.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    const heading = text.match(/<h2[^>]*>[\s\S]*?<i>([\s\S]*?)<\/i>[\s\S]*?<\/h2>/i)?.[1];
    const candidate = heading || title;
    if (candidate) {
      const message = candidate.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
      if (message) return `${status} ${statusText}: ${message}`;
    }
    const plain = text.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
    return plain.slice(0, 500) || `${status} ${statusText}`;
  }

  /**
   * Import an SDP package file
   */
  async importPackage(file: File): Promise<{ success: boolean; log?: string; error?: string }> {
    if (!this.sessionInfo || !this.config) {
      return { success: false, error: 'Not connected to STARLIMS' };
    }

    try {
      const bootstrapUrl = `${this.baseUrl}/SCM_API.ImportPackage.${this.urlSuffix}`;
      const sessions = await this.getServerSessions();
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/octet-stream',
        'STARLIMSUser': this.config.user || '',
        'STARLIMSPass': this.password
      };
      if (sessions?.aspnetSessionId) headers['aspnet-sessionid'] = sessions.aspnetSessionId;
      if (sessions?.starlimsSessionId) headers['starlims-sessionid'] = sessions.starlimsSessionId;
      if (sessions?.langid) headers['langid'] = sessions.langid;

      const request = {
        method: 'POST',
        headers,
        bodyBase64: this.arrayBufferToBase64(await file.arrayBuffer())
      } as const;
      // Binary uploads must use the original SCM_API endpoint. Calling a
      // custom *.lims endpoint directly is rejected by STARLIMS 12.6.2 with
      // "Cache error: No cache item id provided" before the script executes.
      const response = await this.httpRequest({
        url: bootstrapUrl,
        ...request
      });

      const text = response.data;
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        return { success: false, error: this.summarizeHttpError(text, response.status, response.statusText) };
      }
      if (data?.success === true) {
        return { success: true, log: data.data };
      }
      return { success: false, error: data?.data || 'Import failed' };
    } catch (error) {
      console.error('Failed to import package:', getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Get the version history of an item from LIMSSOURCECONTROL
   * (mirrors the official Source Control Manager dsGetHistory data source).
   * Requires the SCM_API GetItemHistory endpoint (shipped in scm_api patch).
   */
  async getItemHistory(uri: string): Promise<ItemHistoryEntry[]> {
    try {
      const data = await this.apiRequest<any>(`GetItemHistory?URI=${encodeURIComponent(uri)}`, {
        method: 'GET'
      });
      return this.parseHistoryEntries(data);
    } catch (error) {
      console.error('Failed to get item history:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Get the labels attached to an item from VERSIONSLABELS / VERSIONSLABELS_ITEMS
   * (mirrors the official Source Control Manager dsGetLabelsForItem data source).
   * Requires the SCM_API GetItemLabels endpoint (shipped in scm_api patch).
   */
  async getItemLabels(uri: string): Promise<ItemLabelEntry[]> {
    try {
      const data = await this.apiRequest<any>(`GetItemLabels?URI=${encodeURIComponent(uri)}`, {
        method: 'GET'
      });
      return this.parseLabelEntries(data);
    } catch (error) {
      console.error('Failed to get item labels:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Read the code documents of a specific version from LIMSSOURCECONTROL
   * (mirrors the official scGetCodeFromLimsSourceControl script).
   * Requires the SCM_API GetItemVersionCode endpoint (shipped in scm_api patch).
   */
  async getItemVersionCode(versionId: string): Promise<ItemVersionCode | null> {
    try {
      const data = await this.apiRequest<any>(`GetItemVersionCode?VERSIONID=${encodeURIComponent(versionId)}`, {
        method: 'GET'
      });
      if (!data || data.success !== true) return null;
      const row = data.data as Record<string, unknown> | undefined;
      if (!row || typeof row !== 'object') return null;
      return {
        code: typeof row.CODEDOCUMENT === 'string' ? row.CODEDOCUMENT : '',
        xfdDocument: typeof row.XFDDOCUMENT === 'string' ? row.XFDDOCUMENT : '',
        resourceDocument: typeof row.RESOURCEDOCUMENT === 'string' ? row.RESOURCEDOCUMENT : '',
        versionId: typeof row.VERSIONID === 'string' ? row.VERSIONID : versionId
      };
    } catch (error) {
      console.error('Failed to get item version code:', getErrorMessage(error));
      return null;
    }
  }

  /**
   * Load the whole enterprise tree at once. Returns every item
   * (forms, server/client scripts, data sources, tables) with its
   * uri, type, language, guid and checkout state.
   */
  async getAllItems(): Promise<EnterpriseItem[]> {
    try {
      const data = await this.apiRequest<any>('GetAllItems', { method: 'GET' });
      if (data?.data?.items && Array.isArray(data.data.items) && data.data.items.length > 0) {
        return data.data.items.map((item: any) => {
          const uri = item.uri || '';
          const uriName = uri.split('/').filter(Boolean).pop() || '';
          return {
          id: item.uri || item.name || '',
          // Older SCM_API.GetAllItems versions returned the whole URI in
          // `name`.  The Enterprise/SCM trees should always show the leaf
          // display name, never the complete script path.
          name: uriName || item.name || '',
          type: item.type || 'UNKNOWN',
          uri,
          hasChildren: false,
          isCheckedOut: !!item.checkedOutBy,
          checkedOutBy: item.checkedOutBy || undefined,
          language: item.language || '',
          guid: item.guid || undefined
          };
        });
      }
      return [];
    } catch (error) {
      console.error('Failed to get all items:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Load every Source Control item with its checkout state.
   * Mirrors the official SCM dsGetItemsFromSearch data source.
   * Requires the SCM_API GetSCMItems endpoint (shipped in scm_api patch).
   */
  async getSCMItems(filter?: {
    itemName?: string; types?: string[]; checkedOutOnly?: boolean;
    checkOutBy?: string; checkInBy?: string;
    checkOutDateFrom?: string; checkOutDateTo?: string;
    checkInDateFrom?: string; checkInDateTo?: string;
    factoryMajor?: string; factoryMinor?: string; factoryBuild?: string;
    dealerMajor?: string; dealerMinor?: string; dealerBuild?: string;
    clientMajor?: string; clientMinor?: string; clientBuild?: string;
    textType?: string; textValue?: string;
  }): Promise<SCMItem[]> {
    try {
      const params = new URLSearchParams();
      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') return;
          if (Array.isArray(value)) {
            if (value.length > 0) params.set(key, value.join(','));
          } else if (value === true) {
            params.set(key, 'true');
          } else if (typeof value === 'string') {
            params.set(key, value);
          }
        });
      }
      const qs = params.toString();
      const endpoint = qs ? `GetSCMItems?${qs}` : 'GetSCMItems';
      const data = await this.apiRequest<any>(endpoint, { method: 'GET' });
      if (data?.data?.items && Array.isArray(data.data.items) && data.data.items.length > 0) {
        return data.data.items.map((item: any) => ({
          itemType: item.itemType || '',
          catName: item.catName || '',
          appName: item.appName || '',
          itemName: item.itemName || '',
          itemId: item.itemId || '',
          uri: item.uri || '',
          state: item.state || '',
          isCheckedOut: !!item.isCheckedOut,
          checkedOutBy: item.checkedOutBy || undefined,
          checkedOutDate: item.checkedOutDate || undefined,
          checkedInBy: item.checkedInBy || undefined,
          checkedInDate: item.checkedInDate || undefined,
          factoryVersion: item.factoryVersion || undefined,
          dealerVersion: item.dealerVersion || undefined,
          clientVersion: item.clientVersion || undefined,
          reason: item.reason || undefined,
          versionId: item.versionId || undefined
        }));
      }
      // GetSCMItems is an optional history extension.  Keep the native SCM
      // export tree useful on servers that only have the standard DevTools
      // SCM_API package by falling back to GetAllItems.
      return this.getSCMItemsFallback(filter);
    } catch (error) {
      console.error('Failed to get SCM items:', getErrorMessage(error));
      return this.getSCMItemsFallback(filter);
    }
  }

  private async getSCMItemsFallback(filter?: {
    itemName?: string; types?: string[]; checkedOutOnly?: boolean;
    checkOutBy?: string; checkInBy?: string;
    checkOutDateFrom?: string; checkOutDateTo?: string;
    checkInDateFrom?: string; checkInDateTo?: string;
    factoryMajor?: string; factoryMinor?: string; factoryBuild?: string;
    dealerMajor?: string; dealerMinor?: string; dealerBuild?: string;
    clientMajor?: string; clientMinor?: string; clientBuild?: string;
    textType?: string; textValue?: string;
  }): Promise<SCMItem[]> {
    const source = await this.getAllItems();
    const seen = new Set<string>();
    const mapped: SCMItem[] = [];
    const typeMap: Record<string, string> = {
      HTMLFORMXML: 'APP_FRM', HTMLFORMCODE: 'APP_FRM', HTMLFORMGUIDE: 'APP_FRM', HTMLFORMRESOURCES: 'APP_FRM',
      XFDFORMXML: 'APP_FRM', XFDFORMCODE: 'APP_FRM', XFDFORMRESOURCES: 'APP_FRM',
      APPSS: 'APP_SSC', APPCS: 'APP_CS', APPDS: 'APP_DS',
      SS: 'SSC', CS: 'CSC', DS: 'DS', TABLE: 'TBL'
    };

    for (const item of source) {
      const itemType = typeMap[item.type] || item.type;
      const parts = (item.uri || '').split('/').filter(Boolean);
      const isApplication = parts[0] === 'Applications';
      const itemId = item.guid || item.id;
      // A form appears as XML/Code Behind/Guide/Resources in GetAllItems, but
      // an SDP contains the form once with all of its documents.
      const dedupeKey = `${itemType}:${itemId}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      mapped.push({
        itemType,
        catName: isApplication ? (parts[1] || '') : (parts[1] || ''),
        appName: isApplication ? (parts[2] || '') : '',
        itemName: parts[parts.length - 1] || item.name,
        itemId,
        uri: item.uri || '',
        state: item.isCheckedOut ? 'CheckedOut' : 'Current',
        isCheckedOut: !!item.isCheckedOut,
        checkedOutBy: item.checkedOutBy
      });
    }

    const name = filter?.itemName?.trim().toLowerCase();
    const types = filter?.types || [];
    return mapped.filter(item => {
      if (name && !item.itemName.toLowerCase().includes(name)) return false;
      if (types.length > 0 && !types.includes(item.itemType)) return false;
      if (filter?.checkedOutOnly && !item.isCheckedOut) return false;
      if (filter?.checkOutBy && !String(item.checkedOutBy || '').toLowerCase().includes(filter.checkOutBy.toLowerCase())) return false;
      return true;
    });
  }

  /**
   * Export selected enterprise items (live / checked-in state) as an SDP
   * package for deployment to another STARLIMS environment.
   * Mirrors the official SCM "Send to Package Manager" flow.
   * Requires the SCM_API ExportItems endpoint (shipped in scm_api patch).
   */
  async exportItems(uris: string[]): Promise<{ success: boolean; fileName?: string; blob?: Blob; error?: string }> {
    if (!uris || uris.length === 0) {
      return { success: false, error: 'No items selected for export' };
    }
    try {
      const endpoint = `ExportItems?items=${encodeURIComponent(uris.join(','))}`;
      const data = await this.apiRequest<any>(endpoint, { method: 'GET' });
      if (!data || data.success !== true) {
        const message = data?.data ? String(data.data) : 'Export failed: server did not return success';
        return { success: false, error: message };
      }
      const payload = data.data as unknown;
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const direct = payload as { fileName?: unknown; content?: unknown };
        if (typeof direct.fileName === 'string' && typeof direct.content === 'string') {
          const bytes = this.base64ToBytes(direct.content);
          if (!this.isZipBytes(bytes)) {
            return { success: false, error: `Export succeeded, but returned content is not a valid SDP/ZIP file (${direct.fileName})` };
          }
          return { success: true, fileName: direct.fileName, blob: this.bytesToBlob(bytes) };
        }
      }
      return { success: false, error: 'Export failed: unexpected server response' };
    } catch (error) {
      console.error('Failed to export items:', getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Recover an old version into the current version.
   * Mirrors the official Source Control Manager scRecoverOldVersion script:
   * copies the version documents into a new version and updates the live
   * item tables (LIMSXFDFORMS/LIMSSERVERSCRIPTS/LIMSDATASOURCES/...).
   * This is a write operation; the UI must confirm with the user first.
   * Requires the SCM_API RecoverVersion endpoint (shipped in scm_api patch).
   */
  async recoverVersion(uri: string, versionId: string, reason?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const params = new URLSearchParams({ URI: uri, VERSIONID: versionId });
      if (reason) params.set('Reason', reason);
      const data = await this.apiRequest<any>(`RecoverVersion?${params.toString()}`, {
        method: 'GET'
      });
      if (!data) {
        return { success: false, error: 'RecoverVersion: no response from server' };
      }
      if (data.success === true) {
        return { success: true, message: typeof data.data === 'string' ? data.data : 'Version recovered' };
      }
      return { success: false, error: typeof data.data === 'string' ? data.data : 'Version recovery failed' };
    } catch (error) {
      console.error('Failed to recover version:', getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Create a version label and attach it to an item/version (write operation).
   * Requires the SCM_API CreateLabel endpoint (shipped in scm_api patch).
   */
  async createLabel(uri: string, labelTitle: string, labelDesc?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const params = new URLSearchParams({ URI: uri, labelTitle });
      if (labelDesc) params.set('labelDesc', labelDesc);
      const data = await this.apiRequest<any>(`CreateLabel?${params.toString()}`, {
        method: 'GET'
      });
      if (!data) {
        return { success: false, error: 'CreateLabel: no response from server' };
      }
      if (data.success === true) {
        return { success: true, message: typeof data.data === 'string' ? data.data : 'Label created' };
      }
      return { success: false, error: typeof data.data === 'string' ? data.data : 'Label creation failed' };
    } catch (error) {
      console.error('Failed to create label:', getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /** Normalize history rows coming back from GetItemHistory (rows or row list). */
  private parseHistoryEntries(data: any): ItemHistoryEntry[] {
    try {
      const rows = this.extractRows(data);
      return rows.map((row: any) => ({
        itemType: this.rowString(row, 'ITEM_TYPE'),
        itemId: this.rowString(row, 'ITEM_ID'),
        status: this.rowString(row, 'STATUS'),
        done: this.rowString(row, 'DONE'),
        checkedOutBy: this.rowString(row, 'CHECKEDOUTBY'),
        checkedOutDate: this.rowString(row, 'CHECKEDOUTDATE'),
        checkedInBy: this.rowString(row, 'CHECKEDINBY'),
        checkedInDate: this.rowString(row, 'CHECKEDINDATE'),
        reasonForCheckout: this.rowString(row, 'REASONFORCHECKOUT'),
        lsCorigRec: this.rowString(row, 'LSCORIGREC'),
        factory: this.rowString(row, 'FACTORY'),
        dealer: this.rowString(row, 'DEALER'),
        client: this.rowString(row, 'CLIENT'),
        versionId: this.rowString(row, 'VERSIONID'),
        scriptLanguage: this.rowString(row, 'SCRIPTLANGUAGE'),
        isCurrentCheckout: this.rowString(row, 'DONE') === '0' || this.rowString(row, 'DONE') === 'false'
      }));
    } catch (error) {
      console.error('Failed to parse history entries:', error);
      return [];
    }
  }

  /** Normalize label rows coming back from GetItemLabels. */
  private parseLabelEntries(data: any): ItemLabelEntry[] {
    try {
      const rows = this.extractRows(data);
      return rows.map((row: any) => ({
        labelTitle: this.rowString(row, 'LABEL_TITLE'),
        labelDesc: this.rowString(row, 'LABEL_DESC'),
        createdBy: this.rowString(row, 'CREATED_BY'),
        createdDate: this.rowString(row, 'CREATED_DT'),
        itemVersionId: this.rowString(row, 'ITEM_VERSIONID')
      }));
    } catch (error) {
      console.error('Failed to parse label entries:', error);
      return [];
    }
  }

  /** Pull a flat row list out of the various response shapes. */
  private extractRows(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.data?.rows)) return data.data.rows;
    if (Array.isArray(data.data?.results)) return data.data.results;
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      return [data.data];
    }
    return [];
  }

  private rowString(row: any, key: string): string {
    if (!row || row[key] === undefined || row[key] === null) return '';
    return String(row[key]);
  }

  /**
   * Get server sessions (internal use for bridge)
   */
  async getServerSessions(): Promise<{ aspnetSessionId: string; starlimsSessionId: string; langid: string } | null> {
    try {
      const data = await this.apiRequest<any>('GetSessions', {
        method: 'GET'
      });

      if (data?.success === true) {
        return data.data;
      }
      return null;
    } catch (error) {
      console.error('Failed to get server sessions:', getErrorMessage(error));
      return null;
    }
  }

  /**
   * Check if item is checked out
   */
  async isCheckedOut(uri: string): Promise<boolean> {
    return this.checkedOutDocuments.has(uri);
  }

  /**
   * Get all checked out items
   * @param allUsers - if true, get all users' checkouts; if false, only current user's
   */
  async getCheckedOutItems(allUsers = false): Promise<EnterpriseItem[]> {
    try {
      const endpoint = allUsers ? 'GetCheckedOutItems?allUsers=true' : 'GetCheckedOutItems';
      const data = await this.apiRequest<any>(endpoint);

      console.log('GetCheckedOutItems response:', JSON.stringify(data).substring(0, 500));

      // Check if data is XML (GetCheckedOutItems returns XML)
      if (data?.data && typeof data.data === 'string' && data.data.includes('<DataSet>')) {
        return this.parseCheckedOutItemsXml(data.data);
      }

      if (data && Array.isArray(data.data)) {
        return this.parseEnterpriseItems(data.data);
      }
      return [];
    } catch (error) {
      console.error('Failed to get checked out items:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Get all pending checkins (items that have been checked in)
   * Uses GetPendingCheckins API with filters
   */
  async getPendingCheckins(filter?: {
    user?: string;
    dateFrom?: string;
    dateTo?: string;
    itemTypes?: string[];
  }): Promise<EnterpriseItem[]> {
    try {
      // Build query string with filters
      let endpoint = 'GetPendingCheckins';
      const queryParams: string[] = [];

      if (filter?.user) {
        queryParams.push(`user=${encodeURIComponent(filter.user)}`);
      }
      if (filter?.dateFrom) {
        queryParams.push(`dateFrom=${encodeURIComponent(filter.dateFrom)}`);
      }
      if (filter?.dateTo) {
        queryParams.push(`dateTo=${encodeURIComponent(filter.dateTo)}`);
      }

      if (queryParams.length > 0) {
        endpoint += '?' + queryParams.join('&');
      }

      const data = await this.apiRequest<any>(endpoint);

      // Parse XML response
      if (data?.data && typeof data.data === 'string') {
        return this.parsePendingCheckinsXml(data.data);
      }

      // Handle JSON response format
      if (data?.data && typeof data.data === 'object') {
        return this.parsePendingCheckinsJson(data.data);
      }

      return [];
    } catch (error) {
      console.error('Failed to get pending checkins:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Get all checked in items (items that have been completed and are ready to export)
   * Uses GetCheckedInItems API with filters
   */
  async getCheckedInItems(filter?: {
    user?: string;
    dateFrom?: string;
    dateTo?: string;
    itemTypes?: string[];
  }): Promise<EnterpriseItem[]> {
    try {
      let endpoint = 'GetCheckedInItems';
      const queryParams: string[] = [];

      if (filter?.user) {
        queryParams.push(`user=${encodeURIComponent(filter.user)}`);
      }
      if (filter?.dateFrom) {
        queryParams.push(`dateFrom=${encodeURIComponent(filter.dateFrom)}`);
      }
      if (filter?.dateTo) {
        queryParams.push(`dateTo=${encodeURIComponent(filter.dateTo)}`);
      }

      if (queryParams.length > 0) {
        endpoint += '?' + queryParams.join('&');
      }

      const data = await this.apiRequest<any>(endpoint);

      // Parse XML response
      if (data?.data && typeof data.data === 'string') {
        return this.parsePendingCheckinsXml(data.data);
      }

      // Handle JSON response format
      if (data?.data && typeof data.data === 'object') {
        return this.parsePendingCheckinsJson(data.data);
      }

      return [];
    } catch (error) {
      console.error('Failed to get checked in items:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Parse pending checkins from XML response (GetCheckedOutItems format)
   */
  private parsePendingCheckinsXml(xmlString: string): EnterpriseItem[] {
    try {
      console.log('Parsing pending checkins XML, length:', xmlString.length);
      const items: EnterpriseItem[] = [];

      // Look for PendingCheckins elements
      const rowMatches = xmlString.match(/<PendingCheckins>[\s\S]*?<\/PendingCheckins>/g);
      if (rowMatches) {
        console.log('Found pending checkins:', rowMatches.length);
        for (const row of rowMatches) {
          const childIdMatch = row.match(/<CHILDID>([^<]*)<\/CHILDID>/);
          const childNameMatch = row.match(/<CHILDNAME>([^<]*)<\/CHILDNAME>/);
          const userMatch = row.match(/<CHECKEDOUTBY>([^<]*)<\/CHECKEDOUTBY>/);
          const typeMatch = row.match(/<CHILDTYPE>([^<]*)<\/CHILDTYPE>/);
          const parentNameMatch = row.match(/<ParentName>([^<]*)<\/ParentName>/);
          const dateMatch = row.match(/<CHECKEDOUTDATE>([^<]*)<\/CHECKEDOUTDATE>/);

          if (childNameMatch) {
            items.push({
              id: childIdMatch?.[1] || childNameMatch[1],
              name: childNameMatch[1],
              type: typeMatch?.[1] || 'UNKNOWN',
              uri: childIdMatch?.[1] || '',
              hasChildren: false,
              isCheckedOut: true,
              checkedOutBy: userMatch?.[1] || 'Unknown',
              checkedOutDate: dateMatch?.[1] || ''
            });
          }
        }
      } else {
        console.log('No PendingCheckins found in XML');
      }

      console.log('Parsed pending checkins:', items.length);
      return items;
    } catch (error) {
      console.error('Failed to parse pending checkins XML:', error);
      return [];
    }
  }

  /**
   * Parse pending checkins from JSON response
   */
  private parsePendingCheckinsJson(data: any): EnterpriseItem[] {
    try {
      // Handle different JSON structures
      if (Array.isArray(data)) {
        return data.map((item: any) => ({
          id: item.id || item.CHILDID || item.ITEMID || '',
          name: item.name || item.CHILDNAME || item.ITEMNAME || 'Unknown',
          type: item.type || item.CHILDTYPE || 'UNKNOWN',
          uri: item.id || item.CHILDID || item.ITEMID || '',
          hasChildren: false,
          isCheckedOut: true,
          checkedOutBy: item.user || item.CHECKEDOUTBY || 'Unknown',
          checkedOutDate: item.date || item.CHECKEDOUTDATE || ''
        }));
      }

      if (data.items) {
        return this.parsePendingCheckinsJson(data.items);
      }

      return [];
    } catch (error) {
      console.error('Failed to parse pending checkins JSON:', error);
      return [];
    }
  }

  /**
   * Get item by GUID - returns full URI for an item
   */
  async getItemByGuid(guid: string, itemType: string): Promise<EnterpriseItem | null> {
    try {
      const data = await this.apiRequest<any>(`GetItemByGUID?guid=${encodeURIComponent(guid)}&itemType=${encodeURIComponent(itemType)}`, {
        method: 'GET'
      });

      if (data?.success && data.data?.items?.[0]) {
        const item = data.data.items[0];
        return {
          id: item.uri || guid,
          name: item.name || '',
          type: item.type || itemType,
          uri: item.uri || '',
          hasChildren: false,
          isCheckedOut: item.checkedOutBy ? true : false,
          checkedOutBy: item.checkedOutBy,
          version: item.version
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get item by GUID:', getErrorMessage(error));
      return null;
    }
  }

  /**
   * Get item GUID by URI
   */
  async getGUID(uri: string): Promise<string | null> {
    try {
      const data = await this.apiRequest<any>(`GetGUID?URI=${encodeURIComponent(uri)}`, {
        method: 'GET'
      });

      if (data?.success && data.data?.guid) {
        return data.data.guid;
      }
      return null;
    } catch (error) {
      console.error('Failed to get GUID:', getErrorMessage(error));
      return null;
    }
  }

  /**
   * Run a script
   */
  async runScript(uri: string, parameters: unknown[] = []): Promise<ScriptResult> {
    const startTime = Date.now();

    try {
      const data = await this.apiRequest<any>('RunScript', {
        method: 'POST',
        body: JSON.stringify({ URI: uri, Parameters: parameters })
      });

      return {
        success: data?.success === true,
        output: data?.data || '',
        error: data?.error,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Run a data source
   */
  async runDataSource(uri: string): Promise<DataSourceResult> {
    const result = await this.runScript(uri);
    const table = normalizeDataSourceOutput(result.output);
    return {
      ...result,
      columns: table.columns,
      rows: table.rows,
      rowCount: table.rowCount
    };
  }

  /**
   * Execute SQL query and return structured results
   */
  async executeQuery(sql: string): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const data = await this.apiRequest<any>('ExecuteQuery', {
        method: 'POST',
        body: JSON.stringify({ sql })
      });

      // Parse the response - STARLIMS may return data in different formats
      if (data?.success === false) {
        return {
          success: false,
          columns: [],
          rows: [],
          rowCount: 0,
          error: data?.error || 'Query execution failed',
          executionTime: Date.now() - startTime
        };
      }

      // Handle different response formats
      let columns: string[] = [];
      let rows: Record<string, string | number | null>[] = [];

      if (data?.data?.columns && Array.isArray(data.data.columns)) {
        columns = data.data.columns;
        rows = data.data.rows || [];
      } else if (data?.data?.results && Array.isArray(data.data.results)) {
        // Alternative format: results array with first row as headers
        if (data.data.results.length > 0) {
          columns = Object.keys(data.data.results[0]);
          rows = data.data.results;
        }
      } else if (Array.isArray(data?.data)) {
        // Simple array format
        if (data.data.length > 0) {
          columns = Object.keys(data.data[0]);
          rows = data.data;
        }
      }

      return {
        success: true,
        columns,
        rows,
        rowCount: rows.length,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        columns: [],
        rows: [],
        rowCount: 0,
        error: getErrorMessage(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * Run XFD Form
   */
  async runXFDForm(uri: string): Promise<boolean> {
    if (!this.sessionInfo || !this.config) return false;

    // Check if bridge is running
    const bridgeIsRunning = await isBridgeRunning();
    if (!bridgeIsRunning) {
      console.error('STARLIMS Bridge is not running');
      return false;
    }

    // Parse URI to get app and form name
    const parts = uri.split('/');
    const appName = parts[0] || 'APP';
    const formName = parts[parts.length - 1]?.replace('.xfd', '') || 'FORM';

    return launchXFDForm(this.config.url, appName, formName, this.sessionInfo);
  }

  /**
   * Open HTML Form
   */
  async openHTMLForm(uri: string): Promise<boolean> {
    if (!this.sessionInfo || !this.config) return false;

    const bridgeIsRunning = await isBridgeRunning();
    if (!bridgeIsRunning) {
      console.error('STARLIMS Bridge is not running');
      return false;
    }

    const formId = uri.replace('.xml', '').replace('HTMLForms/', '');
    return launchHTMLForm(this.config.url, formId, this.sessionInfo, 'open');
  }

  /**
   * Debug HTML Form
   * Opens the form in the system browser with Debug=true parameter
   * @param uri - The form URI
   * @param guid - Optional form GUID (if not provided, will try to get from server)
   */
  async debugHTMLFormInWindow(uri: string, guid?: string): Promise<{ success: boolean; message?: string }> {
    if (!this.sessionInfo || !this.config) {
      return { success: false, message: 'Not connected to STARLIMS' };
    }

    try {
      // Extract form ID from URI
      // URI format could be: /Applications/AppName/HTMLForms/Language/formName.xml
      // or: HTMLForms/formName.xml
      const formId = uri.replace('.xml', '').replace('HTMLForms/', '').replace(/\/$/, '');

      // Use provided GUID or try to get from server
      let formGuid: string | null | undefined = guid;
      if (!formGuid) {
        console.log('GUID not provided, trying to get from server...');
        formGuid = await this.getGUID(uri);
      }
      if (!formGuid) {
        return { success: false, message: 'Could not get form GUID' };
      }

      const langid = this.sessionInfo.langid || 'ENG';
      const serverUrl = cleanUrl(this.config.url);

      // Build the debug URL
      // Format: https://server/starthtml.lims?FormId=GUID&LangId=ENG&Debug=true
      const debugUrl = `${serverUrl}/starthtml.lims?FormId=${formGuid}&LangId=${langid}&Debug=true`;

      console.log('Opening debug window with URL:', debugUrl);
      console.log('activeFile guid:', guid);
      console.log('activeFile uri:', uri);
      console.log('window.electronAPI exists:', !!window.electronAPI);
      if (window.electronAPI) {
        console.log('window.electronAPI keys:', Object.keys(window.electronAPI));
      }

      // Open in system browser - STARLIMS forms require full browser environment
      if (window.electronAPI && window.electronAPI.openSystemBrowser) {
        console.log('Using openSystemBrowser to open system browser');
        const result = await window.electronAPI.openSystemBrowser(debugUrl);
        if (result.success) {
          return { success: true, message: `Opened debug window for: ${formId}` };
        }
        console.error('openSystemBrowser failed:', result.error);
      } else {
        console.log('openSystemBrowser not available or not found');
      }

      // Fallback for web version
      console.log('Using window.open as fallback');
      window.open(debugUrl, '_blank');
      return { success: true, message: `Opened debug window for: ${formId}` };
    } catch (error) {
      console.error('Debug HTML Form failed:', error);
      return { success: false, message: getErrorMessage(error) };
    }
  }

  /**
   * Design HTML Form
   * Opens the FormDesigner with the target form loaded
   * @param uri - The form URI
   * @param guid - Optional form GUID (if not provided, will try to get from server)
   */
  async designHTMLFormInWindow(uri: string, guid?: string): Promise<{ success: boolean; message?: string }> {
    if (!this.sessionInfo || !this.config) {
      return { success: false, message: 'Not connected to STARLIMS' };
    }

    try {
      // Use provided GUID or try to get from server
      let formGuid: string | null | undefined = guid;
      if (!formGuid) {
        console.log('GUID not provided, trying to get from server...');
        formGuid = await this.getGUID(uri);
      }
      if (!formGuid) {
        return { success: false, message: 'Could not get form GUID' };
      }

      const serverUrl = cleanUrl(this.config.url);

      // Build the FormDesigner URL
      // FormDesigner GUID: 1D09BB79-2D28-4594-8B03-26306F5C8AEC
      // Use ENG as the language like VS Code plugin
      const designUrl = `${serverUrl}/starthtml.lims?FormId=1D09BB79-2D28-4594-8B03-26306F5C8AEC&LangId=ENG&Debug=true&FormArgs=%22${formGuid}%22`;

      console.log('Opening FormDesigner with URL:', designUrl);

      // Open in system browser
      if (window.electronAPI && window.electronAPI.openSystemBrowser) {
        console.log('Using openSystemBrowser to open FormDesigner');
        const result = await window.electronAPI.openSystemBrowser(designUrl);
        if (result.success) {
          return { success: true, message: `Opened FormDesigner for: ${uri}` };
        }
        console.error('openSystemBrowser failed:', result.error);
      } else {
        console.log('openSystemBrowser not available, using window.open');
      }

      window.open(designUrl, '_blank');
      return { success: true, message: `Opened FormDesigner for: ${uri}` };
    } catch (error) {
      console.error('Design HTML Form failed:', error);
      return { success: false, message: getErrorMessage(error) };
    }
  }

  /**
   * Debug HTML Form (using Bridge)
   */
  async debugHTMLForm(uri: string): Promise<boolean> {
    if (!this.sessionInfo || !this.config) return false;

    const bridgeIsRunning = await isBridgeRunning();
    if (!bridgeIsRunning) {
      console.error('STARLIMS Bridge is not running');
      return false;
    }

    const formId = uri.replace('.xml', '').replace('HTMLForms/', '');
    return launchHTMLForm(this.config.url, formId, this.sessionInfo, 'debug');
  }

  /**
   * Design HTML Form
   */
  async designHTMLForm(uri: string): Promise<boolean> {
    if (!this.sessionInfo || !this.config) return false;

    const bridgeIsRunning = await isBridgeRunning();
    if (!bridgeIsRunning) {
      console.error('STARLIMS Bridge is not running');
      return false;
    }

    const formId = uri.replace('.xml', '').replace('HTMLForms/', '');
    return launchHTMLForm(this.config.url, formId, this.sessionInfo, 'design');
  }

  /**
   * Add new item
   */
  async addItem(parentUri: string, itemName: string, itemType: string): Promise<boolean> {
    try {
      const data = await this.apiRequest<any>('Add', {
        method: 'POST',
        body: JSON.stringify({
          lid: parentUri,
          name: itemName,
          itemType
        })
      });

      return data?.success === true;
    } catch (error) {
      console.error('Failed to add item:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Delete item
   */
  async deleteItem(uri: string): Promise<boolean> {
    try {
      const data = await this.apiRequest<any>('Delete', {
        method: 'GET',
        body: JSON.stringify({ lid: uri })
      });

      return data?.success === true;
    } catch (error) {
      console.error('Failed to delete item:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Rename item
   */
  async renameItem(uri: string, newName: string): Promise<boolean> {
    try {
      const data = await this.apiRequest<any>('Rename', {
        method: 'POST',
        body: JSON.stringify({ lid: uri, newName })
      });

      return data?.success === true;
    } catch (error) {
      console.error('Failed to rename item:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Move item
   */
  async moveItem(uri: string, destinationUri: string): Promise<boolean> {
    try {
      const data = await this.apiRequest<any>('Move', {
        method: 'POST',
        body: JSON.stringify({ lid: uri, destination: destinationUri })
      });

      return data?.success === true;
    } catch (error) {
      console.error('Failed to move item:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Search for items
   */
  async search(itemName: string, itemType?: string, exactMatch?: boolean): Promise<SearchResult> {
    try {
      // Build URL with query parameters matching VS Code plugin
      let url = `Search?itemName=${encodeURIComponent(itemName)}&exactMatch=${exactMatch || false}`;
      if (itemType) {
        const normalizedType = this.normalizeSearchItemType(itemType);
        url += `&itemType=${encodeURIComponent(normalizedType)}`;
      }

      console.log('Search request URL:', url);
      const data = await this.apiRequest<any>(url, {
        method: 'GET'
      });

      console.log('Search response:', JSON.stringify(data)?.substring(0, 500));

      // Search API returns { success, data: { items: [...] } }
      let items: any[] = [];
      if (data?.data?.items) {
        items = this.parseEnterpriseItems(data.data.items);
        console.log('Found items from data.data.items:', items.length);
      } else if (Array.isArray(data?.data)) {
        items = this.parseEnterpriseItems(data.data);
        console.log('Found items from data.data array:', items.length);
      } else if (data?.items) {
        items = this.parseEnterpriseItems(data.items);
        console.log('Found items from data.items:', items.length);
      } else {
        console.log('No items found in response');
      }
      return {
        items,
        totalCount: items.length
      };
    } catch (error) {
      console.error('Failed to search:', getErrorMessage(error));
      return { items: [], totalCount: 0 };
    }
  }

  /**
   * Global search in code
   */
  async globalSearch(searchString: string, itemTypes?: string[]): Promise<SearchResult> {
    try {
      const types = itemTypes?.length ? itemTypes.join(',') : 'ALL';
      const data = await this.apiRequest<any>(
        `GlobalSearch?searchString=${encodeURIComponent(searchString)}&itemTypes=${encodeURIComponent(types)}`,
        { method: 'GET' }
      );

      const rawItems = Array.isArray(data?.data?.items)
        ? data.data.items
        : Array.isArray(data?.data)
          ? data.data
          : [];
      const items = this.parseEnterpriseItems(rawItems);
      return {
        items,
        totalCount: data?.data?.totalCount || data?.totalCount || items.length
      };
    } catch (error) {
      console.error('Failed to global search:', getErrorMessage(error));
      return { items: [], totalCount: 0 };
    }
  }

  private normalizeSearchItemType(itemType: string): string {
    switch (itemType.trim().toUpperCase()) {
      case 'HTMLFORMXML':
      case 'XFDFORMXML':
      case 'PHONEFORMXML':
      case 'TABLETFORMXML':
        return 'FORMXML';
      case 'HTMLFORMCODE':
      case 'XFDFORMCODE':
      case 'PHONEFORMCODE':
      case 'TABLETFORMCODE':
        return 'FORMCODEBEHIND';
      case 'APPSS':
        return 'SS';
      case 'APPCS':
        return 'CS';
      case 'APPDS':
        return 'DS';
      default:
        return itemType;
    }
  }

  /**
   * Get table definition
   */
  async getTableDefinition(uri: string): Promise<any> {
    try {
      const data = await this.apiRequest<any>('TableDefinition', {
        method: 'GET',
        body: JSON.stringify({ lid: uri })
      });

      return data?.data || data;
    } catch (error) {
      console.error('Failed to get table definition:', getErrorMessage(error));
      return null;
    }
  }

  /**
   * Generate SELECT statement
   */
  async generateTableSelect(uri: string): Promise<string> {
    try {
      const data = await this.apiRequest<any>('TableCommand', {
        method: 'GET',
        body: JSON.stringify({ lid: uri, command: 'SELECT' })
      });

      return data?.data || '';
    } catch (error) {
      console.error('Failed to generate SELECT:', getErrorMessage(error));
      return '';
    }
  }

  /**
   * Generate INSERT statement
   */
  async generateTableInsert(uri: string): Promise<string> {
    try {
      const data = await this.apiRequest<any>('TableCommand', {
        method: 'GET',
        body: JSON.stringify({ lid: uri, command: 'INSERT' })
      });

      return data?.data || '';
    } catch (error) {
      console.error('Failed to generate INSERT:', getErrorMessage(error));
      return '';
    }
  }

  /**
   * Generate UPDATE statement
   */
  async generateTableUpdate(uri: string): Promise<string> {
    try {
      const data = await this.apiRequest<any>('TableCommand', {
        method: 'GET',
        body: JSON.stringify({ lid: uri, command: 'UPDATE' })
      });

      return data?.data || '';
    } catch (error) {
      console.error('Failed to generate UPDATE:', getErrorMessage(error));
      return '';
    }
  }

  /**
   * Generate DELETE statement
   */
  async generateTableDelete(uri: string): Promise<string> {
    try {
      const data = await this.apiRequest<any>('TableCommand', {
        method: 'GET',
        body: JSON.stringify({ lid: uri, command: 'DELETE' })
      });

      return data?.data || '';
    } catch (error) {
      console.error('Failed to generate DELETE:', getErrorMessage(error));
      return '';
    }
  }

  /**
   * Get available languages
   */
  async getLanguages(): Promise<string[]> {
    const options = await this.getLanguageOptions();
    return options.map(option => option.id);
  }

  /** Get language ids and display names for form export. */
  async getLanguageOptions(): Promise<LanguageOption[]> {
    try {
      const data = await this.apiRequest<any>('GetLanguages');

      if (data?.data && Array.isArray(data.data)) {
        return data.data.map((lang: any) => {
          if (Array.isArray(lang)) return { id: String(lang[0] || ''), name: String(lang[1] || lang[0] || '') };
          const id = String(lang.LANGID || lang.langid || lang.id || '');
          return { id, name: String(lang.LANGUAGE || lang.language || lang.name || id) };
        }).filter((lang: LanguageOption) => Boolean(lang.id));
      }
      return [{ id: 'ENG', name: 'English' }];
    } catch (error) {
      console.error('Failed to get languages:', getErrorMessage(error));
      return [{ id: 'ENG', name: 'English' }];
    }
  }

  /**
   * Clear server log
   */
  async clearLog(): Promise<boolean> {
    try {
      const data = await this.apiRequest<any>('ClearLog', {
        method: 'GET'
      });

      return data?.success === true;
    } catch (error) {
      console.error('Failed to clear log:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Get server log for current user
   */
  async getServerLog(user?: string): Promise<string> {
    const logUser = (user || this.config?.user || '').trim();
    if (!logUser) {
      return '';
    }
    if (/[\\/\0]/.test(logUser)) {
      throw new Error('Invalid STARLIMS log user.');
    }
    try {
      const logUri = `/ServerLogs/${logUser}.log`;
      // Use apiRequest directly since log is plain text, not JSON
      const data = await this.apiRequest<any>(`GetCode?URI=${encodeURIComponent(logUri)}&UserLang=${this.sessionInfo?.langid || 'ENG'}`, {
        method: 'GET'
      });
      // Log file returns plain text, not structured JSON
      if (typeof data === 'string') {
        return data;
      }
      return data?.data?.code || '';
    } catch (error) {
      console.error('Failed to get server log:', error);
      return '';
    }
  }
}

// Singleton instance
let enterpriseServiceInstance: EnterpriseService | null = null;

export function getEnterpriseService(): EnterpriseService {
  if (!enterpriseServiceInstance) {
    enterpriseServiceInstance = new EnterpriseService();
  }
  return enterpriseServiceInstance;
}

export default EnterpriseService;
