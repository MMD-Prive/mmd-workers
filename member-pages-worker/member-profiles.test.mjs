import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMemberProfiles,isMemberProfilesRequest} from './src/member-profiles.js';

const line = 'U'+'1'.repeat(32);
const grant = {approved:true,approved_by:'per',approved_at:'2026-10-04T17:00:00Z',audience:'mmd_members',canonical_model_id:'recModel001',asset_id:'pmua_TestAsset'};
function setup() {
  const payload={consent:true,mmd_nonmember_profile_image_consent:false,mmd_public_promo_consent_status:'not_granted',upload_session_id:'pmu_TestSession',uploads:[{kind:'photo',upload_ref:'pmu_ref_TestRef'}],mmd_member_profile:{...grant}};
  const app={fields:{fld3KMefCywUTNIoQ:'public_model',fldInXMklAz53CiCq:'accepted',fldHk2h9Rf6g5UlZw:'approved',fldJ9ldETtMF2Qbqf:payload,fldUIqNSM6Z9dK8Tj:'Big',fldE5jq01JlYtvSP7:'pma_Test',fldBPLNmVfbfjsNeN:['recModel001']}};
  const asset={fields:{fldSKeoWClypsbPNF:'pmua_TestAsset',fldPCr17XtTGH52BZ:'pma_Test',fldGmoadvfKK2NHJn:'photo',fldOy0nJXvYH1zzrL:'mmd-private-public-model-uploads',fldGTJmeQkiSD4NEP:'public-model/v1/2026/10/03/pmu_TestSession/pmu_ref_TestRef.jpg',fldDhx8xsUUFB8D8N:'attached',fldJIwNkFsNKuhgp1:'approved',fldE0qlrPfZXzTjnp:'image/jpeg'}};
  let reads=0,bytes=0;
  const entitlement={source_status:'verified',fail_closed:true,member_blocked:false,capability_state:{active:['public_member']}};
  const deps={readSession:async()=>({lineUserId:line}),readEntitlement:async(env,identity)=>{assert.deepEqual(identity,{line_user_id:line});return entitlement;}};
  const env={AIRTABLE_API_KEY:'test-only',AIRTABLE_BASE_ID:'test-base',AIRTABLE_HTTP:{fetch:async request=>{reads++;return Response.json({records:request.url.includes('tblwUa8ySWln8OfaJ')?[app]:[asset]});}},PUBLIC_MODEL_UPLOADS_R2:{get:async key=>{bytes++;assert.equal(key,asset.fields.fldGTJmeQkiSD4NEP);return {body:new Uint8Array([1,2,3])};}}};
  return {env,deps,entitlement,app,asset,payload,counts:()=>({reads,bytes})};
}
const req=(path='',init={})=>new Request('https://mmdbkk.com/member/api/liff/profiles'+path,init);
test('members receive a protected portrait with nonmember consent still false',async()=>{
  const s=setup();const response=await handleMemberProfiles(req(),s.env,s.deps);assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.items[0].display_name,'Big');assert.equal(data.items[0].audience_visibility,'mmd_members');
  assert.equal(data.items[0].image_url,'/member/api/liff/profiles/big/photo');assert.doesNotMatch(JSON.stringify(data),/pmua_|public-model\/v1|canonical_model|recModel/);
  const photo=await handleMemberProfiles(req('/big/photo'),s.env,s.deps);assert.equal(photo.status,200);assert.deepEqual([...new Uint8Array(await photo.arrayBuffer())],[1,2,3]);
  assert.match(photo.headers.get('cache-control'),/private, no-store/);assert.equal(photo.headers.get('vary'),'Cookie');
  assert.equal(s.payload.mmd_nonmember_profile_image_consent,false);
});
test('guest, expired, grace, blocked and unavailable membership never read profile storage',async()=>{
  const cases=[{identity:null,status:401},{active:[],status:403},{active:['guest_pass'],status:403},{active:[],grace:['private_premium'],status:403},{active:['private_premium'],blocked:true,status:403},{source:'unavailable',status:503}];
  for(const c of cases){const s=setup();if('identity'in c)s.deps.readSession=async()=>c.identity;if(c.active)s.entitlement.capability_state.active=c.active;if(c.grace)s.entitlement.capability_state.grace=c.grace;if(c.blocked)s.entitlement.member_blocked=true;if(c.source)s.entitlement.source_status=c.source;
    for(const p of ['', '/big/photo'])assert.equal((await handleMemberProfiles(req(p),s.env,s.deps)).status,c.status);assert.deepEqual(s.counts(),{reads:0,bytes:0});}
});
test('owner withdrawal and canonical mismatch remove the profile and deny direct photo access',async()=>{
  for(const mutate of [s=>s.payload.mmd_member_profile.approved=false,s=>s.payload.mmd_member_profile.canonical_model_id='recOther',s=>s.app.fields.fldInXMklAz53CiCq='rejected',s=>s.payload.consent=false]){const s=setup();mutate(s);assert.deepEqual((await(await handleMemberProfiles(req(),s.env,s.deps)).json()).items,[]);assert.equal((await handleMemberProfiles(req('/big/photo'),s.env,s.deps)).status,404);assert.equal(s.counts().bytes,0);}
});
test('photo must remain reviewed, attached and exactly owned by this application upload',async()=>{
  for(const [field,value] of [['fldJIwNkFsNKuhgp1','pending_review'],['fldPCr17XtTGH52BZ','pma_Other'],['fldGTJmeQkiSD4NEP','private/evidence/photo.jpg'],['fldGmoadvfKK2NHJn','document'],['fldOy0nJXvYH1zzrL','mmd-models'],['fldGTJmeQkiSD4NEP','public-model/v1/2026/10/03/pmu_Other/pmu_ref_TestRef.jpg']]){const s=setup();s.asset.fields[field]=value;assert.equal((await handleMemberProfiles(req('/big/photo'),s.env,s.deps)).status,404);assert.equal(s.counts().bytes,0);}
});
test('membership revocation is rechecked on the next photo request; HEAD is protected',async()=>{
  const s=setup();assert.equal((await handleMemberProfiles(req(),s.env,s.deps)).status,200);s.entitlement.capability_state.active=[];assert.equal((await handleMemberProfiles(req('/big/photo',{method:'HEAD'}),s.env,s.deps)).status,403);assert.equal(s.counts().bytes,0);
});
test('reject browser identity claims, cross-site requests and unsupported methods',async()=>{
  const s=setup();for(const r of [req('?tier=premium'),req('',{headers:{origin:'https://evil.example'}}),req('/big/photo',{headers:{'sec-fetch-site':'cross-site'}})])assert.equal((await handleMemberProfiles(r,s.env,s.deps)).status,403);
  assert.equal((await handleMemberProfiles(req('',{method:'POST'}),s.env,s.deps)).status,405);assert.deepEqual(s.counts(),{reads:0,bytes:0});assert.equal(isMemberProfilesRequest(req('/big/photo')),true);
});
