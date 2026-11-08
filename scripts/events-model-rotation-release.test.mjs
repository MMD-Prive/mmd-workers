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
