import assert from 'node:assert/strict';
import { EnterpriseService } from '../src/services/enterpriseService';
import { boundedExecutionResult, executionArguments } from '../src/services/mcpExecution';

async function main() {
  const service = new EnterpriseService();
  const calls: Record<string, unknown>[] = [];
  let response: unknown = { success: true, data: 0 };
  (service as unknown as { apiRequest: (endpoint: string, options: { body: string }) => Promise<unknown> }).apiRequest = async (endpoint, options) => {
    assert.equal(endpoint, 'RunScript'); calls.push(JSON.parse(options.body)); return response;
  };
  const options = executionArguments({ parameters: ['中文', false], entryPoint: 'Echo', outputType: 'JSON', maxCharacters: 5 }, false);
  assert.equal((await service.runScript('/ServerScripts/Test/Echo', options.parameters, options)).output, 0);
  assert.deepEqual(calls[0], { URI: '/ServerScripts/Test/Echo', Parameters: ['中文', false], EntryPoint: 'Echo', OutputType: 'JSON' });
  response = { success: false, data: 'native failure details' };
  assert.match((await service.runScript('/ServerScripts/Test/Echo')).error || '', /native failure details/);
  response = { data: [] };
  assert.equal((await service.runScript('/ServerScripts/Test/Echo')).success, false);
  response = { success: true, data: [['ID'], [1]], totalRows: 9, rowsTruncated: true };
  const ds = await service.runDataSource('/DataSources/Test/Rows', ['sentinel'], { outputType: 'ARRAY', maxRows: 1 });
  assert.equal(ds.totalRows, 9); assert.equal(ds.rowsTruncated, true);
  assert.deepEqual(calls.at(-1), { URI: '/DataSources/Test/Rows', Parameters: ['sentinel'], OutputType: 'ARRAY', MaxRows: 1 });
  assert.deepEqual(ds.rows, [{ ID: 1 }]);
  assert.throws(() => executionArguments({ parameters: {} }, false), /array/);
  assert.throws(() => executionArguments({ entryPoint: 'Other.Proc' }, false), /one server procedure/);
  assert.throws(() => executionArguments({ entryPoint: 'Run' }, true), /not supported/);
  assert.throws(() => executionArguments({ maxRows: 0 }, true), /positive/);
  assert.throws(() => executionArguments({ outputType: 'SQL' }, true), /Unsupported/);
  assert.equal(boundedExecutionResult({ success: true, output: false }, 10).output, false);
  const limited = boundedExecutionResult({ success: true, output: { value: 'abcdef' } }, 5);
  assert.equal(limited.truncated, true); assert.equal(String(limited.output).length, 5);
  assert.equal(limited.outputEncoding, 'text-fragment');
  console.log('Execution contract and output bounds passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
