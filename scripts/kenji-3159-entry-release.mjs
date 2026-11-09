import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const sha = value => createHash('sha256').update(value).digest('hex');
const SOURCE_SHA = 'c41681a99b087aceb3638e64f059fed4c85073d6';
function validatePinnedEntrySource() {
 for (const file of ['kenji-entry-topics.mjs','kenji-reply-category-gate.mjs']) {
  const path = 'member-dashboard-chat-worker/src/' + file;
  const source = fs.readFileSync(path, 'utf8');
  assert.equal(source, execFileSync('git', ['show', SOURCE_SHA + ':' + path], {encoding:'utf8'}), 'entry source drift');
 }
}
import {activeVersion,versionConfiguration,uploadMetadata,validateSourceState} from './admin-current-session-code-only.mjs';
import {verifyProductionApproval} from './admin-production-approval.mjs';
import {inspectEnvironment} from './admin-production-validation.mjs';
export const ROOT='/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/scripts/member-dashboard-chat-worker';
const baselineModule = 'guide-notification-entry.js';
const candidateModule = baselineModule;
const artifactRoot=ROOT.replace('/scripts/','/workers/');
export const MANIFEST_SHA='f965bc4ebd054d0933483c2f284538d85f6d3f449f6ef0a647883e4c0b4f21f6';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const hash=v=>sha(JSON.stringify(sort(v)));
const modes=['inspect','upload','promote','deploy'];
export function loadManifest(){const raw=fs.readFileSync(new URL('./kenji-3159-entry-manifest.json',import.meta.url));assert.equal(sha(raw),MANIFEST_SHA,'tracked manifest drift');const m=JSON.parse(raw);assert.equal(m.source_sha,SOURCE_SHA);assert.equal(m.worker,'member-dashboard-chat-worker');assert.equal(m.patches.length,3);for(const p of m.patches){assert.equal(sha(p.before),p.before_sha256);assert.equal(sha(p.after),p.after_sha256);}return m;}
export function applyManifest(bytes,m=loadManifest()){
 assert.equal(sha(bytes),m.baseline_sha256,'baseline artifact drift');let code=bytes.toString();
 for(const p of m.patches){assert.equal(code.split(p.before).length,2,'ambiguous patch');code=code.replace(p.before,()=>p.after);}
 assert.equal(sha(code),m.candidate_sha256,'candidate drift');let reverse=code;
 for(const p of [...m.patches].reverse()){assert.equal(reverse.split(p.after).length,2);reverse=reverse.replace(p.after,()=>p.before);}assert.equal(reverse,bytes.toString(),'unrelated Overlay bytes changed');return Buffer.from(code);
}
export function createEntryTransport(token,mode,request=fetch){
 assert(token);assert(modes.includes(mode));
 return async(path,{method='GET',body}={})=>{
  const read=method==='GET'&&(path===ROOT+'/deployments'||path===ROOT+'/versions'||path===ROOT+'/script-settings'||path.startsWith(ROOT+'/versions/')&&UUID.test(path.slice((ROOT+'/versions/').length))||path.startsWith(artifactRoot+'/versions/')&&UUID.test(path.slice((artifactRoot+'/versions/').length).split('?')[0])&&path.endsWith('?include=modules'));
  const write=method==='POST'&&(['upload','deploy'].includes(mode)&&path===ROOT+'/versions?bindings_inherit=strict'||['promote','deploy'].includes(mode)&&path===ROOT+'/deployments');
  assert(read||write,'outside scoped transport');
  let response;try{response=await request('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'content-type':'application/json'})},body,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw Error('transport failed; stop without retry');}
  assert(response.ok,`Cloudflare HTTP ${response.status}; stop without retry`);const result=await response.json();assert.equal(result.success,true,'Cloudflare operation failed; stop without retry');return result.result;
 };
}
export async function runEntryRelease(io){
 const m=io.manifest||loadManifest();assert(modes.includes(io.mode));
 const receipt={phase:'preflight',mode:io.mode,source_sha:SOURCE_SHA,tooling_sha:io.sha,manifest_sha256:MANIFEST_SHA,candidate_sha256:m.candidate_sha256};
 const save=phase=>{receipt.phase=phase;io.save({...receipt});};
 const stage=phase=>{receipt.check=phase;save(receipt.phase);};
 stage('owner-and-source');await io.approve(stage);
 const call=io.call;
 const moduleBytes=async (id, expectedName)=>{assert(UUID.test(id));const a=await call(artifactRoot+'/versions/'+id+'?include=modules');assert.equal(a.id,id);assert.equal(a.modules.length,1);assert.equal(a.modules[0].name,expectedName,'unexpected module name');const b=Buffer.from(a.modules[0].content_base64,'base64');assert(b.length>0&&b.length<20*1024*1024);return b;};
 const snapshot=async latest=>{
  stage('active-deployment');
  const d=(await call(ROOT+'/deployments')).deployments[0];assert.equal(d.id,m.baseline_deployment,'deployment drift');assert.equal(activeVersion(d),m.baseline_version,'active drift');
  stage('latest-version');
  assert.equal((await call(ROOT+'/versions')).items[0].id,latest,'latest upload drift');
  stage('baseline-config');
  const v=await call(ROOT+'/versions/'+m.baseline_version);assert.equal(hash(versionConfiguration(v)),m.configuration_sha256,'configuration drift');
  assert.equal(hash(await call(ROOT+'/script-settings')),m.settings_sha256,'settings drift');
  const flag=v.resources.bindings.find(x=>x.name==='LINE_KENJI_MODEL_ENABLED');assert.equal(flag?.type,'plain_text');assert.equal(flag.text,'false','model must stay OFF');return v;
 };
 let latest=io.mode==='promote'?io.candidateVersion:m.baseline_version;if(io.mode==='promote'){assert(UUID.test(latest||''));assert.notEqual(latest,m.baseline_version);}
 const baseline=await snapshot(latest);
 stage('baseline-artifact-read');
 const baselineBytes=await moduleBytes(m.baseline_version,baselineModule);
 stage('baseline-overlay');
 const candidate=applyManifest(baselineBytes,m);
 stage('candidate-syntax');
 execFileSync(process.execPath,['--input-type=module','--check'],{input:candidate,stdio:['pipe','pipe','pipe']});
 const exact=async id=>{const v=await call(ROOT+'/versions/'+id);assert.equal(v.id,id);assert.equal(hash(versionConfiguration(v)),m.configuration_sha256,'candidate config mismatch');assert.equal(sha(await moduleBytes(id,candidateModule)),m.candidate_sha256,'version-specific bytes mismatch');return v;};
 if(io.mode==='inspect'||io.mode==='deploy'){await snapshot(latest);receipt.baseline_version=m.baseline_version;receipt.configuration_sha256=m.configuration_sha256;receipt.settings_sha256=m.settings_sha256;receipt.model_enabled=false;receipt.overlay_reversible=true;save('inspection-complete');if(io.mode==='inspect')return receipt;}
 stage('owner-and-source');await io.approve(stage);await snapshot(latest);
 if(io.mode==='upload'||io.mode==='deploy'){
  const form=new FormData();form.set('metadata',JSON.stringify({...uploadMetadata(baseline,SOURCE_SHA),main_module:candidateModule}));form.set(candidateModule,new Blob([candidate],{type:'application/javascript+module'}),candidateModule);
  save('upload-attempted-outcome-unknown');const uploaded=await call(ROOT+'/versions?bindings_inherit=strict',{method:'POST',body:form});assert(UUID.test(uploaded?.id||'')&&uploaded.id!==m.baseline_version,'ambiguous upload; do not retry');
  receipt.candidate_version=uploaded.id;save('uploaded-not-promoted');stage('uploaded-version-parity');await exact(uploaded.id);await snapshot(uploaded.id);save('upload-readback-complete');if(io.mode==='upload')return receipt;latest=uploaded.id;
 }
 stage('candidate-version-parity');
 const v=await exact(latest);assert.equal(v.annotations?.['workers/commit_sha']||v.metadata?.annotations?.['workers/commit_sha'],SOURCE_SHA,'candidate source annotation mismatch');
 stage('owner-and-source');await io.approve(stage);await snapshot(latest);receipt.candidate_version=latest;
 const versions=[{version_id:latest,percentage:100}];
 receipt.traffic=versions;save('promotion-attempted-outcome-unknown');
 const promoted=await call(ROOT+'/deployments',{method:'POST',body:JSON.stringify({strategy:'percentage',versions})});assert(UUID.test(promoted?.id||''),'ambiguous promotion; do not retry');
 receipt.deployment=promoted.id;save('promoted-readback-pending');const d=(await call(ROOT+'/deployments')).deployments[0];assert.equal(d.id,promoted.id);assert.equal(d.strategy,'percentage');assert.deepEqual(d.versions.map(({version_id,percentage})=>({version_id,percentage})).sort((a,b)=>b.percentage-a.percentage),versions);await exact(latest);assert.equal(hash(await call(ROOT+'/script-settings')),m.settings_sha256);save('complete');return receipt;
}
async function main(){
 loadManifest();validatePinnedEntrySource();if(process.argv[2]==='--check-source')return;
 const env=process.env,mode=env.MODE;assert.equal(env.PRODUCTION_APPROVED,'true');assert.equal(env.GITHUB_ACTOR,'mmdprive');assert.equal(env.GITHUB_RUN_ATTEMPT,'1','no automatic rerun');
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 const approve=async stage=>{stage('owner-protection');await verifyProductionApproval(env);stage('environment-policy');assert.equal((await inspectEnvironment(env)).ready,true);stage('clean-pinned-source');validateSourceState({expectedSha:env.GITHUB_SHA,headSha:git('rev-parse','HEAD'),dirtyStatus:git('status','--porcelain=v1','--untracked-files=all')});assert.equal(git('ls-files','scripts/kenji-3159-entry-manifest.json'),'scripts/kenji-3159-entry-manifest.json');assert.equal(git('merge-base',SOURCE_SHA,env.GITHUB_SHA),SOURCE_SHA);};
 let last;const save=r=>{last=r;fs.writeFileSync(join(env.RUNNER_TEMP||'/tmp','kenji-3159-entry-receipt.json'),JSON.stringify(r,null,2),{mode:0o600});};
 save({phase:'preflight',check:'transport-setup',mode,tooling_sha:env.GITHUB_SHA});
 try{const result=await runEntryRelease({mode,sha:env.GITHUB_SHA,candidateVersion:env.CANDIDATE_VERSION,approve,call:createEntryTransport(env.CLOUDFLARE_API_TOKEN,mode),save});console.log(JSON.stringify(result));}
 catch(error){const http=/^Cloudflare HTTP (\d{3});/.exec(error.message)?.[1];save({...last,failed:true,...(http?{http_status:Number(http)}:{})});console.error(JSON.stringify({phase:last.phase,check:last.check,http_status:http??null}));throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Kenji entry release stopped; inspect receipt before any further action. No automatic retry.');process.exitCode=1;});
