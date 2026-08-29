import { useEffect } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { useOutputLogStore } from '../../services/outputLogStore';
import { isStateChangingMcpTool } from '../../services/agentPermissions';

type McpRequest = { id: string; tool: string; arguments: Record<string, unknown> };
type McpToolPermissionPolicy = 'read-only' | 'ask-writes' | 'full-access';

const MCP_TOOL_PERMISSION_STORE_KEY = 'mcpToolPermissionPolicy.v1';

function summarizeArguments(args: Record<string, unknown>): string {
  const safe = Object.fromEntries(Object.entries(args).map(([key, value]) => {
    if (/password|pass|token|cookie|secret|code|body/i.test(key)) return [key, '[hidden]'];
    if (typeof value === 'string' && value.length > 240) return [key, `${value.slice(0, 240)}…`];
    return [key, value];
  }));
  return JSON.stringify(safe);
}

const limitArray = <T,>(items: T[], requested?: unknown): T[] => {
  const limit = typeof requested === 'number' ? Math.max(1, Math.min(requested, 10000)) : 100;
  return items.slice(0, limit);
};

const truncate = (text: string, requested?: unknown): { value: string; totalCharacters: number; truncated: boolean } => {
  const max = typeof requested === 'number' ? requested : 50_000;
  return { value: text.slice(0, max), totalCharacters: text.length, truncated: text.length > max };
};

async function ensureMcpToolAllowed(request: McpRequest): Promise<void> {
  if (!isStateChangingMcpTool(request.tool)) return;
  const saved = await window.electronAPI?.storeGet(MCP_TOOL_PERMISSION_STORE_KEY).catch(() => null);
  const policy: McpToolPermissionPolicy = saved === 'read-only' || saved === 'full-access' ? saved : 'ask-writes';
  if (policy === 'read-only') throw new Error(`MCP tool '${request.tool}' is blocked by the current read-only conversation mode.`);
  if (policy === 'full-access') return;
  const result = await window.electronAPI?.showMessageBox({
    type: 'warning',
    title: 'STARLIMS MCP 操作确认',
    message: `允许 AI 执行“${request.tool}”吗？`,
    detail: summarizeArguments(request.arguments),
    buttons: ['拒绝', '允许一次'],
    cancelId: 0,
    defaultId: 1,
    noLink: true
  });
  if (!result || result.response !== 1) throw new Error(`MCP tool '${request.tool}' was declined by the user.`);
}

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
    case 'query_checkin_history': {
      const filter = {
        user: String(args.user || ''),
        dateFrom: String(args.dateFrom || ''),
        dateTo: String(args.dateTo || '')
      };
      const items = await service.getCheckInHistory(filter);
      return { filter, items, totalItems: items.length };
    }
    case 'checkout_item': {
      const result = await service.checkOut(uri(), args.language ? String(args.language) : undefined);
      if (!result.success) throw new Error(result.message || 'Checkout failed.');
      return { uri: uri(), ...result };
    }
    case 'save_item': {
      const success = await service.saveItemCode(uri(), String(args.code ?? ''), args.language ? String(args.language) : undefined);
      if (!success) throw new Error('Saving the STARLIMS item failed.');
      return { uri: uri(), saved: true };
    }
    case 'checkin_item': {
      const result = await service.checkIn(uri(), String(args.reason), args.language ? String(args.language) : undefined);
      if (!result.success) throw new Error(result.message || 'Check-in failed.');
      return { uri: uri(), ...result };
    }
    case 'undo_checkout': {
      if (!await service.undoCheckOut(uri())) throw new Error('Undo checkout failed.');
      return { uri: uri(), undone: true };
    }
    case 'execute_server_script': {
      const result = await service.runScript(uri(), Array.isArray(args.parameters) ? args.parameters : []);
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
  useEffect(() => window.electronAPI?.onDiagnosticLog?.((event) => {
    useOutputLogStore.getState().addEntry({
      channel: event.channel, level: event.level, source: event.source, message: event.message
    });
  }), []);

  useEffect(() => {
    if (!window.electronAPI?.mcpGetStatus) return;
    void window.electronAPI.mcpGetStatus().then((status) => {
      useOutputLogStore.getState().addEntry({
        channel: 'mcp-server', level: status.running ? 'success' : 'error', source: 'MCP Server',
        message: status.running ? `Listening at ${status.url}` : `Unavailable${status.error ? `: ${status.error}` : ''}`
      });
    }).catch((error) => {
      useOutputLogStore.getState().addEntry({
        channel: 'mcp-server', level: 'error', source: 'MCP Server',
        message: error instanceof Error ? error.message : String(error)
      });
    });
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onMcpRequest) return;
    return window.electronAPI.onMcpRequest(async (request) => {
      const started = performance.now();
      useOutputLogStore.getState().addEntry({
        channel: 'mcp-tools', level: 'info', source: 'MCP Tool',
        message: `${request.tool} started · ${summarizeArguments(request.arguments)}`
      });
      try {
        await ensureMcpToolAllowed(request);
        const result = await executeMcpTool(request);
        useOutputLogStore.getState().addEntry({
          channel: 'mcp-tools', level: 'success', source: 'MCP Tool',
          message: `${request.tool} completed (${Math.round(performance.now() - started)} ms)`
        });
        window.electronAPI.respondToMcpRequest({ id: request.id, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        useOutputLogStore.getState().addEntry({
          channel: 'mcp-tools', level: 'error', source: 'MCP Tool',
          message: `${request.tool} failed (${Math.round(performance.now() - started)} ms): ${message}`
        });
        window.electronAPI.respondToMcpRequest({
          id: request.id,
          error: message
        });
      }
    });
  }, []);

  return null;
}
