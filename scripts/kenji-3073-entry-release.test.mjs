import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sha} from './kenji-3073-entry-delta.mjs';
import {ROOT,loadManifest,applyManifest,runEntryRelease,createEntryTransport} from './kenji-3073-entry-release.mjs';
import {versionConfiguration} from './admin-current-session-code-only.mjs';
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const hash=v=>sha(JSON.stringify(sort(v)));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(mode){
 const before='export default {fetch(){return new Response("old")}};',after=before.replace('old','new');
 const make=id=>({id,resources:{script:{handlers:['fetch']},script_runtime:{compatibility_date:'2026-07-02',migration_tag:'existing-v3'},bindings:[{name:'LINE_KENJI_MODEL_ENABLED',type:'plain_text',text:'false'}]}});
 const baseline=make(id(1)),candidate={...make(id(2)),annotations:{'workers/commit_sha':'3f2acbc2a3f359163f3ec0c7bd0524a88a359b92'}};const settings={observability:{enabled:true}};
 const m={...loadManifest(),baseline_version:id(1),baseline_deployment:id(3),baseline_sha256:sha(before),candidate_sha256:sha(after),configuration_sha256:hash(versionConfiguration(baseline)),settings_sha256:hash(settings),patches:[{before,after}]};
 let latest=mode==='promote'?id(2):id(1),deployment={id:id(3),strategy:'percentage',versions:[{version_id:id(1),percentage:100}]},approvals=0;
 const writes=[],saves=[];
 const io={mode,manifest:m,sha:'a'.repeat(40),candidateVersion:id(2),approve:async()=>{approvals++;},save:x=>saves.push(x),call:async(path,init={})=>{
  if(init.method==='POST') {writes.push(path);if(path.endsWith('/versions?bindings_inherit=strict')){assert(init.body instanceof FormData);const meta=JSON.parse(init.body.get('metadata'));assert.deepEqual(meta.bindings,[{name:'LINE_KENJI_MODEL_ENABLED',type:'inherit'}]);assert(!meta.vars);latest=id(2);return {id:latest};}if(path.endsWith('/deployments')){const split=JSON.parse(init.body);assert.deepEqual(split.versions,[{version_id:id(1),percentage:99},{version_id:id(2),percentage:1}]);deployment={id:id(4),...split};return deployment;}throw Error('unexpected write');}
  if(path===ROOT+'/deployments')return {deployments:[deployment]};
  if(path===ROOT+'/versions')return {items:[{id:latest}]};
  if(path===ROOT+'/script-settings')return settings;
  if(path===ROOT+'/versions/'+id(1))return baseline;
  if(path===ROOT+'/versions/'+id(2))return candidate;
  if(path.endsWith('?include=modules')){const v=path.includes(id(1))?id(1):id(2);return {id:v,modules:[{name:'worker.js',content_base64:Buffer.from(v===id(1)?before:after).toString('base64')}]};}
  throw Error('unexpected read');
 }};return {io,writes,saves,settings,candidate,baseline,get approvals(){return approvals;}};
}
for(const [mode,expected] of [['inspect',[]],['upload',[ROOT+'/versions?bindings_inherit=strict']],['promote',[ROOT+'/deployments']]])test(`${mode} remains a separate Owner-guarded phase`,async()=>{
 const f=fixture(mode);const r=await runEntryRelease(f.io);assert.deepEqual(f.writes,expected);assert(f.approvals>=(mode==='inspect'?1:2));assert.equal(r.phase,mode==='inspect'?'inspection-complete':mode==='upload'?'upload-readback-complete':'complete');
 if(mode==='upload')assert(f.saves.some(x=>x.phase==='upload-attempted-outcome-unknown'));
});
for(const issue of ['approval','config','settings','bytes','latest','annotation'])test(`fail closed before write: ${issue}`,async()=>{
 const f=fixture('promote');const original=f.io.call;
 if(issue==='approval')f.io.approve=async()=>{throw Error('denied');};
 if(issue==='config')f.baseline.resources.bindings[0].text='true';
 if(issue==='settings')f.settings.observability.enabled=false;
 if(issue==='annotation')f.candidate.annotations['workers/commit_sha']='b'.repeat(40);
 if(issue==='bytes'||issue==='latest')f.io.call=async(path,init)=>{const r=await original(path,init);if(issue==='bytes'&&path.endsWith('?include=modules')&&path.includes(id(2)))r.modules[0].content_base64=Buffer.from('wrong').toString('base64');if(issue==='latest'&&path===ROOT+'/versions')r.items[0].id=id(9);return r;};
 await assert.rejects(runEntryRelease(f.io));assert.equal(f.writes.length,0);
});
test('transport forbids settings/secrets/routes and cross-mode writes without requests',async()=>{
 let calls=0;for(const mode of ['inspect','upload','promote']){const call=createEntryTransport('synthetic',mode,async()=>{calls++;throw Error('not reached');});for(const path of [ROOT+'/settings',ROOT+'/secrets','/zones/fixture/workers/routes'])await assert.rejects(call(path,{method:'PATCH'}));if(mode!=='upload')await assert.rejects(call(ROOT+'/versions?bindings_inherit=strict',{method:'POST'}));if(mode!=='promote')await assert.rejects(call(ROOT+'/deployments',{method:'POST'}));}assert.equal(calls,0);
});
test('unknown upload outcome is recorded once and never retried or promoted',async()=>{
 const f=fixture('upload'),original=f.io.call;let posts=0;
 f.io.call=async(path,init)=>{if(init?.method==='POST'){posts++;throw Error('connection lost');}return original(path,init);};
 await assert.rejects(runEntryRelease(f.io));assert.equal(posts,1);assert.equal(f.saves.at(-1).phase,'upload-attempted-outcome-unknown');
});
test('wrong version-specific bytes after upload cannot trigger promotion',async()=>{
 const f=fixture('upload'),original=f.io.call;
 f.io.call=async(path,init)=>{const r=await original(path,init);if(path.endsWith('?include=modules')&&path.includes(id(2)))r.modules[0].content_base64=Buffer.from('wrong bytes').toString('base64');return r;};
 await assert.rejects(runEntryRelease(f.io),/version-specific bytes mismatch/);assert.deepEqual(f.writes,[ROOT+'/versions?bindings_inherit=strict']);assert.equal(f.saves.at(-1).phase,'uploaded-not-promoted');
});
test('pinned manifest bytes and source artifact cannot silently drift',()=>{const m=loadManifest();assert.equal(m.patches.length,4);assert.throws(()=>applyManifest(Buffer.from('wrong')),/baseline artifact drift/);});
test('canary verifies inspect before upload and allocates exactly 99/1',async()=>{
 const f=fixture('canary'), original=f.io.call;
 f.io.call=async(path,init)=>{if(init?.method==='POST')assert(f.saves.some(x=>x.phase==='inspection-complete'));return original(path,init);};
 const receipt=await runEntryRelease(f.io);assert.equal(receipt.phase,'complete');assert.deepEqual(receipt.traffic.map(x=>x.percentage),[99,1]);
 assert.deepEqual(f.writes,[ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments']);
});
test('failed inspect records safe checkpoint and cannot upload in canary mode',async()=>{
 const f=fixture('canary');f.settings.observability.enabled=false;
 await assert.rejects(runEntryRelease(f.io),/settings drift/);assert.deepEqual(f.writes,[]);assert.equal(f.saves.at(-1).check,'baseline-config');
});
test('workflow preserves existing Owner gate and cannot mutate production on PR',()=>{
 const w=fs.readFileSync(new URL('../.github/workflows/kenji-entry-delta-release.yml',import.meta.url),'utf8');
 assert.match(w,/options: \[inspect, upload, promote, canary\]/);assert.match(w,/uses: \.\/\.github\/workflows\/admin-production-approval.yml/);assert.match(w,/environment: mmd-production-mutation/);assert.match(w,/needs: \[contracts, production-approval\]/);
 assert.equal((w.match(/if: github.event_name == 'workflow_dispatch'.*github.ref == 'refs\/heads\/main'.*github.actor == 'mmdprive'.*github.run_attempt == 1.*inputs.production_approved == true.*inputs.approved_sha == github.sha/g)||[]).length,2);
 assert.doesNotMatch(w,/wrangler deploy|route-sync|secrets: inherit|contents: write/);
 const adapter=fs.readFileSync(new URL('./kenji-3073-entry-release.mjs',import.meta.url),'utf8');assert.match(adapter,/verifyProductionApproval/);assert.match(adapter,/inspectEnvironment/);assert.match(adapter,/validateSourceState/);assert.match(adapter,/git\('ls-files'/);assert.match(adapter,/version-specific bytes mismatch/);assert.match(adapter,/GITHUB_RUN_ATTEMPT,'1'/);
});
