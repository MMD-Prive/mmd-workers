import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReconfirmFreshness,revisionAuditLine,reconfirmSnapshot} from './src/model-reconfirm-freshness.js';
import {runModelReconfirmSweep,buildReconfirmSchedule} from './src/model-reconfirm-runtime.js';
const NOW=Date.parse('2026-10-03T13:00:00Z');
const record=()=>({id:'recWT7FLsJrf1eH6G',fields:{session_id:'sess_fixture',session_state:'confirmed',job_date:'2026-10-04',start_time:'2026-10-04T10:45:00.000Z',end_time:'2026-10-04T12:15:00.000Z',location_name:'Fixture Hotel', 'Canonical Model':['recMODELAAAAAAAAAA'], Client:['recCLIENTAAAAAAAAA'], notes:'history',paid_received_sum:30000,customer_amount_due_thb:0}});
const change=(status='applied')=>({id:'recChange',fields:{fldWMwebmHhyVQLzW:'ccr_fixture',fldbL2Ya44l6xEYe1:['recWT7FLsJrf1eH6G'],fldMD3Fhu0ibDmjk0:'sess_fixture',fldxg0WIVCmxtdRCF:'time_change',fldcBkBS70bWBgI8A:status,fldnnAWYmA0U1q8nX:'2026-10-03T12:27:38Z',fld8O7RW6UmzbfBKU:'owner_fixture'}});
async function revised(){const r=record();r.fields.notes+='\n'+await revisionAuditLine(r.fields,{request_id:'ccr_fixture',actor_ref:'owner_fixture',resolved_at:'2026-10-03T12:27:38Z'});return r;}
const check=(r,changes=[])=>checkReconfirmFreshness({},r,{now:NOW,readChanges:async()=>changes});
test('Que golden: structured owner-supported 17:45 revision is current, retains 90 minutes and money',async()=>{const r=await revised();assert.equal((await check(r,[change()])).action,'current');assert.equal(Date.parse(r.fields.end_time)-Date.parse(r.fields.start_time),90*60000);assert.equal(r.fields.paid_received_sum,30000);assert.equal(r.fields.customer_amount_due_thb,0);});
test('actual manual owner update stays data-review, never inferred cancellation or acknowledgement',async()=>{const r=record();r.fields.notes+='\n[SCHEDULE UPDATE 2026-10-03] owner reports 17:45';assert.equal((await check(r)).reason,'manual_revision_requires_review');assert.equal(r.fields.session_state,'confirmed');});
test('pending customer choice and approved unapplied change remain distinct risks',async()=>{for(const [status,reason]of [['pending_review','awaiting_customer_choice_or_review'],['approved','resolution_application_pending']])assert.equal((await check(record(),[change(status)])).reason,reason);});
test('unavailable, duplicate, cross-session, conflicting or newer unapplied provenance fails closed',async()=>{
 const r=await revised();assert.equal((await checkReconfirmFreshness({},r,{now:NOW,readChanges:async()=>{throw Error('offline')}})).reason,'resolution_source_unavailable');
 assert.equal((await check(r,[change(),change()])).reason,'resolution_source_ambiguous');
 const cross=change();cross.fields.fldbL2Ya44l6xEYe1=['other'];assert.equal((await check(r,[cross])).reason,'resolution_source_ambiguous');
 r.fields.start_time='2026-10-04T09:30:00Z';assert.equal((await check(r,[change()])).reason,'canonical_revision_conflict');
 assert.equal((await check(await revised(),[])).reason,'resolution_provenance_unverified');
 const newer=change();newer.fields.fldnnAWYmA0U1q8nX='2026-10-03T12:40:00Z';assert.equal((await check(await revised(),[newer])).reason,'resolution_revision_unreconciled');
});
test('out-of-order historical notes resolve newest by timestamp and conflicting ties require review',async()=>{
 const r=await revised(), old=record();old.fields.start_time='2026-10-04T09:30:00Z';const line=await revisionAuditLine(old.fields,{request_id:'old',actor_ref:'owner_fixture',resolved_at:'2026-10-02T12:00:00Z'});r.fields.notes+='\n'+line;assert.equal((await check(r,[change()])).action,'current');
 r.fields.notes+='\n'+await revisionAuditLine(old.fields,{request_id:'conflict',actor_ref:'owner_fixture',resolved_at:'2026-10-03T12:27:38Z'});assert.equal((await check(r,[change()])).reason,'revision_evidence_conflicting');
});
function harness(t,{mutate,changes=[],unavailable=false,duplicate=false,lineFailure=false}={}) {
 const r=record(), deliveries=[], patches=[], keys=[];let gets=0;
 const schedule=buildReconfirmSchedule('2026-10-04');Object.assign(r.fields,{reconfirm_status:'scheduled',reconfirm_required_at:schedule.required_at,reconfirm_reminder_at:schedule.reminder_at,reconfirm_overdue_at:schedule.overdue_at,'Assigned Model':['recMODELAAAAAAAAAA']});
 t.mock.method(globalThis,'fetch',async(input,init={})=>{
  const u=new URL(input instanceof Request?input.url:input),method=init.method||'GET';
  if(u.hostname==='api.line.me'){deliveries.push(JSON.parse(init.body));keys.push(init.headers['X-Line-Retry-Key']);return Response.json({}, {status:lineFailure?500:200});}
  if(u.hostname==='telegram.test'){deliveries.push(JSON.parse(init.body));return Response.json({telegram:{ok:true}});}
  const table=u.pathname.split('/')[3];
  if(table==='models')return Response.json({fields:{line_user_id:'U'+'a'.repeat(32)}});
  if(table==='tblhQGfJc4GgiteZr') {if(unavailable)return Response.json({}, {status:503});return Response.json({records:changes});}
  if(table==='sessions'){
   if(method==='PATCH'){const p=JSON.parse(init.body).fields;patches.push(p);Object.assign(r.fields,p);return Response.json(structuredClone(r));}
   gets++;if(mutate)mutate(r,gets);return Response.json({records:duplicate&&gets>1?[r,r]:[structuredClone(r)]});
  }
  throw Error('unexpected network');
 });
 return {r,deliveries,patches,keys};
}
const env={MODEL_RECONFIRM_ENABLED:'true',AIRTABLE_BASE_ID:'fixture',AIRTABLE_API_KEY:'fixture',AIRTABLE_TABLE_SESSIONS:'sessions',AIRTABLE_TABLE_MODELS:'models',MODEL_LINE_CHANNEL_ACCESS_TOKEN:'fixture',TELEGRAM_INTERNAL_SEND_URL:'https://telegram.test/send',TELEGRAM_CHAT_ID:'fixture',AUTH_SERVICE_EVENTS_TO_TELEGRAM:'fixture'};
test('late cron sends initial notice only; blank ACK never triggers simultaneous reminder/overdue',async t=>{const h=harness(t);const result=await runModelReconfirmSweep(env,{now:NOW});assert.equal(result.notified,1);assert.equal(result.reminded,0);assert.equal(result.escalated,0);await runModelReconfirmSweep(env,{now:NOW+60000});assert.equal(h.deliveries.length,1);assert.match(h.keys[0],/^[a-f0-9-]{36}$/);});
test('genuine unresolved risk remains: delivered notice leads to reminder and ops escalation',async t=>{const h=harness(t);h.r.fields.reconfirm_notified_at='2026-10-03T09:00:00Z';const result=await runModelReconfirmSweep(env,{now:NOW});assert.equal(result.reminded,1);assert.equal(result.escalated,1);assert.equal(h.deliveries.length,2);});
for(const kind of ['cancelled','completed','reschedule','ack','duplicate','offline','pending'])test(`fresh server gate prevents stale delivery: ${kind}`,async t=>{
 const options=kind==='duplicate'?{duplicate:true}:kind==='offline'?{unavailable:true}:kind==='pending'?{changes:[change('pending_review')]}:{mutate:(r,n)=>{if(n===2){if(kind==='reschedule')r.fields.start_time='2026-10-04T11:00:00Z';else if(kind==='ack')r.fields.reconfirm_acknowledged_at='2026-10-03T12:30:00Z';else r.fields.session_state=kind;}}};
 const h=harness(t,options);await runModelReconfirmSweep(env,{now:NOW});assert.equal(h.deliveries.length,0);assert.equal(h.patches.length,0);
});
test('same isolate concurrent sweeps are serialized and LINE retries use stable revision key',async t=>{const h=harness(t,{lineFailure:true});const [a,b]=await Promise.all([runModelReconfirmSweep(env,{now:NOW}),runModelReconfirmSweep(env,{now:NOW})]);assert.equal(b.reason,'reconfirm_sweep_in_progress');await runModelReconfirmSweep(env,{now:NOW+60000});assert.equal(h.keys[0],h.keys[1]);assert.equal(h.keys.length,2);});
