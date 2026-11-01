import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {normalizeMeetingDetails,normalizeWrongLocation} from './model-meeting-details.mjs';
import {travelFixture,MODEL} from './model-travel-fixtures.mjs';
import {saveMeetingDetails,saveTravelTransport,projectTravel,meetingBinding} from './model-travel-store.mjs';
import modelWorker from '../admin-worker/src/model-liff-worker.js';
import eventsWorker from '../events-worker/src/model-eta-wrapper.js';

const condo=()=>({venue_type:'condo',meeting_point:'Lobby, east entrance',house_number:'',building:'A',floor:'12A',room_number:'0012',security_requires_room:true,pickup_required:true,vehicle_access_note:'Drop off at the lobby; do not use the car park entrance'});
const report=()=>({current_place:'Wrong hotel, west entrance',eta_minutes:18,transport_mode:'grab_taxi',report_id:'location-fixture-report-01'});

test('meeting details preserve leading zeros and house fractions, and require security room details only when selected',()=>{
  assert.equal(normalizeMeetingDetails(condo()).room_number,'0012');
  const home={...condo(),venue_type:'home',house_number:'0012/3',room_number:'',security_requires_room:false};
  assert.equal(normalizeMeetingDetails(home).house_number,'0012/3');
  assert.equal(normalizeMeetingDetails({...condo(),room_number:'',security_requires_room:false}).room_number,'');
  for(const bad of [{...condo(),room_number:''},{...home,house_number:''},{...condo(),location_name:'Another venue'},{...condo(),meeting_point:''},{...condo(),pickup_required:'true'},{...condo(),room_number:12}])assert.throws(()=>normalizeMeetingDetails(bad));
  for(const bad of [{...report(),eta_minutes:true},{...report(),eta_minutes:241},{...report(),current_place:''},{...report(),transport_mode:'unknown'},{...report(),agreed_location:'changed'}])assert.throws(()=>normalizeWrongLocation(bad));
});

test('private meeting and transport details supplement the agreed venue without changing the appointment or using message quota',async()=>{
  const {env,record}=travelFixture();record.fields.model_session_state='confirmed';record.fields.location_name='Agreed Condo';
  const identity={lineUserId:record.fields.line_user_id,memberId:record.fields.member_id},before=structuredClone(record);
  await saveMeetingDetails(env,record,identity,condo());await saveTravelTransport(env,record,MODEL,{mode:'private_car'});
  const model=await projectTravel(env,record,'model');assert.equal(model.appointment_location,'Agreed Condo');
  assert.equal(model.meeting_details.room_number,'0012');assert.equal(model.meeting_details.pickup_required,true);
  assert.equal(model.transport_details.mode,'private_car');assert.equal(model.messages_used,0);assert.deepEqual(record,before);
  await assert.rejects(saveMeetingDetails(env,record,{...identity,readGraceOnly:true},condo()));
  await assert.rejects(saveMeetingDetails(env,record,{lineUserId:'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},condo()));
  record.fields.location_name='Changed by the canonical appointment owner';
  assert.equal((await projectTravel(env,record,'model')).meeting_details,null);
  record.fields['Canonical Model']=['recReplacement'];
  assert.equal((await projectTravel(env,record,'customer')).transport_details,null);
});

async function runtimeFixture(run) {
  const {env,record}=travelFixture(),original=globalThis.fetch,sessionWrites=[],jobWrites=[];
  Object.assign(record.fields,{model_session_state:'arrived',location_name:'Agreed Hotel Lobby',job_date:new Date(Date.now()+7*3600000).toISOString().slice(0,10)});
  const job={id:'recJobFixture',fields:{session_id:record.fields.session_id,events_json:'[]'}};
  env.AUTH_SERVICE_ADMIN_TO_EVENTS='synthetic-location-bridge';env.AT_SESSIONS__STATE='model_session_state';
  const fetcher=async(input,init)=>{
    const request=input instanceof Request?input:new Request(input,init),url=new URL(request.url);
    assert.equal(url.hostname,'api.airtable.com','no real notification or external provider in tests');
    const table=decodeURIComponent(url.pathname.split('/')[3]),isJob=table==='Jobs';
    if(request.method==='GET')return Response.json({records:[structuredClone(isJob?job:record)]});
    assert.equal(request.method,'PATCH');const body=await request.json();
    (isJob?jobWrites:sessionWrites).push(body.fields);Object.assign((isJob?job:record).fields,body.fields);
    return Response.json(structuredClone(isJob?job:record));
  };
  globalThis.fetch=fetcher;env.AIRTABLE_HTTP={fetch:fetcher};env.EVENTS_WORKER={fetch:request=>eventsWorker.fetch(request,env,{})};
  const payload=Buffer.from(JSON.stringify({kind:'model_session',role:'model',model_record_id:MODEL,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const cookie='mmd_model_session_v1='+payload+'.'+createHmac('sha256',env.MODEL_SESSION_SIGNING_SECRET).update(payload).digest('hex');
  const call=async(issue=report())=>modelWorker.fetch(new Request('https://mmdbkk.com/v1/model/session/action',{
    method:'POST',headers:{cookie,origin:'https://mmdbkk.com','content-type':'application/json'},
    body:JSON.stringify({action:'report_wrong_location',session_id:record.fields.session_id,context_binding:await meetingBinding(env,record),report:issue})
  }),env,{});
  try {await run({env,record,job,sessionWrites,jobWrites,call});} finally {globalThis.fetch=original;}
}

test('wrong-location report keeps the agreed venue, records Events-owned ETA and returns arrived to en_route without payment writes',async()=>runtimeFixture(async f=>{
  const response=await f.call();assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.session.normalized_state,'en_route');assert.equal(result.eta.owner,'events-worker');
  assert.deepEqual(f.sessionWrites,[{model_session_state:'en_route'}]);
  assert.equal(f.record.fields.location_name,'Agreed Hotel Lobby');
  assert.equal(f.jobWrites.length,1);
  const event=JSON.parse(f.job.fields.events_json)[0];assert.equal(event.eta_minutes,18);
  assert.equal(event.location_issue.current_place,report().current_place);assert.equal(event.location_issue.agreed_location,'Agreed Hotel Lobby');
  const customer=await projectTravel(f.env,f.record,'customer');assert.equal(customer.eta.status,'active');
  assert.equal(customer.eta.location_report.current_place,report().current_place);assert.equal(customer.state,'en_route');
  assert.equal((await f.call()).status,200);assert.equal(f.jobWrites.length,1);assert.equal(f.sessionWrites.length,1);
  assert.equal((await f.call({...report(),current_place:'Different wrong location'})).status,409);
  f.record.fields.model_session_state='met_customer';assert.equal((await f.call({...report(),report_id:'new-report-after-meeting'})).status,409);
}));

test('failed ETA publication or a changed session during the report never returns false success or changes state',async()=>runtimeFixture(async f=>{
  const events=f.env.EVENTS_WORKER;
  f.env.EVENTS_WORKER={fetch:async()=>Response.json({ok:false,error:'storage_unavailable'},{status:503})};
  assert.equal((await f.call()).status,503);assert.equal(f.sessionWrites.length,0);assert.equal(f.record.fields.model_session_state,'arrived');
  f.env.EVENTS_WORKER={fetch:async request=>{const response=await events.fetch(request);f.record.fields.model_session_state='work_started';return response;}};
  assert.equal((await f.call()).status,409);assert.equal(f.sessionWrites.length,0);
}));
