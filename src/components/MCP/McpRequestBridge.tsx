import { useEffect } from 'react';
import { getEnterpriseService } from '../../services/enterpriseService';
import { useOutputLogStore } from '../../services/outputLogStore';
import { isStateChangingMcpTool, requiresMcpApproval } from '../../services/agentPermissions';
import { requestInlineMcpApproval } from '../../services/mcpApprovalStore';
import { checkInItemWithGate, checkoutItemWithGate, executeDataSourceWithGate, executeServerScriptWithGate, saveItemWithGate, undoCheckoutWithGate } from '../../services/writeGateService';
import { formResourceVersion, normalizeFormResourcesUri, parseFormResources, setFormResourceValue } from '../../services/formResources';

type McpRequest = { id: string; tool: string; arguments: Record<string, unknown> };
type McpToolPermissionPolicy = 'read-only' | 'ask-writes' | 'auto-safe' | 'full-access';

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

const sameFormResources = (left: string, right: string): boolean => {
  try {
    const canonical = (value: string) => parseFormResources(value).resources
      .map(({ resourceId, resourceValue, guid }) => ({ resourceId, resourceValue, guid: guid || '' }))
      .sort((a, b) => a.resourceId.localeCompare(b.resourceId));
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  } catch {
    return false;
  }
};

async function ensureMcpToolAllowed(request: McpRequest): Promise<void> {
  if (!isStateChangingMcpTool(request.tool)) return;
  const saved = await window.electronAPI?.storeGet(MCP_TOOL_PERMISSION_STORE_KEY).catch(() => null);
  const policy: McpToolPermissionPolicy = saved === 'read-only' || saved === 'auto-safe' || saved === 'full-access' ? saved : 'ask-writes';
  if (policy === 'read-only') throw new Error(`MCP tool '${request.tool}' is blocked by the current read-only conversation mode.`);
  if (!requiresMcpApproval(request.tool, policy)) return;
  const allowed = await requestInlineMcpApproval({
    id: request.id,
    tool: request.tool,
    detail: summarizeArguments(request.arguments)
  });
  if (!allowed) throw new Error(`MCP tool '${request.tool}' was declined by the user.`);
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
    case 'get_form_resources': {
      const resourceUri = normalizeFormResourcesUri(uri());
      const language = String(args.language || '').trim();
      const parsed = parseFormResources(await service.getItemCode(resourceUri, language));
      const output = truncate(parsed.xml, args.maxCharacters);
      return {
        uri: resourceUri,
        language,
        version: await formResourceVersion(parsed.xml),
        resources: parsed.resources,
        totalItems: parsed.resources.length,
        ...(args.includeXml === true ? { resourceXml: output.value, totalCharacters: output.totalCharacters, truncated: output.truncated } : {})
      };
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
      const result = await checkoutItemWithGate({ source: 'agent', action: 'checkout', uri: uri(), language: args.language ? String(args.language) : undefined, approved: true });
      if (!result.success) throw new Error(result.message || 'Checkout failed.');
      return { uri: uri(), ...result };
    }
    case 'save_item': {
      const result = await saveItemWithGate({ source: 'agent', action: 'save', uri: uri(), language: args.language ? String(args.language) : undefined, type: args.type ? String(args.type) : undefined, code: String(args.code ?? ''), approved: true });
      return { uri: uri(), ...result };
    }
    case 'save_form_resources': {
      const resourceUri = normalizeFormResourcesUri(uri());
      const language = String(args.language || '').trim();
      const resourceXml = String(args.resourceXml || '');
      const desired = parseFormResources(resourceXml);
      const current = parseFormResources(await service.getItemCode(resourceUri, language));
      const currentVersion = await formResourceVersion(current.xml);
      if (args.expectedVersion && String(args.expectedVersion) !== currentVersion) {
        throw new Error('Form Resources changed after they were read. Read the selected language again before saving.');
      }
      const result = await saveItemWithGate({
        source: 'agent', action: 'save', uri: resourceUri, language, type: 'HTMLFORMRESOURCES', code: desired.xml,
        expectedRemoteContent: current.xml, approved: true, verifyReadBack: sameFormResources
      });
      const saved = parseFormResources(await service.getItemCode(resourceUri, language));
      return { uri: resourceUri, language, ...result, version: await formResourceVersion(saved.xml), totalItems: saved.resources.length };
    }
    case 'set_form_resource': {
      const resourceUri = normalizeFormResourcesUri(uri());
      const language = String(args.language || '').trim();
      const current = parseFormResources(await service.getItemCode(resourceUri, language));
      const currentVersion = await formResourceVersion(current.xml);
      if (args.expectedVersion && String(args.expectedVersion) !== currentVersion) {
        throw new Error('Form Resources changed after they were read. Read the selected language again before updating a value.');
      }
      const updated = setFormResourceValue(current.xml, String(args.resourceId || ''), String(args.resourceValue ?? ''));
      const result = await saveItemWithGate({
        source: 'agent', action: 'save', uri: resourceUri, language, type: 'HTMLFORMRESOURCES', code: updated.xml,
        expectedRemoteContent: current.xml, approved: true, verifyReadBack: sameFormResources
      });
      const saved = parseFormResources(await service.getItemCode(resourceUri, language));
      return {
        uri: resourceUri, language, resourceId: String(args.resourceId), created: updated.created, ...result,
        version: await formResourceVersion(saved.xml), totalItems: saved.resources.length
      };
    }
    case 'checkin_item': {
      const result = await checkInItemWithGate({ source: 'agent', action: 'checkin', uri: uri(), reason: String(args.reason), language: args.language ? String(args.language) : undefined, approved: true });
      if (!result.success) throw new Error(result.message || 'Check-in failed.');
      return { uri: uri(), ...result };
    }
    case 'undo_checkout': {
      if (!await undoCheckoutWithGate({ source: 'agent', action: 'undo-checkout', uri: uri(), approved: true })) throw new Error('Undo checkout failed.');
      return { uri: uri(), undone: true };
    }
    case 'execute_server_script': {
      const result = await executeServerScriptWithGate({ source: 'agent', action: 'execute-script', uri: uri(), parameters: Array.isArray(args.parameters) ? args.parameters : [], approved: true });
      if (!result.success) throw new Error(result.error || 'Server script execution failed.');
      return { uri: uri(), ...result };
    }
    case 'execute_data_source': {
      const result = await executeDataSourceWithGate({ source: 'agent', action: 'execute-data-source', uri: uri(), approved: true });
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
