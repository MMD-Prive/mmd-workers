import test from 'node:test';
import assert from 'node:assert/strict';
import { readAdminCalendar, calendarPageResponse } from './admin-calendar-runtime-v2.js';

const IDS = {
  sessions:'tblC98mKWbzmPuNzX', jobs:'tbl0jxIjN8QYwGABX', payments:'tblWGGJJOx5eBvBZJ', clients:'tblVv58TCbwh5j1fS', models:'tblI4B0bI446vp9GX', cal:'tbl6saWYEQrEdnMIK'
};
const f = {
  sid:'fldLTq2kZbyRv22IA', jid:'fldHw5HdDDdkHXMhG', client:'fld6P6if0vDZCeV0C', model:'fldrXQAyOMPCvbOaY', start:'fldBeG0FkWwa8kgnp', end:'fldiDSz0wW9Ct9I3P', duration:'fldP7Xx99uf5BvJpF', ack:'fldFgkHXivIAThfDz', modelState:'fld57fhdWqIcOy4Jp', total:'fldeBf4gl5iTBj7eX', paymentRef:'fldojgjSQLaO0uQLX',
  jobId:'fldwreJwlz8sWd6GM', jobModel:'fldscPK15ejBw0BAH', jobClient:'fldlPdR0pmynCY6fW', jobBudget:'fldSspHLxJPQOg7wA',
  paySid:'fld2wdhBvc8xrV6y5', payRef:'fldOO6SY49iDw8VBZ', payAmount:'fldvCSwrUW8OMAooS', payVerify:'fldJ7a0Ube9F0bmRy', payStage:'fldrr9g8ZZjqAbdKQ', payStatus:'fldEJ1hmm7KwWuI6q',
  clientName:'fldrHqkGQzvBLRxlP', modelName:'fldShiT60bmCxFxRu', modelId:'fldVWbT0gsSe0hn7Q', modelKey:'fldYvAbkENGQ4NaaI', modelAvailability:'fld6RuUDmGcGDc34i', modelLine:'fld2ywTFI6MZhX6PV',
  calUid:'fld42rRY3ufGeXCcf', calSid:'fldd0STLRxOGIKXPn', calJid:'fldzvGB5u7t55kwUQ', calStatus:'fld449t1h6s7jbcnf', calTrigger:'fldNhk22zLTvR9Y4C', calEvent:'fldfC6D0RXyogXcMG'
};

