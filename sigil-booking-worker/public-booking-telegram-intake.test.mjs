import test from 'node:test';
import assert from 'node:assert/strict';
import runtime from './src/runtime-index.js';
import {verifyPublicOwner} from './src/public-booking-owner.js';

test('authenticated Public intake notifies only the trusted Per Rename and actual budget without exposing identity in response',async t=>{
 const memberId='member_verified',recordId='recMemberFixture01',entitlementId='recEntitlement0001';
 const memberRef=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('mmd-discovery-member-v1:'+memberId))).toString('hex');
 const writes=[],notifications=[];
 const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_TABLE_MEMBERS_ID:'Members',AIRTABLE_TABLE_ENTITLEMENTS_ID:'Entitlements',AIRTABLE_TABLE_BOOKING_REQUESTS_ID:'Bookings',AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:'fixture-service-secret-at-least-32-characters',TELEGRAM_NOTIFY_ENABLED:'true',TELEGRAM_INTERNAL_SEND_URL:'https://telegram.fixture.invalid/internal/send',TELEGRAM_BOOKING_CHAT_ID:'fixture-chat',MEMBER_PAGES_WORKER:{fetch:async()=>Response.json({ok:true,identity_binding_verified:true,memberId,memberRef,perRename:{source:'linked_per_rename_index_v1',per_rename:'Trusted Owner Name'}})}};
 t.mock.method(globalThis,'fetch',async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url);
  if(url.hostname==='telegram.fixture.invalid'){
   assert.equal(url.pathname,'/internal/send');assert.equal(init.method,'POST');notifications.push(JSON.parse(init.body));return Response.json({ok:true});
  }
  assert.equal(url.hostname,'api.airtable.com','all outbound calls remain within mocked fixtures');
  const table=decodeURIComponent(url.pathname.split('/')[3]);
  if((init.method||'GET')!=='GET'){assert.equal(table,'Bookings');const row={id:'recBookingFixture',fields:JSON.parse(init.body).fields};writes.push(row);return Response.json(row);}
  if(table==='Members'){const row={id:recordId,fields:{member_id:memberId,status:'active','MMD — Member Entitlements':[entitlementId]}};return Response.json(url.pathname.endsWith('/'+recordId)?row:{records:[row]});}
  if(table==='Entitlements')return Response.json({records:[{id:entitlementId,fields:{member:[recordId],capability:'public_member',member_status:'active',access_status:'active'}}]});
  if(table==='Bookings')return Response.json({records:writes});
  throw Error('Unexpected fixture target '+table);
 });
 const response=await runtime.fetch(new Request('https://sigil.mmdbkk.com/sigil/api/booking/intake',{method:'POST',headers:{cookie:'__Secure-mmd_discovery_session='+'a'.repeat(64),'content-type':'application/json'},body:JSON.stringify({booking_ref:'book_verified_budget',lane:'public',search_mode:'booking',budget_thb:7800,client_nickname:'SPOOFED NAME',client_contact:'forged@example.invalid',per_rename:'FORGED RENAME',resolver_payload_json:{canonical_identity:{source:'linked_per_rename_index_v1',per_rename:'FORGED RENAME'},customer_search:{budget:{max_thb:999999}}}})}),env,{});
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.telegram_notify.ok,true);
 assert.equal(writes.length,1);assert.equal(notifications.length,1);
 const note=notifications[0];assert.equal(note.chat_id,'fixture-chat');assert.match(note.text,/ลูกค้า: <b>Trusted Owner Name<\/b>/);assert.match(note.text,/งบสูงสุด: <b>7,800 บาท<\/b>/);assert.doesNotMatch(note.text,/SPOOFED|FORGED|forged@example|999,999/);
 const saved=JSON.parse(writes[0].fields.resolver_payload_json);assert.equal(saved.customer_search.budget.max_thb,7800);assert.equal(await verifyPublicOwner(env,data.booking_ref,saved.public_booking_owner),true);
 assert.doesNotMatch(JSON.stringify(data),/Trusted Owner Name|per_rename|canonical_identity|public_booking_owner/);
});
