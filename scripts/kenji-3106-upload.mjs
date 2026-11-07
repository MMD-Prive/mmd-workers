import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {versionConfiguration,uploadMetadata,validateSourceState} from './admin-current-session-code-only.mjs';
import {verifyProductionApproval} from './admin-production-approval.mjs';
import {inspectEnvironment} from './admin-production-validation.mjs';

const MANIFEST_DIGEST='16649eb34d5481103a671a66c99da7bcc02b16485cbd355b4ff2e301c15d3ed9';
const file='scripts/kenji-3106-upload-manifest.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const source='830c3e76a2040e3a09c202cbc36fc8ad0874eab6';
const kenji='member-dashboard-chat-worker';
const admin='admin-worker';
const account='/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/';
const script=w=>account+'scripts/'+w;
const ids={[kenji]:'0879743e79f14eb1999a93cabe328397',[admin]:'2c2bd9363ac249879758f274f3964df3'};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const versionPath=(w,id)=>{assert.match(id,uuid);return script(w)+'/versions/'+id;};
const bundlePath=(w,id)=>{assert.match(id,uuid);return account+'workers/'+ids[w]+'/versions/'+id+'?include=modules';};
const uploadPath=script(kenji)+'/versions?bindings_inherit=strict';
const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const digest=v=>sha(JSON.stringify(sort(v)));
const read=(worker,name)=>git('show',source+':'+worker+'/src/'+name);
const cut=(s,a,b)=>{const start=s.indexOf(a);const end=s.indexOf(b,start+a.length);assert(start>=0&&end>start);return s.slice(start,end).trimEnd();};

export function loadManifest(){
 const raw=fs.readFileSync(new URL('./kenji-3106-upload-manifest.json',import.meta.url));
 assert.equal(sha(raw),MANIFEST_DIGEST,'manifest pin mismatch');
 const m=JSON.parse(raw);assert.equal(m.source,source);assert.deepEqual(m.upload_targets,[kenji]);
 assert.deepEqual(Object.keys(m.workers),[kenji]);assert.deepEqual(Object.keys(m.dependencies),[admin]);assert.equal(m.dependencies[admin].mode,'read_only');return m;
}

