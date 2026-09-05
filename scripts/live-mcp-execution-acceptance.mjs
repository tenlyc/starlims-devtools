import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const uri=process.env.STARLIMS_ACCEPTANCE_DATASOURCE_URI;
const native = uri === '/Applications/TestApp/LIYC_AI_UserManagement_TEST/DataSources/MCP_ExecutionAcceptanceNative';
if(!native && uri !== '/DataSources/SourceControlMgmt/dsGetItemsFromSearch') throw new Error('Specify the native test fixture or system metadata data source.');
const parameters = native ? ['mcp-first','mcp-second'] : ['Manager',['APP_FRM']];
const scriptName = native ? 'LIYC_AI_UserManagement_TEST.MCP_ExecutionAcceptanceNative' : 'SourceControlMgmt.dsGetItemsFromSearch';
const c=new Client({name:'execution-contract-acceptance',version:'1'});
async function call(name,args){const r=await c.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r.content));return r.structuredContent;}
try{await c.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3102/mcp')));
const script=await call('execute_server_script',{uri:'/ServerScripts/SCM_API/RunScript',entryPoint:'RunDataSource',parameters:[scriptName,'ARRAY',parameters,1],outputType:'JSON',maxCharacters:1000000});
assert.ok(JSON.parse(script.output).totalRows>1);
for(const outputType of ['ARRAY','XML','JSON']){
 const r=await call('execute_data_source',{uri,parameters,outputType,maxRows:1,maxCharacters:10000});
 assert.ok(r.totalRows>1); assert.equal(r.rowsTruncated,true); assert.equal(r.truncated,false);
 const output=JSON.stringify(r.output);assert.match(output,native ? /mcp-first/ : /Manager/i);
 if(native) { assert.equal(r.totalRows,2); assert.doesNotMatch(output,/mcp-second/); }
 console.log(JSON.stringify({outputType,totalRows:r.totalRows,rowsTruncated:r.rowsTruncated,parameterVerified:true}));
}
const bounded=await call('execute_data_source',{uri,parameters,outputType:'XML',maxRows:2,maxCharacters:20});assert.equal(bounded.truncated,true);assert.equal(bounded.output.length,20);
const failure=await c.callTool({name:'execute_data_source',arguments:{uri:uri+'_MissingFixture',parameters:[],outputType:'ARRAY'}});assert.equal(failure.isError,true,'Missing data source must be an error, not empty success.');
const invalid=await c.callTool({name:'execute_server_script',arguments:{uri:'/ServerScripts/SCM_API/Utils',entryPoint:'Not.Executable',parameters:[]}});assert.equal(invalid.isError,true);
console.log(JSON.stringify({ok:true,entryPointVerified:true,formats:3,maxCharactersVerified:true,errorsVerified:true}));
}finally{await c.close();}