function fixture({ verified=false, duration=3, crossMidnight=false }={}) {
  const start='2026-09-17T15:00:00.000Z';
  const end=crossMidnight?'2026-09-17T19:30:00.000Z':'2026-09-17T18:00:00.000Z';
  return {
    [IDS.sessions]:[{id:'recSession',fields:{[f.sid]:'SES-17',[f.jid]:'JOB-17',[f.client]:['recClient'],[f.model]:['recModel'],[f.start]:start,[f.end]:end,[f.duration]:duration,[f.ack]:'2026-09-14T01:00:00Z',[f.modelState]:'model_confirmed',[f.total]:20000,[f.paymentRef]:'PAY-17'}}],
    [IDS.jobs]:[{id:'recJob',fields:{[f.jobId]:'JOB-17',[f.jobClient]:['recClient'],[f.jobModel]:['recModel'],[f.jobBudget]:20000}}],
    [IDS.payments]:[{id:'recPay',fields:{[f.paySid]:'SES-17',[f.payRef]:'PAY-17',[f.payAmount]:10000,[f.payVerify]:verified?'official_verified':'pending_review',[f.payStage]:'deposit',[f.payStatus]:verified?'paid':'pending'}}],
    [IDS.clients]:[{id:'recClient',fields:{[f.clientName]:'คุณเอ็ม'}}],
    [IDS.models]:[{id:'recModel',fields:{[f.modelName]:'Model A',[f.modelId]:'GWs17',[f.modelKey]:'mdl_pub_model_a',[f.modelAvailability]:'Available',[f.modelLine]:'U0123456789abcdef0123456789abcdef'}}],
    [IDS.cal]:[{id:'recCal',fields:{[f.calUid]:'cal-uid-real-17',[f.calSid]:'SES-17',[f.calJid]:'JOB-17',[f.calStatus]:'linked',[f.calTrigger]:'BOOKING_CREATED',[f.calEvent]:'2026-09-14T02:00:00Z'}}],
  };
}
function installFetch(data){
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=new URL(input instanceof Request ? input.url : String(input));
    const table=decodeURIComponent(url.pathname.split('/').pop());
    return Response.json({records:data[table]||[]});
  };
  return ()=>{globalThis.fetch=original};
}
function availabilitySnapshot(state='available_today', confidence='model_confirmed', ttlMs=60*60*1000){
  const now=Date.now();
  return {
    schema:'sigil_availability_snapshot_v1',
    model_key:'mdl_pub_model_a',
    safe_availability_state:state,
    availability_bucket:state==='available_now'?'now':state==='available_today'?'today':state,
    city:'Bangkok',
    zones:[],
    operational_flags:{},
    confidence,
    updated_at:new Date(now-60_000).toISOString(),
    expires_at:new Date(now+ttlMs).toISOString(),
  };
}
function availabilityKv(entries={}, {throwOnGet=[]}={}){
  return {
    async list({prefix}={}){
      return {keys:Object.keys(entries).filter(k=>!prefix||k.startsWith(prefix)).map(name=>({name})),list_complete:true};
    },
    async get(key,type){
      if(throwOnGet.includes(key))throw Error('kv_read_failed');
      const value=entries[key];
      if(!value)return null;
      return type==='json'?structuredClone(value):JSON.stringify(value);
    },
  };
}

test('calendar joins client job model deposit and real Cal booking UID', async()=>{
  const restore=installFetch(fixture());
  try{
    const out=await readAdminCalendar({AIRTABLE_API_KEY:'test'},'2026-09-17');
    assert.equal(out.ok,true);
    assert.equal(out.schema,'mmd.admin.calendar.v1');
    assert.equal(out.items.length,1);
    const row=out.items[0];
    assert.equal(row.client.name,'คุณเอ็ม');
    assert.equal(row.job.job_id,'JOB-17');
    assert.equal(row.model.name,'Model A');
    assert.equal(row.deposit.amount_thb,10000);
    assert.equal(row.deposit.authority,'payments-worker');
    assert.equal(row.cal.booking_uid,'cal-uid-real-17');
    assert.equal(row.internal_hold,true);
  } finally { restore(); }
});

test('calendar returns live model and MMS therapist availability even on an empty day', async()=>{
  const data=fixture();
  data[IDS.sessions]=[];
  const restore=installFetch(data);
  try{
    const out=await readAdminCalendar({
      AIRTABLE_API_KEY:'test',
      SIGIL_AVAILABILITY_SNAPSHOTS:availabilityKv({
        'availability:v1:mdl_pub_model_a':availabilitySnapshot('available_today','model_confirmed'),
      }),
      MMS_WORKER:{
        async fetch(request){
          assert.equal(new URL(request.url).hostname,'mms.internal');
          return Response.json({
            ok:true,
            therapists:[{
              therapist_id:'mmst_test1234567890123456',
              display_name:'Therapist A',
              availability_status:'Limited',
              public_photo_url:'https://images.example.test/therapist-a.webp',
              status:'Active',
              matching_enabled:true,
              internal_notes:'must-not-project',
            }],
          });
        },
      },
    },'2026-09-19');
    assert.equal(out.items.length,0);
    assert.equal(out.availability.models[0].name,'Model A');
    assert.equal(out.availability.models[0].availability_status,'available_today');
    assert.equal(out.availability.models[0].snapshot_state,'fresh');
    assert.equal(out.availability.models[0].confidence,'model_confirmed');
    assert.equal(out.availability.models[0].line_connected,true);
    assert.doesNotMatch(JSON.stringify(out.availability.models[0]),/U0123456789abcdef/);
    assert.equal(out.availability.model_source_status,'ok');
    assert.equal(out.availability.model_counts.fresh,1);
    assert.equal(out.availability.therapists[0].display_name,'Therapist A');
    assert.equal(out.availability.therapists[0].availability_status,'Limited');
    assert.equal(out.availability.therapists[0].public_photo_url,'https://images.example.test/therapist-a.webp');
    assert.equal(out.availability.therapist_source_status,'ok');
    assert.doesNotMatch(JSON.stringify(out.availability),/must-not-project/);
  } finally { restore(); }
});

