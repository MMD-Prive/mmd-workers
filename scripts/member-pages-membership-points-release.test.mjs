import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_DELTA_PATHS, APPROVED_SOURCE_SHA, BASELINE_SOURCE_SHA, validateMembershipSourceScope, verifyArtifactPreservation } from './member-pages-membership-points-release.mjs';

test('source scope is exact and includes only the reviewed membership/Points delta plus release tooling', () => {
  const result = validateMembershipSourceScope(APPROVED_SOURCE_SHA, APPROVED_SOURCE_SHA, ALLOWED_DELTA_PATHS);
  assert.equal(result.baseline_source_sha, BASELINE_SOURCE_SHA);
  assert.throws(() => validateMembershipSourceScope(APPROVED_SOURCE_SHA, APPROVED_SOURCE_SHA, [...ALLOWED_DELTA_PATHS, 'member-pages-worker/src/unreviewed.js']));
  assert.throws(() => validateMembershipSourceScope('a'.repeat(40), APPROVED_SOURCE_SHA, ALLOWED_DELTA_PATHS));
});

test('artifact preservation requires exact binding/runtime configuration equality', () => {
  const baseline = { resources: {
    bindings: [{ name: 'KV', type: 'kv_namespace' }],
    script_runtime: { compatibility_date: '2026-01-01' },
    script: { handlers: [], named_handlers: [], placement_mode: 'off' },
  } };
  const candidate = structuredClone(baseline);
  assert.equal(verifyArtifactPreservation(baseline, candidate, 'fixture', () => 'fixture'), true);
  assert.throws(() => verifyArtifactPreservation(baseline, { resources: { bindings: [], script_runtime: baseline.resources.script_runtime } }, 'fixture', () => 'fixture'));
});
