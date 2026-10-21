import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ROOT,VERSION_ROOT,ZONE,versionConfiguration} from './member-pages-code-only-release.mjs';
import {RECOVERY_TARGET as t,inspectUploadedRecovery,verifyRecoveryArtifact} from './member-pages-uploaded-recovery.mjs';
const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
const digest=x=>createHash('sha256').update(JSON.stringify(sort(x))).digest('hex');
function fixture(){
 const version=id=>({id,resources:{script:{etag:'private',handlers:['fetch']},script_runtime:{compatibility_date:'2026-06-20'},bindings:[{name:'SECRET',type:'secret_text',text:'private-fixture-secret'}]}});
 const baseline=version(t.baseline_version),uploaded=version(t.uploaded_version);
 const settings={observability:{enabled:true}},boundary={routes:[],schedules:[],subdomain:{enabled:true,previews_enabled:true}};
 const annotation={id:t.uploaded_version,annotations:{'workers/commit_sha':t.source_sha,'workers/message':`member-pages code-only source-sha=${t.source_sha}`}};
 const records=new Map([[ROOT+'/deployments',{deployments:[{id:t.baseline_deployment,strategy:'percentage',versions:[{version_id:t.baseline_version,percentage:100}]}]}],
 [ROOT+'/versions',{items:[{id:t.uploaded_version},{id:t.baseline_version}]}],[ROOT+'/versions/'+t.baseline_version,baseline],[ROOT+'/versions/'+t.uploaded_version,uploaded],
 [VERSION_ROOT+'/'+t.uploaded_version,annotation],[ROOT+'/script-settings',settings],[ROOT+'/schedules',{schedules:[]}],[ROOT+'/subdomain',boundary.subdomain],[`/zones/${ZONE}/workers/routes`,[]]]);
 const calls=[];
 const io={originalReceipt:{phase:'stopped',stopped_after:'uploaded-not-promoted',worker:'member-pages-worker',release_sha:t.original_release_sha,source_sha:t.source_sha,
 uploaded_version:t.uploaded_version,baseline_version:t.baseline_version,baseline_deployment:t.baseline_deployment,bundle_sha256:t.bundle_sha256,
 configuration_digest:digest(versionConfiguration(baseline)),settings_digest:digest(settings),boundary_digest:digest(boundary)},
 read:async(path,options)=>{assert.equal(options.method,'GET');if(options.query)assert.deepEqual(options.query,{include:'modules'});assert.ok(records.has(path));calls.push(path);return structuredClone(records.get(path));}};
 return {io,records,calls};
}
test('matching metadata alone blocks at artifact bytes; no execution authorization',async()=>{
 const f=fixture(),r=await inspectUploadedRecovery(f.io);
 assert.equal(r.state,'BLOCKED');assert.equal(r.can_promote,false);
 assert.equal(r.stage,'RECOVERY_ARTIFACT_CHECK');
 assert.doesNotMatch(JSON.stringify(r),/private-fixture|observability|bindings/);
});
for(const field of ['source_sha','release_sha','uploaded_version','baseline_version','baseline_deployment','bundle_sha256','configuration_digest','settings_digest','boundary_digest','stopped_after'])
 test(`invalid ${field} fails closed`,async()=>{const f=fixture();f.io.originalReceipt[field]='forged-secret';const r=await inspectUploadedRecovery(f.io);assert.equal(r.state,'BLOCKED');assert.equal(r.can_promote,false);assert.doesNotMatch(JSON.stringify(r),/forged-secret/);});
for(const path of [ROOT+'/deployments',ROOT+'/versions',ROOT+'/versions/'+t.baseline_version,ROOT+'/versions/'+t.uploaded_version,VERSION_ROOT+'/'+t.uploaded_version,ROOT+'/script-settings',ROOT+'/schedules',ROOT+'/subdomain',`/zones/${ZONE}/workers/routes`])
 test(`unavailable read ${path} blocks without retry or leaking exception`,async()=>{const f=fixture();const original=f.io.read;let failures=0;f.io.read=async(p,o)=>{if(p===path){failures++;throw Error('token=private-secret');}return original(p,o);};const r=await inspectUploadedRecovery(f.io);assert.equal(r.state,'BLOCKED');assert.equal(failures,1);assert.equal(r.can_promote,false);assert.doesNotMatch(JSON.stringify(r),/token|private-secret/);});