test('calendar never guesses availability from stale Airtable profile fields when no fresh snapshot exists', async()=>{
  const data=fixture();
  data[IDS.sessions]=[];
  const restore=installFetch(data);
  try{
    const out=await readAdminCalendar({
      AIRTABLE_API_KEY:'test',
      SIGIL_AVAILABILITY_SNAPSHOTS:availabilityKv({}),
    },'2026-09-19');
    assert.equal(out.availability.models[0].availability_status,'unconfirmed');
    assert.equal(out.availability.models[0].snapshot_state,'missing');
    assert.equal(out.availability.models[0].availability_fresh,false);
    assert.equal(out.availability.model_counts.unconfirmed,1);
    assert.notEqual(out.availability.models[0].availability_status,'Available');
  } finally { restore(); }
});

test('expired availability snapshots fail closed and do not stay available', async()=>{
  const data=fixture();
  data[IDS.sessions]=[];
  const stale=availabilitySnapshot('available_now','operator_confirmed',-60_000);
  const restore=installFetch(data);
  try{
    const out=await readAdminCalendar({
      AIRTABLE_API_KEY:'test',
      SIGIL_AVAILABILITY_SNAPSHOTS:availabilityKv({'availability:v1:mdl_pub_model_a':stale}),
    },'2026-09-19');
    assert.equal(out.availability.models[0].availability_status,'unconfirmed');
    assert.equal(out.availability.models[0].snapshot_state,'stale');
    assert.equal(out.availability.model_counts.stale,1);
  } finally { restore(); }
});


test('calendar recovery queue follows canonical connection and safe evidence only', async()=>{
  const data=fixture();
  data[IDS.sessions]=[];
  data[IDS.models][0].fields[f.modelLine]='';
  const restore=installFetch(data);
  try{
    const out=await readAdminCalendar({
      AIRTABLE_API_KEY:'test',
      SIGIL_AVAILABILITY_SNAPSHOTS:availabilityKv({
        'availability-adoption:v1:recovery:mdl_pub_model_a':{
          model_key:'mdl_pub_model_a',
          activation_link_issued_at:'2026-09-23T00:00:00.000Z',
          activation_link_expires_at:'2099-01-01T00:00:00.000Z',
          activation_url:'PRIVATE',
          line_user_id:'U0123456789abcdef0123456789abcdef',
        },
      }),
    },'2026-09-19');
    const row=out.availability.models[0];
    assert.equal(row.recovery_stage,'line_link_issued_waiting_for_connection');
    assert.equal(row.recovery_action,'wait_for_line_connection');
    assert.equal(row.follow_up_at,'2099-01-01T00:00:00.000Z');
    assert.equal(out.availability.recovery_counts.line_link_issued_waiting_for_connection,1);
    assert.doesNotMatch(JSON.stringify(row),/PRIVATE|activation_url|U0123456789abcdef/);
  } finally { restore(); }
});

