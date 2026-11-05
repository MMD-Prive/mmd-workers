import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {travelFixture} from '../shared/model-travel-fixtures.mjs';
import {travelBinding} from '../shared/model-travel-store.mjs';
import {travelClock} from '../shared/model-travel-eta.mjs';
import {readOwnerTravel, ownerTravelResponse, notifyOwnerWrongLocation} from './src/model-travel-owner.js';
import {mountOwnerTravel} from './src/model-travel-owner-client.js';
import wrapper from './src/job-orchestrator-owner-ops-wrapper.js';
import delegated from './src/cancellation-credit-recovery.js';
import {memoryR2} from '../shared/test/payment-memory-r2.mjs';
import {drainOwnerTravelAlerts} from './src/model-travel-owner.js';
import {listNotificationReviews,resolveNotificationReview} from './src/notification-manual-review.js';

const settle=async()=>{for(let n=0;n<12;n++)await new Promise(setImmediate);};
test('wrong-location manual recovery checks current context and sends once after owner inspection',async()=>{
  const f=await fixture();let sends=0,unknown=true;
  f.env.PRIVATE_MODEL_MEDIA=memoryR2();
  Object.assign(f.env,{MODEL_RECONFIRM_OWNER_CHAT_ID:'12345',AUTH_SERVICE_STUDIO_TO_TELEGRAM:'synthetic',TELEGRAM_INTERNAL_SEND_URL:'https://telegram.test/send',TELEGRAM_WORKER:{fetch:async()=>{sends++;if(unknown)throw Error('synthetic lost response');return Response.json({telegram:{ok:true}});}}});
  await notifyOwnerWrongLocation(f.env,f.record,f.report,{eta_updated_at:f.ts});
  const lane='model-travel-owner',item=(await listNotificationReviews(f.env,{lane})).items[0];
  assert.equal(item.can_resend,true);unknown=false;
  const body={lane,id:item.id,snapshot:item.snapshot,decision:'not_received',note:'Checked synthetic owner chat'},actor={id:'synthetic-owner',role:'owner'};
  assert.equal((await resolveNotificationReview(f.env,body,actor)).delivered,true);
  await assert.rejects(resolveNotificationReview(f.env,body,actor),/review_already_resolved/);
  await drainOwnerTravelAlerts(f.env,Date.now()+360000);assert.equal(sends,2);
});
test('owner alert accepted with lost response is not resent by drain or repeated report',async()=>{
  const f=await fixture();let accepted=0;
  Object.assign(f.env,{MODEL_RECONFIRM_OWNER_CHAT_ID:'12345',AUTH_SERVICE_STUDIO_TO_TELEGRAM:'synthetic',TELEGRAM_INTERNAL_SEND_URL:'https://telegram.test/send',TELEGRAM_WORKER:{fetch:async()=>{accepted++;throw new Error('synthetic response lost');}}});
  assert.equal((await notifyOwnerWrongLocation(f.env,f.record,f.report,{eta_updated_at:f.ts})).status,'manual_review');
  await drainOwnerTravelAlerts(f.env,Date.now()+360000);
  await notifyOwnerWrongLocation(f.env,f.record,f.report,{eta_updated_at:f.ts});
  assert.equal(accepted,1);
});
test('wrong-location outbox retries after an outage but cancels stale lifecycle and recipient context',async()=>{
  const f=await fixture();let sends=0,offline=true;
  Object.assign(f.env,{PRIVATE_MODEL_MEDIA:memoryR2(),MODEL_RECONFIRM_OWNER_CHAT_ID:'12345',AUTH_SERVICE_STUDIO_TO_TELEGRAM:'synthetic',TELEGRAM_INTERNAL_SEND_URL:'https://telegram.test/send',TELEGRAM_WORKER:{fetch:async()=>{sends++;return Response.json({telegram:{ok:!offline,...(offline?{error:{ok:false,error_code:429}}:{})}});}}});
  assert.equal((await notifyOwnerWrongLocation(f.env,f.record,f.report,{eta_updated_at:f.ts})).delivered,false);
  offline=false;assert.equal((await drainOwnerTravelAlerts(f.env,Date.now()+61000)).delivered,1);assert.equal(sends,2);
  await drainOwnerTravelAlerts(f.env,Date.now()+120000);assert.equal(sends,2);
  offline=true;await notifyOwnerWrongLocation(f.env,f.record,{...f.report,report_id:'synthetic-report-new-123'},{eta_updated_at:f.ts});
  f.record.fields.model_session_state='arrived';offline=false;
  assert.equal((await drainOwnerTravelAlerts(f.env,Date.now()+61000)).manual_review,1);assert.equal(sends,3);
});
async function fixture() {
  const f=travelFixture(),now=Date.now(),ts=new Date(now).toISOString(),calls=[];
  Object.assign(f.record.fields,{model_name:'Synthetic model',location_name:'Original venue',private_note:'NOT FOR OWNER TRAVEL',bank_account:'NOT A REAL BANK',room_number:'0012'});
  const report={current_place:'Wrong entrance',transport_mode:'grab_taxi',report_id:'synthetic-report-12345',eta_minutes:18};
  const events=[{event:'eta_update',ts,eta_minutes:18,location_issue:{...report,binding:await travelBinding(f.record),agreed_location:'Original venue'}}];
  f.env.AIRTABLE_HTTP={fetch:async request=>{calls.push(request);assert.equal(request.method,'GET');return Response.json({records:new URL(request.url).pathname.endsWith('/Jobs')?[{fields:{session_id:f.record.fields.session_id,events_json:JSON.stringify(events)}}]:[structuredClone(f.record)]});}};
  return {...f,now,ts,calls,report,events};
}

