/**
 * STARLIMS Enterprise Service Interface
 * Defines the contract for STARLIMS API operations
 */

export interface ServerConfig {
  name: string;
  url: string;
  user?: string;
  urlSuffix?: string;
}

export interface SessionInfo {
  aspnetSessionId: string;
  starlimsSessionId: string;
  langid: string;
}

export interface EnterpriseItem {
  id: string;
  name: string;
  type: string;
  uri?: string;
  hasChildren?: boolean;
  children?: EnterpriseItem[];
  parentId?: string;
  version?: string;
  isCheckedOut?: boolean;
  checkedOutBy?: string;
  checkedOutDate?: string;
  guid?: string;
}

export interface CheckOutResult {
  success: boolean;
  localPath?: string;
  message?: string;
}

export interface CheckInResult {
  success: boolean;
  message?: string;
}

export interface ScriptResult {
  success: boolean;
  output?: string;
  error?: string;
  executionTime?: number;
}

export interface QueryResult {
  success: boolean;
  columns: string[];
  rows: Record<string, string | number | null>[];
  rowCount: number;
  error?: string;
  executionTime?: number;
}

export interface SearchResult {
  items: EnterpriseItem[];
  totalCount: number;
}

export interface IEnterpriseService {
  // Connection
  connect(server: ServerConfig, password: string): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
  getCurrentServer(): ServerConfig | null;

  // Session
  refreshSession(): Promise<boolean>;
  getSessionInfo(): SessionInfo | null;

  // Enterprise items
  getEnterpriseItems(uri?: string): Promise<EnterpriseItem[]>;
  getItemCode(uri: string, language?: string): Promise<string>;
  saveItemCode(uri: string, code: string, language?: string): Promise<boolean>;

  // Check out/in
  checkOut(uri: string): Promise<CheckOutResult>;
  checkIn(uri: string, reason?: string): Promise<CheckInResult>;
  undoCheckOut(uri: string): Promise<boolean>;
  isCheckedOut(uri: string): Promise<boolean>;
  getCheckedOutItems(): Promise<EnterpriseItem[]>;
  getPendingCheckins(filter?: {
    user?: string;
    dateFrom?: string;
    dateTo?: string;
    itemTypes?: string[];
  }): Promise<EnterpriseItem[]>;
  getCheckedInItems(filter?: {
    user?: string;
    dateFrom?: string;
    dateTo?: string;
    itemTypes?: string[];
  }): Promise<EnterpriseItem[]>;

  // Script execution
  runScript(uri: string): Promise<ScriptResult>;
  runDataSource(uri: string): Promise<ScriptResult>;

  // SQL Query execution
  executeQuery(sql: string): Promise<QueryResult>;

  // Form operations
  runXFDForm(uri: string): Promise<boolean>;
  openHTMLForm(uri: string): Promise<boolean>;
  debugHTMLForm(uri: string): Promise<boolean>;
  designHTMLForm(uri: string): Promise<boolean>;

  // CRUD operations
  addItem(parentUri: string, itemName: string, itemType: string): Promise<boolean>;
  deleteItem(uri: string): Promise<boolean>;
  renameItem(uri: string, newName: string): Promise<boolean>;
  moveItem(uri: string, destinationUri: string): Promise<boolean>;

  // Search
  search(itemName: string, itemType?: string, exactMatch?: boolean): Promise<SearchResult>;
  globalSearch(searchString: string, itemTypes?: string[]): Promise<SearchResult>;

  // Table operations
  getTableDefinition(uri: string): Promise<any>;
  generateTableSelect(uri: string): Promise<string>;
  generateTableInsert(uri: string): Promise<string>;
  generateTableUpdate(uri: string): Promise<string>;
  generateTableDelete(uri: string): Promise<string>;

  // Languages
  getLanguages(): Promise<string[]>;

  // Log
  clearLog(): Promise<boolean>;
  getServerLog(): Promise<string>;

  // Package operations (Source Control Manager)
  exportPackage(): Promise<{ success: boolean; fileName?: string; error?: string }>;
  importPackage(file: File): Promise<{ success: boolean; log?: string; error?: string }>;
  downloadPackage(fileName: string): Promise<{ success: boolean; data?: Blob; error?: string }>;
}

export default IEnterpriseService;
