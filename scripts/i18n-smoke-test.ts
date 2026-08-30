import assert from 'node:assert/strict';
import { enUS } from '../src/i18n/en';
import { zhCN } from '../src/i18n/zh';

const enKeys = Object.keys(enUS).sort();
const zhKeys = Object.keys(zhCN).sort();
assert.deepEqual(zhKeys, enKeys, 'Chinese and English dictionaries must expose the same keys');

for (const key of [
  'server.select', 'sidebar.searchResults', 'checkout.title', 'scm.nativeTitle',
  'scm.export.checkedOnly', 'editor.noFile', 'context.cut', 'context.checkIn', 'output.title', 'agent.askHint'
]) {
  assert.ok(enUS[key] && zhCN[key], `Missing translation: ${key}`);
  assert.notEqual(enUS[key], zhCN[key], `Expected localized values for: ${key}`);
}

console.log(`i18n dictionary parity smoke test passed (${enKeys.length} keys).`);
