/**
 * STARLIMS Enterprise Service Implementation
 * Handles all communication with STARLIMS REST API
 */

// Using native browser fetch
import { IEnterpriseService, ServerConfig, SessionInfo, EnterpriseItem, CheckOutResult, CheckInResult, ScriptResult, SearchResult, QueryResult } from './iEnterpriseService';
import { cleanUrl, isJson, getErrorMessage } from './miscUtils';
import { isBridgeRunning, launchXFDForm, launchHTMLForm } from './bridge';

export class EnterpriseService implements IEnterpriseService {
  private config: ServerConfig | null = null;
  private password: string = '';
  private baseUrl: string = '';
  private urlSuffix: string = 'lims';
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
  }): Promise<{ ok: boolean; status: number; statusText: string; headers: Record<string, string>; data: string }> {
    // In browser context, use IPC to proxy request
    if (typeof window !== 'undefined' && window.electronAPI) {
      return window.electronAPI.httpRequest(options);
    }
    // Fallback to native fetch (shouldn't happen in Electron)
    const response = await fetch(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body
    });
    const data = await response.text();
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
    options: { method?: string; body?: string } = {}
  ): Promise<T | null> {
    if (!this.sessionInfo) {
      console.error('Not connected to STARLIMS');
      return null;
    }

    // endpoint format: GetEnterpriseItems or GetEnterpriseItems?URI=xxx
    const [endpointName, queryString] = endpoint.split('?');
    const baseApiUrl = `${this.baseUrl}/SCM_API.${endpointName}.${this.urlSuffix}`;
    const url = queryString ? `${baseApiUrl}?${queryString}` : baseApiUrl;
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
        return null;
      }

      if (isJson(response.data)) {
        return JSON.parse(response.data);
      }

      return response.data as any;
    } catch (error) {
      console.error(`API request error for ${endpoint}:`, getErrorMessage(error));
      return null;
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
      isCheckedOut: item.checkedOut === 'true' || item.checkedOut === true,
      checkedOutBy: item.checkedOutBy,
      version: item.ver || item.version,
      guid: item.guid || item.GUID || undefined
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
              checkedOutDate: dateMatch?.[1]
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
        return data.data?.code || '';
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
  async checkOut(uri: string): Promise<CheckOutResult> {
    try {
      const lang = this.sessionInfo?.langid || 'ENG';
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
  async checkIn(uri: string, reason?: string): Promise<CheckInResult> {
    try {
      const lang = this.sessionInfo?.langid || 'ENG';
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
   * Export checked out items as a package and return the filename
   */
  async exportPackage(): Promise<{ success: boolean; fileName?: string; error?: string }> {
    try {
      const data = await this.apiRequest<any>('ExportPackage', {
        method: 'GET'
      });

      if (data?.success === true) {
        return { success: true, fileName: data.data };
      }
      return { success: false, error: data?.data || 'Export failed' };
    } catch (error) {
      console.error('Failed to export package:', getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
  }

  /**
   * Import an SDP package file
   */
  async importPackage(file: File): Promise<{ success: boolean; log?: string; error?: string }> {
    if (!this.sessionInfo || !this.config) {
      return { success: false, error: 'Not connected to STARLIMS' };
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const url = `${this.baseUrl}/SCM_API.ImportPackage.${this.urlSuffix}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'STARLIMSUser': this.config.user || '',
          'STARLIMSPass': this.password
        },
        body: formData
      });

      const data = await response.json();
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
   * Download an SDP package file from the server
   */
  async downloadPackage(fileName: string): Promise<{ success: boolean; data?: Blob; error?: string }> {
    if (!this.sessionInfo || !this.config) {
      return { success: false, error: 'Not connected to STARLIMS' };
    }

    try {
      // The SDP file is stored on the server at GlbImpExpPath
      // We need to use a different endpoint to download it
      const url = `${this.baseUrl}/SCM_API.DownloadPackage.${this.urlSuffix}?fileName=${encodeURIComponent(fileName)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/octet-stream',
          'STARLIMSUser': this.config.user || '',
          'STARLIMSPass': this.password
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        return { success: true, data: blob };
      }
      return { success: false, error: `Download failed: ${response.status}` };
    } catch (error) {
      console.error('Failed to download package:', getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
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
  async getCheckedOutItems(allUsers: boolean = false): Promise<EnterpriseItem[]> {
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
  async runScript(uri: string): Promise<ScriptResult> {
    const startTime = Date.now();

    try {
      const data = await this.apiRequest<any>('RunScript', {
        method: 'POST',
        body: JSON.stringify({ URI: uri })
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
  async runDataSource(uri: string): Promise<ScriptResult> {
    return this.runScript(uri); // Same implementation for now
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
        url += `&itemType=${encodeURIComponent(itemType)}`;
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
      const data = await this.apiRequest<any>('GlobalSearch', {
        method: 'POST',
        body: JSON.stringify({
          search: searchString,
          itemTypes: itemTypes?.join(',') || 'SS,CS,DS'
        })
      });

      const items = data?.data ? this.parseEnterpriseItems(data.data) : [];
      return {
        items,
        totalCount: data?.totalCount || items.length
      };
    } catch (error) {
      console.error('Failed to global search:', getErrorMessage(error));
      return { items: [], totalCount: 0 };
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
    try {
      const data = await this.apiRequest<any>('GetLanguages');

      if (data?.data && Array.isArray(data.data)) {
        return data.data.map((lang: any) => lang.id || lang);
      }
      return ['ENG']; // Default
    } catch (error) {
      console.error('Failed to get languages:', getErrorMessage(error));
      return ['ENG'];
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
  async getServerLog(): Promise<string> {
    if (!this.config?.user) {
      return '';
    }
    try {
      const logUri = `/ServerLogs/${this.config.user}.log`;
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
