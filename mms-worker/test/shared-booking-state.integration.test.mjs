import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { register } from 'node:module';
import { readSharedMmsJob, sharedBookingState, requestBookingState, publicBookingState } from '../src/shared-booking-state.mjs';
import { handleMmsMemberReadRequest } from '../src/member-read-runtime.mjs';
import { maybeHandleWorkspaceAdmin } from '../src/workspace-admin-runtime.mjs';
import { handleMyMmsCustomerApi } from '../../member-dashboard-chat-worker/src/my-mms-customer-app-front-gate.js';

// Run actual HTTP handlers; replace only the platform base class in Node.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true };
  return next(specifier, context);
}`.replace(/^\+/gm, '')), import.meta.url);
const { maybeHandleMyMmsDispatch } = await import('../src/my-mms-dispatch-runtime.mjs');
const jid = 'mmsjob_' + 'a'.repeat(24), pid = 'mmspre_' + 'b'.repeat(24);
const memberA = 'mmsmem_' + 'a'.repeat(32), memberB = 'mmsmem_' + 'b'.repeat(32);
const therapistA = 'mmst_' + 'c'.repeat(24), therapistB = 'mmst_' + 'd'.repeat(24);
const tables = Object.fromEntries(['PREBOOKINGS', 'JOBS', 'OFFERS', 'THERAPISTS'].map((k,i) => [k, 'tbl' + String(i).repeat(14)]));
const origin = 'https://www.mmdbkk.com';
const signedCookie = (env, id) => {
  const now = Math.floor(Date.now()/1000);
  const body = Buffer.from(JSON.stringify({ v:1, role:'mms_therapist', therapist_id:id, iat:now, exp:now+3600 })).toString('base64url');
  return '__Secure-mms_therapist_session=v1.' + body + '.' + createHmac('sha256', env.MMS_THERAPIST_SESSION_SECRET).update('mms-therapist-session-v1.'+body).digest('hex');
};

function fixture(t) {
  const prebooking = { id: 'rec'+'p'.repeat(14), fields: { 'Prebooking ID':pid, 'Member Ref':memberA, Status:'Confirmed', 'Service Date':'2026-11-15', 'Service Time':'19:30' } };
  const job = { id:'rec'+'j'.repeat(14), fields: { 'Job ID':jid, 'Prebooking ID':pid, 'Job Status':'Accepted', 'Accepted Therapist ID':therapistA,
    'Service Start At':'2026-11-15T12:30:00Z', 'Duration Minutes':90, Service:'Fixture service', 'Updated At':'2026-11-01T10:00:00Z',
    'Exact Address Private':'fixture-private-destination', 'Customer Contact Private':'fixture-private-contact', 'Customer Display Private':'fixture-private-name',
    'Map URL Private':'https://example.test/fixture-private-map', 'Travel Label':'กำลังเดินทาง', 'ETA Label':'35 นาที',
    'Internal Payload JSON':JSON.stringify({ customer_contact:'fixture-private-contact', is_test:false }) } };
  const offer = { id:'rec'+'o'.repeat(14), fields:{ 'Offer ID':'mmsoffer_'+'f'.repeat(24), 'Job ID':jid, 'Therapist ID':therapistA, 'Offer Status':'Offered' } };
  const control = { state:'ACCEPTED', owner:therapistA, failure:false, jobsFailure:false, offset:false, duplicate:false, authStatus:'Active', access:'Approved', claims:0, keys:new Set(), writes:[], actor:memberA };
  const therapist = id => ({ id:'rec'+'t'.repeat(14), fields:{ 'Therapist ID':id, Status:'Active', 'Therapist Auth Status':control.authStatus, 'LINE Subject Hash':'fixture-only-hash', 'MY MMS Access':control.access } });
  const env = { AIRTABLE_API_TOKEN:'fixture-token-only', AIRTABLE_BASE_ID:'app'+'s'.repeat(14), MMS_THERAPIST_SESSION_SECRET:'fixture-session-secret-only-1234567890123456', ALLOWED_ORIGINS:origin,
    ...Object.fromEntries(Object.entries(tables).map(([k,v])=>['AIRTABLE_'+k+'_TABLE_ID',v])),
    MMS_DISPATCH_COORDINATOR:{ idFromName:id=>id, get:()=>({
      snapshot:async id=>{ if(control.failure)throw Error('fixture unavailable'); return {job:{job_id:id,state:control.state,winner_therapist_id:control.owner}}; },
      accept:async(id,who,key)=>{if(!control.keys.has(key)){control.keys.add(key);control.claims++;}control.state='ACCEPTED';control.owner=who;return {state:'ACCEPTED',winner_therapist_id:who};},
    }) },
    MMS_THERAPIST_SCHEDULE_COORDINATOR:{ idFromName:id=>id, get:()=>({reserve:async()=>({state:'RESERVED'}),release:async()=>({state:'RELEASED'})}) },
  };
  t.mock.method(globalThis, 'fetch', async(input,init={})=>{
    const url=new URL(String(input)); assert.equal(url.hostname,'api.airtable.com','No real provider or LINE call');
    const table=url.pathname.split('/').pop();
    if(init.method==='PATCH') { control.writes.push(table); const fields=JSON.parse(init.body).fields;Object.assign(job.fields,fields);return Response.json(job); }
    const filter=url.searchParams.get('filterByFormula')||'';
    if(table===tables.THERAPISTS) return Response.json({records:[therapist(filter.includes(therapistB)?therapistB:therapistA)]});
    if(table===tables.PREBOOKINGS) return Response.json({records:control.preMalformed?null:filter.includes(memberB)?[]:control.preDuplicate?[prebooking,prebooking]:[prebooking],...(control.preOffset?{offset:'fixture-more'}:{})});
    if(table===tables.JOBS) {
      if(control.jobsFailure)return new Response(null,{status:503});
      return Response.json({records:control.jobsMalformed?null:control.duplicate?[job,{...job,id:'rec'+'x'.repeat(14)}]:[job],...(control.offset?{offset:'fixture-more'}:{})});
    }
    if(table===tables.OFFERS)return Response.json({records:[offer]});
    throw Error('Unexpected fixture table');
  });
  const customerEnv = { MMS_MEMBER_WORKER:{fetch:async request=>Response.json({ok:true,data:{registered:true,profile:{member_id:request.headers.get('cookie')==='fixture-B'?memberB:memberA}}})},
    MMS_WORKER:{fetch:request=>handleMmsMemberReadRequest(request,env)} };
  return { env,control,job,prebooking,
    customer:(cookie='fixture-A',path='/bookings/current')=>handleMyMmsCustomerApi(new Request(origin+'/api/mms/app'+path,{headers:{cookie}}),customerEnv),
    native:(who=therapistA,action='',key='fixture-request-001')=>maybeHandleMyMmsDispatch(new Request(origin+'/male-massage/therapists/api/app/'+(action==='accept'?'offers/':'jobs/')+jid+(action?'/'+action:''),{
      ...(action?{method:'POST',body:JSON.stringify({requestKey:key})}:{}),headers:{Cookie:signedCookie(env,who),Origin:origin,'Content-Type':'application/json'},
    }),env),
    nativeList:()=>maybeHandleMyMmsDispatch(new Request(origin+'/male-massage/therapists/api/app/jobs',{headers:{Cookie:signedCookie(env,therapistA)}}),env),
    workspace:()=>maybeHandleWorkspaceAdmin(new Request('https://mms.internal/internal/mms/admin/workspace'),env),
  };
}

test('customer, Therapist and Console share current coordinator state even when Airtable is stale', async t=>{
  const f=fixture(t);
  for(const [state,status] of [['ACCEPTED','pending'],['IN_PROGRESS','in_progress'],['COMPLETED','completed'],['CANCELLED','cancelled']]) {
    f.control.state=state;
    const customer=await(await f.customer('fixture-A','/bookings')).json();
    const native=await(await f.native()).json();const admin=await(await f.workspace()).json();
    assert.equal(customer.data[0].status,status);assert.equal(native.data.state,state);
    assert.deepEqual(customer.data[0].bookingState,native.data.bookingState);assert.deepEqual(native.data.bookingState,admin.jobs[0].bookingState);
    assert.equal(native.data.bookingState.confirmation,'checking');assert.equal(native.data.bookingState.payment,'checking');
    assert.equal(customer.data[0].etaMinutes,state==='ACCEPTED'?35:null);
    const privateView=JSON.stringify(native.data.disclosure);
    assert.doesNotMatch(privateView,/fixture-private-contact/);
    assert.doesNotMatch(privateView,/fixture-private-name/);
    if(['COMPLETED','CANCELLED'].includes(state))assert.doesNotMatch(privateView,/fixture-private/);
    else assert.equal(native.data.disclosure.addressLabel,'fixture-private-destination');
  }
});

test('Prebooking cancellation overrides stale active job and revokes disclosure and service writes',async t=>{
  const f=fixture(t);f.prebooking.fields.Status='Cancelled';
  const n=await(await f.native()).json();assert.equal(n.data.state,'CANCELLED');assert.equal(n.data.disclosure.locationUnlocked,false);
  assert.doesNotMatch(JSON.stringify(n.data),/fixture-private/);
  assert.equal((await f.native(therapistA,'start')).status,409);assert.equal((await f.native(therapistA,'complete')).status,409);
  assert.equal(f.control.writes.length,0);assert.equal((await(await f.workspace()).json()).jobs[0].status,'Cancelled');
});

test('forged/missing session and a different Therapist cannot read another job',async t=>{
  const f=fixture(t);
  assert.equal((await f.native(therapistB)).status,404);
  const unauth=await maybeHandleMyMmsDispatch(new Request(origin+'/male-massage/therapists/api/app/jobs/'+jid),f.env);
  assert.equal(unauth.status,401);
  for(const [field,value] of [['authStatus','Unlinked'],['access','Revoked']]){f.control[field]=value;const res=await f.native();assert.equal(res.status,403);f.control[field]=field==='access'?'Approved':'Active';}
});

test('changed coordinator owner locks stale disclosure rather than trusting Airtable owner',async t=>{
  const f=fixture(t);f.control.owner=therapistB;
  const res=await f.native();assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/fixture-private/);
  const c=await(await f.customer()).json();assert.equal(c.data.status,'checking');assert.equal(c.data.etaMinutes,null);
  const admin=await(await f.workspace()).json();assert.equal(admin.complete,false);assert.equal(admin.jobs[0].therapist_id,null);
});

test('unavailable authority stays checking and account switch never reuses previous member data',async t=>{
  const f=fixture(t);assert.equal((await(await f.customer()).json()).data.id,pid);
  assert.equal((await(await f.customer('fixture-B')).json()).data,null);
  f.control.failure=true;const c=await(await f.customer()).json();assert.equal(c.data.status,'checking');assert.equal(c.data.travelStatus,'checking');assert.equal(c.data.etaMinutes,null);
  assert.equal((await f.native()).status,503);assert.equal((await(await f.workspace()).json()).complete,false);
});

test('job source failure, pagination and duplicate assignment never become empty or confirmed',async t=>{
  const f=fixture(t);
  for(const flag of ['jobsFailure','offset','duplicate']){f.control[flag]=true;const res=await f.customer();assert.equal(res.status,200);const d=(await res.json()).data;assert.equal(d.id,pid);assert.equal(d.status,'checking');assert.equal(d.etaMinutes,null);f.control[flag]=false;}
});

test('accept retries remain assignment-only and never assert deposit verification',async t=>{
  const f=fixture(t);f.control.state='OFFERED';f.control.owner=null;f.job.fields['Accepted Therapist ID']='';
  for(let i=0;i<2;i++){const r=await f.native(therapistA,'accept');assert.equal(r.status,200);const d=(await r.json()).data;assert.equal(d.state,'ACCEPTED');assert.equal(d.bookingState.status,'pending');assert.equal(d.bookingState.confirmation,'checking');assert.doesNotMatch(d.message,/CONFIRMED|ยืนยันนัดแล้ว/);}
  assert.equal(f.control.claims,1);
});

test('legacy confirmation/completion labels cannot manufacture verified operational state',()=>{
  for(const label of ['Confirmed','Scheduled','Completed']){const s=requestBookingState(label);assert.equal(s.status,'checking');assert.equal(s.confirmation,'checking');}
  assert.equal(publicBookingState({status:'confirmed',schema:'mms_booking_state_v1'}).status,'checking');
  assert.equal('private' in publicBookingState({...sharedBookingState('ACCEPTED'),private:'hidden'}),false);
});

test('contradictory snapshot state/winner and invalid job IDs structurally redact private data',async t=>{
  const f=fixture(t);f.control.state='OFFERED';
  for(const record of [f.job,{...f.job,fields:{...f.job.fields,'Job ID':'invalid'}}]){const s=await readSharedMmsJob(f.env,record,{prebooking:f.prebooking});assert.equal(s.state,'CHECKING');assert.equal(s.disclosureAllowed,false);assert.doesNotMatch(JSON.stringify(s.record),/fixture-private/);}
});


test('malformed and incomplete customer sources cannot become empty success', async t => {
  const f=fixture(t);
  for(const flag of ['preMalformed','preDuplicate','preOffset']) {
    f.control[flag]=true; assert.equal((await f.customer()).status,503); f.control[flag]=false;
  }
  for(const [key,value] of [['Prebooking ID','invalid'],['Service Date','2026-02-30'],['Member Ref',memberB]]) {
    const before=f.prebooking.fields[key]; f.prebooking.fields[key]=value;
    assert.equal((await f.customer()).status,503); f.prebooking.fields[key]=before;
  }
});

test('native malformed/paginated reads fail closed and Console rejects malformed Jobs', async t => {
  const f=fixture(t);
  for(const flag of ['jobsMalformed','offset']) {
    f.control[flag]=true; assert.equal((await f.nativeList()).status,503);
    assert.equal((await f.native()).status,503); f.control[flag]=false;
  }
  f.control.jobsMalformed=true; assert.equal((await f.workspace()).status,503);
  f.control.jobsMalformed=false; f.control.duplicate=true; assert.equal((await f.workspace()).status,503);
});

test('waiting-customer requests preserve their support cue without claiming confirmation', async t => {
  const f=fixture(t); f.prebooking.fields.Status='Waiting Customer';
  const c=await(await f.customer()).json(); assert.equal(c.data.needsAttention,true);
  assert.equal(c.data.nextAction.kind,'contact_support'); assert.equal(c.data.bookingState.confirmation,'checking');
});

test('authority timeout and route cancellation lock disclosure and allow a clean retry', async t => {
  const f=fixture(t), original=f.env.MMS_DISPATCH_COORDINATOR;
  f.env.MMS_DISPATCH_COORDINATOR={idFromName:id=>id,get:()=>({snapshot:()=>new Promise(()=>{})})};
  const deadline=performance.now();
  const timeout=await readSharedMmsJob(f.env,f.job,{prebooking:f.prebooking});
  assert.equal(timeout.state,'CHECKING'); assert.ok(performance.now()-deadline<3000);
  const abort=new AbortController(); const pending=readSharedMmsJob(f.env,f.job,{signal:abort.signal,prebooking:f.prebooking}); abort.abort();
  assert.equal((await pending).state,'CHECKING');
  f.env.MMS_DISPATCH_COORDINATOR=original;
  assert.equal((await readSharedMmsJob(f.env,f.job,{prebooking:f.prebooking})).state,'ACCEPTED');
});


test('native list and detail reject a source row from another requested scope', async t => {
  const f=fixture(t); f.job.fields['Accepted Therapist ID']=therapistB;
  assert.equal((await f.nativeList()).status,503);
  f.job.fields['Accepted Therapist ID']=therapistA; f.job.fields['Job ID']='mmsjob_'+'e'.repeat(24);
  assert.equal((await f.native()).status,503);
});
