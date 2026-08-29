import assert from 'node:assert/strict';
import { evaluateQualityGate, mergeAiLayers, parseWorkflowTasks, validateExtensionManifest, workflowRolePrompt } from '../src/services/aiPlatform';

const effective = mergeAiLayers({
  team: { schemaVersion: 1, layer: 'team', rules: 'team', quality: { requirePassedTests: true }, updatedAt: 1 },
  personal: { schemaVersion: 1, layer: 'personal', rules: 'personal', quality: { warnChangedLines: 10 }, updatedAt: 2 }
});
assert.deepEqual(effective.rules.map((rule) => rule.layer), ['team', 'personal']);
assert.equal(effective.quality.requirePassedTests, true);
assert.equal(effective.quality.warnChangedLines, 10);

const report = evaluateQualityGate({
  changes: [{ uri: '/A', name: 'A', type: 'SS', relativePath: 'A.ssl', kind: 'modified', before: ':RETURN .T.;', after: ':IF .T.;\n:RETURN .T.;' }],
  reviewState: { reviewedKeys: [], tests: [] },
  policy: effective.quality
});
assert.equal(report.passed, false);
assert.ok(report.findings.some((finding) => finding.source === 'review'));
assert.ok(report.findings.some((finding) => finding.source === 'test'));

const manifest = validateExtensionManifest({ schemaVersion: 1, id: 'sample.tools', name: 'Sample', version: '1.0.0', contributes: { languages: [{ id: 'sample', extensions: ['.sample'] }] } });
assert.equal(manifest.enabled, true);
assert.match(workflowRolePrompt('reviewer', 'Change A', 'Implementation B').system, /review role/);
assert.deepEqual(parseWorkflowTasks('Plan\n```json\n[{"id":"a","title":"Change A"},{"id":"b","title":"Test B","detail":"independent"}]\n```').map((task) => task.id), ['a', 'b']);

console.log('AI platform smoke test passed.');
