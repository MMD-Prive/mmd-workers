import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync,mkdtempSync,writeFileSync,cpSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {PIN,ROOT,GUARD,hash,canonical,handler,assemble,toolchain,transport,release,safeBindings,Journal,uploadReviewed as productionUploadReviewed,reconcile,verifyUploaded,promote,validateReadback} from './checkpts-preserved-release.mjs';
// Mock API cases exercise upload transitions independently of the real CI guard.
// Only this test process temporarily changes the flag; production code is unchanged.
async function uploadReviewed(options) {
 const previous=process.env.GITHUB_ACTIONS;delete process.env.GITHUB_ACTIONS;
 try{return await productionUploadReviewed(options);}
 finally{if(previous===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=previous;}
}
const out=process.env.CHECKPTS_REVIEW_DIR;
assert.ok(out,'CHECKPTS_REVIEW_DIR required');
const read=(dir,n)=>readFileSync(path.join(out,dir,n),'utf8');
const base=read('baseline',PIN.module),candidate=read('candidate',PIN.module);
const a=JSON.parse(read('baseline',PIN.module+'.map')),b=JSON.parse(read('candidate',PIN.module+'.map'));
const manifest=JSON.parse(read('candidate','manifest.json'));
const {decode}=toolchain();
const digest=v=>hash(JSON.stringify(canonical(v)));

test('candidate preserves every byte except the single reviewed guard and all 14 exports',()=>{
 assert.equal(hash(base),PIN.js);assert.equal(hash(read('baseline',PIN.module+'.map')),PIN.map);
 assert.equal(hash(candidate),manifest.candidate_js_sha256);assert.equal(hash(read('candidate',PIN.module+'.map')),manifest.candidate_map_sha256);
 const at=candidate.indexOf(GUARD,handler(candidate).start);
 assert.ok(at>0);assert.equal(candidate.slice(0,at)+candidate.slice(at+GUARD.length),base);
 assert.equal(manifest.exports.length,14);assert.ok(manifest.exports.includes('GuideOwnerNotifications'));
 assert.equal(hash(handler(base).text),PIN.handler);
 assert.equal(hash(handler(candidate).text),manifest.candidate_handler_sha256);
});
test('source map retains every original mapping on the same source text; only the reviewed source changes',()=>{
 assert.deepEqual(Object.keys(b).sort(),Object.keys(a).sort());
 for(const k of Object.keys(a)) if(!['sourcesContent','mappings'].includes(k)) assert.deepEqual(b[k],a[k],k);
 const changed=a.sourcesContent.flatMap((s,i)=>s===b.sourcesContent[i]?[]:[a.sources[i]]);
 assert.deepEqual(changed,['src/kenji-lv5-line-operational-request.mjs']);
 const sourceLinesA=a.sourcesContent.map(s=>s.split('\n')),sourceLinesB=b.sourcesContent.map(s=>s.split('\n'));
 const before=decode(a.mappings),after=decode(b.mappings);const added=manifest.inserted_generated_line;
 assert.deepEqual(after[added],[]);after.splice(added,1);assert.equal(after.length,before.length);
 for(let i=0;i<before.length;i++){
  assert.equal(after[i].length,before[i].length);
  for(let j=0;j<before[i].length;j++){
   const x=before[i][j],y=after[i][j];assert.equal(y[0],x[0]);assert.equal(y.length,x.length);
   if(x.length>=4){assert.equal(y[1],x[1]);assert.equal(y[3],x[3]);assert.equal(y[4],x[4]);
    assert.equal(sourceLinesB[y[1]][y[2]],sourceLinesA[x[1]][x[2]],'original source line retained');}
  }
 }
});
test('assembly refuses changed JS, changed map, wrong reviewed source and repeated application',async()=>{
 const source=b.sourcesContent[b.sources.indexOf(manifest.changed_source)];
 await assert.rejects(assemble(base+' ',read('baseline',PIN.module+'.map'),source),/baseline JS drift/);
 await assert.rejects(assemble(base,read('baseline',PIN.module+'.map')+' ',source),/baseline source map drift/);
 await assert.rejects(assemble(base,read('baseline',PIN.module+'.map'),source+' '),/reviewed source drift/);
 await assert.rejects(assemble(candidate,read('candidate',PIN.module+'.map'),source));
});

const require=createRequire(path.resolve(process.env.CHECKPTS_TOOLS_DIR||'/private/tmp/checkpts-artifact-tools','package.json'));
assert.equal(require('miniflare/package.json').version,'4.20260317.3');
const {Miniflare}=require('miniflare');
const UID='U'+'a'.repeat(32),MATRIX='tblS6iRgPjYLBqZJh';
const aliases=['Checkpts','check point','check points','checkpoint','เช็คสิทธิ์','เช็กสิทธิ์'];
async function runtime(code,fn,controls={}){
 const now=Date.now();const trace={line:[],writes:[],runtime:0,reads:0};
 const hashId=createHash('sha256').update('line_ofc:'+UID).digest('hex');
 const draft={schema:'mmd.kenji_booking_accumulator.v1',draft_id:'fixture-hiro',model_name:'Hiro',model_working_name_hint:'Hiro',status:'collecting',revision:1,action_state:'not_started',missing_fields:['date','time','location','amount_thb'],started_at:new Date(now-1000).toISOString(),updated_at:new Date(now-1000).toISOString()};
 const record={id:'rec00000000000002',fields:{matrix_id:'kcm1_line_'+hashId.slice(0,20),Client:['rec00000000000001'],schema_version:'mmd.kenji_conversation_matrix.v1',conversation_id_hash:hashId,channel:'line_ofc',conversation_scope:'line:'+hashId.slice(0,20),topic:'booking',subtopic:'model_booking',last_customer_intent:'model_lookup',conversation_stage:'awaiting_customer',awaiting_from:'customer',pending_action:'collect booking date',handoff_required:false,matrix_status:'active',state_updated_at:new Date(now-1000).toISOString(),state_expires_at:new Date(now+60000).toISOString(),version:1,payload_json:JSON.stringify({booking_draft_v1:draft})}};
 const mf=new Miniflare({modules:[{type:'ESModule',path:'entry.mjs',contents:`import {reviewOperational} from './subject.js'; export default {async fetch(r,env,ctx){const response=await reviewOperational(r,env,ctx);return response?.response||Response.json({delegated:!response});}}`},
  {type:'ESModule',path:'subject.js',contents:code+'\nexport { tryHandleKenjiLv5LineOperationalRequest as reviewOperational };\n'}],
  compatibilityDate:'2026-07-02',bindings:{LINE_CHANNEL_SECRET:'fixture-secret',LINE_CHANNEL_ACCESS_TOKEN:'fixture-line',LINE_AUTO_REPLY_ENABLED:'true',LINE_KENJI_AI_ENABLED:'true',LINE_KENJI_BOOKING_INTENT_ENABLED:'true',KENJI_LINE_CONTINUITY_ENABLED:'true',AIRTABLE_API_KEY:'fixture-airtable',AIRTABLE_BASE_ID:'fixture-base',INTERNAL_TOKEN:'fixture-internal'},
  serviceBindings:{ADMIN_WORKER:async request=>{assert.match(new URL(request.url).pathname,/\/kenji\/control\/runtime\/status$/);trace.runtime++;return Response.json({ok:true,controls:{all_kenji_mutations:false,line_oa_auto_reply:false,...controls}});}},
  outboundService:async request=>{
   const url=new URL(request.url);
   if(url.hostname==='api.line.me'){assert.equal(url.pathname,'/v2/bot/message/reply');trace.line.push(await request.json());return Response.json({});}
   assert.equal(url.hostname,'api.airtable.com','no real network');
   if(request.method!=='GET'){trace.writes.push({path:url.pathname,body:await request.json()});return Response.json({records:[record]});}
   trace.reads++;return Response.json({records:url.pathname.endsWith(MATRIX)?[record]:[]});
  }});
 const send=async(text,valid=true)=>{
  const body=JSON.stringify({events:[{type:'message',mode:'active',timestamp:now,replyToken:'fixture-reply',source:{type:'user',userId:UID},message:{id:'fixture-message',type:'text',text}}]});
  const signature=valid?createHmac('sha256','fixture-secret').update(body).digest('base64'):'invalid';
  return (await mf.dispatchFetch('https://mmdbkk.com/webhooks/line',{method:'POST',body,headers:{'x-line-signature':signature,'content-type':'application/json'}})).json();
 };
 try{await fn(send,trace);}finally{await mf.dispose();}
}
test('actual baseline bundle reproduces Hiro reply for Checkpts before patch',async()=>runtime(base,async(send,t)=>{
 await send('Checkpts');assert.equal(t.line.length,1);assert.match(t.line[0].messages[0].text,/Hiro/);
}));
test('actual candidate bundle initializes existing helper and delegates all six aliases before booking I/O',async()=>runtime(candidate,async(send,t)=>{
 for(const alias of aliases)assert.equal((await send(alias)).delegated,true);
 assert.equal(t.line.length,0);assert.equal(t.reads,0);assert.equal(t.writes.length,0);assert.equal(t.runtime,0);
}));
test('CARE BACK delegation is identical in original and candidate bundles',async()=>{
 for(const code of [base,candidate])await runtime(code,async(send,t)=>{
  for(const message of ['CARE BACK สมาชิกใหม่','CARE BACK สมาชิกปัจจุบัน','CARE BACK สมาชิกหมดอายุไม่เกิน 90 วัน'])assert.equal((await send(message)).delegated,true);
  assert.equal(t.writes.length,0);assert.equal(t.line.length,0);
 });
});
test('ordinary Hiro booking still replies through the candidate bundle',async()=>runtime(candidate,async(send,t)=>{
 await send('นายแบบ Hiro');assert.equal(t.line.length,1);assert.match(t.line[0].messages[0].text,/Hiro/);
}));
test('candidate retains LINE reply pause and invalid-signature protection for ordinary booking',async()=>{
 await runtime(candidate,async(send,t)=>{await send('นายแบบ Hiro');assert.equal(t.line.length,0);},{line_oa_auto_reply:true});
 await runtime(candidate,async(send,t)=>{assert.equal((await send('Checkpts',false)).delegated,true);assert.equal(t.writes.length,0);assert.equal(t.line.length,0);assert.equal(t.reads,0);});
});

function fakeApi(fault='') {
 const expected=JSON.parse(read('candidate','baseline.json'));
 const settings={bindings:[{name:'LINE_CHANNEL_ACCESS_TOKEN',type:'secret_text'},{name:'MODE',type:'plain_text',text:'fixture'}],compatibility_date:'2026-07-02',compatibility_flags:[],usage_model:'standard'};
 const resources={bindings:settings.bindings,script_runtime:{compatibility_date:'2026-07-02',migration_tag:'fixture',usage_model:'standard'},script:{etag:'fixture-etag',handlers:['fetch','scheduled'],named_handlers:[{name:'GuideOwnerNotifications',handlers:['ownerProfile']}]}};
 expected.config_fingerprints={safe_bindings:digest(safeBindings(settings.bindings)),settings_without_bindings:digest(Object.fromEntries(Object.entries(settings).filter(([k])=>k!=='bindings')))};
 expected.schedules={schedules:[]};expected.routes_sha256=digest([]);
 const temp=mkdtempSync(path.join(os.tmpdir(),'checkpts-release-fixture-'));cpSync(path.join(out,'candidate'),temp,{recursive:true});
 writeFileSync(path.join(temp,'baseline.json'),JSON.stringify(expected,null,2)+'\n');
 const m=JSON.parse(readFileSync(path.join(temp,'manifest.json')));m.baseline_configuration_sha256=hash(readFileSync(path.join(temp,'baseline.json')));
 writeFileSync(path.join(temp,'manifest.json'),JSON.stringify(m,null,2)+'\n');
 const approval={approved:true,sourceMerge:PIN.merge,manifestSha256:hash(readFileSync(path.join(temp,'manifest.json')))};
 let deployment={id:PIN.deployment,versions:[{version_id:PIN.version,percentage:100}]},latest=PIN.version;
 const calls=[];const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';const target={id,resources:structuredClone(resources)};
 const io=async(method,p,body)=>{
  calls.push({method,path:p});
  if(method==='GET'&&p.endsWith('/deployments'))return {deployments:[fault==='deployment-drift'?{...deployment,id:'drift'}:deployment]};
  if(method==='GET'&&p.endsWith('/versions'))return {items:latest===id?[{...target},...(fault==='ambiguous'?[{...target,id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}]:[])]:[{id:fault==='inactive-upload'?'other':latest}]};
  if(method==='GET'&&p===ROOT+'/versions/'+PIN.version)return {id:PIN.version,resources};
  if(method==='GET'&&p===ROOT+'/versions/'+id){if(fault==='config-drift')target.resources.script_runtime.compatibility_date='2026-01-01';return target;}
  if(method==='GET'&&p.endsWith('/settings'))return fault==='settings-drift'?{...settings,compatibility_date:'2026-01-01'}:fault==='bindings-drift'?{...settings,bindings:[...settings.bindings,{name:'OTHER',type:'plain_text',text:'changed'}]}:settings;
  if(method==='GET'&&p.endsWith('/schedules'))return fault==='schedule-drift'?{schedules:[{cron:'* * * * *'}]}:expected.schedules;
  if(method==='GET'&&p.endsWith('/routes'))return fault==='route-drift'?[{script:PIN.worker,pattern:'changed'}]:[];
  if(method==='POST'&&p.endsWith('/versions?bindings_inherit=strict')){
   const meta=JSON.parse(await body.get('metadata').text());assert.deepEqual(meta.bindings,settings.bindings.map(b=>({name:b.name,type:'inherit'})));
   assert.ok(!('migrations' in meta));assert.equal(meta.main_module,PIN.module);
   assert.equal(hash(Buffer.from(await body.get(PIN.module).arrayBuffer())),m.candidate_js_sha256);
   target.annotations=meta.annotations;
   if(fault==='upload-not-visible')throw Error('synthetic lost acknowledgement');
   latest=id;if(fault==='upload-unknown')throw Error('synthetic lost acknowledgement');
   if(fault==='malformed-ack')return {};return {id};
  }
  if(method==='POST'&&p.endsWith('/deployments')){deployment={id:'new-deployment',versions:body.versions};if(fault==='promotion-unknown')throw Error('synthetic lost acknowledgement');return deployment;}
  if(method==='GET'&&p===ROOT){
   const boundary='fixture-boundary';const readbackMap=JSON.parse(read('candidate',PIN.module+'.map'));if(fault==='map-readback')readbackMap.sourceRoot='wrong-root';const raw=[`--${boundary}\r\nContent-Disposition: form-data; name="${PIN.module}"; filename="${PIN.module}"\r\nContent-Type: application/javascript\r\n\r\n${candidate}\r\n`,`--${boundary}\r\nContent-Disposition: form-data; name="${PIN.module}.map"; filename="${PIN.module}.map"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(readbackMap)}\r\n`,`--${boundary}--\r\n`].join('');
   return {text:fault==='js-readback'?raw.replace(candidate,candidate+' '):raw,etag:fault==='etag-readback'?'wrong-etag':'fixture-etag'};
  }
  throw Error('unexpected fixture request '+method+' '+p);
 };
 return {io,folder:temp,approval,calls,journal:new Journal(mkdtempSync(path.join(os.tmpdir(),'checkpts-journal-fixture-')))};
}

const posts=f=>f.calls.filter(c=>c.method==='POST');
const journalIdentity=f=>({attempt_id:'cccccccc-cccc-cccc-cccc-cccccccccccc',source_merge:PIN.merge,manifest_sha256:f.approval.manifestSha256,baseline_version:PIN.version,baseline_deployment:PIN.deployment,js_sha256:manifest.candidate_js_sha256,map_sha256:manifest.candidate_map_sha256});
test('exact upload approval is required before network or journal writes',async()=>{
 const f=fakeApi();await assert.rejects(uploadReviewed({...f,approval:{approved:false}}));
 await assert.rejects(uploadReviewed({...f,approval:{...f.approval,manifestSha256:'0'.repeat(64)}}));
 assert.equal(f.calls.length,0);assert.equal(f.journal.read().length,0);
});
for(const file of [PIN.module,PIN.module+'.map','baseline.json'])test('tampered '+file+' blocks all network access',async()=>{
 const f=fakeApi();writeFileSync(path.join(f.folder,file),readFileSync(path.join(f.folder,file))+' ');
 await assert.rejects(uploadReviewed(f));assert.equal(f.calls.length,0);
});
for(const fault of ['deployment-drift','inactive-upload','route-drift','settings-drift','bindings-drift','schedule-drift'])test('preflight stops before intent/upload on '+fault,async()=>{
 const f=fakeApi(fault);await assert.rejects(uploadReviewed(f));assert.equal(posts(f).length,0);assert.equal(f.journal.read().length,0);
});
test('approved upload is one POST, retains durable identity, never promotes and requires a new verification stage',async()=>{
 const f=fakeApi();const r=await uploadReviewed(f);assert.equal(r.phase,'uploaded_unverified');assert.equal(r.promotion_enabled,false);
 assert.equal(posts(f).length,1);const j=f.journal.read();assert.deepEqual(j.map(s=>s.phase),['upload_intent','uploaded_unverified']);
 assert.equal(j[0].attempt_id,j[1].attempt_id);assert.equal(j[0].manifest_sha256,f.approval.manifestSha256);
 await assert.rejects(uploadReviewed(f));assert.equal(posts(f).length,1);
});
for(const fault of ['upload-unknown','upload-not-visible','malformed-ack'])test('unknown outcome survives a second invocation: '+fault,async()=>{
 const f=fakeApi(fault);await assert.rejects(uploadReviewed(f));assert.equal(f.journal.read().at(-1).phase,'upload_unknown');
 const before=f.calls.length;await assert.rejects(uploadReviewed(f));assert.equal(f.calls.length,before);assert.equal(posts(f).length,1);
});
test('moving artifacts to a new directory cannot bypass the Worker journal',async()=>{
 const f=fakeApi('upload-not-visible');await assert.rejects(uploadReviewed(f));
 const copy=mkdtempSync(path.join(os.tmpdir(),'checkpts-copy-'));cpSync(f.folder,copy,{recursive:true});
 await assert.rejects(uploadReviewed({...f,folder:copy,journal:new Journal(f.journal.root)}));assert.equal(posts(f).length,1);
});
for(const phase of ['upload_intent','upload_unknown','promotion_intent','promotion_unknown'])test('crash/restart with persisted '+phase+' blocks before any network call',async()=>{
 const f=fakeApi();f.journal.acquire();f.journal.append({...journalIdentity(f),phase});f.journal.unlock();
 await assert.rejects(uploadReviewed({...f,journal:new Journal(f.journal.root)}));assert.equal(f.calls.length,0);
});
test('failed intent persistence prevents upload',async()=>{
 const f=fakeApi();f.journal.append=()=>{throw Error('fixture disk failure');};await assert.rejects(uploadReviewed(f));assert.equal(posts(f).length,0);
});
test('corrupt or torn journal fails closed',async()=>{
 for(const data of ['broken\n','{}','']){const f=fakeApi();writeFileSync(f.journal.file,data);await assert.rejects(uploadReviewed(f));assert.equal(f.calls.length,0);}
});
test('concurrent invocation cannot acquire the same Worker lock',async()=>{
 const f=fakeApi();let resolveGate;const gate=new Promise(r=>resolveGate=r);let entered;const ready=new Promise(r=>entered=r);
 const first=uploadReviewed({...f,io:async(method,p,body)=>{if(method==='POST'){entered();await gate;}return f.io(method,p,body);}});
 await ready;await assert.rejects(uploadReviewed({...f,journal:new Journal(f.journal.root)}));resolveGate();await first;assert.equal(posts(f).length,1);
});
test('an existing crash lock never expires automatically',async()=>{
 const f=fakeApi();f.journal.acquire();try{await assert.rejects(uploadReviewed(f));assert.equal(f.calls.length,0);}finally{f.journal.unlock();}
});
test('legacy receipt is imported as unresolved and never overwritten',async()=>{
 const f=fakeApi(),file=path.join(f.folder,'release-receipt.json'),data=JSON.stringify({phase:'upload_intent'});writeFileSync(file,data);
 await assert.rejects(uploadReviewed(f));assert.equal(f.calls.length,0);assert.equal(readFileSync(file,'utf8'),data);assert.equal(f.journal.read().at(-1).phase,'legacy_unresolved');
});
test('GET-only reconcile attaches an observed candidate to the same unknown attempt without verifying bytes',async()=>{
 const f=fakeApi('upload-unknown');await assert.rejects(uploadReviewed(f));const before=posts(f).length;
 const r=await reconcile(f);assert.equal(r.phase,'upload_observed_unverified');assert.equal(posts(f).length,before);
 const history=f.journal.read();assert.equal(history.at(-1).attempt_id,history[0].attempt_id);
 const missing=await verifyUploaded(f);assert.equal(missing.phase,'verification_unavailable');assert.equal(missing.promotion_enabled,false);
 await assert.rejects(uploadReviewed(f));assert.equal(posts(f).length,before);
});
test('not finding a candidate once never unlocks an unknown attempt',async()=>{
 const f=fakeApi('upload-not-visible');await assert.rejects(uploadReviewed(f));const before=f.journal.read().length;
 assert.equal((await reconcile(f)).phase,'unresolved');assert.equal(f.journal.read().length,before);
 await assert.rejects(uploadReviewed(f));assert.equal(posts(f).length,1);
});
test('ambiguous candidate matches remain unresolved',async()=>{
 const f=fakeApi('ambiguous');await uploadReviewed(f);const r=await reconcile(f);assert.equal(r.reason,'ambiguous_candidates');assert.equal(posts(f).length,1);
});
test('config mismatch after upload never promotes or permits another upload',async()=>{
 const f=fakeApi('config-drift');await assert.rejects(uploadReviewed(f));await assert.rejects(uploadReviewed(f));assert.equal(posts(f).length,1);
});
for(const fault of ['etag-readback','js-readback','map-readback'])test('no readback mismatch scenario has a promotion capability: '+fault,async()=>{
 const f=fakeApi(fault);await uploadReviewed(f);await assert.rejects(promote(f));assert.equal(posts(f).length,1);
 assert.equal(f.calls.filter(c=>c.path===ROOT).length,0,'do not pretend active content proves inactive bytes');
});
test('old combined operation and promotion are disabled regardless of provided evidence',async()=>{
 let calls=0;const f={io:()=>{calls++;},verified:true};await assert.rejects(release(f));await assert.rejects(promote(f));assert.equal(calls,0);
});
test('transport rejects promotion, flags/routes/secrets and all writes without upload approval',async()=>{
 let calls=0;const request=async()=>{calls++;throw Error('should never run');};
 for(const approved of [false,true])for(const [method,p] of [['POST',ROOT+'/deployments'],['PUT',ROOT],['PATCH',ROOT+'/settings'],['POST',ROOT+'/secrets'],['POST','/zones/'+PIN.zone+'/workers/routes']])await assert.rejects(transport('fixture',{approved,request})(method,p));
 await assert.rejects(transport('fixture',{request})('POST',ROOT+'/versions?bindings_inherit=strict',{}));assert.equal(calls,0);
});

test('reconcile refuses config drift while leaving the original unknown attempt blocked',async()=>{
 const f=fakeApi('config-drift');await assert.rejects(uploadReviewed(f));const count=f.journal.read().length;
 await assert.rejects(reconcile(f));assert.equal(f.journal.read().length,count);assert.equal(posts(f).length,1);
});
test('reconcile refuses a foreign latest upload even when one matching candidate exists',async()=>{
 const f=fakeApi();await uploadReviewed(f);const count=f.journal.read().length;
 const io=async(method,p,body)=>{const r=await f.io(method,p,body);if(p.endsWith('/versions'))r.items.unshift({id:'dddddddd-dddd-dddd-dddd-dddddddddddd'});return r;};
 await assert.rejects(reconcile({...f,io}));assert.equal(f.journal.read().length,count);assert.equal(posts(f).length,1);
});
test('CI upload is explicitly unavailable without cross-runner state and shared release serialization',async()=>{
 const old=process.env.GITHUB_ACTIONS;process.env.GITHUB_ACTIONS='true';const f=fakeApi();
 try{await assert.rejects(productionUploadReviewed(f),/CI upload disabled/);assert.equal(f.calls.length,0);}finally{if(old===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=old;}
});

test('a separate process cannot replay an intent or acquire an existing Worker lock',()=>{
 const f=fakeApi();f.journal.acquire();f.journal.append({...journalIdentity(f),phase:'upload_intent'});
 const url=new URL('./checkpts-preserved-release.mjs',import.meta.url).href;
 const program=`import assert from 'node:assert/strict';import {Journal,uploadReviewed} from ${JSON.stringify(url)};
 const [root,folder,approvalJson]=process.argv.slice(1);let calls=0;delete process.env.GITHUB_ACTIONS; // Test journal guards, not the separate CI guard.
 await assert.rejects(uploadReviewed({folder,approval:JSON.parse(approvalJson),journal:new Journal(root),io:async()=>{calls++;throw Error('network forbidden');}}));
 assert.equal(calls,0);console.log('blocked');`;
 const child=()=>execFileSync(process.execPath,['--input-type=module','-e',program,f.journal.root,f.folder,JSON.stringify(f.approval)],{encoding:'utf8'}).trim();
 try{assert.equal(child(),'blocked');}finally{f.journal.unlock();}
 assert.equal(child(),'blocked');assert.equal(f.journal.read().length,1);
});

for(const fault of ['','etag-readback','js-readback','map-readback'])test('retained byte validator handles readback '+(fault||'success')+' without enabling promotion',async()=>{
 const f=fakeApi(fault),readback=await f.io('GET',ROOT),version=await f.io('GET',ROOT+'/versions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
 const call=()=>validateReadback({readback,version,manifest,map:read('candidate',PIN.module+'.map')});
 if(fault)await assert.rejects(call());else assert.equal((await call()).code_readback_exact,true);
 await assert.rejects(promote());assert.equal(posts(f).length,0);
});

for(const data of ['\n','\n\n'])test('blank-only journal blocks upload without network access: '+JSON.stringify(data),async()=>{
 const f=fakeApi();writeFileSync(f.journal.file,data);
 await assert.rejects(uploadReviewed(f),/journal contains no records/);
 assert.equal(f.calls.length,0,'no GET or POST may run for a malformed journal');
 assert.equal(readFileSync(f.journal.file,'utf8'),data,'preserve malformed evidence');
});
