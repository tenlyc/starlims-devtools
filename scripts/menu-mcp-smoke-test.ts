import assert from 'node:assert/strict';
import { MenuMcpService, menuRows } from '../src/services/menuMcpService';
import { isStateChangingMcpTool, requiresMcpApproval } from '../src/services/agentPermissions';

const formId='72C5ABFE-423D-44A3-A245-090B37B278CA';
const formUri='/Applications/TestApp/TestApp/HTMLForms/XML/TestForm';
const input={group:'Demo',itemName:'MCP_Test',formUri,captions:{CHS:'中文测试'},roles:['Lims_Admin']};
function fixture() {
  const tree:any[]=[{NAME:'Demo',PARENT:null},{PARENT:'Demo',NAME:'Other',ITEMSORTER:1}];
  const captions:any[]=[]; const grants:any[]=[]; let writes=0; let fail='';
  const service:any={getCurrentServer:()=>({url:'http://test'}),getSessionInfo:()=>({starlimsSessionId:'one'}),getLanguages:async()=>['CHS','ENG'],getEnterpriseItems:async()=>[{uri:'/Applications/TestApp/TestApp',guid:'app-id'}],getItemCode:async()=>'<Form><Guid>'+formId+'</Guid></Form>',
    runDataSource:async(uri:string)=>({success:true,output:{Tables:[{Rows: uri.endsWith('/ConsoleTreeDT')?tree:uri.endsWith('/Roles')?[{ROLE:'Lims_Admin',ROLEID:'L'}]:uri.endsWith('/ConsoleRoles')?grants:captions}]}}),
    runScript:async(uri:string,p:any[], options:any)=>{
      assert.equal(uri,'/ServerScripts/SCM_API/MenuManagement');
      if(options.entryPoint==='ResolveForm') return {success:true,output:[['app-id',formId]]};
      writes++;
      if(fail) return {success:true,output:'ERROR: rejected'};
      tree.push({PARENT:p[0],NAME:p[1],ITEMSORTER:p[7],COMMANDNAME:p[3]+'.'+p[4],PARENTID:p[5],ITEMID:p[6],COMMANDTYPE:'A',DESTINATIONWINDOW:'A',COMMANDPARAMETERS:p[10]});
      for(const [lang,caption] of p[8]) captions.push({LANGID:lang,CAPTION:caption});
      for(const role of p[9]) grants.push({PARENT:p[0],NAME:p[1],ROLEID:role});
      return {success:true,output:true};
    }};

  return {m:new MenuMcpService(service),tree,service,get writes(){return writes;},set fail(value:string){fail=value;}};
}
async function main() {
assert.throws(()=>menuRows({success:true,rowsTruncated:true,output:{}}));
assert.throws(()=>menuRows({success:true,output:{}}));
assert.equal(isStateChangingMcpTool('apply_menu_item'),true);
assert.equal(requiresMcpApproval('apply_menu_item','auto-safe'),true);
const f=fixture();
await assert.rejects(f.m.execute('plan_menu_item',{...input,roles:['Missing']}));
await assert.rejects(f.m.execute('plan_menu_item',{...input,captions:{ZZZ:'bad'}}));
assert.equal(f.writes,0);
const plan:any=await f.m.execute('plan_menu_item',input);
assert.equal(plan.resolvedRoles[0].ROLEID,'L');
assert.equal(plan.position,2);
const result:any=await f.m.execute('apply_menu_item',{planId:plan.planId});
assert.equal(result.configurationVerified,true);
assert.equal(result.runtimeVerified,false);
assert.equal(f.writes,1);
assert.deepEqual(await f.m.execute('apply_menu_item',{planId:plan.planId}),result);
assert.equal(f.writes,1);
await assert.rejects(f.m.execute('plan_menu_item',input));
const stale=fixture();const stalePlan:any=await stale.m.execute('plan_menu_item',input);stale.tree[1].ITEMSORTER=3;
await assert.rejects(stale.m.execute('apply_menu_item',{planId:stalePlan.planId}),/changed/);assert.equal(stale.writes,0);
const partial=fixture();const partialPlan:any=await partial.m.execute('plan_menu_item',input);partial.fail='updateConsoleDetails';
await assert.rejects(partial.m.execute('apply_menu_item',{planId:partialPlan.planId}),/mayHavePartialChanges/);
await assert.rejects(partial.m.execute('apply_menu_item',{planId:partialPlan.planId}),/already attempted/);assert.equal(partial.writes,1);
const concurrent=fixture();const cp:any=await concurrent.m.execute('plan_menu_item',input);
const rs=await Promise.allSettled([concurrent.m.execute('apply_menu_item',{planId:cp.planId}),concurrent.m.execute('apply_menu_item',{planId:cp.planId})]);
assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);assert.equal(concurrent.writes,1);
console.log('Menu MCP regression passed: roles, language, create, readback, stale plans, replay, concurrency, partial failure, permission policy.');

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
