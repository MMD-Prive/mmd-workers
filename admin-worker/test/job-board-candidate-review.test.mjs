import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAdminBroadcastRead } from '../src/job-board-owner-publish.js';
import { handlePublicJobBoardV2Request, createJobRecord } from '../../public-access-worker/src/public-job-board-v2.js';
import { jobBoardCandidateReview } from '../src/job-board-candidate-review.js';
import { handleSessionCreatorPageRequest } from '../src/session-creator-page-proxy.js';

function fixture(world='public') {
  const rows=new Map(); let writes=0;
  const job={...createJobRecord({brief:'Test job',world,status:'published'}),id:'JOB-TEST-ONE'};
  const ref='APP-TEST-ONE', prefix='public-job-board/v2/';
  const application={schema:'mmd_public_job_board_v2.application',application_ref:ref,job_id:job.id,submission_status:'submitted',workflow_status:'candidate_pending_owner',identity:{identity_class:'UNVERIFIED_CANDIDATE',verified_model_record_id:null},controls:{auto_bind:false},applicant:{nickname:'TEST',line_id:'test-line',phone:''},uploads:Array.from({length:10},(_,i)=>({slot:i+1,kind:i<8?'photo':i===8?'clip':'compcard',content_type:i===8?'video/mp4':'image/jpeg',key:prefix+'private-media/'+job.id+'/'+ref+'/'+(i+1)+(i===8?'.mp4':'.jpg')}))};
  rows.set(prefix+'jobs/'+job.id+'.json',JSON.stringify(job));
  const appKey=prefix+'applications/'+job.id+'/'+ref+'.json';rows.set(appKey,JSON.stringify(application));
  for(const u of application.uploads)rows.set(u.key,new Uint8Array([u.slot,7,8]));
  const env={PUBLIC_JOB_BOARD_SIGNING_SECRET:'local-test-signing-secret-32-characters',PUBLIC_ACCESS_EVIDENCE:{get:async key=>{if(!rows.has(key))return null;const data=rows.get(key);return {text:async()=>data,body:new Response(data).body}},list:async({prefix})=>({objects:[...rows.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}),put:async()=>{writes++;throw Error('read must not write')}}};
  const adminEnv={PUBLIC_JOB_BOARD_WORKER:{fetch:r=>handlePublicJobBoardV2Request(r,env)}};
  const actor={id:'test-admin',role:'admin'};
  const read=(suffix='',who=actor)=>handleAdminBroadcastRead(new Request('https://mmdbkk.com/v1/admin/jobs/broadcast/'+job.id+'/candidates'+suffix),adminEnv,who);
  return {read,rows,application,appKey,env,writes:()=>writes};
}

test('existing admin scope reads job-bound submitted applicant and all ten media without mutations, including Private jobs',async()=>{
 for(const world of ['public','private']){
  const f=fixture(world), before=JSON.stringify([...f.rows]);
  const data=await (await f.read()).json();assert.equal(data.ok,true);assert.equal(data.job.id,'JOB-TEST-ONE');assert.equal(data.job.public.world,world);assert.equal(data.candidates[0].applicant.line_id,'test-line');
  for(let slot=1;slot<=10;slot++){const r=await f.read('/APP-TEST-ONE/media/'+slot);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store, private');assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[slot,7,8]);}
  assert.equal(f.writes(),0);assert.equal(JSON.stringify([...f.rows]),before);assert.equal(data.candidates[0].identity.verified_model_record_id,null);assert.equal(data.candidates[0].controls.auto_bind,false);
 }
});

test('anonymous and non-admin actors cannot read either candidates or media',async()=>{
 const f=fixture();for(const actor of [null,{id:'test-model',role:'model'},{role:'admin'}])for(const suffix of ['', '/APP-TEST-ONE/media/1'])assert.equal((await f.read(suffix,actor)).status,401);
 const publicRead=await handlePublicJobBoardV2Request(new Request('https://sigil.mmdbkk.com/public/api/jobs/internal/jobs/JOB-TEST-ONE/candidates'),f.env);assert.equal(publicRead.status,403);
});

test('media rejects wrong application, cross-job record, cross-application key, dangerous MIME, absent object and unsubmitted draft',async()=>{
 const f=fixture();assert.equal((await f.read('/APP-OTHER/media/1')).status,404);
 for(const change of [a=>a.job_id='JOB-OTHER',a=>a.uploads[0].key='public-job-board/v2/private-media/JOB-OTHER/APP-OTHER/1.jpg',a=>a.uploads[0].content_type='text/html',a=>a.uploads[0].key+='missing',a=>a.submission_status='draft']){
 const a=structuredClone(f.application);change(a);f.rows.set(f.appKey,JSON.stringify(a));assert.equal((await f.read('/APP-TEST-ONE/media/1')).status,404);
 }
 assert.equal(f.writes(),0);
});

test('review is injected only on successful Job Board HTML, leaves composer and other pages intact',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('<html><body><div id="root">composer</div></body></html>',{headers:{'content-type':'text/html'}});
 try{for(const page of ['job-board','all']){const html=await (await handleSessionCreatorPageRequest(new Request('https://mmdbkk.com/internal/admin/jobs/'+page))).text();assert.equal(html.includes('id="jb-review"'),page==='job-board');assert.ok(html.includes('composer'));}}
 finally{globalThis.fetch=original;}
 const html=jobBoardCandidateReview();const script=html.match(/<script>([\s\S]*)<\/script>/)[1];assert.doesNotThrow(()=>new Function(script));assert.ok(!html.includes('data-decision'));assert.ok(html.includes("credentials:'same-origin'"));
});

test('admin bridge forwards authenticated video range and preserves partial response headers',async()=>{
 const env={PUBLIC_JOB_BOARD_WORKER:{fetch:async r=>{assert.equal(r.headers.get('range'),'bytes=1-2');assert.match(r.headers.get('x-mmd-owner-scope'),/^[a-f0-9]{64}$/);return new Response(new Uint8Array([2,3]),{status:206,headers:{'content-type':'video/mp4','accept-ranges':'bytes','content-range':'bytes 1-2/4','content-length':'2'}})}}};
 const r=await handleAdminBroadcastRead(new Request('https://mmdbkk.com/v1/admin/jobs/broadcast/JOB-TEST/candidates/APP-TEST/media/9',{headers:{range:'bytes=1-2'}}),env,{id:'test-admin',role:'admin'});
 assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 1-2/4');assert.equal(r.headers.get('content-length'),'2');assert.equal(r.headers.get('cache-control'),'no-store, private');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[2,3]);
});
