/**
 * Miscellaneous utility functions for STARLIMS DevTools
 */

/**
 * Clean URL by removing trailing slash
 */
export function cleanUrl(url: string): string {
  if (!url) return '';
  return url.replace(/\/+$/, '');
}

/**
 * Check if a string is valid JSON
 */
export function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format date to ISO string without milliseconds
 */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 19);
}

/**
 * Get file extension from URI
 */
export function getFileExtension(uri: string): string {
  const match = uri.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Get item type from file extension
 */
export function getItemTypeFromExtension(ext: string): string {
  const typeMap: Record<string, string> = {
    'ssl': 'SS',
    'srvscr': 'SS',
    'clientscript': 'CS',
    'slsql': 'DS',
    'ds': 'DS',
    'xml': 'HTMLFORMXML',
    'xfd': 'XFDFORMXML',
    'html': 'HTMLFORMCODE',
    'res': 'RESOURCE'
  };
  return typeMap[ext.toLowerCase()] || 'UNKNOWN';
}

/**
 * Get language ID from item type
 */
export function getLanguageFromItemType(itemType: string): string {
  const langMap: Record<string, string> = {
    'SS': 'ssl',
    'CS': 'ssl',
    'DS': 'slsql',
    'HTMLFORMXML': 'xml',
    'HTMLFORMCODE': 'html',
    'XFDFORMXML': 'xml',
    'XFDFORMCODE': 'html'
  };
  return langMap[itemType] || 'plaintext';
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse version string
 */
export function parseVersion(versionStr: string): { major: number; minor: number; patch: number } {
  const parts = versionStr.split('.');
  return {
    major: parseInt(parts[0] || '0', 10),
    minor: parseInt(parts[1] || '0', 10),
    patch: parseInt(parts[2] || '0', 10)
  };
}

/**
 * Compare versions
 */
export function compareVersions(a: string, b: string): number {
  const verA = parseVersion(a);
  const verB = parseVersion(b);

  if (verA.major !== verB.major) return verA.major - verB.major;
  if (verA.minor !== verB.minor) return verA.minor - verB.minor;
  return verA.patch - verB.patch;
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * Get current timestamp
 */
export function getTimestamp(): string {
  return formatDate(new Date());
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if running in Electron
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/**
 * Get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error occurred';
}
