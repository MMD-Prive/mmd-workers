import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateReadInputs, verifyReadSource, readOnlyWorkerFetch, readBaseline, ROOT, WORKFLOW } from './events-porto-ems16-evidence-read.mjs';
import { BASELINE_SHA256, digest } from '../release/events-porto-ems16-exclusion/build-candidate.mjs';
const SHA='a'.repeat(40);
const ENV={GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'MMD-Prive/mmd-workers',GITHUB_SHA:SHA,APPROVED_SHA:SHA,READ_APPROVED:'true',APPROVAL_REF:'synthetic-offline-authorization',GITHUB_RUN_ID:'22',GITHUB_RUN_ATTEMPT:'1',GH_TOKEN:'synthetic-read-token'};
const node={id:11,run_attempt:1,path:'.github/workflows/node.js.yml',event:'push',head_sha:SHA,head_branch:'main',head_repository:{full_name:ENV.GITHUB_REPOSITORY},status:'completed',conclusion:'success'};
const scoped={...node,id:22,path:WORKFLOW,event:'workflow_dispatch',status:'in_progress',conclusion:null};
function api(change=()=>{}) {const seen=[];const request=async(url,init)=>{assert.equal(init.method,'GET');assert.equal(init.redirect,'error');seen.push(url);let data;
 if(url.includes('/git/ref/')) data={object:{sha:SHA}};
 else if(url.includes('/jobs?')) {const run=url.includes('/11/')?node:scoped;const names=run.id===11?['build (18.x)','build (20.x)','build (22.x)']:['contracts'];data={total_count:names.length,jobs:names.map((name,i)=>({id:i+1,name,run_id:run.id,head_sha:SHA,status:'completed',conclusion:'success'}))};}
 else if(url.includes('runs?')) data={total_count:1,workflow_runs:[structuredClone(node)]};
 else data=structuredClone(url.endsWith('/11')?node:scoped);
 change(data,url,seen);return {status:200,redirected:false,json:async()=>data};};return {request,seen};}