test('owner travel uses canonical Session and Events ETA, exposes wrong location but never chat, identities, bank or room',async()=>{
  const f=await fixture(),before=structuredClone(f.record);
  const data=await readOwnerTravel(f.env,new URLSearchParams({session_id:f.record.fields.session_id}),f.now);
  assert.equal(data.items[0].state,'en_route');assert.equal(data.items[0].eta.status,'active');
  assert.equal(data.items[0].location_alert.current_place,'Wrong entrance');assert.equal(data.items[0].appointment_location,'Original venue');
  assert.doesNotMatch(JSON.stringify(data),/NOT FOR OWNER|NOT A REAL|0012|line_user_id|Canonical Model|submissions|report_id|binding/);
  assert.deepEqual(f.record,before);assert.equal(f.env.PRIVATE_MODEL_MEDIA.objects.size,0);
  f.events.push({event:'eta_update',ts:new Date(f.now+1000).toISOString(),eta_minutes:15});
  const later=await readOwnerTravel(f.env,new URLSearchParams({session_id:f.record.fields.session_id}),f.now+1000);
  assert.equal(later.items[0].location_alert.current_place,'Wrong entrance');
  assert.equal(later.items[0].eta.arrival_at,new Date(f.now+1000+15*60000).toISOString());
  f.record.fields.model_session_state='arrived';
  const arrived=await readOwnerTravel(f.env,new URLSearchParams({session_id:f.record.fields.session_id}),f.now);
  assert.equal(arrived.items[0].eta.status,'inactive');assert.equal(arrived.items[0].location_alert,null);
});

test('unavailable or conflicting truth does not revive ETA; changed appointment hides an old location report',async()=>{
  const f=await fixture();f.record.fields.location_name='Changed venue';
  let data=await readOwnerTravel(f.env,new URLSearchParams({session_id:f.record.fields.session_id}),f.now);
  assert.equal(data.items[0].location_alert,null);
  f.record.fields.session_state='work_started';
  data=await readOwnerTravel(f.env,new URLSearchParams({session_id:f.record.fields.session_id}),f.now);
  assert.equal(data.items[0].state,'checking');assert.equal(data.items[0].eta.arrival_at,null);
  delete f.record.fields.session_state;
  const read=f.env.AIRTABLE_HTTP.fetch;f.env.AIRTABLE_HTTP.fetch=request=>new URL(request.url).pathname.endsWith('/Jobs')?Response.json({}, {status:503}):read(request);
  data=await readOwnerTravel(f.env,new URLSearchParams({session_id:f.record.fields.session_id}),f.now);
  assert.equal(data.items[0].eta.status,'unavailable');assert.equal(data.items[0].location_alert,null);
});

test('read-only owner API is paginated, validates selectors and fails closed for duplicate sessions',async()=>{
  const f=await fixture();let query;
  f.env.AIRTABLE_HTTP.fetch=async request=>{if(new URL(request.url).pathname.endsWith('/Sessions'))query=new URL(request.url).searchParams;return Response.json({records:[f.record],offset:'next-page'});};
  const out=await readOwnerTravel(f.env);assert.equal(out.next_cursor,'next-page');assert.equal(query.get('pageSize'),'20');
  assert.match(query.get('filterByFormula')||'',/model_session_state/);
  for(const params of ['session_id=','session_id=a&session_id=b','model_record_id=recOther','session_id=a&cursor=x'])await assert.rejects(()=>readOwnerTravel(f.env,new URLSearchParams(params)));
  assert.equal((await ownerTravelResponse(new Request('https://mmdbkk.com/v1/admin/jobs/travel',{method:'POST'}),f.env)).status,405);
  f.env.AIRTABLE_HTTP.fetch=async()=>Response.json({records:[f.record,f.record]});
  await assert.rejects(()=>readOwnerTravel(f.env),/owner_travel_source_ambiguous/);
});

test('travel endpoint reuses the existing owner cookie gate and never grants access to a model or customer',async t=>{
  const original=delegated.fetch;t.after(()=>{delegated.fetch=original;});
  const f=await fixture();let actor={authenticated:true,actor_id:'synthetic-owner',actor_role:'owner'};
  delegated.fetch=async()=>Response.json(actor);
  const request=role=>new Request('https://mmdbkk.com/v1/admin/jobs/travel?session_id=sess_FIXTURE',{headers:role?{cookie:'synthetic-local-cookie'}:{}});
  assert.equal((await wrapper.fetch(request(false),f.env,{})).status,401);
  for(const role of ['model','customer','staff']){actor.actor_role=role;assert.equal((await wrapper.fetch(request(true),f.env,{})).status,401);}
  actor.actor_role='owner';const response=await wrapper.fetch(request(true),f.env,{});
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal((await response.json()).items[0].location_alert.kind,'wrong_location');
});

