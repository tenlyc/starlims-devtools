import { SSLParser } from '../lsp/ssl/parser';
import type { CheckInResult, CheckOutResult, DataSourceResult, QueryResult, ScriptResult } from './iEnterpriseService';
import { getEnterpriseService } from './enterpriseService';
import { loadAiLayers, mergeAiLayers } from './aiPlatform';
import { useOutputLogStore } from './outputLogStore';

export type WriteGateSource = 'editor' | 'workspace' | 'agent' | 'extension';

type MutationContext = {
  source: WriteGateSource;
  action: 'checkout' | 'save' | 'checkin' | 'checkin-all' | 'undo-checkout' | 'execute-script' | 'execute-data-source' | 'execute-query';
  uri: string;
  language?: string;
  approved: boolean;
};

export type SaveGateInput = MutationContext & {
  action: 'save';
  code: string;
  type?: string;
  expectedRemoteContent?: string;
  verifyReadBack?: (expected: string, actual: string) => boolean;
};

const SSL_TYPES = new Set(['SS', 'APPSS', 'SRVSCR', 'SERVERSCRIPT', 'APPSERVERSCRIPT', 'SSL']);

function audit(context: MutationContext, level: 'info' | 'success' | 'error', message: string, fingerprint?: string): void {
  useOutputLogStore.getState().addEntry({
    channel: 'starlims-operation', level, source: 'Write Gate',
    message: `${context.source} · ${context.action} · ${context.uri}${context.language ? ` · ${context.language}` : ''}${fingerprint ? ` · ${fingerprint.slice(0, 12)}` : ''} · ${message}`
  });
}

function assertAuthorized(context: MutationContext): void {
  if (!context.uri.trim()) throw new Error('Write gate rejected an empty STARLIMS target URI.');
  if (!context.approved) throw new Error(`Write gate rejected '${context.action}' because no user authorization was attached.`);
}

export async function contentVersionFingerprint(input: { server?: string; user?: string; uri: string; language?: string; action: string; before?: string; after?: string }): Promise<string> {
  const payload = JSON.stringify({ version: 1, server: input.server || '', user: input.user || '', uri: input.uri, language: input.language || '', action: input.action, before: input.before ?? '', after: input.after ?? '' });
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function saveItemWithGate(input: SaveGateInput): Promise<{ saved: boolean; fingerprint: string }> {
  assertAuthorized(input);
  const service = getEnterpriseService();
  const remoteBefore = await service.getItemCode(input.uri, input.language);
  const server = service.getCurrentServer();
  const fingerprint = await contentVersionFingerprint({ ...input, server: server?.url || server?.name, user: server?.user, before: remoteBefore, after: input.code });
  audit(input, 'info', 'preflight started', fingerprint);

  const policy = mergeAiLayers(await loadAiLayers()).quality;

  if (input.expectedRemoteContent !== undefined && remoteBefore !== input.expectedRemoteContent) {
    audit(input, 'error', 'remote content changed before save', fingerprint);
    throw new Error('服务器内容已在本次编辑后发生变化。为防止覆盖他人修改，保存已被写入门禁阻止。');
  }
  if (SSL_TYPES.has(String(input.type || '').toUpperCase()) || /\.(?:ssl|srvscr|ss)$/i.test(input.uri)) {
    const errors = new SSLParser().parse(input.code).errors;
    if (errors.length) {
      audit(input, policy.blockSslErrors ? 'error' : 'info', `SSL diagnostics found ${errors.length} error(s)`, fingerprint);
      if (policy.blockSslErrors) throw new Error(`SSL 语法检查发现 ${errors.length} 个错误，第 ${errors[0].line + 1} 行：${errors[0].message}`);
    }
  }
  if (input.source === 'agent' || input.source === 'extension') {
    if (policy.requirePassedTests) {
      audit(input, 'error', 'direct AI save blocked because passed tests are required', fingerprint);
      throw new Error('当前质量策略要求测试通过。请让 Agent 修改工作区文件，并通过“质量门禁”写回 STARLIMS。');
    }
  }

  const saved = await service.saveItemCode(input.uri, input.code, input.language);
  if (!saved) {
    audit(input, 'error', 'STARLIMS SaveCode returned failure', fingerprint);
    throw new Error('STARLIMS SaveCode 返回失败。');
  }
  const remoteAfter = await service.getItemCode(input.uri, input.language);
  if (!(input.verifyReadBack ? input.verifyReadBack(input.code, remoteAfter) : remoteAfter === input.code)) {
    audit(input, 'error', 'read-back verification mismatch', fingerprint);
    throw new Error('保存后回读内容不一致，写入结果无法确认。');
  }
  audit(input, 'success', 'saved and verified', fingerprint);
  return { saved: true, fingerprint };
}

export async function checkoutItemWithGate(context: MutationContext): Promise<CheckOutResult> {
  assertAuthorized(context);
  audit(context, 'info', 'checkout started');
  const result = await getEnterpriseService().checkOut(context.uri, context.language);
  audit(context, result.success ? 'success' : 'error', result.success ? 'checkout completed' : result.message || 'checkout failed');
  return result;
}

export async function checkInItemWithGate(context: MutationContext & { reason?: string }): Promise<CheckInResult> {
  assertAuthorized(context);
  audit(context, 'info', 'check-in started');
  const result = await getEnterpriseService().checkIn(context.uri, context.reason, context.language);
  audit(context, result.success ? 'success' : 'error', result.success ? 'check-in completed' : result.message || 'check-in failed');
  return result;
}

export async function checkInAllWithGate(context: MutationContext & { reason?: string }): Promise<boolean> {
  assertAuthorized(context);
  audit(context, 'info', 'bulk check-in started');
  const success = await getEnterpriseService().checkInAll(context.reason);
  audit(context, success ? 'success' : 'error', success ? 'bulk check-in completed' : 'bulk check-in failed');
  return success;
}

export async function undoCheckoutWithGate(context: MutationContext): Promise<boolean> {
  assertAuthorized(context);
  audit(context, 'info', 'undo checkout started');
  const success = await getEnterpriseService().undoCheckOut(context.uri);
  audit(context, success ? 'success' : 'error', success ? 'undo checkout completed' : 'undo checkout failed');
  return success;
}

export async function executeServerScriptWithGate(context: MutationContext & { parameters?: unknown[] }): Promise<ScriptResult> {
  assertAuthorized(context);
  audit(context, 'info', 'server script execution started');
  const result = await getEnterpriseService().runScript(context.uri, context.parameters || []);
  audit(context, result.success ? 'success' : 'error', result.success ? 'server script execution completed' : result.error || 'execution failed');
  return result;
}

export async function executeDataSourceWithGate(context: MutationContext): Promise<DataSourceResult> {
  assertAuthorized(context);
  audit(context, 'info', 'data source execution started');
  const result = await getEnterpriseService().runDataSource(context.uri);
  audit(context, result.success ? 'success' : 'error', result.success ? 'data source execution completed' : result.error || 'execution failed');
  return result;
}

export async function executeQueryWithGate(context: MutationContext & { query: string }): Promise<QueryResult> {
  assertAuthorized(context);
  const fingerprint = await contentVersionFingerprint({ ...context, after: context.query });
  audit(context, 'info', 'query execution started', fingerprint);
  const result = await getEnterpriseService().executeQuery(context.query);
  audit(context, result.success ? 'success' : 'error', result.success ? 'query execution completed' : result.error || 'query failed', fingerprint);
  return result;
}
