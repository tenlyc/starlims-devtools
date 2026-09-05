import type { IEnterpriseService, ScriptResult } from './iEnterpriseService';
import { menuSchemas, type MenuInput } from './menuMcpSchema';

type Row = Record<string, unknown>;
type Service = Pick<IEnterpriseService, 'runDataSource' | 'runScript' | 'getItemCode' | 'getEnterpriseItems' | 'getCurrentServer' | 'getSessionInfo' | 'getLanguages'>;
const root = '/Applications/DashboardParts/Console/';

export function menuRows(result: ScriptResult): Row[] {
  if (!result.success || result.rowsTruncated) throw new Error(result.error || 'Menu query failed or was truncated.');
  const data = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
  if (!data || !Array.isArray(data.Tables) || data.Tables.length !== 1 || !Array.isArray(data.Tables[0].Rows)) throw new Error('Unexpected native menu dataset.');
  return data.Tables[0].Rows;
}
const same = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
const stable = (rows: Row[]) => JSON.stringify(rows.map(r => Object.fromEntries(Object.entries(r).sort())).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

export class MenuMcpService {
  private plans = new Map<string, { input: MenuInput; session: string; baseline: string; appId: string; formId: string; roles: Row[]; expires: number; state: 'ready'|'applying'|'done'|'failed'; result?: unknown }>();
  constructor(private service: Service) {}
  private session() { return JSON.stringify([this.service.getCurrentServer()?.url, this.service.getSessionInfo()]); }
  private async read(name: string, parameters: unknown[]) {
    return menuRows(await this.service.runDataSource(root + 'DataSources/' + name, parameters, { outputType: 'JSON', maxRows: 10000 }));
  }
  private async configuration(group?: string, item?: string) {
    const [tree, roles, grants] = await Promise.all([
      this.read('ConsoleTreeDT', ['C','HTML']), this.read('Roles', ['RUNTIME']), this.read('ConsoleRoles', ['C','HTML','DESIGNER'])
    ]);
    const items = tree.filter(r => !group || same(r.PARENT,group) || (!r.PARENT && same(r.NAME,group)));
    const captions = group && item ? await this.read('getItemCaptions_HTML',['C','HTML',group,item]) : [];
    return { items, roles, grants: grants.filter(r => (!group || same(r.PARENT,group)) && (!item || same(r.NAME,item))), captions };
  }
  private async form(input: MenuInput) {
    const parts = input.formUri.split('/');
    const resolved = await this.service.runScript('/ServerScripts/SCM_API/MenuManagement', [parts[2],parts[3],parts[6]], {entryPoint:'ResolveForm',outputType:'ARRAY'});
    let ids = resolved.output;
    if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch { throw new Error('Menu backend form resolution failed: '+ids); } }
    if (!resolved.success || !Array.isArray(ids) || ids.length!==1 || !Array.isArray(ids[0]) || ids[0].length!==2) throw new Error('Cannot resolve authoritative application and form IDs. Install SCM_API.MenuManagement.');
    const [appId, nativeFormId] = ids[0] as string[];
    const xml = await this.service.getItemCode(input.formUri, Object.keys(input.captions)[0]);
    const formId = xml.match(/<Guid>\s*([0-9a-f-]{36})\s*<\/Guid>/i)?.[1];
    if (!formId || !same(formId,nativeFormId)) throw new Error('Cannot resolve runtime GUID from Form XML.');
    return { appId, formId, commandName: parts[3]+'.'+parts[6] };
  }
  async execute(tool: string, args: Record<string,unknown>): Promise<unknown> {
    if (tool === 'get_menu_configuration') {
      const input = menuSchemas.get_menu_configuration.parse(args);
      return { ...(await this.configuration(input.group,input.itemName)), mode:'HTML', destinationType:'C', runtimeVerified:false };
    }
    if (tool === 'plan_menu_item') {
      const input = menuSchemas.plan_menu_item.parse(args);
      const languages = await this.service.getLanguages();
      if (Object.keys(input.captions).some(lang=>!languages.includes(lang))) throw new Error('Unknown menu caption language.');
      const cfg = await this.configuration(input.group,input.itemName);
      const groups = cfg.items.filter(r => !r.PARENT && same(r.NAME,input.group));
      if (groups.length !== 1) throw new Error('Choose one existing visible HTML menu group.');
      input.group = String(groups[0].NAME);
      if (cfg.items.some(r => r.PARENT && same(r.NAME,input.itemName))) throw new Error('Menu item already exists; this tool creates only and will not overwrite it.');
      const roles = input.roles.map(name => {
        const matches = cfg.roles.filter(r => same(r.ROLE,name));
        if (matches.length !== 1 || !matches[0].ROLEID || ['*','@@'].includes(String(matches[0].ROLEID))) throw new Error('Unknown, ambiguous or special role: '+name);
        return matches[0];
      });
      if (new Set(roles.map(r=>r.ROLEID)).size !== roles.length) throw new Error('Duplicate roles.');
      const maxPosition = Math.max(0,...cfg.items.filter(r=>r.PARENT).map(r=>Number(r.ITEMSORTER)||0));
      input.position ??= maxPosition + 1;
      if (input.position <= maxPosition) throw new Error('First version appends items; choose a position after existing items.');
      const form = await this.form(input);
      const planId = crypto.randomUUID();
      for (const [id,p] of this.plans) if(p.expires < Date.now()) this.plans.delete(id);
      if(this.plans.size >= 100) throw new Error('Too many pending menu plans.');
      this.plans.set(planId,{input, ...form, roles, session:this.session(), baseline:stable([...cfg.items,...cfg.grants,...cfg.captions]), expires:Date.now()+15*60000,state:'ready'});
      return {planId, expiresInSeconds:900, action:'create', ...input, ...form, resolvedRoles:roles, destinationWindow:'Applications Tab', parameterKind:'SSL script executed by STARLIMS on menu launch', atomic:true, runtimeVerified:false};
    }
    const {planId} = menuSchemas.apply_menu_item.parse(args);
    const plan = this.plans.get(planId);
    if(!plan || plan.session !== this.session() || plan.expires < Date.now()) throw new Error('Menu plan expired or session changed. Plan again.');
    if(plan.state === 'done') return plan.result;
    if(plan.state !== 'ready') throw new Error('Plan already attempted. Inspect configuration before creating another plan.');
    plan.state = 'applying';
    const completed: string[] = [];
    let attempted = 'preflight';
    try {
      const input = plan.input;
      const cfg = await this.configuration(input.group,input.itemName);
      if(stable([...cfg.items,...cfg.grants,...cfg.captions]) !== plan.baseline) throw new Error('Menu changed since planning.');
      const form = await this.form(input);
      if(form.appId !== plan.appId || form.formId !== plan.formId || plan.roles.some(role=>!cfg.roles.some(r=>same(r.ROLE,role.ROLE)&&r.ROLEID===role.ROLEID))) throw new Error('Form or role mapping changed.');
      attempted = 'SCM_API.MenuManagement.CreateItem';
      const parts = input.formUri.split('/');
      const result = await this.service.runScript('/ServerScripts/SCM_API/MenuManagement', [input.group,input.itemName,parts[2],parts[3],parts[6],plan.appId,plan.formId,input.position,Object.entries(input.captions),plan.roles.map(r=>r.ROLEID),input.parameterScript], {entryPoint:'CreateItem',outputType:'ARRAY'});
      if(!result.success || ![true,'true','.T.'].includes(result.output as boolean|string)) throw new Error('Owned menu backend did not confirm success: '+JSON.stringify(result.error||result.output));
      completed.push(attempted);
      attempted = 'readback';
      const after = await this.configuration(input.group,input.itemName);
      const item = after.items.find(r=>r.PARENT && same(r.NAME,input.itemName));
      if(!item || item.COMMANDNAME!==form.commandName || !same(item.ITEMID,plan.formId) || !same(item.PARENTID,plan.appId) || item.COMMANDTYPE!=='A' || item.DESTINATIONWINDOW!=='A' || Number(item.ITEMSORTER)!==input.position || String(item.COMMANDPARAMETERS||'')!==input.parameterScript || after.grants.length!==plan.roles.length || plan.roles.some(r=>!after.grants.some(g=>g.ROLEID===r.ROLEID)) || Object.entries(input.captions).some(([lang,value])=>!after.captions.some(r=>r.LANGID===lang&&r.CAPTION===value))) throw new Error('Menu readback differs from the approved plan.');
      plan.state='done';
      return plan.result={created:true,configurationVerified:true,runtimeVerified:false,item,captions:after.captions,roles:plan.roles,completed,nextStep:'Refresh the actual STARLIMS menu and open this entry under an allowed role. Existing runtime tabs may need reload.'};
    } catch(error) {
      plan.state='failed';
      throw new Error(JSON.stringify({message:error instanceof Error?error.message:String(error),completed,attempted,mayHavePartialChanges:attempted!=='preflight',automaticRetryAllowed:false}));
    }
  }
}