test('owner wrong-location alert is private, delivery-confirmed and deduplicated across simultaneous retries',async()=>{
  const f=await fixture(),sends=[];
  f.record.fields.model_name='Synthetic <b> & model';
  Object.assign(f.env,{MODEL_RECONFIRM_OWNER_CHAT_ID:'12345',AUTH_SERVICE_STUDIO_TO_TELEGRAM:'synthetic-only',TELEGRAM_INTERNAL_SEND_URL:'https://telegram.test/send',TELEGRAM_WORKER:{fetch:async request=>{sends.push(await request.json());return Response.json({telegram:{ok:true}});}}});
  await Promise.all([notifyOwnerWrongLocation(f.env,f.record,f.report,{eta_updated_at:f.ts}),notifyOwnerWrongLocation(f.env,f.record,f.report,{eta_updated_at:f.ts})]);
  assert.equal(sends.length,1);assert.equal(sends[0].intent,'model_wrong_location_owner');assert.equal(sends[0].chat_id,'12345');
  assert.match(sends[0].text,/18 นาที/);assert.doesNotMatch(sends[0].text,/Wrong entrance|0012|line_user_id|NOT A REAL|PRIVATE/);
  assert.equal(sends[0].parse_mode,'HTML');assert.match(sends[0].text,/Synthetic &lt;b&gt; &amp; model/);
  assert.equal((await notifyOwnerWrongLocation(f.env,f.record,f.report,{eta_updated_at:f.ts})).delivered,true);assert.equal(sends.length,1);
});

test('missing private destination, failed provider acknowledgment or a changed session never claims owner delivery',async()=>{
  const f=await fixture();let sends=0;
  Object.assign(f.env,{MODEL_RECONFIRM_OWNER_CHAT_ID:'-12345',AUTH_SERVICE_STUDIO_TO_TELEGRAM:'synthetic-only',TELEGRAM_INTERNAL_SEND_URL:'https://telegram.test/send',TELEGRAM_WORKER:{fetch:async()=>{sends++;return Response.json({ok:true});}}});
  assert.equal((await notifyOwnerWrongLocation(f.env,f.record,f.report,{eta_updated_at:f.ts})).status,'owner_private_chat_required');assert.equal(sends,0);
  f.env.MODEL_RECONFIRM_OWNER_CHAT_ID='12345';
  const result=await notifyOwnerWrongLocation(f.env,f.record,f.report,{eta_updated_at:f.ts});assert.equal(result.delivered,false);assert.equal(sends,1);
  f.record.fields.model_session_state='met_customer';
  const changed=await notifyOwnerWrongLocation(f.env,f.record,{...f.report,report_id:'synthetic-report-54321'},{eta_updated_at:f.ts});
  assert.equal(changed.delivered,false);assert.equal(sends,1);
});

test('owner UI is read-only, clocked by server time, does not repeat unchanged alerts, and clears revoked access',async()=>{
  const dom=new JSDOM('<main></main>',{url:'https://mmdbkk.com/internal/admin/jobs/completion?session_id=sess_FIXTURE',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,requests=[];
  const now='2026-11-01T12:00:00Z';let denied=false;
  const item={session_id:'sess_FIXTURE',model_name:'Synthetic model',state:'en_route',appointment_location:'Original venue',eta:{status:'active',server_now:now,arrival_at:'2026-11-01T12:18:00Z',updated_at:now},location_alert:{current_place:'Wrong entrance',agreed_location:'Original venue',reported_at:now}};
  w.fetch=async(url,options)=>{requests.push([url,options]);return denied?{ok:false,json:async()=>({ok:false})}:{ok:true,json:async()=>({ok:true,server_now:now,items:[structuredClone(item)],next_cursor:null})};};
  w.Date.now=()=>0;w.eval('var travelClock='+travelClock.toString());
  const controller=w.eval('('+mountOwnerTravel.toString()+')')(w.document.querySelector('main'));
  try {
    await settle();assert.match(w.document.querySelector('.travel-eta').textContent,/18 นาที/);assert.equal(w.document.querySelectorAll('[role=alert]').length,1);
    assert.equal(w.document.querySelectorAll('input,textarea').length,0);
    assert.ok(requests.every(([url,options])=>url.includes('session_id=sess_FIXTURE')&&!options.method));
    const alert=w.document.querySelector('[role=alert]');await controller.refresh();assert.equal(w.document.querySelector('[role=alert]'),alert);
    denied=true;await controller.refresh();assert.equal(w.document.querySelectorAll('[data-travel-session]').length,0);assert.match(w.document.querySelector('main').textContent,/ยังยืนยันสถานะเดินทางและ ETA ไม่ได้/);
  }finally{controller.destroy();w.close();}
});
