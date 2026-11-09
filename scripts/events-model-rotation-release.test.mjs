import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyRotationOverlay, digest } from './events-model-rotation-release.mjs';

test('overlay applies only unique approved module anchors and is exactly reversible', () => {
  const code = '// src/compcard-policy.js\nconst a = 1;\n// src/unrelated.js\nconst b = 2;\n';
  const next = code.replace('const a = 1;', 'const a = 3;');
  const manifest = { worker: 'events-worker', module: 'model-eta-wrapper.js', baseline_sha256: digest(code),
    candidate_sha256: digest(next), replacements: [{ section: 'compcard-policy', before: 'const a = 1;', after: 'const a = 3;' }] };
  assert.equal(applyRotationOverlay(code, manifest), next);
  assert.throws(() => applyRotationOverlay(code + ' ', manifest), /baseline/);
  assert.throws(() => applyRotationOverlay(code, { ...manifest, candidate_sha256: '0'.repeat(64) }), /candidate/);
  assert.throws(() => applyRotationOverlay(code, { ...manifest, replacements: [{ ...manifest.replacements[0], section: 'other' }] }), /unapproved/);
  assert.throws(() => applyRotationOverlay(code, { ...manifest, replacements: [{ section: 'compcard-policy', before: 'const b = 2;', after: 'const b = 9;' }] }), /outside/);
});
test('release workflow requires exact main SHA and protected owner review, never broad deploy', () => {
  const text = readFileSync('.github/workflows/deploy-events-model-rotation-code-only.yml', 'utf8');
  assert.match(text, /inputs.approved_sha == github.sha/);
  assert.match(text, /environment: mmd-production-mutation/);
  assert.match(text, /needs: \[production-approval, contracts\]/);
  assert.match(text, /uses: .\/.github\/workflows\/admin-production-approval.yml/);
  assert.match(text, /group: .*deploy-events-worker-production/);
  assert.doesNotMatch(text, /wrangler.*deploy|environment.*bypass/);
});
test('safe-hold production manifest pins unchanged reviewed candidate with explicit limits', () => {
  const manifest = JSON.parse(readFileSync('release/events-model-rotation/overlay-manifest.json','utf8'));
  assert.equal(manifest.release_scope,'safe_hold_all_models_three_calendar_month_review');
  assert.equal(manifest.candidate_sha256,'85a851f8de481f70875076f356beefba140e896e592ea756915c00564f00b9a5');
  assert.equal(manifest.replacements.length,17);
  assert.match(manifest.operational_effect,/all model posts may pause/);
  assert.match(manifest.warning_delivery,/no verified owner/);
  const script=readFileSync('scripts/events-model-rotation-release.mjs','utf8');
  assert.match(script,/return testHistoryReviewCandidate\(candidate\)/);
  assert.match(script,/HYPE_PROMOTION_ENABLED/);
});
