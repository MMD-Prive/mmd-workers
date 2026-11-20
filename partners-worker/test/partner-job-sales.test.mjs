import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,apiModule,MODEL,PARTNER,SESSION} from './helpers/partner-fixture.mjs';
const route='/v1/partner/jobs/sales-proposal',S=apiModule.SESSION_FIELDS,R=apiModule.MODEL_REFERRALS;
async function setup(t){const f=await fixture();t.after(f.restore);return f;}
async function read(f,id=SESSION){const r=await f.call(route+'?session_record_id='+id);return {status:r.status,...await r.json()};}
function input(current,system='co_partner',id=SESSION){return {session_record_id:id,job_revision:current.job_revision,revision:current.revision,system,source_rate_thb:6000,customer_sell_rate_thb:9000,commission_percent:7,partner_share_percent:55,note:'fixture only',share_with_mmd:true};}
async function save(f,body,key='job-sales-fixture-key'){const r=await f.call(route,{body,headers:{'Idempotency-Key':key}});return {status:r.status,...await r.json()};}
test('all three job systems persist independently; roster and canonical finance remain intact',async t=>{
 const f=await setup(t),snapshot=JSON.stringify(f.db);let current=await read(f);
 for(const system of ['bridge','co_partner','profit_share']){current=await save(f,input(current,system),'job-sales-'+system);assert.equal(current.status,200);assert.equal(current.proposal.system,system);assert.equal(current.proposal.status,'pending_review');assert.equal((await read(f)).proposal.system,system);}
 const other='recTTTTTTTTTTTTTT';f.db.Sessions.push({id:other,fields:{...f.db.Sessions[0].fields,[S.sessionId]:'other'}});
 assert.equal((await read(f,other)).proposal,null);
 assert.equal(f.writes.length,0);assert.equal(f.messages.length,0);assert.equal(JSON.stringify({...f.db,Sessions:f.db.Sessions.slice(0,1)}),snapshot);
 assert.equal(JSON.parse([...f.objects.values()][0].textValue).history.length,3);
});
test('duplicate retries reuse saved revision; changed payload and stale devices conflict',async t=>{
 const f=await setup(t),before=await read(f),body=input(before);const first=await save(f,body);
 assert.equal((await save(f,body)).revision,first.revision);
 assert.equal((await save(f,{...body,source_rate_thb:6500})).status,409);
 assert.equal((await save(f,body,'different-request-key')).status,409);
 const key=[...f.objects.keys()][0];assert.equal(JSON.parse(f.objects.get(key).textValue).history.length,1);
});
test('simultaneous submissions only accept one revision',async t=>{
 const f=await setup(t),before=await read(f);const responses=await Promise.all([save(f,input(before),'parallel-request-one'),save(f,input(before,'bridge'),'parallel-request-two')]);assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);
});
test('foreign Partner, revoked roster and incomplete consent are rejected',async t=>{
 const f=await setup(t),before=await read(f);assert.equal((await save(f,{...input(before),share_with_mmd:false})).status,400);
 f.db.Referrals[0].fields[R.ownershipStatus]='revoked';assert.equal((await read(f)).status,403);
 f.db.Referrals[0].fields[R.ownershipStatus]='active';f.db.Sessions[0].fields[S.partnerIdSnapshot]='other';assert.equal((await read(f)).status,403);assert.equal((await save(f,input(before))).status,403);assert.equal(f.objects.size,0);
});
test('job change requires current snapshot; started and locked jobs cannot edit',async t=>{
 const f=await setup(t),before=await read(f);await save(f,input(before));f.db.Sessions[0].fields[S.startTime]='2026-12-01T12:00:00Z';assert.equal((await read(f)).proposal.status,'job_changed');assert.equal((await save(f,input(before),'new-snapshot-key')).status,409);
 const current=await read(f);f.db.Sessions[0].fields[S.commissionSnapshotLocked]=true;assert.equal((await read(f)).editable,false);assert.equal((await save(f,input(current),'locked-request-key')).status,409);
});
test('amount, percent and missing revisions fail without storing',async t=>{
 const f=await setup(t),before=await read(f),body=input(before);
 for(const patch of [{source_rate_thb:null},{customer_sell_rate_thb:''},{source_rate_thb:-1},{customer_sell_rate_thb:1},{system:'invalid'},{system:'bridge',commission_percent:11},{system:'profit_share',partner_share_percent:100},{note:null}])assert.equal((await save(f,{...body,...patch})).status,400);
 assert.equal((await save(f,{...body,revision:'old'})).status,409);assert.equal(f.objects.size,0);
});
test('R2 failure never becomes empty or successful; owner can read submitted proposals',async t=>{
 const f=await setup(t),before=await read(f);await save(f,input(before));assert.equal((await f.call('/v1/partner/admin/job-sales')).status,401);
 const owner=await f.call('/v1/partner/admin/job-sales',{owner:true});assert.equal(owner.status,200);assert.equal((await owner.json()).proposals[0].session_record_id,SESSION);
 f.env.PARTNER_ASSETS.get=async()=>{throw Error('private storage');};const result=await read(f);assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result),/private storage/);
});
test('scope revoked during storage read does not expose a prior proposal',async t=>{
 const f=await setup(t),before=await read(f);await save(f,input(before));const original=f.env.PARTNER_ASSETS.get;f.env.PARTNER_ASSETS.get=async key=>{const value=await original(key);f.db.Referrals[0].fields[R.ownershipStatus]='revoked';return value;};const result=await read(f);assert.equal(result.status,409);assert.equal(result.proposal,undefined);
});
