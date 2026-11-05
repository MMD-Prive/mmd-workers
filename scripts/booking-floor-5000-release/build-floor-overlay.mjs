// Offline only. Builds the Public-floor-5000 candidate by patching the exact deployed SIGIL bytes.
// No network, no Cloudflare calls, no deployment. Pure string edits with exact-one-anchor guards.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const sha=value=>createHash('sha256').update(value).digest('hex');
// Deployed sigil-booking-worker/runtime-index.js, read-only capture 2026-11-06 (= booking-identity-release candidate).
export const BASE_HASH='4ce2dd1c1573fa1d5babced3764b1c5c7c77e024c24303b7ba9534fd3f5b19b0';
export const BASE_BYTES=239064;
export const CANDIDATE_HASH='cc092790b18521a8ee78c08ddd29134b8a9050a07a0026ed85bf67f69ac64b68';

export const EDITS=Object.freeze([
 {label:'Public floor 4500 -> 5000',
  before:'var PUBLIC_MODEL_MIN_BUDGET_THB = 4500;',
  after:'var PUBLIC_MODEL_MIN_BUDGET_THB = 5000;'},
 {label:'Legacy 4.5K band tokens normalize to the 5000_10000 band',
  before:'  if (["4500_10000", "4_5_10", "4_5k_10k"].includes(band)) return { provided: true, min_thb: 4500, max_thb: 1e4, label: "4500_10000" };',
  after:'  if (["4500_10000", "4_5_10", "4_5k_10k"].includes(band)) return { provided: true, min_thb: 5e3, max_thb: 1e4, label: "5000_10000" };'},
]);

export function applyEdits(source,edits=EDITS){
 let candidate=source;const applied=[];
 for(const edit of edits){
  const at=candidate.indexOf(edit.before);
  assert.ok(at>=0,'missing anchor: '+edit.label);
  assert.equal(candidate.indexOf(edit.before,at+edit.before.length),-1,'ambiguous anchor: '+edit.label);
  candidate=candidate.slice(0,at)+edit.after+candidate.slice(at+edit.before.length);
  applied.push({label:edit.label,before:edit.before,after:edit.after,candidate_start:at,candidate_end:at+edit.after.length});
 }
 return {candidate,applied};
}
export function reverseEdits(candidate,applied){
 let source=candidate;
 for(const edit of [...applied].reverse()){
  assert.equal(source.slice(edit.candidate_start,edit.candidate_end),edit.after,'inverse span drift: '+edit.label);
  source=source.slice(0,edit.candidate_start)+edit.before+source.slice(edit.candidate_end);
 }
 return source;
}
export function buildFloorCandidate(baseline,{expectedCandidate=CANDIDATE_HASH}={}){
 const bytes=Buffer.isBuffer(baseline)?baseline:Buffer.from(baseline);
 assert.equal(sha(bytes),BASE_HASH,'live SIGIL baseline drift');
 assert.equal(bytes.length,BASE_BYTES,'live baseline byte count');
 const text=bytes.toString('utf8');
 assert.ok(Buffer.from(text,'utf8').equals(bytes),'baseline must be valid UTF-8');
 const {candidate,applied}=applyEdits(text);
 const inverse=reverseEdits(candidate,applied);
 assert.equal(inverse,text,'candidate must reverse exactly to the live baseline');
 // The edits may only touch the floor, the legacy band and nothing else.
 assert.equal(applied.length,2);
 const out=Buffer.from(candidate,'utf8');
 const proof={baseline_sha256:BASE_HASH,candidate_sha256:sha(out),inverse_sha256:sha(Buffer.from(inverse,'utf8')),baseline_bytes:bytes.length,candidate_bytes:out.length,edits:applied};
 assert.equal(proof.candidate_sha256,expectedCandidate,'unreviewed candidate');
 return {candidate:out,proof};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const args=process.argv.slice(2);const arg=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];};
 if(!arg('--baseline')||!arg('--output-dir'))throw Error('Usage: build-floor-overlay.mjs --baseline <deployed runtime-index.js> --output-dir <dir outside the repo>');
 const out=resolve(arg('--output-dir'));fs.mkdirSync(out,{recursive:true});
 const {candidate,proof}=buildFloorCandidate(fs.readFileSync(resolve(arg('--baseline'))));
 fs.writeFileSync(resolve(out,'sigil-candidate.mjs'),candidate,{flag:'wx'});
 fs.writeFileSync(resolve(out,'sigil-floor-proof.json'),JSON.stringify(proof,null,2),{flag:'wx'});
 console.log(JSON.stringify({baseline_sha256:proof.baseline_sha256,candidate_sha256:proof.candidate_sha256,edits:proof.edits.map(e=>e.label)},null,2));
}