for(const [name,change] of [
 ['other latest',f=>f.records.get(ROOT+'/versions').items[0].id=t.baseline_version],
 ['other predecessor',f=>f.records.get(ROOT+'/versions').items[1].id=t.uploaded_version],
 ['active traffic split',f=>f.records.get(ROOT+'/deployments').deployments[0].versions[0].percentage=50],
 ['config drift',f=>f.records.get(ROOT+'/versions/'+t.uploaded_version).resources.script_runtime.compatibility_date='2025-01-01'],
 ['annotation drift',f=>f.records.get(VERSION_ROOT+'/'+t.uploaded_version).annotations['workers/commit_sha']='b'.repeat(40)],
 ['settings drift',f=>f.records.get(ROOT+'/script-settings').observability.enabled=false],
 ['boundary drift',f=>f.records.get(ROOT+'/subdomain').enabled=false],
 ])test(`${name} blocks`,async()=>{const f=fixture();change(f);assert.equal((await inspectUploadedRecovery(f.io)).state,'BLOCKED');});
test('caller readiness flags and matching claimed digest cannot authorize promotion',async()=>{const f=fixture();f.io.artifact_verified=true;f.io.owner_approved=true;f.io.actual_artifact_digest=t.bundle_sha256;assert.equal((await inspectUploadedRecovery(f.io)).can_promote,false);});
test('module has no executable mutation transport or CLI entry point',()=>{const s=readFileSync(new URL('./member-pages-uploaded-recovery.mjs',import.meta.url),'utf8');assert.doesNotMatch(s,/\bfetch\s*\(|method:\s*['"](?:POST|PUT|PATCH|DELETE)|process\.env|execFile|process\.argv/);});

const fixtureBytes=Buffer.from('fixture worker module');
const fixtureTarget={uploaded_version:t.uploaded_version,bundle_sha256:createHash('sha256').update(fixtureBytes).digest('hex')};
const artifact=()=>({id:t.uploaded_version,main_module:'worker.js',modules:[{name:'worker.js',content_type:'application/javascript+module',content_base64:fixtureBytes.toString('base64')}]});
test('byte verifier hashes decoded bytes for exact version/module',()=>{assert.equal(verifyRecoveryArtifact(artifact(),fixtureTarget),true);});
for(const [name,mutate] of [
 ['wrong version',v=>v.id='wrong'],['wrong main module',v=>v.main_module='other.js'],
 ['extra module',v=>v.modules.push({...v.modules[0]})],['missing modules',v=>delete v.modules],
 ['wrong content type',v=>v.modules[0].content_type='text/plain'],
 ['missing bytes',v=>delete v.modules[0].content_base64],
 ['invalid base64',v=>v.modules[0].content_base64='!!!!'],
 ['noncanonical base64',v=>v.modules[0].content_base64+='\n'],
 ['mismatched bytes',v=>v.modules[0].content_base64=Buffer.from('different').toString('base64')],
])test(`artifact ${name} fails closed`,()=>{const v=artifact();mutate(v);assert.throws(()=>verifyRecoveryArtifact(v,fixtureTarget));});
test('a matching claimed digest cannot replace bytes',()=>{const v=artifact();delete v.modules[0].content_base64;v.sha256=fixtureTarget.bundle_sha256;assert.throws(()=>verifyRecoveryArtifact(v,fixtureTarget));});
for(const body of [{},null,{schedules:null},{schedules:'not-array'}])test('missing/malformed schedules never defaults to empty',async()=>{const f=fixture();f.records.set(ROOT+'/schedules',body);const r=await inspectUploadedRecovery(f.io);assert.equal(r.stage,'RECOVERY_BOUNDARY_CHECK');assert.equal(r.state,'BLOCKED');});
