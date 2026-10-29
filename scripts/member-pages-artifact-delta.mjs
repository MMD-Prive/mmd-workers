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

export const COMPANION_BASE_VERSION = '641cea01-6986-45d4-be33-2346bd6c28fb';
export const COMPANION_BASE_DEPLOYMENT = 'e6eb7c7a-fe50-45fd-b7a2-8f1fdefcc16c';
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

export const COMPANION_MAIN_MODULE='tmib-release-entry.mjs';
export const COMPANION_WRAPPER_SHA256='c596373634775859181796ef3ac36865921541b192ea52ba09931a40505bf789';
// Inventory validation is reusable for small synthetic fixtures; release callers
// always supply the fixed reviewed hashes below.
export function verifyModuleInventory(version, expectedId, expectedMain, hashes) {
  assert.equal(version?.id,expectedId,'artifact version drift');
  assert.equal(version.main_module,expectedMain,'artifact main module drift');
  assert.ok(Array.isArray(version.modules));
  assert.deepEqual(version.modules.map(m=>m.name).sort(),Object.keys(hashes).sort(),'artifact module inventory drift');
  return version.modules.map(module=>{
    assert.ok(typeof module.content_base64==='string' && module.content_base64.length>0);
    const bytes=Buffer.from(module.content_base64,'base64');
    assert.equal(hash(bytes),hashes[module.name],'artifact module bytes drift');
    return {name:module.name,bytes};
  });
}
export function decodeBaselineModule(version) {
  return verifyModuleInventory(version,COMPANION_BASE_VERSION,COMPANION_MAIN_MODULE,{
    'runtime-index.js':ACTIVE_ARTIFACT_SHA256,
    [COMPANION_MAIN_MODULE]:COMPANION_WRAPPER_SHA256,
  });
}
export function buildReviewedCompanionModules(modules) {
  return modules.map(module=>({name:module.name,bytes:module.name==='runtime-index.js'
    ? buildReviewedCompanionArtifact(module.bytes) : module.bytes}));
}
export function verifyUploadedCompanionModules(version,id) {
  return verifyModuleInventory(version,id,COMPANION_MAIN_MODULE,{
    'runtime-index.js':COMPANION_CANDIDATE_SHA256,
    [COMPANION_MAIN_MODULE]:COMPANION_WRAPPER_SHA256,
  });
}
