import assert from 'node:assert/strict';
import { contentVersionFingerprint } from '../src/services/writeGateService';

async function main() {
  const base = await contentVersionFingerprint({ server: 'DEMO', user: 'DEMO_USER', uri: '/Applications/A', language: 'CHS', action: 'save', before: 'old', after: 'new' });
  const same = await contentVersionFingerprint({ server: 'DEMO', user: 'DEMO_USER', uri: '/Applications/A', language: 'CHS', action: 'save', before: 'old', after: 'new' });
  const changedContent = await contentVersionFingerprint({ server: 'DEMO', user: 'DEMO_USER', uri: '/Applications/A', language: 'CHS', action: 'save', before: 'old', after: 'newer' });
  const changedLanguage = await contentVersionFingerprint({ server: 'DEMO', user: 'DEMO_USER', uri: '/Applications/A', language: 'ENG', action: 'save', before: 'old', after: 'new' });
  const changedServer = await contentVersionFingerprint({ server: 'QA', user: 'DEMO_USER', uri: '/Applications/A', language: 'CHS', action: 'save', before: 'old', after: 'new' });
  assert.equal(base.length, 64);
  assert.equal(base, same);
  assert.notEqual(base, changedContent);
  assert.notEqual(base, changedLanguage);
  assert.notEqual(base, changedServer);
  console.log('Unified write gate fingerprint smoke test passed.');
}

void main();