test('readiness accepts only exact approved main read-only dispatch',()=>{validateReadInputs(ENV);for(const [key,value] of Object.entries({GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/heads/other',GITHUB_REPOSITORY:'other/repo',APPROVED_SHA:'b'.repeat(40),READ_APPROVED:'false',APPROVAL_REF:'\n',GITHUB_RUN_ATTEMPT:'0',GH_TOKEN:''}))assert.throws(()=>validateReadInputs({...ENV,[key]:value}));});
test('fresh exact-main Node matrix and current attempt contracts pass using GETs only',async()=>{const x=api();const result=await verifyReadSource(ENV,x.request);assert.equal(result.source_sha,SHA);assert.equal(result.node_jobs.length,3);assert.equal(x.seen.filter(x=>x.includes('/git/ref')).length,2);});
for(const kind of ['main','node-failed','wrong-head','contracts-failed','cancelled','wrong-path','attempt','incomplete','duplicate','post-jobs-cancel','final-main'])test('source rejects '+kind,async()=>{const x=api((d,u,seen)=>{
 if(kind==='main'&&d.object)d.object.sha='b'.repeat(40);
 if(kind==='final-main'&&d.object&&seen.filter(x=>x.includes('/git/ref')).length===2)d.object.sha='b'.repeat(40);
 if(kind==='node-failed'&&u.endsWith('/11'))d.conclusion='failure';
 if(kind==='wrong-head'&&u.endsWith('/11'))d.head_sha='b'.repeat(40);
 if(kind==='contracts-failed'&&d.jobs&&u.includes('/22/'))d.jobs[0].conclusion='failure';
 if(kind==='cancelled'&&u.endsWith('/22')){d.status='completed';d.conclusion='cancelled';}
 if(kind==='wrong-path'&&u.endsWith('/22'))d.path='.github/workflows/other.yml';
 if(kind==='attempt'&&u.endsWith('/22'))d.run_attempt=2;
 if(kind==='incomplete'&&d.workflow_runs)d.total_count=2;
 if(kind==='duplicate'&&d.jobs)d.jobs.push(d.jobs[0]);
 if(kind==='post-jobs-cancel'&&u.endsWith('/22')&&seen.filter(x=>x.endsWith('/22')).length===2){d.status='completed';d.conclusion='cancelled';}
 });await assert.rejects(verifyReadSource(ENV,x.request));});
test('GitHub read denial fails closed',async()=>{await assert.rejects(verifyReadSource(ENV,async()=>({status:403})));});
test('Cloudflare reader exposes only fixed Worker GET endpoints',async()=>{const calls=[];const read=readOnlyWorkerFetch('test',async(url,init)=>{calls.push({url,init});return {status:200,redirected:false};});await read(ROOT+'/deployments');assert.equal(calls[0].init.method,'GET');for(const path of [ROOT+'/versions?bindings_inherit=strict',ROOT+'/deployments/other',ROOT+'/settings',ROOT+'/content/v2?url=evil','/accounts/other/workers/scripts/events-worker/deployments','https://evil.invalid'])await assert.rejects(read(path));assert.equal(calls.length,1);});
test('Cloudflare failure or redirect stops without retry',async()=>{for(const response of [{status:403},{status:200,redirected:true}]){let calls=0;const read=readOnlyWorkerFetch('test',async()=>{calls++;return response;});await assert.rejects(read(ROOT+'/versions'));assert.equal(calls,1);}});
test('baseline mismatch stops observation before object reads',async()=>{await assert.rejects(readBaseline(async()=>({json:async()=>({success:true,result:{deployments:[{id:'wrong'}]}})}),{expected_deployment:'right',expected_version:'v'}));});
const VERSION='88e741df-15bd-40ba-a4ce-f88a2735822b';
const DEPLOYMENT='d9617e88-3f2f-4698-a3e5-3853fd197e06';
const manifest={expected_version:VERSION,expected_deployment:DEPLOYMENT,module:'model-eta-wrapper.js'};
const mockHash=value=>value==='synthetic-module-bytes'?BASELINE_SHA256:digest(value);
function baselineApi(change=()=>{}) {let index=0;return async path=>{
 let value;
 if(path.endsWith('/content/v2')){const file={size:207037,text:async()=>'synthetic-module-bytes'};const parts=[['model-eta-wrapper.js',file]];change(parts,path,++index);return {formData:async()=>new Map(parts)};}
 if(path.endsWith('/deployments'))value={deployments:[{id:DEPLOYMENT,strategy:'percentage',versions:[{version_id:VERSION,percentage:100}]}]};
 else if(path.endsWith('/versions'))value={items:[{id:VERSION}]};
 else if(path.endsWith('/versions/'+VERSION))value={id:VERSION,resources:{bindings:[...Object.entries({HYPE_COMPCARD_ENABLED:'true',HYPE_STANDARD_ENABLED:'true',HYPE_INTAKE_ENABLED:'true',HYPE_PROMOTION_ENABLED:'false'}).map(([name,text])=>({name,type:'plain_text',text})),{name:'HYPE_COMPCARD_STATE',type:'r2_bucket',bucket_name:'mmd-hype-compcard-state'}]}};
 else if(path.endsWith('/script-settings'))value={usage_model:'standard'};
 else if(path.endsWith('/schedules'))value={schedules:[{cron:'*/15 * * * *'}]};
 else if(path.endsWith('/subdomain'))value={enabled:true};else throw new Error('unexpected-read');
 change(value,path,++index);return {json:async()=>({success:true,result:value})};};}
test('synthetic full baseline observation validates multipart, flags, bucket and repeated pins',async()=>{const r=await readBaseline(baselineApi(),manifest,mockHash);assert.equal(r.module_sha256,BASELINE_SHA256);assert.equal(r.version,VERSION);assert.match(r.configuration_sha256,/^[a-f0-9]{64}$/);assert.deepEqual(await readBaseline(baselineApi(),manifest,mockHash),r);});
for(const kind of ['latest','deployment-race','latest-race','flag','bucket','module-name','module-size','module-extra','module-hash'])test('baseline rejects '+kind,async()=>{let reached=false;const read=baselineApi((v,p,i)=>{
 if(kind==='latest'&&p.endsWith('/versions')){reached=true;v.items[0].id='different';}
 if(kind==='deployment-race'&&p.endsWith('/deployments')&&i>1){reached=true;v.deployments[0].id='different';}
 if(kind==='latest-race'&&p.endsWith('/versions')&&i>2){reached=true;v.items[0].id='different';}
 if(kind==='flag'&&v.resources){reached=true;v.resources.bindings.find(x=>x.name==='HYPE_PROMOTION_ENABLED').text='true';}
 if(kind==='bucket'&&v.resources){reached=true;v.resources.bindings.find(x=>x.type==='r2_bucket').bucket_name='other';}
 if(p.endsWith('/content/v2')){if(kind.startsWith('module-'))reached=true;if(kind==='module-name')v[0][0]='other.js';if(kind==='module-size')v[0][1].size++;if(kind==='module-extra')v.push(['other.js',v[0][1]]);if(kind==='module-hash')v[0][1].text=async()=>'changed';}
 });await assert.rejects(readBaseline(read,manifest,mockHash));assert.equal(reached,true,'must reach intended adversarial boundary');});
test('production default hashing rejects synthetic bytes even with the right reported size',async()=>{await assert.rejects(readBaseline(baselineApi(),manifest));});
test('configuration drift across complete observations changes fingerprint and stops comparison',async()=>{const before=await readBaseline(baselineApi(),manifest,mockHash);const after=await readBaseline(baselineApi((v,p)=>{if(p.endsWith('/script-settings'))v.unreviewed=true;}),manifest,mockHash);assert.throws(()=>assert.deepEqual(after,before));});
test('workflow preserves permissions, protected approval, concurrency and read-only commands',()=>{const text=readFileSync(new URL('../.github/workflows/read-events-porto-ems16-release-evidence.yml',import.meta.url),'utf8');assert.match(text,/contents: read\n  actions: read/);assert.match(text,/environment: mmd-production-mutation/);assert.match(text,/deploy-events-worker-production/);assert.match(text,/cancel-in-progress: false/);assert.match(text,/needs: \[contracts, readiness, protection-config\]/);assert.match(text,/--collect-approved/);assert.doesNotMatch(text,/--execute-approved|wrangler|checks: write|contents: write|always\(\)/);});
test('entry has no deployment helper, write transport or policy enablement',()=>{const text=readFileSync(new URL('./events-porto-ems16-evidence-read.mjs',import.meta.url),'utf8');assert.doesNotMatch(text,/releaseEventsRotation|createTransport|method: ['"](?:POST|PUT|DELETE|PATCH)['"]|REVIEWED_RELEASE_POLICY\s*=/);assert.match(text,/Read-only evidence collection stopped; no production mutation/);});
