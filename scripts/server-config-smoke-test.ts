import assert from 'node:assert/strict';
import { normalizeStarlimsUrl } from '../src/services/miscUtils';

assert.equal(
  normalizeStarlimsUrl('https://starlims.example.test/LIMS/starthtml.lims'),
  'https://starlims.example.test/LIMS'
);
assert.equal(
  normalizeStarlimsUrl('https://example.test/STARLIMS/starthtml.lims?FormId=123#debug'),
  'https://example.test/STARLIMS'
);
assert.equal(
  normalizeStarlimsUrl('https://example.test/STARLIMS/'),
  'https://example.test/STARLIMS'
);

console.log('Server configuration smoke test passed.');
