import test from 'node:test';
import assert from 'node:assert/strict';
import runtime from './src/runtime-index.js';
import entitlementRuntime from './src/entitlement-runtime-worker.js';
import { currentPrivateAccess } from './src/current-private-access.js';
import { makePublicOwner } from './src/public-booking-owner.js';

const memberId='member-A', memberRecordId='recAAAAAAAAAAAAAA', other='recBBBBBBBBBBBBBB', ent='recEEEEEEEEEEEEEE';
const secret='fixture-only-service-secret-longer-than-32';
const hash=async()=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('mmd-discovery-member-v1:'+memberId))).toString('hex');
const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_TABLE_MEMBERS_ID:'Members',AIRTABLE_TABLE_ENTITLEMENTS_ID:'Entitlements',AIRTABLE_TABLE_BOOKING_REQUESTS_ID:'Bookings',AIRTABLE_TABLE_PAYMENTS_ID:'Payments',AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:secret,INTERNAL_TOKEN:'fixture-internal',TELEGRAM_NOTIFY_ENABLED:'false',MEMBER_PAGES_WORKER:{fetch:async()=>Response.json({ok:true,identity_binding_verified:true,memberId,memberRef:await hash()})}};
function request(path,body={}){return new Request('https://sigil.mmdbkk.com'+path,{method:'POST',headers:{'content-type':'application/json',cookie:'__Secure-mmd_discovery_session=fixture','x-mmd-internal-token':'fixture-internal'},body:JSON.stringify(body)});}
function fixture(t,{owners=[memberRecordId],capability='public_member',booking}={}){
 const reads=[],writes=[];
 t.mock.method(globalThis,'fetch',async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url), table=decodeURIComponent(url.pathname.split('/')[3]);
  if(init.method&&init.method!=='GET'){writes.push({table,body:JSON.parse(init.body)});return Response.json({id:'recBookingFixture',fields:JSON.parse(init.body).fields});}
  reads.push({table,formula:url.searchParams.get('filterByFormula')});
  if(table==='Members'){const row={id:memberRecordId,fields:{member_id:memberId,'MMD — Member Entitlements':[ent]}};return Response.json(url.pathname.endsWith('/'+memberRecordId)?row:{records:[row]});}
  if(table==='Entitlements')return Response.json({records:[{id:ent,fields:{member:owners,capability,member_lifecycle_status:'active',access_status:'active'}}]});
  if(table==='Bookings')return Response.json({records:booking?[booking]:[]});
  if(table==='Payments')return Response.json({records:[{id:'recPaymentFixture',fields:{status:'verified',amount_thb:4500,booking_ref:'book_A',payment_ref:'pay_A'}}]});
  throw Error('Unexpected fixture table '+table);
 });return{reads,writes};
}
for(const owners of [[memberRecordId,other],[other,memberRecordId],[memberRecordId,memberRecordId],[],[other],memberRecordId,null]){
 test('ambiguous/malformed entitlement ownership cannot grant Public or Private access: '+JSON.stringify(owners),async t=>{
  const f=fixture(t,{owners,capability:'private_premium'});
  const access=await currentPrivateAccess(request('/'),env,memberRecordId,await hash());
  assert.deepEqual(access.allowedFolders,[]);assert.equal(access.viewerRef,'');
  for(const path of ['/sigil/api/client/resolve','/sigil/api/booking/intake']){
   const res=await runtime.fetch(request(path,{lane:'public',budget_thb:5000,client_contact:'B@example.invalid'}),env,{});
   assert.equal(res.status,403);assert.equal((await res.json()).error,'public_membership_required');
  }
  assert.equal(f.writes.length,0);assert.ok(f.reads.every(r=>!['Bookings','Payments'].includes(r.table)));
 });
}
test('single canonical owner still grants current Private access',async t=>{
 fixture(t,{capability:'private_premium'});const access=await currentPrivateAccess(request('/'),env,memberRecordId,await hash());assert.ok(access.allowedFolders.length);assert.equal(access.viewerRef,await hash());
});
for(const lane of ['public','private'])for(const status of ['Requested','Confirmed'])test('unsigned '+lane+' '+status+' requires ownership review without any entitlement/payment/write side effects',async t=>{
 const booking={id:'recBookingFixture',fields:{booking_ref:'book_A',lane,'Request Status':status,client_contact:'B@example.invalid',line_or_member_id:'B',resolver_payload_json:JSON.stringify({my_mmd_owner:{schema:'member_booking_owner_v2',owner:'f'.repeat(64),state:'submitted'}})}};
 const before=structuredClone(booking),f=fixture(t,{booking});
 const res=await runtime.fetch(request('/__internal/booking/confirm',{booking_ref:'book_A',payment_ref:'pay_B',lane:'public'}),env,{});
 assert.equal(res.status,409);assert.equal((await res.json()).error,'booking_owner_review_required');assert.equal(f.writes.length,0);assert.ok(f.reads.every(r=>r.table==='Bookings'));assert.deepEqual(booking,before);
});
test('valid signed owner confirms without ever using submitted contact as authority',async t=>{
 const owner=await makePublicOwner(env,'book_A',{viewer:{memberId,memberRef:await hash()},memberRecordId});
 const booking={id:'recBookingFixture',fields:{booking_ref:'book_A',lane:'public',client_contact:'B@example.invalid',line_or_member_id:'B',resolver_payload_json:JSON.stringify({public_booking_owner:owner})}};
 const f=fixture(t,{booking});const res=await entitlementRuntime.fetch(request('/__internal/booking/confirm',{booking_ref:'book_A',payment_ref:'pay_A'}),env,{});
 assert.equal(res.status,200,await res.clone().text());assert.equal(f.writes.length,1);assert.equal(f.writes[0].body.fields['Request Status'],'Confirmed');assert.ok(f.reads.every(r=>!String(r.formula).includes('B@example.invalid')&&!String(r.formula).includes('line_user_id')));
});
test('signed owner cannot confirm a shared entitlement',async t=>{
 const owner=await makePublicOwner(env,'book_A',{viewer:{memberId,memberRef:await hash()},memberRecordId});const booking={id:'recBookingFixture',fields:{booking_ref:'book_A',lane:'public',resolver_payload_json:JSON.stringify({public_booking_owner:owner})}};
 const f=fixture(t,{booking,owners:[memberRecordId,other]});const res=await entitlementRuntime.fetch(request('/__internal/booking/confirm',{booking_ref:'book_A',payment_ref:'pay_A'}),env,{});assert.notEqual(res.status,200);assert.equal(f.writes.length,0);assert.ok(f.reads.every(r=>r.table!=='Payments'));
});
