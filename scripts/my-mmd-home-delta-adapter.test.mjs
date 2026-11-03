import test from 'node:test';
import assert from 'node:assert/strict';
import {HOME_SCHEMA,parseHomeManifest,releaseHomeDelta} from './my-mmd-home-delta-adapter.mjs';
import {sha256} from './care-back-november-policy-release.mjs';
const sha='a'.repeat(40),id='11111111-1111-4111-8111-111111111111';
const before='export default {};',after='export default {fetch(){return new Response("fixture")}};';
const manifest={schema:HOME_SCHEMA,source_sha:sha,worker:'member-pages-worker',baseline_version:id,baseline_deployment:id,main_module:'worker.js',modules:[{name:'worker.js',type:'esm',before_sha256:sha256(before),after_sha256:sha256(after),patches:[{id:'home',before,after,before_sha256:sha256(before),after_sha256:sha256(after)}]}]};
const raw=Buffer.from(JSON.stringify(manifest)),digest=sha256(raw);
test('Home manifest is separately named and exact-hash pinned',()=>{
 assert.equal(parseHomeManifest(raw,digest,'member-pages-worker').source_sha,sha);
 assert.throws(()=>parseHomeManifest(raw,'0'.repeat(64),'member-pages-worker'));
 assert.throws(()=>parseHomeManifest(raw,digest,'payments-worker'));
 const extra=Buffer.from(JSON.stringify({...manifest,unreviewed:true}));
 assert.throws(()=>parseHomeManifest(extra,sha256(extra),'member-pages-worker'));
});
function fixture(mode='execute-approved'){
 let calls=0;
 return {io:{mode,worker:'member-pages-worker',releaseSha:sha,manifestBytes:raw,expectedManifestHash:digest,expectedVersion:id,expectedDeployment:id,expectedModuleHash:sha256(before),sourceCheck:async()=>({source_sha:sha,manifest_sha256:digest}),call:async()=>{calls++;throw Error('provider must not be reached');}},env:{APPROVED_SHA:sha,APPROVED_SOURCE_SHA:sha,PRODUCTION_APPROVED:'true',PRODUCTION_ENVIRONMENT_NAME:'member-pages-code-only-owner'},calls:()=>calls};
}
test('missing real Owner evidence cannot be replaced by io.approve',async()=>{
 const f=fixture();f.io.approve=()=>true;
 await assert.rejects(releaseHomeDelta(f.io,f.env));assert.equal(f.calls(),0);
});
test('source proof, SHA and mode failures stop before provider reads/writes',async()=>{
 for(const fault of ['source','sha','mode','environment','approval']){
  const f=fixture(fault==='source'?'inspect':'execute-approved');
  if(fault==='source')f.io.sourceCheck=async()=>({source_sha:'b'.repeat(40),manifest_sha256:digest});
  if(fault==='sha')f.env.APPROVED_SOURCE_SHA='b'.repeat(40);
  if(fault==='mode')f.io.mode='promote-reviewed-upload';
  if(fault==='environment')f.env.PRODUCTION_ENVIRONMENT_NAME='other';
  if(fault==='approval')f.env.PRODUCTION_APPROVED='false';
  await assert.rejects(releaseHomeDelta(f.io,f.env));assert.equal(f.calls(),0);
 }
});
test('inspect uses inherited parity guards and never performs writes',async()=>{
 for(const drift of [false,true]){
  const f=fixture('inspect');let reads=0,posts=0;
  const root='/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/scripts/member-pages-worker';
  const config={id,resources:{script:{handlers:['fetch']},script_runtime:{compatibility_date:'2026-06-20'},bindings:[]}};
  const deployment={id,strategy:'percentage',versions:[{version_id:id,percentage:100}]};
  f.io.call=async(path,init={})=>{
   if(init.method&&init.method!=='GET'){posts++;throw Error('unexpected write');}
   reads++;
   if(path.endsWith('/deployments'))return {deployments:[deployment]};
   if(path===root+'/versions')return {items:[{id}]};
   if(path===root+'/versions/'+id)return config;
   if(path.endsWith('?include=modules'))return {id,main_module:'worker.js',modules:[{name:'worker.js',content_base64:Buffer.from(before).toString('base64')}]};
   if(path.endsWith('/script-settings'))return {logpush:drift&&reads>10};
   if(path.endsWith('/routes'))return [];
   if(path.endsWith('/schedules'))return {schedules:[]};
   if(path.endsWith('/subdomain'))return {enabled:false};
   throw Error('unexpected read');
  };
  if(drift)await assert.rejects(releaseHomeDelta(f.io,f.env),/script settings changed/);
  else assert.equal((await releaseHomeDelta(f.io,f.env)).phase,'inspected');
  assert.equal(posts,0);
 }
});
