// Transport tests use an in-memory fake of the Cloudflare and GitHub APIs. Nothing here touches a network.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {contract as live,hash,configurationHash,sealedRefHash} from './floor-release.mjs';
import {allowedRead,captureLive,fetchBaseline,createFloorAdapter,appendJournal} from './floor-release-adapter.mjs';
import {verifyFloorOwnerApproval,environmentName,workflowPath} from './floor-release-owner-approval.mjs';
const clone=structuredClone;const uuid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const owner={login:'mmdprive',id:216427112};
const SHA='a'.repeat(40);
const dir=mkdtempSync(join(tmpdir(),'floor-adapter-'));process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
function world({moduleBytes=Buffer.from('baseline')}={}){
 const t={...live.target,sha256:hash(moduleBytes),version:uuid(901),deployment:uuid(902)};
 const version={id:t.version,number:2,metadata:{source:'api',has_preview:false},annotations:{},resources:{script:{handlers:['fetch'],named_handlers:[]},script_runtime:{compatibility_date:'2026-01-01'},bindings:[{name:'SECRET',type:'secret_text'},{name:'SERVICE',type:'service',service:'original'}]}};
 const snapshotForHash={version:{...clone(version),resources:{...clone(version.resources),script:{...clone(version.resources.script),main_module:t.module}}},settings:{compatibility_flags:[],logpush:false},scriptSettings:{logpush:false,tags:[],tail_consumers:[],observability:null},boundary:{routes:[],domains:[],schedules:[],subdomain:{enabled:true}}};
 const c={...clone(live),target:{...t,configuration_sha256:configurationHash(snapshotForHash)},candidate_sha256:'c'.repeat(64),proof_sha256:'d'.repeat(64),approval_ref_sha256:sealedRefHash('ref')};
 const log=[];
 const env={CLOUDFLARE_API_TOKEN:'cf-test',GH_TOKEN:'gh-test',APPROVED_RELEASE_SCOPE:c.scope,APPROVED_MIGRATION_POLICY:'none-retain-existing',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'MMD-Prive/mmd-workers',GITHUB_REPOSITORY_ID:'1121397236',GITHUB_ACTOR:'mmdprive',GITHUB_ACTOR_ID:'216427112',GITHUB_TRIGGERING_ACTOR:'mmdprive',GITHUB_SHA:SHA,APPROVED_SHA:SHA,APPROVAL_REF:'ref',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};
 const base=`/accounts/${c.account}/workers/scripts/${t.name}`;
 const github=path=>{
  const map={
   '/actions/runs/123':{id:123,repository:{id:1121397236},event:'workflow_dispatch',head_branch:'main',head_sha:SHA,path:workflowPath,actor:owner,triggering_actor:owner,run_attempt:1},
   '/git/ref/heads/main':{object:{sha:SHA}},
   [`/environments/${environmentName}`]:{id:5,name:environmentName,can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:false,reviewers:[{type:'User',reviewer:owner}]}],deployment_branch_policy:{protected_branches:false,custom_branch_policies:true}},
   [`/environments/${environmentName}/deployment-branch-policies?per_page=100`]:{total_count:1,branch_policies:[{name:'main',type:'branch'}]},
   '/actions/runs/123/approvals':[{state:'approved',user:owner,environments:[{id:5,name:environmentName}]}],
  };
  return map[path];
 };
 const cloudflare=path=>{
  if(path===base+'/deployments')return{deployments:[{id:t.deployment,strategy:'percentage',versions:[{version_id:t.version,percentage:100}]}]};
  if(path===base+'/versions')return{items:[{id:t.version}]};
  if(path===base+'/versions/'+t.version)return clone(version);
  if(path===`/accounts/${c.account}/workers/workers/${t.name}/versions/${t.version}?include=modules`)return{id:t.version,main_module:t.module,modules:[{name:t.module,content_type:'application/javascript+module',content_base64:moduleBytes.toString('base64')}]};
  if(path===base+'/settings')return clone(snapshotForHash.settings);
  if(path===base+'/script-settings')return clone(snapshotForHash.scriptSettings);
  if(path===base+'/schedules')return{schedules:[]};
  if(path===base+'/subdomain')return{enabled:true};
  if(path===`/zones/${c.zone}/workers/routes`)return[];
  if(path===`/accounts/${c.account}/workers/domains`)return[];
  throw Error('unexpected Cloudflare path '+path);
 };
 const request=async(url,opts={})=>{
  log.push({url,method:opts.method||'GET'});
  const gh='https://api.github.com/repos/MMD-Prive/mmd-workers';const cf='https://api.cloudflare.com/client/v4';
  if(url.startsWith(gh)){const r=github(url.slice(gh.length));return{status:r===undefined?404:200,ok:r!==undefined,json:async()=>r};}
  if(url.startsWith(cf)){const result=cloudflare(url.slice(cf.length));return{ok:true,status:200,json:async()=>({success:true,result})};}
  throw Error('network outside GitHub and Cloudflare: '+url);
 };
 return{c,t,env,request,log,base,moduleBytes};
}
test('read allowlist covers only the SIGIL worker snapshot endpoints',()=>{
 const {c,base}=world();
 for(const p of [base+'/deployments',base+'/versions',base+'/settings',base+'/script-settings',base+'/schedules',base+'/subdomain',base+'/versions/'+uuid(1),`/accounts/${c.account}/workers/workers/${c.target.name}/versions/${uuid(1)}?include=modules`,`/zones/${c.zone}/workers/routes`,`/accounts/${c.account}/workers/domains`])assert.ok(allowedRead(p,c),p);
 for(const p of [`/accounts/${c.account}/workers/scripts/member-pages-worker/deployments`,base,base+'/secrets',base+'/content',`/accounts/${c.account}/workers/scripts`,'/user/tokens/verify',base+'/versions/not-a-uuid'])assert.equal(allowedRead(p,c),false,p);
});
test('capture is read-only, prints only ids and hashes, and matches the pinned baseline',async()=>{
 const w=world();
 const out=await captureLive({env:{...w.env},releaseRoot:dir,request:w.request,c:w.c});
 assert.deepEqual(Object.keys(out).sort(),['configuration_sha256','deployment','module_sha256','version','worker']);
 assert.equal(out.version,w.t.version);assert.equal(out.deployment,w.t.deployment);assert.equal(out.module_sha256,w.t.sha256);assert.equal(out.configuration_sha256,w.c.target.configuration_sha256);
 assert.ok(w.log.length>0);assert.ok(w.log.every(r=>r.method==='GET'),'capture must only read');
 assert.equal(JSON.stringify(out).includes('SECRET'),false);
});
test('capture refuses to report when the live module is not the pinned baseline',async()=>{
 const w=world();const c={...clone(w.c),target:{...w.c.target,sha256:'0'.repeat(64)}};
 await assert.rejects(captureLive({env:{...w.env},releaseRoot:dir,request:w.request,c}),/not the pinned baseline/);
});
test('capture still needs the exact owner gates',async()=>{
 for(const mutate of [e=>{e.GITHUB_ACTOR='someone';},e=>{e.GITHUB_REF='refs/heads/other';},e=>{e.GITHUB_RUN_ATTEMPT='2';},e=>{e.APPROVED_SHA='b'.repeat(40);},e=>{e.APPROVED_RELEASE_SCOPE='other';}]){
  const w=world();const env={...w.env};mutate(env);await assert.rejects(captureLive({env,releaseRoot:dir,request:w.request,c:w.c}));
 }
});
test('owner gate rejects a missing, foreign or double approval and the wrong workflow',async()=>{
 for(const [name,tweak] of [['no approval',h=>h.length=0],['foreign approver',h=>{h[0].user={login:'other',id:1};}],['two receipts',h=>h.push(clone(h[0]))],['rejected',h=>{h[0].state='rejected';}]]){
  const w=world();const req=async(url,o)=>{const r=await w.request(url,o);if(url.endsWith('/approvals')){const data=await r.json();tweak(data);return{status:200,ok:true,json:async()=>data};}return r;};
  await assert.rejects(verifyFloorOwnerApproval(w.env,req,{c:w.c}),a=>a.name==='AssertionError'&&!/unsealed/.test(a.message),name);
 }
 const w=world();const req=async(url,o)=>{const r=await w.request(url,o);if(url.endsWith('/actions/runs/123')){const data=await r.json();data.path='.github/workflows/other.yml';return{status:200,ok:true,json:async()=>data};}return r;};
 await assert.rejects(verifyFloorOwnerApproval(w.env,req,{c:w.c}),/wrong workflow/);
});
test('owner gate needs the sealed owner reference for a release but not for capture',async()=>{
 const w=world();
 assert.deepEqual(Object.keys(await verifyFloorOwnerApproval(w.env,w.request,{c:w.c})).sort(),['approved_sha','environment']);
 await assert.rejects(verifyFloorOwnerApproval({...w.env,APPROVAL_REF:'wrong'},w.request,{c:w.c}),/wrong owner authorization reference/);
 // capture does not need the reference (it is what the owner seals afterwards)
 await verifyFloorOwnerApproval({...w.env,APPROVAL_REF:'anything'},w.request,{c:w.c,requireRef:false});
 // an unsealed reference must fail closed
 await assert.rejects(verifyFloorOwnerApproval(w.env,w.request,{c:{...clone(w.c),approval_ref_sha256:null}}),/unsealed release contract/);
 // the committed contract is sealed to a reference this fixture does not know
 await assert.rejects(verifyFloorOwnerApproval(w.env,w.request),/wrong owner authorization reference/);
});
test('fetchBaseline refuses an unsealed contract and writes the exact bytes create-only when sealed',async()=>{
 const w=world();
 await assert.rejects(fetchBaseline({env:{...w.env},releaseRoot:dir,artifactRoot:join(dir,'a0'),request:w.request,c:{...clone(w.c),target:{...w.c.target,version:null}}}),/unsealed/);
 const out=await fetchBaseline({env:{...w.env},releaseRoot:dir,artifactRoot:join(dir,'a1'),request:w.request,c:w.c});
 assert.equal(out.baseline_sha256,w.t.sha256);assert.equal(hash(readFileSync(join(dir,'a1','sigil-baseline.js'))),w.t.sha256);
 await assert.rejects(fetchBaseline({env:{...w.env},releaseRoot:dir,artifactRoot:join(dir,'a1'),request:w.request,c:w.c}),undefined,'create-only: never overwrite');
 assert.ok(w.log.every(r=>r.method==='GET'));
});
test('adapter refuses a write without a fresh owner gate or outside the allowlist',async()=>{
 const w=world();const io=createFloorAdapter({env:w.env,releaseRoot:dir,journalPath:join(dir,'j.jsonl'),request:w.request,c:w.c});
 await assert.rejects(io.write(w.base+'/deployments',{method:'POST',body:{}}),/fresh owner gate/);
 await io.approve({sha:SHA,ref:'ref'});
 await assert.rejects(io.write(w.base+'/settings',{method:'PUT',body:{}}),a=>a.name==='AssertionError');
 assert.equal(w.log.filter(r=>r.method!=='GET'&&r.url.includes('cloudflare')).length,0);
});
test('journal append is durable and one JSON object per line',()=>{
 const p=join(dir,'nested','journal.jsonl');appendJournal(p,{phase:'a'});appendJournal(p,{phase:'b'});
 assert.deepEqual(readFileSync(p,'utf8').trim().split('\n').map(JSON.parse),[{phase:'a'},{phase:'b'}]);
});
