import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EnterpriseService } from '../src/services/enterpriseService';
import { pendingCheckoutIds, checkinTargetUri } from '../src/services/checkinVerification';
Object.assign(globalThis, { DOMParser: new JSDOM('').window.DOMParser });
const uri = '/Applications/Test/TestApp/HTMLForms/Resources/TestForm';
const target = uri.replace('/Resources/', '/XML/');
assert.equal(checkinTargetUri(uri), target);
assert.throws(() => pendingCheckoutIds(undefined), /unavailable/);
assert.throws(() => pendingCheckoutIds('<DataSet><PendingCheckins/></DataSet>'), /no item GUID/);
assert.deepEqual(pendingCheckoutIds('<d:DataSet xmlns:d="x"><d:PendingCheckins><d:CHILDID>A</d:CHILDID></d:PendingCheckins></d:DataSet>'), ['a']);
async function verify(mode: 'ok' | 'retain' | 'error' | 'unavailable') {
  const service = new EnterpriseService();
  let submitted = false;
  (service as unknown as { apiRequest: (endpoint: string) => Promise<unknown> }).apiRequest = async (endpoint) => {
    if (endpoint.startsWith('Search?')) return { success: true, data: { items: [{ uri: target, guid: 'guid-a' }] } };
    if (endpoint === 'GetCheckedOutItems') return { success: true, data: submitted && mode === 'unavailable' ? null : !submitted || mode === 'retain' ? [{ guid: 'guid-a' }] : [] };
    assert.ok(endpoint.startsWith(`CheckIn?URI=${encodeURIComponent(target)}`));
    submitted = true;
    return { success: true, data: mode === 'error' ? 'ERROR: wrong user' : 'OK' };
  };
  const result = await service.checkIn(uri, 'acceptance', 'CHS');
  assert.equal(result.success, mode === 'ok');
  assert.equal(result.verified, mode === 'ok' ? true : undefined);
}
void Promise.all(['ok', 'retain', 'error', 'unavailable'].map((mode) => verify(mode as Parameters<typeof verify>[0])))
  .then(() => console.log('Verified check-in smoke test passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
