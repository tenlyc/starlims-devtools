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
  displayPath?: string;
  language?: string;
  scriptLanguage?: string;
  rawType?: string;
}

export interface CheckOutResult {
  success: boolean;
  alreadyCheckedOut?: boolean;
  checkoutLanguage?: string;
  localPath?: string;
  message?: string;
}

export interface CheckInResult {
  success: boolean;
  checkedIn?: boolean;
  verified?: boolean;
  verification?: 'checkout_released';
  targetUri?: string;
  guid?: string;
  message?: string;
}

export interface ExecutionOptions {
  entryPoint?: string;
  outputType?: 'ARRAY' | 'JSON' | 'XML';
  maxRows?: number;
}

export interface ScriptResult {
  success: boolean;
  output?: unknown;
  totalRows?: number;
  rowsTruncated?: boolean;
  error?: string;
  executionTime?: number;
}

export interface DataSourceResult {
  totalRows?: number;
  rowsTruncated?: boolean;
  success: boolean;
  output?: unknown;
  error?: string;
  executionTime?: number;
  columns: string[];
  rows: Record<string, string | number | null>[];
  rowCount: number;
}

export interface LanguageOption {
  id: string;
  name: string;
}

export interface QueryResult {
  success: boolean;
  columns: string[];
  rows: Record<string, string | number | null>[];
  rowCount: number;
  error?: string;
  executionTime?: number;
}

export interface TableMutationResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface SearchResult {
  items: EnterpriseItem[];
  totalCount: number;
}

/** One row of the LIMSSOURCECONTROL history for an item (mirrors the official
 *  Source Control Manager dsGetHistory data source). */
export interface ItemHistoryEntry {
  itemType: string;
  itemId: string;
  status: string;
  done: boolean | string;
  checkedOutBy: string;
  checkedOutDate: string;
  checkedInBy: string;
  checkedInDate: string;
  reasonForCheckout: string;
  lsCorigRec: string;
  factory: string;
  dealer: string;
  client: string;
  versionId: string;
  scriptLanguage: string;
  /** true when the row still carries the checked-out code (DONE = 0) */
  isCurrentCheckout?: boolean;
}

/** One row of VERSIONSLABELS / VERSIONSLABELS_ITEMS for an item. */
export interface ItemLabelEntry {
  labelTitle: string;
  labelDesc: string;
  createdBy: string;
  createdDate: string;
  itemVersionId: string;
}

/** The code documents attached to a specific version in LIMSSOURCECONTROL. */
export interface ItemVersionCode {
  code: string;
  xfdDocument: string;
  resourceDocument: string;
  versionId: string;
}

/** One Source Control item row returned by GetSCMItems. */
export interface SCMItem {
  itemType: string;
  catName: string;
  appName: string;
  itemName: string;
  itemId: string;
  uri: string;
  state?: string;
  isCheckedOut: boolean;
  checkedOutBy?: string;
  checkedOutDate?: string;
  checkedInBy?: string;
  checkedInDate?: string;
  factoryVersion?: string;
  dealerVersion?: string;
  clientVersion?: string;
  reason?: string;
  versionId?: string;
}

export interface CheckInHistoryFilter {
  user: string;
  dateFrom: string;
  dateTo: string;
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
  getPreviewCredentials(): { user: string; password: string } | null;

  // Enterprise items
  getEnterpriseItems(uri?: string): Promise<EnterpriseItem[]>;
  getItemCode(uri: string, language?: string): Promise<string>;
  saveItemCode(uri: string, code: string, language?: string): Promise<boolean>;

  // Check out/in
  checkOut(uri: string, language?: string): Promise<CheckOutResult>;
  checkIn(uri: string, reason?: string, language?: string): Promise<CheckInResult>;
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
  runScript(uri: string, parameters?: unknown[], options?: ExecutionOptions): Promise<ScriptResult>;
  runDataSource(uri: string, parameters?: unknown[], options?: ExecutionOptions): Promise<DataSourceResult>;

  // SQL Query execution
  executeQuery(sql: string): Promise<QueryResult>;

  // Form operations
  runXFDForm(uri: string): Promise<boolean>;
  openHTMLForm(uri: string): Promise<boolean>;
  debugHTMLForm(uri: string): Promise<boolean>;
  designHTMLForm(uri: string): Promise<boolean>;