test('daily coverage health only reports fresh canonical snapshot coverage', async()=>{
  const data=fixture();
  data[IDS.sessions]=[];
  const restore=installFetch(data);
  try{
    const out=await readAdminCalendar({
      AIRTABLE_API_KEY:'test',
      SIGIL_AVAILABILITY_SNAPSHOTS:availabilityKv({
        'availability:v1:mdl_pub_model_a':availabilitySnapshot('available_today','model_confirmed'),
      }),
    },'2026-09-19');
    const health=out.availability.coverage_health;
    assert.equal(health.schema,'mmd.availability.coverage-health.v1');
    assert.equal(health.review_status,'coverage_current');
    assert.equal(health.fresh_models,1);
    assert.equal(health.canonical_models,1);
    assert.equal(health.fresh_coverage_percent,100);
    assert.equal(health.owner_action_required,0);
    assert.equal(health.automatic_send,false);
    assert.equal(health.no_guess,true);
  } finally { restore(); }
});

test('calendar recovery queue fails closed when one model evidence read fails', async()=>{
  const data=fixture();
  data[IDS.sessions]=[];
  const restore=installFetch(data);
  try{
    const out=await readAdminCalendar({
      AIRTABLE_API_KEY:'test',
      SIGIL_AVAILABILITY_SNAPSHOTS:availabilityKv({}, {throwOnGet:['availability-adoption:v1:recovery:mdl_pub_model_a']}),
    },'2026-09-19');
    const row=out.availability.models[0];
    assert.equal(out.availability.recovery_source_status,'partial');
    assert.equal(row.snapshot_state,'source_unavailable');
    assert.equal(row.recovery_stage,'source_unavailable');
    assert.equal(row.recovery_action,'wait_for_source');
    assert.equal(out.availability.coverage_health.review_status,'source_attention');
    assert.equal(out.availability.coverage_health.owner_action_required,0);
  } finally { restore(); }
});

test('an expired confirmation after a reminder starts a new recovery gap', async()=>{
  const data=fixture();
  data[IDS.sessions]=[];
  const restore=installFetch(data);
  try{
    const out=await readAdminCalendar({
      AIRTABLE_API_KEY:'test',
      SIGIL_AVAILABILITY_SNAPSHOTS:availabilityKv({
        'availability:v1:mdl_pub_model_a':availabilitySnapshot('available_today','model_confirmed',-60_000),
        'availability-adoption:v1:recovery:mdl_pub_model_a':{reminder_sent_at:'2020-01-01T00:00:00.000Z'},
      }),
    },'2026-09-19');
    const row=out.availability.models[0];
    assert.equal(row.snapshot_state,'stale');
    assert.equal(row.recovery_stage,'availability_confirmation_required');
    assert.equal(row.recovery_action,'remind_model');
  } finally { restore(); }
});

test('verified deposit clears Internal Hold without changing payment authority', async()=>{
  const restore=installFetch(fixture({verified:true}));
  try{
    const out=await readAdminCalendar({AIRTABLE_API_KEY:'test'},'2026-09-17');
    assert.equal(out.items[0].deposit.verified,true);
    assert.equal(out.items[0].internal_hold,false);
    assert.equal(out.items[0].deposit.authority,'payments-worker');
  } finally { restore(); }
});

test('work over five hours enters pricing review', async()=>{
  const restore=installFetch(fixture({duration:6}));
  try{
    const out=await readAdminCalendar({AIRTABLE_API_KEY:'test'},'2026-09-17');
    assert.equal(out.items[0].pricing.review_required,true);
  } finally { restore(); }
});

test('worker calendar page is noindex and fetches protected API', async()=>{
  const page=calendarPageResponse();
  const html=await page.text();
  assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
  assert.match(html,/\/v1\/admin\/calendar/);
  assert.match(html,/Client \+ Job \+ Model \+ Deposit \+ Cal booking UID/);
  assert.match(html,/ตารางงาน/);
  assert.match(html,/รอมัดจำ/);
  assert.match(html,/เช็กราคา/);
  assert.doesNotMatch(html,/>Therapists<|>Pricing Review</);
});
