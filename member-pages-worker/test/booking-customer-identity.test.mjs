import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBookingPerRename} from '../src/booking-customer-identity.js';
import {handleDiscoveryViewer,attachDiscoverySession} from '../src/booking-discovery-viewer.js';
const uid='U'+'a'.repeat(32), client='rec'+'A'.repeat(14), other='rec'+'B'.repeat(14);
const row=(id=client,name='Per remembered')=>({fields:{source_record_id:'owner:'+id,confidence:'owner_confirmed',source_snapshot_json:JSON.stringify({schema:'mmd_owner_customer_identity_v1'}),identity_key:'line_ofc_per_rename:1',source_type:'line_ofc_staging',resolution_status:'linked',session_lookup_status:'canonical_ready',line_user_id:uid,linked_client:[id],preferred_name:name}});
function envFor(pages=[{records:[row()]}], direct=[{id:client}], clientLine=uid) {
 let n=0;return {AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:'s'.repeat(32),AIRTABLE_HTTP:{fetch:async request=>{
 const u=new URL(request.url);assert.equal(request.method,'GET');
 if(u.pathname.endsWith('/Members'))return Response.json({records:[{id:'rec'+'M'.repeat(14),fields:{line_id:uid,member_id:'mmd_fixture'}}]});
 if(u.pathname.includes('tblwn6')) {assert.equal(u.searchParams.get('filterByFormula'),`{line_user_id}="${uid}"`);return Response.json(pages[n++]);}
 if(u.pathname.includes('tblOs8') || u.pathname.includes('tbl1u0'))return Response.json({records:[]});
 if(u.pathname.endsWith('/'+client))return Response.json({id:client,fields:{line_user_id:clientLine}});
 return Response.json({records:direct});
 }}};
}
test('linked index rename is projected without raw UID/contact',async()=>{const result=await resolveBookingPerRename(envFor(),uid);assert.deepEqual(result,{per_rename:'Per remembered',source:'linked_per_rename_index_v1'});assert.ok(!JSON.stringify(result).includes(uid));});
test('conflict on later page cannot be hidden',async()=>{assert.equal(await resolveBookingPerRename(envFor([{records:[row()],offset:'next'},{records:[row(other)]}]),uid),null);});
test('distinct remembered names fail closed rather than guess latest',async()=>{assert.equal(await resolveBookingPerRename(envFor([{records:[row(),row(client,'Another')]}]),uid),null);});
test('candidate and canonical UID conflicts do not project',async()=>{const r=row();r.fields.candidate_only=true;assert.equal(await resolveBookingPerRename(envFor([{records:[r]}]),uid),null);assert.equal(await resolveBookingPerRename(envFor(undefined,[{id:other}]),uid),null);assert.equal(await resolveBookingPerRename(envFor(undefined,[], 'U'+'b'.repeat(32)),uid),null);});
test('repeat pagination and raw UID in remembered name are rejected',async()=>{await assert.rejects(resolveBookingPerRename(envFor([{records:[row()],offset:'x'},{records:[row()],offset:'x'}]),uid),/incomplete/);assert.equal(await resolveBookingPerRename(envFor([{records:[row(client,uid)]}]),uid),null);});
test('internal context requires secret and ordinary discovery remains hash only',async()=>{
 const env=envFor(),read=async()=>({lineUserId:uid,memberExists:true,memberId:'mmd_fixture',memberProfile:{}});
 assert.equal((await handleDiscoveryViewer(new Request('https://internal/__internal/booking/discovery-viewer?context=booking'),env,read)).status,401);
 const req=url=>new Request(url,{headers:{'x-mmd-booking-service-secret':'s'.repeat(32)}});
 const normal=await (await handleDiscoveryViewer(req('https://internal/__internal/booking/discovery-viewer'),env,read)).json();assert.deepEqual(Object.keys(normal).sort(),['memberRef','ok']);
 const context=await (await handleDiscoveryViewer(req('https://internal/__internal/booking/discovery-viewer?context=booking'),env,read)).json();assert.equal(context.memberId,'mmd_fixture');assert.equal(context.perRename.per_rename,'Per remembered');assert.ok(!JSON.stringify(context).includes(uid));
});

test('ineligible conflicting same-UID row prevents stale eligible name',async()=>{const conflict=row(other,'Another');conflict.fields.resolution_status='review_required';assert.equal(await resolveBookingPerRename(envFor([{records:[row(),conflict]}]),uid),null);});

test('verified nonmember gets signup403 while missing session401 and storage outage503',async()=>{
 const env=envFor(),request=new Request('https://internal/__internal/booking/discovery-viewer?context=booking',{headers:{cookie:'__Host-mmd_liff_session=fixture','x-mmd-booking-service-secret':'s'.repeat(32)}});
 assert.equal((await handleDiscoveryViewer(request,env,async()=>({lineUserId:uid,memberExists:false}))).status,403);
 assert.equal((await handleDiscoveryViewer(request,env,async()=>null)).status,401);
 env.LIFF_SESSION_SECRET='s'.repeat(32);env.LIFF_IDENTITY_KV={get:async()=>{throw Error('fixture outage');}};
 assert.equal((await handleDiscoveryViewer(request,env)).status,503);
});

test('verified nonmember login receives discovery alias without any membership grant',async()=>{
 let stored;const env={LIFF_IDENTITY_KV:{put:async(key,value)=>{stored=JSON.parse(value);}}};
 const response=await attachDiscoverySession(new Request('https://mmdbkk.com/member/api/liff/start'),env,new Response('{}',{headers:{'set-cookie':'__Host-mmd_liff_session='+'b'.repeat(64)+'; Path=/; Secure; HttpOnly'}}),async()=>({lineUserId:uid,memberExists:false,memberId:null}));
 assert.match(response.headers.get('set-cookie'),/__Secure-mmd_discovery_session=/);assert.equal(stored.session_token,'b'.repeat(64));assert.equal(stored.member_id,undefined);
});

test('nonempty conflicting current staging and missing source provenance return unknown',async()=>{
 const env=envFor(),base=env.AIRTABLE_HTTP.fetch;
 env.AIRTABLE_HTTP.fetch=async request=>new URL(request.url).pathname.includes('tblOs8')?Response.json({records:[{id:'recStageFixture01',fields:{'LINE User ID':uid,'Import Status':'matched','Canonical Client':[other],'Current LINE Rename':'Per remembered'}}]}):base(request);
 assert.equal(await resolveBookingPerRename(env,uid),null);
 const missing=row();missing.fields.source_record_id='recMissingSource01';missing.fields.confidence='verified';assert.equal(await resolveBookingPerRename(envFor([{records:[missing]}]),uid),null);
});