export function buildCandidate(bytes,pin){
 assert.equal(sha(bytes),pin.baseline_sha256,'baseline bytes drift');
 const baseline=bytes.toString();assert(Buffer.from(baseline).equals(bytes));
 let out=baseline;const patches=[];
 const patch=(before,after)=>{assert.equal(out.split(before).length,2,'missing or ambiguous anchor');out=out.replace(before,()=>after);patches.push({before,after});};
  const history=read(kenji,'kenji-line-conversation-history.mjs');
  const anchor=cut(history,'const PROFILE_FOLLOWUP_WINDOW_MS','\nfunction text(').replace(/^export /gm,'')
    .replace(/\btext\(/g,'text5(').replace(/\beventId\(/g,'eventId2(');
  const profile=read(kenji,'kenji-profile-link.mjs').replace(/^import .*\n/gm,'').replace(/^export /gm,'').trim();
  const start='async function runApprovedCategoryTurn(env, event, initialRuntime, io) {';
  patch(start,'const resolveProfileLinkReply3102 = (() => {\n'+anchor+'\n'+profile+'\nreturn resolveProfileLinkReply;\n})();\n'+start);
  const decision='approvedCategoryReply(event, env, { careBackOctoberReply, now }) || silent;';
  patch(decision,decision.replace(' || silent;', ' || (controls.model_keyword_auto_reply !== true && await resolveProfileLinkReply3102(env, event, { now, readAnchor: io.readProfileAnchor })) || silent;'));
  const fresh='runtime.controls?.line_oa_auto_reply !== true && continuity?.available === true && owner?.ok === true && owner.active !== true) {\n          attempted = true;';
  patch(fresh,fresh.replace(' && continuity',' && (decision.reply_source !== "category_profile_link" || runtime.controls?.model_keyword_auto_reply !== true) && continuity'));
  patch('|membership_intro|models|jobs)$/.test(decision.reply_source)','|membership_intro|models|jobs|profile_link)$/.test(decision.reply_source)');
  const intake='  const intakeCtx = profileImages.size || events.some((event) => richMenuNavigation(event) || lineIntakeCommand(event)) ? null : ctx;';
  patch(intake,'  const profileHistory = restrictedReplyCategories(env) && enabled7(env.LINE_KENJI_MODEL_ACCESS_ENABLED);\n'+intake.replace('= profileImages','= profileHistory || profileImages'));
 let restored=out;
 for(const {before,after} of [...patches].reverse()){assert.equal(restored.split(after).length,2);restored=restored.replace(after,()=>before);}
 assert.equal(restored,baseline);
 execFileSync(process.execPath,['--input-type=module','--check'],{input:out,stdio:['pipe','pipe','pipe']});

 assert.equal(patches.length,pin.patch_count);
 assert.deepEqual(patches.map(p=>({before:sha(p.before),after:sha(p.after)})),pin.anchors);
 assert.equal(sha(out),pin.candidate_sha256,'candidate bytes drift');
 return Buffer.from(out);
}

export function transport(token,request=fetch){
 assert(token);
 return async (path,{method='GET',body}={})=>{
  const read=method==='GET'&&[kenji,admin].some(w=>{
   const p=script(w);
   const v=path.slice((p+'/versions/').length);
   const b=path.match(/\/versions\/([a-f0-9-]+)\?include=modules$/)?.[1];
   return [p+'/deployments',p+'/versions',p+'/script-settings'].includes(path)||
    (path.startsWith(p+'/versions/')&&uuid.test(v))||(b&&uuid.test(b)&&path===bundlePath(w,b));
  });
  assert(read||(method==='POST'&&path===uploadPath&&body instanceof FormData),'outside upload-only transport');
  const r=await request('https://api.cloudflare.com/client/v4'+path,{method,body,headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
  assert(r.ok,'Cloudflare HTTP '+r.status);
  const j=await r.json();assert.equal(j.success,true);return j.result;
 };
}

export async function runUpload({call,approve,save,m=loadManifest()}){
 const pin=m.workers[kenji], dep=m.dependencies[admin];
 const receipt={phase:'preflight',source,manifest_sha256:MANIFEST_DIGEST,candidate_sha256:pin.candidate_sha256};
 const stage=(phase)=>{receipt.phase=phase;save({...receipt});};
 const bytes=async(w,id,name)=>{
  const v=await call(bundlePath(w,id));assert.equal(v.id,id);assert.equal(v.modules?.length,1);assert.equal(v.modules[0].name,name);return Buffer.from(v.modules[0].content_base64,'base64');
 };
 const snapshot=async(w,p,latest)=>{
  const root=script(w), d=(await call(root+'/deployments')).deployments[0];
  assert.equal(d.id,p.deployment,'deployment drift');assert.deepEqual(d.versions,[{version_id:p.version,percentage:100}]);
  assert.equal((await call(root+'/versions')).items[0].id,latest,'latest version drift');
  const v=await call(versionPath(w,p.version));assert.equal(v.id,p.version);
  assert.equal(digest(versionConfiguration(v)),p.configuration,'configuration drift');
  assert.equal(digest(await call(root+'/script-settings')),p.settings,'settings drift');
  if(w===kenji)assert.equal(v.resources.bindings.find(x=>x.name==='LINE_KENJI_MODEL_ENABLED'&&x.type==='plain_text')?.text,'false','model not OFF');
  return v;
 };
 stage('owner-and-source');await approve();
 stage('baseline');const v=await snapshot(kenji,pin,pin.version);await snapshot(admin,dep,dep.version);
 assert.equal(sha(await bytes(admin,dep.version,dep.module)),dep.baseline_sha256,'admin dependency drift');
 const candidate=buildCandidate(await bytes(kenji,pin.version,pin.module),pin);
 execFileSync(process.execPath,['--input-type=module','--check'],{input:candidate,stdio:['pipe','pipe','pipe']});
 const form=new FormData();const metadata={...uploadMetadata(v,source),main_module:pin.module};
 form.set('metadata',JSON.stringify(metadata));
 form.set(pin.module,new Blob([candidate],{type:'application/javascript+module'}),pin.module);
 stage('pre-upload-recheck');await approve();await snapshot(admin,dep,dep.version);await snapshot(kenji,pin,pin.version);
 stage('upload-attempted-outcome-unknown');
 const uploaded=await call(uploadPath,{method:'POST',body:form});
 assert.match(uploaded?.id||'',uuid);assert.notEqual(uploaded.id,pin.version);
 receipt.candidate_version=uploaded.id;stage('uploaded-not-promoted');
 const candidateVersion=await call(versionPath(kenji,uploaded.id));assert.equal(candidateVersion.id,uploaded.id);
 assert.equal(digest(versionConfiguration(candidateVersion)),pin.configuration,'uploaded config drift');
 assert.equal(sha(await bytes(kenji,uploaded.id,pin.module)),pin.candidate_sha256,'uploaded bytes drift');
 await snapshot(kenji,pin,uploaded.id);await snapshot(admin,dep,dep.version);
 stage('upload-readback-complete');return receipt;
}

async function main(){
 loadManifest();assert.equal(git('merge-base',source,'HEAD').trim(),source);
 if(process.argv[2]==='--check-source')return;
 const env=process.env;
 assert.equal(env.GITHUB_ACTOR,'mmdprive');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REF,'refs/heads/main');assert.equal(env.PRODUCTION_APPROVED,'true');
 const approve=async()=>{
  await verifyProductionApproval(env);
  assert.equal((await inspectEnvironment(env)).ready,true);
  validateSourceState({expectedSha:env.GITHUB_SHA,headSha:git('rev-parse','HEAD').trim(),dirtyStatus:git('status','--porcelain=v1','--untracked-files=all').trim()});
  assert.equal(git('ls-files',file).trim(),file);
 };
 const save=r=>fs.writeFileSync(join(env.RUNNER_TEMP,'kenji-3106-upload-receipt.json'),JSON.stringify(r,null,2),{mode:0o600});
 console.log(JSON.stringify(await runUpload({call:transport(env.CLOUDFLARE_API_TOKEN),approve,save})));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('Kenji upload-only stopped; check receipt before any retry:', e.code==='ERR_ASSERTION'?'guard rejected':'operation failed');process.exitCode=1;});
