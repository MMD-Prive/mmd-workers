// Offline source transformation only. No credentials, network, upload or deployment.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export const BASELINE_SHA256 = 'd517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee';
export const CANDIDATE_SHA256 = '570b7a8e310aa0b6588260ece6139889e1b72c526149aa7510df3ca634a7ed3d';
export const MANIFEST_SHA256 = '1759810194c7ca2e463670003485ac511fec3329178c7ab25b13b76671053610';
export const digest = text => createHash('sha256').update(text).digest('hex');
export function applyEms16PrivateOverlay(code, bytes = readFileSync(new URL('./overlay-manifest.json', import.meta.url), 'utf8')) {
  assert.equal(digest(bytes), MANIFEST_SHA256, 'reviewed EMs16 private-only manifest changed');
  assert.equal(digest(code), BASELINE_SHA256, 'live baseline drift: separately review and repin, never overwrite Porto');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.baseline_sha256, BASELINE_SHA256);
  assert.equal(manifest.candidate_sha256, CANDIDATE_SHA256);
  assert.equal(manifest.replacements.length, 2);
  let candidate = code;
  for (const change of manifest.replacements) {
    assert.equal(change.section, 'compcard-daily');
    const index = candidate.indexOf(change.before);
    assert.ok(index >= 0 && candidate.indexOf(change.before, index + change.before.length) === -1, 'ambiguous source anchor');
    assert.equal(candidate.slice(0, index).match(/\/\/ src\/[^\n]+/g)?.at(-1), '// src/compcard-daily.js');
    candidate = candidate.replace(change.before, change.after);
  }
  assert.equal(digest(candidate), CANDIDATE_SHA256);
  let restored = candidate;
  for (const change of [...manifest.replacements].reverse()) restored = restored.replace(change.after, change.before);
  assert.equal(restored, code, 'unrelated runtime bytes changed');
  return candidate;
}
