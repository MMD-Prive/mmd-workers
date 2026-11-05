import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BASE_HASH,CANDIDATE_HASH,EDITS,applyEdits,reverseEdits,buildFloorCandidate,sha} from './build-floor-overlay.mjs';

// ---- fixture tests: always run, no deployed bytes needed ----
const fixture=['var a = 1;',EDITS[0].before,'function x(){',EDITS[1].before,'}','var z = 2;'].join('\n');

test('edits touch only the floor and the legacy 4.5K band, and reverse exactly',()=>{
 const {candidate,applied}=applyEdits(fixture);
 assert.notEqual(candidate,fixture);
 assert.equal(applied.length,2);
 assert.equal(reverseEdits(candidate,applied),fixture);
 const changed=candidate.split('\n').filter((line,i)=>line!==fixture.split('\n')[i]);
 assert.equal(changed.length,2);
 assert.match(candidate,/PUBLIC_MODEL_MIN_BUDGET_THB = 5000;/);
 assert.match(candidate,/min_thb: 5e3, max_thb: 1e4, label: "5000_10000"/);
 assert.doesNotMatch(candidate,/min_thb: 4500|label: "4500_10000"/);
});
test('a missing or ambiguous anchor fails closed',()=>{
 assert.throws(()=>applyEdits('nothing to patch'),/missing anchor/);
 assert.throws(()=>applyEdits(fixture+'\n'+EDITS[0].before),/ambiguous anchor/);
});
test('inverse drift is detected',()=>{
 const {candidate,applied}=applyEdits(fixture);
 assert.throws(()=>reverseEdits(candidate.replace('5000;','5001;'),applied),/inverse span drift/);
});
test('wrong baseline bytes are rejected before any edit',()=>{
 assert.throws(()=>buildFloorCandidate(Buffer.from(fixture)),/live SIGIL baseline drift/);
});

// ---- integration tests: run only when the exact deployed bytes are supplied ----
const baselinePath=process.env.SIGIL_BASELINE;
const live=baselinePath&&fs.existsSync(baselinePath)?fs.readFileSync(baselinePath):null;
const skip=live?false:'set SIGIL_BASELINE to the deployed runtime-index.js (sha256 '+BASE_HASH+') to run';

test('deployed baseline hash matches the pin',{skip},()=>{assert.equal(sha(live),BASE_HASH);});
test('candidate is reproducible, pinned and differs from the deployed bytes by exactly two lines',{skip},()=>{
 const {candidate,proof}=buildFloorCandidate(live);
 assert.equal(proof.candidate_sha256,CANDIDATE_HASH);
 const a=live.toString('utf8').split('\n'),b=candidate.toString('utf8').split('\n');
 assert.equal(a.length,b.length);
 assert.equal(a.filter((line,i)=>line!==b[i]).length,2);
 assert.equal(sha(Buffer.from(reverseEdits(candidate.toString('utf8'),proof.edits),'utf8')),BASE_HASH);
});
test('compiled candidate enforces the 5,000 floor on public search',{skip},async t=>{
 const {candidate}=buildFloorCandidate(live);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sigil-floor-'));const file=path.join(dir,'sigil-candidate.mjs');fs.writeFileSync(file,candidate);
 const worker=await import(pathToFileURL(file).href);
 assert.deepEqual(Object.keys(worker).sort(),['default','requestedScope']);
 const calls=[];
 t.mock.method(globalThis,'fetch',async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.hostname,'api.airtable.com');assert.equal(init.method||'GET','GET');calls.push(url);return Response.json({records:[]});});
 const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture'};
 const search=async query=>{const res=await worker.default.fetch(new Request('https://sigil.mmdbkk.com/sigil/api/models/search?scope=public&search_mode=search&'+query),env,{});assert.equal(res.status,200);return res.json();};
 for(const query of ['budget_thb=4499','budget_thb=4500','budget_thb=4999','budget_band=under_10000']){
  const before=calls.length;const data=await search(query);
  assert.deepEqual(data.errors,['public_budget_below_minimum'],query);assert.equal(calls.length,before,'no Airtable read for a rejected budget: '+query);
 }
 for(const query of ['budget_thb=5000','budget_band=5000_10000','budget_band=4500_10000','budget_band=10000_20000']){
  const data=await search(query);assert.notEqual(data.validation_error,true,query+' '+JSON.stringify(data));
 }
});
