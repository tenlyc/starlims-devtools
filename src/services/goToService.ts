/**
 * GoTo Navigation Service for STARLIMS
 * Handles navigation to Server Scripts, Client Scripts, DataSources, Forms
 */

import { getEnterpriseService } from './enterpriseService';
import { editorStore } from '../stores/editorStore';

export interface GoToConfig {
  command: string;
  keywords: string[];
  itemType?: string;
}

// Auto-detect configuration - order matters, more specific patterns first
const autoDetectConfig: GoToConfig[] = [
  {
    command: 'goto-serverscript',
    keywords: ['lims.CallServer', 'ExecFunction', 'CreateUDObject', 'SubmitToBatch', 'DoProc', 'ServerScript'],
    itemType: 'SS'
  },
  {
    command: 'goto-datasource',
    keywords: ['lims.GetData', 'DataSource'],
    itemType: 'DS'
  },
  {
    command: 'goto-form',
    keywords: ['Form'],
    itemType: 'HTMLFORMCODE'
  },
  {
    command: 'goto-clientscript',
    keywords: ['#include'],
    itemType: 'CS'
  }
];

// Patterns for extracting script/data source/form names from code

// Server script patterns - matching calls like lims.CallServer("ScriptName") or ExecFunction("ScriptName")
const serverScriptPatterns = [
  /lims\.CallServer\s*\(\s*['"]([^'"]+)['"]/g,
  /lims\.CallServer\s*\(\s*['"]([^'"]+)\./g,  // For qualified names like "App.ScriptName"
  /ExecFunction\s*\(\s*['"]([^'"]+)['"]/g,
  /CreateUDObject\s*\(\s*['"]([^'"]+)['"]/g,
  /SubmitToBatch\s*\(\s*['"]([^'"]+)['"]/g,
  /DoProc\s*\(\s*['"]([^'"]+)['"]/g,
  /ServerScript\.(\w+(?:\.\w+)*)/g,
  /:INCLUDE\s+["']([^"']+)["']/g
];

// Data source patterns
const dataSourcePatterns = [
  /lims\.GetData\s*\(\s*['"]([^'"]+)['"]/g,
  /DataSource\.(\w+(?:\.\w+)*)/g,
  /GetData\s*\(\s*['"]([^'"]+)['"]/g
];

// Form patterns
const formPatterns = [
  /Form\s*\(\s*['"]([^'"]+)['"]/g,
  /OpenForm\s*\(\s*['"]([^'"]+)['"]/g,
  /LimsForm\s*\(\s*['"]([^'"]+)['"]/g
];

// Client script patterns - #include directives
const clientScriptPatterns = [
  /#include\s+["']([^"']+)["']/g,
  /#include\s+[<"]([^>"]+)[>"]/g
];

/**
 * Extract the word at cursor position
 */
export function extractWordAtCursor(content: string, position: number): string | null {
  // Find word boundaries around cursor
  const before = content.substring(0, position);
  const after = content.substring(position);

  // Match word characters and dots (for qualified names like ServerScript.Apps.Test)
  const wordMatch = before.match(/[\w.]+$/);
  if (wordMatch) {
    // Also check what comes after cursor
    const afterMatch = after.match(/^[\w.]+/);
    if (afterMatch) {
      return wordMatch[0] + afterMatch[0];
    }
    return wordMatch[0];
  }
  return null;
}

/**
 * Detect which GoTo command should be used for current line
 */
export function detectGoToCommand(line: string): GoToConfig | null {
  for (const config of autoDetectConfig) {
    for (const keyword of config.keywords) {
      if (line.includes(keyword)) {
        return config;
      }
    }
  }
  return null;
}

/**
 * Parse script name from line content using patterns
 */
export function parseScriptNameFromLine(line: string, type: 'server' | 'client' | 'datasource' | 'form'): string | null {
  const patterns = type === 'server' ? serverScriptPatterns
    : type === 'client' ? clientScriptPatterns
    : type === 'datasource' ? dataSourcePatterns
    : formPatterns;

  // First try to match patterns
  for (const pattern of patterns) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    const match = pattern.exec(line);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: extract word at cursor for qualified names
  // For "ServerScript.Main.Something", extract the full qualified name
  const qualifiedMatch = line.match(/(\w+(?:\.\w+)+)/);
  if (qualifiedMatch) {
    return qualifiedMatch[1];
  }

  // Last resort: simple word
  const wordMatch = line.match(/(\w+)/);
  if (wordMatch) {
    return wordMatch[1];
  }

  return null;
}

/**
 * Open an item in the editor
 */
async function openItemInEditor(uri: string, name: string, type: string): Promise<boolean> {
  try {
    const enterpriseService = getEnterpriseService();
    const code = await enterpriseService.getItemCode(uri);
    if (code) {
      editorStore.getState().openFile({
        uri,
        name,
        type,
        content: code
      });
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to open item:', err);
    return false;
  }
}

/**
 * Navigate to a server script by exact name or search
 */
export async function goToServerScript(itemName?: string): Promise<{ success: boolean; message?: string }> {
  if (!itemName) {
    return { success: false, message: 'No item name provided' };
  }

  try {
    const enterpriseService = getEnterpriseService();

    // First try exact search
    let result = await enterpriseService.search(itemName, 'SS', true);
    if (result.items.length > 0) {
      const item = result.items[0];
      if (item.uri) {
        const success = await openItemInEditor(item.uri, item.name, item.type || 'SS');
        if (success) {
          return { success: true };
        }
      }
    }

    // Try partial match
    result = await enterpriseService.search(itemName, 'SS', false);
    if (result.items.length > 0) {
      const item = result.items[0];
      if (item.uri) {
        const success = await openItemInEditor(item.uri, item.name, item.type || 'SS');
        if (success) {
          return { success: true };
        }
      }
    }

    return { success: false, message: `Server script "${itemName}" not found` };
  } catch (err) {
    console.error('GoTo ServerScript failed:', err);
    return { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Navigate to a client script
 */
export async function goToClientScript(itemName?: string): Promise<{ success: boolean; message?: string }> {
  if (!itemName) {
    return { success: false, message: 'No item name provided' };
  }

  try {
    const enterpriseService = getEnterpriseService();

    // Try exact search first
    let result = await enterpriseService.search(itemName, 'CS', true);
    if (result.items.length > 0) {
      const item = result.items[0];
      if (item.uri) {
        const success = await openItemInEditor(item.uri, item.name, item.type || 'CS');
        if (success) {
          return { success: true };
        }
      }
    }

    // Try partial match
    result = await enterpriseService.search(itemName, 'CS', false);
    if (result.items.length > 0) {
      const item = result.items[0];
      if (item.uri) {
        const success = await openItemInEditor(item.uri, item.name, item.type || 'CS');
        if (success) {
          return { success: true };
        }
      }
    }

    return { success: false, message: `Client script "${itemName}" not found` };
  } catch (err) {
    console.error('GoTo ClientScript failed:', err);
    return { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Navigate to a data source
 */
export async function goToDataSource(itemName?: string): Promise<{ success: boolean; message?: string }> {
  if (!itemName) {
    return { success: false, message: 'No item name provided' };
  }

  try {
    const enterpriseService = getEnterpriseService();

    // Try exact search first
    let result = await enterpriseService.search(itemName, 'DS', true);
    if (result.items.length > 0) {
      const item = result.items[0];
      if (item.uri) {
        const success = await openItemInEditor(item.uri, item.name, item.type || 'DS');
        if (success) {
          return { success: true };
        }
      }
    }

    // Try partial match
    result = await enterpriseService.search(itemName, 'DS', false);
    if (result.items.length > 0) {
      const item = result.items[0];
      if (item.uri) {
        const success = await openItemInEditor(item.uri, item.name, item.type || 'DS');
        if (success) {
          return { success: true };
        }
      }
    }

    return { success: false, message: `Data source "${itemName}" not found` };
  } catch (err) {
    console.error('GoTo DataSource failed:', err);
    return { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Navigate to a form's code behind
 */
export async function goToForm(itemName?: string): Promise<{ success: boolean; message?: string }> {
  if (!itemName) {
    return { success: false, message: 'No item name provided' };
  }

  try {
    const enterpriseService = getEnterpriseService();

    // Search for HTML Form Code Behind
    let result = await enterpriseService.search(itemName, 'HTMLFORMCODE', true);
    if (result.items.length > 0) {
      const item = result.items[0];
      if (item.uri) {
        const success = await openItemInEditor(item.uri, item.name, 'HTMLFORMCODE');
        if (success) {
          return { success: true };
        }
      }
    }

    // Try partial match
    result = await enterpriseService.search(itemName, 'HTMLFORMCODE', false);
    if (result.items.length > 0) {
      const item = result.items[0];
      if (item.uri) {
        const success = await openItemInEditor(item.uri, item.name, 'HTMLFORMCODE');
        if (success) {
          return { success: true };
        }
      }
    }

    // Try XFD Form
    result = await enterpriseService.search(itemName, 'XFDFORMCODE', true);
    if (result.items.length > 0) {
      const item = result.items[0];
      if (item.uri) {
        const success = await openItemInEditor(item.uri, item.name, 'XFDFORMCODE');
        if (success) {
          return { success: true };
        }
      }
    }

    return { success: false, message: `Form "${itemName}" not found` };
  } catch (err) {
    console.error('GoTo Form failed:', err);
    return { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Auto-detect and navigate to item based on cursor position
 * Returns result with success status and message
 */
export async function goToItem(content: string, line: string, cursorPosition: number): Promise<{ success: boolean; message?: string }> {
  // First try to detect command type from keywords in current line
  const detected = detectGoToCommand(line);

  let itemName: string | null = null;
  let result: { success: boolean; message?: string } = { success: false };

  if (detected) {
    switch (detected.command) {
      case 'goto-serverscript':
        itemName = parseScriptNameFromLine(line, 'server');
        if (itemName) {
          result = await goToServerScript(itemName);
          if (result.success) return result;
        }
        break;
      case 'goto-datasource':
        itemName = parseScriptNameFromLine(line, 'datasource');
        if (itemName) {
          result = await goToDataSource(itemName);
          if (result.success) return result;
        }
        break;
      case 'goto-form':
        itemName = parseScriptNameFromLine(line, 'form');
        if (itemName) {
          result = await goToForm(itemName);
          if (result.success) return result;
        }
        break;
      case 'goto-clientscript':
        itemName = parseScriptNameFromLine(line, 'client');
        if (itemName) {
          result = await goToClientScript(itemName);
          if (result.success) return result;
        }
        break;
    }
  }

  // Fallback: extract word at cursor and try all types
  itemName = extractWordAtCursor(content, cursorPosition);
  if (itemName) {
    // Try each type in order of likelihood
    result = await goToServerScript(itemName);
    if (result.success) return result;

    result = await goToDataSource(itemName);
    if (result.success) return result;

    result = await goToForm(itemName);
    if (result.success) return result;

    result = await goToClientScript(itemName);
    if (result.success) return result;

    return { success: false, message: `Could not find "${itemName}" as any STARLIMS item type` };
  }

  return { success: false, message: 'No item name found at cursor position' };
}

/**
 * Navigate to a procedure within a server script
 */
export async function goToProcedureInScript(scriptUri: string, procedureName: string): Promise<{ success: boolean; lineNumber?: number; message?: string }> {
  try {
    const enterpriseService = getEnterpriseService();
    const code = await enterpriseService.getItemCode(scriptUri);
    if (!code) {
      return { success: false, message: 'Could not load script' };
    }

    // Find the procedure in the code
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Match :PROCEDURE ProcedureName; or :FUNCTION FunctionName;
      if (line.match(new RegExp(`^:(?:PROCEDURE|FUNCTION)\\s+${procedureName}\\s*;`, 'i'))) {
        return { success: true, lineNumber: i + 1 };
      }
    }

    return { success: false, message: `Procedure "${procedureName}" not found in script` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}
