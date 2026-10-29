import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {readFileSync} from 'node:fs';
export const ACTIVE_ARTIFACT_SHA256 = 'e199ad27ed62ca0acc68892f1af7ffddf3074c3a4d587283e21fc9f00767799f';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Local candidate construction only. No transport, upload or promotion.
export function applyReviewedArtifactDelta(baseline, edits, expectedBaselineHash = ACTIVE_ARTIFACT_SHA256) {
  assert.ok(Buffer.isBuffer(baseline));
  assert.equal(hash(baseline), expectedBaselineHash, 'active artifact drift');
  assert.ok(Array.isArray(edits) && edits.length > 0);
  const spans = edits.map(({before, after, beforeHash, afterHash}) => {
    assert.ok(Buffer.isBuffer(before) && before.length && Buffer.isBuffer(after));
    assert.equal(hash(before), beforeHash, 'reviewed before bytes drift');
    assert.equal(hash(after), afterHash, 'reviewed after bytes drift');
    const start = baseline.indexOf(before);
    assert.ok(start >= 0 && baseline.indexOf(before, start + 1) === -1, 'ambiguous artifact anchor');
    return {start, end:start + before.length, after};
  }).sort((a,b) => a.start-b.start);
  let end=0; const parts=[];
  for (const span of spans) {
    assert.ok(span.start >= end, 'overlapping artifact edits');
    parts.push(baseline.subarray(end,span.start),span.after); end=span.end;
  }
  parts.push(baseline.subarray(end));
  return Buffer.concat(parts);
}

export const COMPANION_BASE_VERSION = 'd81d1bad-a225-43e5-b731-3a89651b165d';
export const COMPANION_BASE_DEPLOYMENT = '863698ec-9db5-48b0-9558-3a9263666573';
export const COMPANION_CANDIDATE_SHA256 = '026d466d8249fcae4d53bff08b2fdc7e8910d9930ff1fc330327b68117c008f5';
export function buildReviewedCompanionArtifact(baseline) {
  const raw = readFileSync(new URL('./member-pages-companion-delta.json',import.meta.url));
  assert.equal(hash(raw),'4c7bb4e8a7963a377922458d7d604591606e6ff4f79f93e4be907d2e23615e3a','reviewed manifest drift');
  const manifest=JSON.parse(raw);
  assert.equal(manifest.baselineSha256,ACTIVE_ARTIFACT_SHA256);
  assert.equal(manifest.candidateSha256,COMPANION_CANDIDATE_SHA256);
  assert.equal(manifest.edits.length,8);
  const candidate=applyReviewedArtifactDelta(baseline,manifest.edits.map(e=>({
    ...e,before:Buffer.from(e.before,'base64'),after:Buffer.from(e.after,'base64'),
  })));
  assert.equal(hash(candidate),COMPANION_CANDIDATE_SHA256,'candidate artifact drift');
  return candidate;
}
export function decodeBaselineModule(version) {
  assert.equal(version?.id,COMPANION_BASE_VERSION,'baseline module version drift');
  assert.equal(version.modules?.length,1,'single module baseline required');
  const module=version.modules[0];
  assert.equal(module.name,version.main_module,'main module identity mismatch');
  assert.ok(typeof module.content_base64==='string' && module.content_base64.length>0);
  const bytes=Buffer.from(module.content_base64,'base64');
  assert.equal(hash(bytes),ACTIVE_ARTIFACT_SHA256,'active artifact drift');
  return bytes;
}
