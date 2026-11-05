import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {join} from 'node:path';
import {sha,SOURCE_SHA,validatePinnedEntrySource} from './kenji-3073-entry-delta.mjs';
import {activeVersion,versionConfiguration,uploadMetadata,validateSourceState} from './admin-current-session-code-only.mjs';
import {verifyProductionApproval} from './admin-production-approval.mjs';
import {inspectEnvironment} from './admin-production-validation.mjs';
export const ROOT='/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/scripts/member-dashboard-chat-worker';
const artifactRoot=ROOT.replace('/scripts/','/workers/');
export const MANIFEST_SHA='8970b2f3567f42bbf4f6d24997708da1ec2a6816c6be596233a7129af72665a7';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const hash=v=>sha(JSON.stringify(sort(v)));
export function loadManifest(){const raw=fs.readFileSync(new URL('./kenji-3073-entry-manifest.json',import.meta.url));assert.equal(sha(raw),MANIFEST_SHA,'tracked manifest drift');const m=JSON.parse(raw);assert.equal(m.source_sha,SOURCE_SHA);assert.equal(m.worker,'member-dashboard-chat-worker');assert.equal(m.patches.length,4);for(const p of m.patches){assert.equal(sha(p.before),p.before_sha256);assert.equal(sha(p.after),p.after_sha256);}return m;}
export function applyManifest(bytes,m=loadManifest()){
 assert.equal(sha(bytes),m.baseline_sha256,'baseline artifact drift');let code=bytes.toString();
 for(const p of m.patches){assert.equal(code.split(p.before).length,2,'ambiguous patch');code=code.replace(p.before,p.after);}
 assert.equal(sha(code),m.candidate_sha256,'candidate drift');let reverse=code;
 for(const p of [...m.patches].reverse()){assert.equal(reverse.split(p.after).length,2);reverse=reverse.replace(p.after,p.before);}assert.equal(reverse,bytes.toString(),'unrelated Overlay bytes changed');return Buffer.from(code);
}
export function createEntryTransport(token,mode,request=fetch){
 assert(token);assert(['inspect','upload','promote'].includes(mode));
 return async(path,{method='GET',body}={})=>{
  const read=method==='GET'&&(path===ROOT+'/deployments'||path===ROOT+'/versions'||path===ROOT+'/script-settings'||path.startsWith(ROOT+'/versions/')&&UUID.test(path.slice((ROOT+'/versions/').length))||path.startsWith(artifactRoot+'/versions/')&&UUID.test(path.slice((artifactRoot+'/versions/').length).split('?')[0])&&path.endsWith('?include=modules'));
  const write=method==='POST'&&(mode==='upload'&&path===ROOT+'/versions?bindings_inherit=strict'||mode==='promote'&&path===ROOT+'/deployments');
  assert(read||write,'outside scoped transport');
  let response;try{response=await request('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'content-type':'application/json'})},body,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error('transport failed; stop without retry');}
  assert(response.ok,'Cloudflare response failed; stop without retry');const result=await response.json();assert.equal(result.success,true,'Cloudflare operation failed; stop without retry');return result.result;
 };
}
export async function runEntryRelease(io){
 const m=io.manifest||loadManifest();assert(['inspect','upload','promote'].includes(io.mode));await io.approve();
 const receipt={phase:'preflight',mode:io.mode,source_sha:SOURCE_SHA,tooling_sha:io.sha,manifest_sha256:MANIFEST_SHA,candidate_sha256:m.candidate_sha256};
 const save=phase=>{receipt.phase=phase;io.save({...receipt});};
 const call=io.call;
 const moduleBytes=async id=>{assert(UUID.test(id));const a=await call(artifactRoot+'/versions/'+id+'?include=modules');assert.equal(a.id,id);assert.equal(a.modules.length,1);assert.equal(a.modules[0].name,'worker.js');const b=Buffer.from(a.modules[0].content_base64,'base64');assert(b.length>0&&b.length<20*1024*1024);return b;};
 const snapshot=async latest=>{
  const d=(await call(ROOT+'/deployments')).deployments[0];assert.equal(d.id,m.baseline_deployment,'deployment drift');assert.equal(activeVersion(d),m.baseline_version,'active drift');
  assert.equal((await call(ROOT+'/versions')).items[0].id,latest,'latest upload drift');
  const v=await call(ROOT+'/versions/'+m.baseline_version);assert.equal(hash(versionConfiguration(v)),m.configuration_sha256,'configuration drift');
  assert.equal(hash(await call(ROOT+'/script-settings')),m.settings_sha256,'settings drift');
  const flag=v.resources.bindings.find(x=>x.name==='LINE_KENJI_MODEL_ENABLED');assert.equal(flag?.type,'plain_text');assert.equal(flag.text,'false','model must stay OFF');return v;
 };
 const latest=io.mode==='promote'?io.candidateVersion:m.baseline_version;if(io.mode==='promote'){assert(UUID.test(latest||''));assert.notEqual(latest,m.baseline_version);}
 const baseline=await snapshot(latest);const candidate=applyManifest(await moduleBytes(m.baseline_version),m);
 execFileSync(process.execPath,['--input-type=module','--check'],{input:candidate,stdio:['pipe','pipe','pipe']});
 const exact=async id=>{const v=await call(ROOT+'/versions/'+id);assert.equal(v.id,id);assert.equal(hash(versionConfiguration(v)),m.configuration_sha256,'candidate config mismatch');assert.equal(sha(await moduleBytes(id)),m.candidate_sha256,'version-specific bytes mismatch');return v;};
 if(io.mode==='inspect'){await snapshot(latest);save('inspection-complete');return receipt;}
 await io.approve();await snapshot(latest);
 if(io.mode==='upload'){
  const form=new FormData();form.set('metadata',JSON.stringify(uploadMetadata(baseline,SOURCE_SHA)));form.set('worker.js',new Blob([candidate],{type:'application/javascript+module'}),'worker.js');
  save('upload-attempted-outcome-unknown');const uploaded=await call(ROOT+'/versions?bindings_inherit=strict',{method:'POST',body:form});assert(UUID.test(uploaded?.id||'')&&uploaded.id!==m.baseline_version,'ambiguous upload; do not retry');
  receipt.candidate_version=uploaded.id;save('uploaded-not-promoted');await exact(uploaded.id);await snapshot(uploaded.id);save('upload-readback-complete');return receipt;
 }
 const v=await exact(latest);assert.equal(v.annotations?.['workers/commit_sha']||v.metadata?.annotations?.['workers/commit_sha'],SOURCE_SHA,'candidate source annotation mismatch');
 await io.approve();await snapshot(latest);receipt.candidate_version=latest;save('promotion-attempted-outcome-unknown');
 const promoted=await call(ROOT+'/deployments',{method:'POST',body:JSON.stringify({strategy:'percentage',versions:[{version_id:latest,percentage:100}]})});assert(UUID.test(promoted?.id||''),'ambiguous promotion; do not retry');
 receipt.deployment=promoted.id;save('promoted-readback-pending');const d=(await call(ROOT+'/deployments')).deployments[0];assert.equal(d.id,promoted.id);assert.equal(activeVersion(d),latest);await exact(latest);assert.equal(hash(await call(ROOT+'/script-settings')),m.settings_sha256);save('complete');return receipt;
}
async function main(){
 loadManifest();validatePinnedEntrySource();if(process.argv[2]==='--check-source')return;
 const env=process.env,mode=env.MODE;assert.equal(env.PRODUCTION_APPROVED,'true');assert.equal(env.GITHUB_ACTOR,'mmdprive');assert.equal(env.GITHUB_RUN_ATTEMPT,'1','no automatic rerun');
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 const approve=async()=>{await verifyProductionApproval(env);assert.equal((await inspectEnvironment(env)).ready,true);validateSourceState({expectedSha:env.GITHUB_SHA,headSha:git('rev-parse','HEAD'),dirtyStatus:git('status','--porcelain=v1','--untracked-files=all')});assert.equal(git('ls-files','scripts/kenji-3073-entry-manifest.json'),'scripts/kenji-3073-entry-manifest.json');assert.equal(git('merge-base',SOURCE_SHA,env.GITHUB_SHA),SOURCE_SHA);};
 const result=await runEntryRelease({mode,sha:env.GITHUB_SHA,candidateVersion:env.CANDIDATE_VERSION,approve,call:createEntryTransport(env.CLOUDFLARE_API_TOKEN,mode),save:r=>fs.writeFileSync(join(env.RUNNER_TEMP||'/tmp','kenji-3073-entry-receipt.json'),JSON.stringify(r,null,2),{mode:0o600})});console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Kenji entry release stopped; inspect receipt before any further action. No automatic retry.');process.exitCode=1;});
