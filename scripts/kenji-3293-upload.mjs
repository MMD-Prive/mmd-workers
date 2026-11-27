import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {uploadMetadata,versionConfiguration,validateSourceState} from './admin-current-session-code-only.mjs';
import {verifyProductionApproval,environmentName} from './admin-production-approval.mjs';
import {inspectEnvironment} from './admin-production-validation.mjs';

const manifestPath='scripts/kenji-3293-upload-manifest.json';
export const manifest=JSON.parse(readFileSync(new URL('./kenji-3293-upload-manifest.json',import.meta.url)));
const sha=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const account='/accounts/b176eda1172b741fd2e58904cc9d77c5/workers';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trimEnd();
function targets(name,pin) {
  const root=account+'/scripts/'+name;
  return {active:root+'/deployments',list:root+'/versions',settings:root+'/script-settings',
    post:root+'/versions?bindings_inherit=strict',
    version:id=>root+'/versions/'+id,
    artifact:id=>account+'/workers/'+pin.id+'/versions/'+id+'?include=modules,sourcemaps'};
}
export function validateManifest(value) {
  assert.equal(value.pr,3293);
  assert.match(value.source_sha,/^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(value.workers),['member-dashboard-chat-worker']);
  assert.equal(value.expires_at,'2026-11-30T17:00:00.000Z');
  for(const [name,p] of Object.entries(value.workers)){
    assert.match(p.id,/^[a-f0-9]{32}$/);
    for(const v of [p.version,p.dep])assert.match(v,uuid);
    for(const v of [p.etag,p.cfg,p.settings,p.sha,p.candidate])assert.match(v,sha);
    assert.notEqual(p.sha,p.candidate);
    assert.equal(p.name,name);
    assert.match(p.module,/^[a-z0-9-]+\.js$/);
    if(p.sidecar){assert.equal(p.sidecar.name,p.module+'.map');assert.match(p.sidecar.sha,sha);}
    assert.equal(p.patches.length,3);
    assert.ok(p.sidecar,'source map pin required');
    for(const q of p.patches){assert(q.before&&q.after);assert.notEqual(q.before,q.after);assert.equal(hash(q.before),q.before_sha256);assert.equal(hash(q.after),q.after_sha256);}
  }
  return value;
}
export function build(bytes,p) {
  assert.equal(hash(bytes),p.sha);
  const original=bytes.toString('utf8');
  assert(Buffer.from(original).equals(bytes));
  const swap=(s,a,b)=>{assert.equal(s.split(a).length,2,'unique byte anchor required');return s.replace(a,()=>b);};
  let next=original;
  for(const q of p.patches)next=swap(next,q.before,q.after);
  let reverse=next;
  for(const q of [...p.patches].reverse())reverse=swap(reverse,q.after,q.before);
  assert(Buffer.from(reverse).equals(bytes),'delta must reverse to baseline bytes');
  assert.equal(next.split('\n').length,original.split('\n').length,'source map line offsets must remain stable');
  assert.equal(hash(next),p.candidate);
  return Buffer.from(next);
}
export function transport(name,pin,token,fetcher=fetch) {
  assert(Object.hasOwn(manifest.workers,name));assert.equal(pin.id,manifest.workers[name].id);assert(token);
  const t=targets(name,pin);
  return async (path,method='GET',body)=>{
    const id=path.match(/\/versions\/([a-f0-9-]+)(?:\?include=modules,sourcemaps)?$/)?.[1];
    const allowed=method==='GET'&&([t.active,t.list,t.settings].includes(path)||(id&&uuid.test(id)&&[t.version(id),t.artifact(id)].includes(path)));
    assert(allowed||(method==='POST'&&path===t.post&&body instanceof FormData),'outside upload-only scope');
    const r=await fetcher('https://api.cloudflare.com/client/v4'+path,{method,body,headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(55000)});
    assert(r.ok,'Cloudflare request failed');
    const data=await r.json();assert.equal(data.success,true);return data.result;
  };
}
export async function runUpload({name,p,approve,call,save,syntax,now=Date.now}) {
  const t=targets(name,p), receipt={worker:name,source_sha:manifest.source_sha,baseline_version:p.version,candidate_sha256:p.candidate};
  const stage=phase=>{receipt.phase=phase;save({...receipt});};
  const beforeExpiry=()=>assert.ok(Number.isFinite(now())&&now()<Date.parse(manifest.expires_at),'CARE BACK window expired');
  const active=async()=>{
    const d=(await call(t.active)).deployments[0];
    assert.equal(d.id,p.dep);assert.deepEqual(d.versions,[{version_id:p.version,percentage:100}]);
  };
  const modelOff=v=>{if(name==='member-dashboard-chat-worker')assert(v.resources.bindings.some(b=>b.name==='LINE_KENJI_MODEL_ENABLED'&&b.type==='plain_text'&&b.text==='false'));};
  const settings=async()=>assert.equal(hash(JSON.stringify(await call(t.settings))),p.settings);
  const artifact=async id=>{
    const e=await call(t.artifact(id));assert.equal(e.id,id);assert.equal(e.main_module,p.module);
    assert.deepEqual(e.modules.map(m=>m.name).sort(),[p.module,p.sidecar.name].sort());
    const get=name=>Buffer.from(e.modules.find(m=>m.name===name).content_base64,'base64');
    const map=get(p.sidecar.name);assert.equal(hash(map),p.sidecar.sha,'version-specific source map hash mismatch');
    return {code:get(p.module),map};
  };
  stage('preflight');
  beforeExpiry();await approve();await active();await settings();
  const v=await call(t.version(p.version));assert.equal(v.id,p.version);modelOff(v);
  const {etag,...script}=v.resources.script;
  assert.equal(etag,p.etag);
  assert.equal(hash(JSON.stringify({bindings:v.resources.bindings,script,runtime:v.resources.script_runtime})),p.cfg);
  const baselineArtifact=await artifact(p.version);
  const candidate=build(baselineArtifact.code,p);syntax(candidate);
  const map=baselineArtifact.map;
  const metadata=uploadMetadata(v,manifest.source_sha);
  metadata.main_module=p.module;
  metadata.annotations['workers/message']='Kenji #3293 upload-only '+ name+' source-sha='+manifest.source_sha;
  const form=new FormData();
  form.set('metadata',JSON.stringify(metadata));
  form.set(p.module,new Blob([candidate],{type:'application/javascript+module'}),p.module);
  if(map)form.set(p.sidecar.name,new Blob([map],{type:'application/source-map'}),p.sidecar.name);
  await approve();await active();await settings();
  const versions=(await call(t.list)).items;
  assert.equal(versions[0]?.id,p.version,'strict inheritance must not pick a staged version');
  assert(!versions.some(v=>Object.values(v.annotations||{}).includes(metadata.annotations['workers/message'])),'candidate already uploaded');
  beforeExpiry();
  stage('upload-attempted-outcome-unknown');
  const uploaded=await call(t.post,'POST',form);assert.match(uploaded.id,uuid);assert.notEqual(uploaded.id,p.version);
  receipt.candidate_version=uploaded.id;stage('uploaded-not-promoted');
  const read=await call(t.version(uploaded.id));
  assert.equal(read.id,uploaded.id);assert.equal(read.annotations?.['workers/message'],metadata.annotations['workers/message']);
  modelOff(read);assert.deepEqual(versionConfiguration(read),versionConfiguration(v));
  assert.equal(hash((await artifact(uploaded.id)).code),p.candidate);
  await settings();await active();
  receipt.baseline_traffic=100;receipt.config_parity=true;receipt.exact_candidate_hash_verified=true;
  if(name==='member-dashboard-chat-worker')receipt.model_off=true;
  stage('upload-readback-complete');return receipt;
}
async function main() {
  validateManifest(manifest);
  const env={...process.env,PRODUCTION_ENVIRONMENT_NAME:environmentName};
  const name='member-dashboard-chat-worker';
  const approve=async()=>{
    assert.equal(env.GITHUB_ACTOR,'mmdprive');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');
    assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REF,'refs/heads/main');
    assert.equal(env.PRODUCTION_APPROVED,'true');
    await verifyProductionApproval(env);assert.equal((await inspectEnvironment(env)).ready,true);
    validateSourceState({expectedSha:env.GITHUB_SHA,headSha:git('rev-parse','HEAD'),dirtyStatus:git('status','--porcelain=v1','--untracked-files=all')});
    assert.equal(git('ls-files',manifestPath),manifestPath);
    assert.equal(git('merge-base',manifest.source_sha,'HEAD'),manifest.source_sha);
  };
  const save=r=>writeFileSync(join(env.RUNNER_TEMP,'kenji-3293-upload-receipt.json'),JSON.stringify(r,null,2),{mode:0o600});
  const syntax=b=>execFileSync(process.execPath,['--input-type=module','--check'],{input:b,stdio:['pipe','pipe','pipe']});
  console.log(JSON.stringify(await runUpload({name,p:manifest.workers[name],approve,save,syntax,call:transport(name,manifest.workers[name],env.CLOUDFLARE_API_TOKEN)})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error('Upload-only stopped; inspect receipt before any further action. No retry.');process.exitCode=1;});
