import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,apiModule,MODEL,SESSION,OTHER} from './helpers/partner-fixture.mjs';
const S=apiModule.SESSION_FIELDS,O=apiModule.MODEL_OFFER_RULES,R=apiModule.MODEL_REFERRALS;
async function setup(t){const f=await fixture();t.after(f.restore);return f;}
const path='/v1/partner/jobs/detail?session_record_id='+SESSION;
const proposal={model_record_id:MODEL,offer_type:'pn',partner_source_rate_thb:6000,customer_sell_rate_thb:9000,sales_visibility:'on',audience_scope:['Premium'],schedule_type:'Always',share_with_mmd:true};
test('job detail shows only authorized lifecycle and real ETA; never sends or writes',async t=>{
 const f=await setup(t);f.db.Sessions[0].fields[S.lifecycle]='en_route';
 f.db.Jobs=[{id:'recJOB00000000001',fields:{session_id:'session_fixture',events_json:JSON.stringify([{event:'eta_update',ts:new Date().toISOString(),eta_minutes:30,private_note:'HIDDEN CHAT'}])}}];
 const r=await f.call(path),p=await r.json();assert.equal(r.status,200);assert.equal(p.detail.lifecycle,'en_route');assert.equal(p.detail.eta.status,'active');assert.equal(p.detail.model_actions_allowed,false);assert.equal(p.detail.history_complete,false);
 assert.equal(p.detail.location_status,'pending_customer_confirmation');assert.doesNotMatch(JSON.stringify(p),/PRIVATE EXACT ADDRESS|HIDDEN CHAT|fixture-only|PRIVATE CLIENT/);assert.equal(f.writes.length,0);assert.equal(f.messages.length,0);
});
test('foreign jobs are forbidden and missing travel history is not zero or arrived',async t=>{
 const f=await setup(t);let r=await f.call(path),p=await r.json();assert.equal(p.detail.eta.status,'missing');assert.equal(p.detail.lifecycle,'checking');
 f.db.Sessions[0].fields[S.partnerIdSnapshot]='foreign_partner';r=await f.call(path);assert.equal(r.status,403);assert.equal(f.writes.length,0);
});
test('duplicate job records and failed ETA reads are explicitly unavailable',async t=>{
 const f=await setup(t);f.db.Jobs=[{id:'one',fields:{session_id:'session_fixture'}},{id:'two',fields:{session_id:'session_fixture'}}];
 assert.equal((await(await f.call(path)).json()).detail.eta.status,'unavailable');
 const original=globalThis.fetch;globalThis.fetch=async(...args)=>{if(String(args[0]).includes('/Jobs?'))return new Response('unavailable',{status:503});return original(...args);};
 assert.equal((await(await f.call(path)).json()).detail.eta.status,'unavailable');
});
test('scope or appointment changes during ETA load reject stale detail',async t=>{
 const f=await setup(t),original=globalThis.fetch;
 globalThis.fetch=async(...args)=>{if(String(args[0]).includes('/Jobs?'))f.db.Sessions[0].fields[S.partnerIdSnapshot]='foreign';return original(...args);};
 const r=await f.call(path);assert.equal(r.status,409);assert.equal((await r.json()).error.code,'job_detail_changed');
});
test('12 and 19 are Bangkok schedules, never automatic acknowledgement or delivery',async t=>{
 const f=await setup(t);f.db.Sessions[0].fields[S.startTime]='2026-11-15T01:00:00Z';
 const d=(await(await f.call(path)).json()).detail;
 assert.equal(d.reconfirm.scheduled_at,'2026-11-14T12:00:00+07:00');assert.equal(d.reconfirm.owner_review_at,'2026-11-14T19:00:00+07:00');assert.equal(d.reconfirm.recorded_acknowledged_at,null);assert.equal(d.reconfirm.delivery_verified,false);assert.equal(f.messages.length,0);
});
test('PN and VIP proposals preserve lane, null rates rejected, revoked roster cannot propose',async t=>{
 const f=await setup(t);
 for(const offer_type of ['pn','vip']){const r=await f.call('/v1/partner/sales/proposal',{body:{...proposal,offer_type}});assert.equal(r.status,201);assert.equal(f.db.Rules.at(-1).fields[O.offerType],offer_type);}
 for(const rate of [null,'',false]){assert.equal((await f.call('/v1/partner/sales/proposal',{body:{...proposal,partner_source_rate_thb:rate}})).status,400);}
 f.db.Referrals[0].fields[R.ownershipStatus]='revoked';assert.equal((await f.call('/v1/partner/sales/proposal',{body:proposal})).status,403);
});
test('reusing sales key with changed rates cannot falsely acknowledge new request',async t=>{
 const f=await setup(t),headers={'Idempotency-Key':'sales-stable-fixture'};
 assert.equal((await f.call('/v1/partner/sales/proposal',{body:proposal,headers})).status,201);
 assert.equal((await f.call('/v1/partner/sales/proposal',{body:proposal,headers})).status,200);
 assert.equal((await f.call('/v1/partner/sales/proposal',{body:{...proposal,customer_sell_rate_thb:9900},headers})).status,409);
 assert.equal(f.db.Rules.length,1);
});
