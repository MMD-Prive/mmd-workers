import test from 'node:test';import assert from 'node:assert/strict';
import runtime from './src/runtime-index.js';
const memberRecordId='recMemberFixture01',ent='recEntitlement0001',secret='fixture-secret-more-than-32-characters';
const hash=async id=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('mmd-discovery-member-v1:'+id))).toString('hex');
test('A contact claims cannot borrow B rights, overwrite B reference or erase ownership via private resolve',async t=>{
 let actor='A',expired=false;const records=[],writes=[],reads=[];
 const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_TABLE_BOOKING_REQUESTS_ID:'Bookings',AIRTABLE_TABLE_MEMBERS_ID:'Members',AIRTABLE_TABLE_ENTITLEMENTS_ID:'Entitlements',AIRTABLE_TABLE_PAYMENTS_ID:'Payments',AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:secret,INTERNAL_TOKEN:'internal-fixture',TELEGRAM_NOTIFY_ENABLED:'false',MEMBER_PAGES_WORKER:{fetch:async()=>Response.json({ok:true,memberId:actor,memberRef:await hash(actor)})}};
 t.mock.method(globalThis,'fetch',async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url),table=decodeURIComponent(url.pathname.split('/')[3]);const method=init.method||'GET';
 if(method!=='GET') {assert.equal(table,'Bookings');const fields=JSON.parse(init.body).fields;writes.push(fields);const prior=records.find(r=>r.fields.booking_ref===fields.booking_ref||url.pathname.endsWith('/'+r.id));if(prior){Object.assign(prior.fields,fields);return Response.json(prior);}const row={id:'recBookingFixture',fields};records.push(row);return Response.json(row);}
 reads.push({table,formula:url.searchParams.get('filterByFormula')||''});
 if(table==='Members'){const member={id:memberRecordId,fields:{member_id:'A','MMD — Member Entitlements':[ent]}};return Response.json(url.pathname.endsWith('/'+memberRecordId)?member:{records:[member]});}
 if(table==='Entitlements')return Response.json({records:[{id:ent,fields:{member:[memberRecordId],capability:'public_member',member_lifecycle_status:'active',access_status:'active',...(expired?{expire_at:'2020-01-01'}:{})}}]});
 if(table==='Bookings')return Response.json({records});
 if(table==='Payments')return Response.json({records:[{fields:{status:'verified',amount_thb:4500}}]});
 return Response.json({records:[]});
 });
 const call=(path,body)=>runtime.fetch(new Request('https://sigil.mmdbkk.com'+path,{method:'POST',headers:{cookie:'__Secure-mmd_discovery_session=a','content-type':'application/json','x-mmd-internal-token':'internal-fixture'},body:JSON.stringify(body)}),env,{});
 const payload={booking_ref:'book_fixture_A',lane:'public',client_contact:'B@example.com',line_or_member_id:'B',budget_thb:4500};
 const resolve=await call('/sigil/api/client/resolve',payload);assert.equal(resolve.status,200,await resolve.clone().text());
 assert.equal(records[0].fields.line_or_member_id,'A');assert.equal(JSON.parse(records[0].fields.resolver_payload_json).public_booking_owner.member_id,'A');
 assert.ok(!reads.some(r=>r.formula.includes('B@example.com')||r.formula.includes('memberstack')));
 const intake=await call('/sigil/api/booking/intake',payload);assert.equal(intake.status,200,await intake.clone().text());
 const before=writes.length;
 // Same verified actor cannot change Public ownership by swapping lane.
 assert.equal((await call('/sigil/api/client/resolve',{...payload,lane:'private'})).status,403);assert.equal(writes.length,before);
 // A lost current entitlement must block confirmation even with B's supplied contact/payment.
 expired=true;const confirm=await call('/__internal/booking/confirm',{booking_ref:payload.booking_ref,payment_ref:'fixture'});assert.equal(confirm.status,409,await confirm.clone().text());assert.equal(writes.length,before);
 // A second verified member cannot take over an existing ref (even with valid paid access).
 actor='B';expired=false;assert.equal((await call('/sigil/api/booking/intake',payload)).status,403);assert.equal(writes.length,before);
 // Forged marker does not become a fallback to contact based authorization.
 const stored=JSON.parse(records[0].fields.resolver_payload_json);stored.public_booking_owner.member_id='B';records[0].fields.resolver_payload_json=JSON.stringify(stored);
 assert.equal((await call('/__internal/booking/confirm',{booking_ref:payload.booking_ref,payment_ref:'fixture'})).status,409);assert.equal(writes.length,before);
});
