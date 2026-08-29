import { useEffect } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';

type McpRequest = { id: string; tool: string; arguments: Record<string, unknown> };

const limitArray = <T,>(items: T[], requested?: unknown): T[] => {
  const limit = typeof requested === 'number' ? Math.max(1, Math.min(requested, 10000)) : 100;
  return items.slice(0, limit);
};

const truncate = (text: string, requested?: unknown): { value: string; totalCharacters: number; truncated: boolean } => {
  const max = typeof requested === 'number' ? requested : 50_000;
  return { value: text.slice(0, max), totalCharacters: text.length, truncated: text.length > max };
};

async function executeMcpTool(request: McpRequest): Promise<unknown> {
  const service = getEnterpriseService();
  if (!service.isConnected()) {
    throw new Error('STARLIMS is not connected. Open STARLIMS DevTools and connect to a server first.');
  }

  const args = request.arguments;
  const uri = () => String(args.uri || '');

  switch (request.tool) {
    case 'browse_tree': {
      const items = await service.getEnterpriseItems(args.uri ? String(args.uri) : undefined);
      return { uri: args.uri || '/', items: limitArray(items, args.maxItems), totalItems: items.length };
    }
    case 'search_by_name': {
      const result = await service.search(String(args.query), args.itemType ? String(args.itemType) : undefined, args.exactMatch === true);
      return { ...result, items: limitArray(result.items, args.maxItems) };
    }
    case 'global_code_search': {
      const result = await service.globalSearch(String(args.searchString), Array.isArray(args.itemTypes) ? args.itemTypes.map(String) : undefined);
      return { ...result, items: limitArray(result.items, args.maxItems) };
    }
    case 'list_languages': {
      const languages = await service.getLanguages();
      return { languages, totalItems: languages.length };
    }
    case 'get_item_code': {
      const code = await service.getItemCode(uri(), args.language ? String(args.language) : undefined);
      const output = truncate(code, args.maxCharacters);
      return { uri: uri(), language: args.language, code: output.value, totalCharacters: output.totalCharacters, truncated: output.truncated };
    }
    case 'list_checked_out_items': {
      const items = await service.getCheckedOutItems(args.includeAllUsers === true);
      return { items, totalItems: items.length };
    }
    case 'read_log':
      return { log: await service.getServerLog() };
    case 'get_table_definition':
      return { uri: uri(), definition: await service.getTableDefinition(uri()) };
    case 'checkout_item': {
      const result = await service.checkOut(uri());
      if (!result.success) throw new Error(result.message || 'Checkout failed.');
      return { uri: uri(), ...result };
    }
    case 'save_item': {
      const success = await service.saveItemCode(uri(), String(args.code ?? ''), args.language ? String(args.language) : undefined);
      if (!success) throw new Error('Saving the STARLIMS item failed.');
      return { uri: uri(), saved: true };
    }
    case 'checkin_item': {
      const result = await service.checkIn(uri(), String(args.reason));
      if (!result.success) throw new Error(result.message || 'Check-in failed.');
      return { uri: uri(), ...result };
    }
    case 'undo_checkout': {
      if (!await service.undoCheckOut(uri())) throw new Error('Undo checkout failed.');
      return { uri: uri(), undone: true };
    }
    case 'execute_server_script': {
      const result = await service.runScript(uri());
      if (!result.success) throw new Error(result.error || 'Server script execution failed.');
      return { uri: uri(), ...result };
    }
    case 'execute_data_source': {
      const result = await service.runDataSource(uri());
      if (!result.success) throw new Error(result.error || 'Data source execution failed.');
      return { uri: uri(), ...result };
    }
    default:
      throw new Error(`Unsupported STARLIMS MCP tool: ${request.tool}`);
  }
}

export function McpRequestBridge() {
  useEffect(() => {
    if (!window.electronAPI?.onMcpRequest) return;
    return window.electronAPI.onMcpRequest(async (request) => {
      try {
        const result = await executeMcpTool(request);
        window.electronAPI.respondToMcpRequest({ id: request.id, result });
      } catch (error) {
        window.electronAPI.respondToMcpRequest({
          id: request.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }, []);

  return null;
}