  // CRUD operations
  addItem(parentUri: string, itemName: string, itemType: string, language?: string): Promise<boolean>;
  deleteItem(uri: string): Promise<boolean>;
  renameItem(uri: string, newName: string): Promise<boolean>;
  moveItem(uri: string, destinationUri: string): Promise<boolean>;

  // Search
  search(itemName: string, itemType?: string, exactMatch?: boolean): Promise<SearchResult>;
  globalSearch(searchString: string, itemTypes?: string[]): Promise<SearchResult>;

  // Table operations
  getTableDefinition(uri: string): Promise<any>;
  getTableDefinitionXml(uri: string): Promise<string>;
  createTable(tableName: string, dsn: string): Promise<TableMutationResult>;
  saveTableDefinition(uri: string, tableXml: string): Promise<TableMutationResult>;
  generateTableSelect(uri: string): Promise<string>;
  generateTableInsert(uri: string): Promise<string>;
  generateTableUpdate(uri: string): Promise<string>;
  generateTableDelete(uri: string): Promise<string>;

  // Languages
  getLanguages(): Promise<string[]>;
  getLanguageOptions(): Promise<LanguageOption[]>;

  // Log
  clearLog(): Promise<boolean>;
  getServerLog(user?: string): Promise<string>;

  // Package operations (Source Control Manager)
  /** Export checked out items as an SDP package. Pass item GUIDs to export only
   *  those items (requires the ExportPackage `items` parameter from the patch),
   *  or omit to export all pending check-ins. */
  exportPackage(items?: string[], history?: boolean, languages?: string[]): Promise<{ success: boolean; fileName?: string; blob?: Blob; error?: string }>;
  /** Users that have completed Source Control check-ins. */
  getSCMUsers(): Promise<string[]>;
  /** Items checked in by one user during an inclusive date range. */
  getCheckInHistory(filter: CheckInHistoryFilter): Promise<SCMItem[]>;
  importPackage(file: File): Promise<{ success: boolean; log?: string; error?: string }>;
  /** Load the whole enterprise tree at once (all items with uri/type/guid). */
  getAllItems(): Promise<EnterpriseItem[]>;
  /** Load every Source Control item with its checkout state (mirrors the
   *  official SCM dsGetItemsFromSearch). Requires the GetSCMItems endpoint. */
  getSCMItems(filter?: {
    itemName?: string; types?: string[]; checkedOutOnly?: boolean;
    checkOutBy?: string; checkInBy?: string;
    checkOutDateFrom?: string; checkOutDateTo?: string;
    checkInDateFrom?: string; checkInDateTo?: string;
    factoryMajor?: string; factoryMinor?: string; factoryBuild?: string;
    dealerMajor?: string; dealerMinor?: string; dealerBuild?: string;
    clientMajor?: string; clientMinor?: string; clientBuild?: string;
    textType?: string; textValue?: string;
  }): Promise<SCMItem[]>;
  /** Export selected enterprise items (their live/checked-in state) as an SDP
   *  package for deployment to another environment. Mirrors the official SCM
   *  "Send to Package Manager" flow. Requires the ExportItems endpoint. */
  exportItems(uris: string[]): Promise<{ success: boolean; fileName?: string; blob?: Blob; error?: string }>;

  // Version history / labels (Source Control Manager deep features)
  getItemHistory(uri: string): Promise<ItemHistoryEntry[]>;
  getItemLabels(uri: string): Promise<ItemLabelEntry[]>;
  getItemVersionCode(versionId: string): Promise<ItemVersionCode | null>;
  /** Recover an old version into the current version (write operation).
   *  Requires the SCM_API RecoverVersion endpoint (shipped in scm_api patch). */
  recoverVersion(uri: string, versionId: string, reason?: string): Promise<{ success: boolean; message?: string; error?: string }>;
  /** Create a version label and attach it to an item/version (write operation).
   *  Requires the SCM_API CreateLabel endpoint (shipped in scm_api patch). */
  createLabel(uri: string, labelTitle: string, labelDesc?: string): Promise<{ success: boolean; message?: string; error?: string }>;
}

export default IEnterpriseService;
