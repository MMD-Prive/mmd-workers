import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  handleMmsTherapistProfileRequest,
  therapistProfileErrorResponse,
} from "../src/therapist-profile-runtime.mjs";

const ORIGIN = "https://www.mmdbkk.com";
const THERAPIST_ID = "mmst_testtherapist0001";
const SECRET = "session-secret-for-tests-1234567890-abcdef";
const zones = [
  { id: "recZonePathumwan123", fields: { "Zone Code": "BKK-PATHUMWAN", "Province Code": "BKK", "Province TH": "กรุงเทพฯ", "Zone Name TH": "ปทุมวัน", Active: true } },
  { id: "recZoneSilom1234567", fields: { "Zone Code": "BKK-SILOM", "Province Code": "BKK", "Province TH": "กรุงเทพฯ", "Zone Name TH": "สีลม", Active: true } },
];
const therapist = {
  id: "recTherapistTest12345",
  fields: {
    "Therapist ID": THERAPIST_ID,
    "Display Name": "Test Therapist",
    "Availability Status": "Unavailable",
    "Base Service Zone": [zones[0].id],
    "Coverage Service Zones": [zones[0].id],
    Status: "Active",
    "Therapist Auth Status": "Active",
    "LINE Subject Hash": "server-side-hash-only",
  },
};
const env = {
  MMS_THERAPIST_AUTH_ENABLED: "true",
  MMS_THERAPIST_SESSION_SECRET: SECRET,
  AIRTABLE_API_TOKEN: "test-airtable-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_THERAPISTS_TABLE_ID: "tblTC9ZHQa4hAUwLu",
  AIRTABLE_SERVICE_ZONES_TABLE_ID: "tblAAAAAAAAAAAAAA",
  ALLOWED_ORIGINS: ORIGIN,
  MMS_PRIVATE_UPLOADS: { async get() { return null; }, async put() { return {etag:"fixture-write"}; } },
};

function sessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({ v: 1, role: "mms_therapist", therapist_id: THERAPIST_ID, line_binding: createHmac('sha256', SECRET).update('mms-therapist-line-binding-v1.server-side-hash-only').digest('hex'), iat: now, exp: now + 600 })).toString("base64url");
  const signature = createHmac("sha256", SECRET).update("mms-therapist-session-v1." + encoded).digest("hex");
  return "__Secure-mms_therapist_session=v1." + encoded + "." + signature;
}

function installFetchMock() {
  const originalFetch = globalThis.fetch;
  const patches = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/" + env.AIRTABLE_SERVICE_ZONES_TABLE_ID)) return Response.json({ records: zones });
    if (String(init.method || "GET").toUpperCase() === "PATCH") {
      const body = JSON.parse(String(init.body || "{}"));
      patches.push(body.fields);
      return Response.json({ ...therapist, fields: { ...therapist.fields, ...body.fields } });
    }
    if (url.pathname.endsWith("/" + env.AIRTABLE_THERAPISTS_TABLE_ID)) return Response.json({ records: [therapist] });
    throw new Error("unexpected Airtable request " + url.pathname);
  };
  return { patches, restore() { globalThis.fetch = originalFetch; } };
}

async function call(method, body) {
  const request = new Request(ORIGIN + "/male-massage/therapists/api/auth/profile", {
    method,
    headers: {
      Origin: ORIGIN,
      Cookie: sessionCookie(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try { return await handleMmsTherapistProfileRequest(request, env); }
  catch (error) { return therapistProfileErrorResponse(error, request, env); }
}

test("profile returns canonical service-zone codes without exposing Airtable links", async () => {
  const mock = installFetchMock();
  try {
    const response = await call("GET");
    assert.equal(response.status, 200);
    const data = (await response.json()).data;
    assert.deepEqual(data.service_zones, {
      base_service_zone_code: "BKK-PATHUMWAN",
      coverage_service_zone_codes: ["BKK-PATHUMWAN"],
    });
    assert.doesNotMatch(JSON.stringify(data), /recZone|server-side-hash-only|test-airtable-token/);
  } finally { mock.restore(); }
});

test("profile saves only active canonical service-zone links", async () => {
  const mock = installFetchMock();
  try {
    const response = await call("PUT", {
      display_name: "Test Therapist",
      base_service_zone_code: "BKK-SILOM",
      coverage_service_zone_codes: ["BKK-PATHUMWAN", "BKK-SILOM"],
    });
    assert.equal(response.status, 200);
    assert.deepEqual(mock.patches[0], {
      "Base Service Zone": [zones[1].id],
      "Coverage Service Zones": [zones[0].id, zones[1].id],
    });
    assert.deepEqual((await response.json()).data.service_zones, {
      base_service_zone_code: "BKK-SILOM",
      coverage_service_zone_codes: ["BKK-PATHUMWAN", "BKK-SILOM"],
    });
  } finally { mock.restore(); }
});

test("profile rejects unknown service zones without writing links", async () => {
  const mock = installFetchMock();
  try {
    const response = await call("PUT", {
      display_name: "Test Therapist",
      base_service_zone_code: "BKK-UNKNOWN",
      coverage_service_zone_codes: ["BKK-UNKNOWN"],
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "SERVICE_ZONE_NOT_ACTIVE");
    assert.equal(mock.patches.length, 0);
  } finally { mock.restore(); }
});

test('45 active zones round-trip; 46 are rejected without writes', async () => {
  const extra = Array.from({length:43}, (_,i)=>({id:'recZoneExtra'+String(i).padStart(6,'0'),fields:{'Zone Code':'BKK-EXTRA-'+i,'Province Code':'BKK','Zone Name TH':'เขต '+i,Active:true}}));
  zones.push(...extra); const mock=installFetchMock();
  try {
    const body={base_service_zone_code:zones[0].fields['Zone Code'],coverage_service_zone_codes:zones.map(z=>z.fields['Zone Code'])};
    const res=await call('PUT',body);assert.equal(res.status,200);assert.equal((await res.json()).data.service_zones.coverage_service_zone_codes.length,45);
    const count=mock.patches.length;const tooMany=await call('PUT',{...body,coverage_service_zone_codes:[...body.coverage_service_zone_codes,'BKK-EXCESS']});
    assert.equal(tooMany.status,400);assert.equal(mock.patches.length,count);
  } finally {mock.restore();zones.splice(2);}
});
test('duplicate zones normalize and base outside coverage is rejected',async()=>{
  const mock=installFetchMock();try{
    const res=await call('PUT',{base_service_zone_code:'BKK-SILOM',coverage_service_zone_codes:['BKK-SILOM','BKK-SILOM']});
    assert.equal(res.status,200);assert.deepEqual(mock.patches[0]['Coverage Service Zones'],[zones[1].id]);
    const bad=await call('PUT',{base_service_zone_code:'BKK-PATHUMWAN',coverage_service_zone_codes:['BKK-SILOM']});assert.equal(bad.status,400);
  }finally{mock.restore();}
});
test('unrelated course save preserves inactive linked zones and explicit replacement requires review',async()=>{
  therapist.fields['Coverage Service Zones'].push('recInactiveZone1234');const mock=installFetchMock();
  try {
    const res=await call('PUT',{courses:[{name:'Aroma Therapy Oil Massage',duration_minutes:90,price_thb:4500}]});
    assert.equal(res.status,200);assert.equal((await res.json()).data.service_zone_review_required,true);assert.equal(mock.patches.length,0);
    const replace=await call('PUT',{base_service_zone_code:'BKK-PATHUMWAN',coverage_service_zone_codes:['BKK-PATHUMWAN']});
    assert.equal(replace.status,409);assert.equal((await replace.json()).error.code,'SERVICE_ZONE_REVIEW_REQUIRED');assert.equal(mock.patches.length,0);
  }finally{mock.restore();therapist.fields['Coverage Service Zones'].pop();}
});
test('profile cannot mutate operational rights through extra fields',async()=>{
  const mock=installFetchMock();try{
    for(const field of ['matching_enabled','verified_skills','availability_status','therapist_id','line_subject_hash']){
      const res=await call('PUT',{[field]:true});assert.equal(res.status,400);assert.equal((await res.json()).error.code,'PROFILE_FIELD_NOT_ALLOWED');
    }assert.equal(mock.patches.length,0);
  }finally{mock.restore();}
});
test('course validation and R2 failure produce no fabricated success',async()=>{
  const mock=installFetchMock();const storage=env.MMS_PRIVATE_UPLOADS;let writes=0;
  env.MMS_PRIVATE_UPLOADS={async get(){return null;},async put(){writes++;throw Error('fixture failure');}};
  try {
    for(const course of [{name:'',duration_minutes:90,price_thb:4500},{name:'Aroma',duration_minutes:35,price_thb:4500},{name:'Aroma',duration_minutes:90,price_thb:-1}]){
      assert.equal((await call('PUT',{courses:[course]})).status,400);
    }assert.equal(writes,0);
    const onlyR2=await call('PUT',{intro:'Fixture intro'});assert.equal(onlyR2.status,503);assert.equal((await onlyR2.json()).error.code,'PROFILE_SAVE_UNCONFIRMED');
    const partial=await call('PUT',{display_name:'Fixture updated',intro:'Fixture intro'});assert.equal(partial.status,503);assert.equal((await partial.json()).error.code,'PROFILE_PARTIALLY_SAVED');assert.equal(mock.patches.length,1);
  }finally{env.MMS_PRIVATE_UPLOADS=storage;mock.restore();}
});
test('uncertain Airtable write stops before R2 and directs readback',async()=>{
  const original=globalThis.fetch,storage=env.MMS_PRIVATE_UPLOADS;let puts=0;
  env.MMS_PRIVATE_UPLOADS={async get(){return null;},async put(){puts++;}};
  globalThis.fetch=async(input,init={})=>{if(init.method==='PATCH')throw Error('fixture lost response');return Response.json({records:[therapist]});};
  try{const res=await call('PUT',{display_name:'Fixture name',intro:'Fixture intro'});assert.equal(res.status,503);assert.equal((await res.json()).error.code,'PROFILE_SAVE_UNCONFIRMED');assert.equal(puts,0);}
  finally{globalThis.fetch=original;env.MMS_PRIVATE_UPLOADS=storage;}
});
test('unchanged profile does not rewrite storage',async()=>{
  const mock=installFetchMock(),storage=env.MMS_PRIVATE_UPLOADS;let puts=0;
  env.MMS_PRIVATE_UPLOADS={async get(){return null;},async put(){puts++;}};
  try{assert.equal((await call('PUT',{display_name:'Test Therapist',courses:[],intro:'',profile_visibility:'hidden'})).status,200);assert.equal(puts,0);assert.equal(mock.patches.length,0);}
  finally{mock.restore();env.MMS_PRIVATE_UPLOADS=storage;}
});
test('photos and existing courses survive an unrelated update; read/write retry uses actual stored state',async()=>{
  const mock=installFetchMock(),storage=env.MMS_PRIVATE_UPLOADS;
  let manifest={version:1,intro:'',profile_visibility:'hidden',courses:[{name:'Women Massage',duration_minutes:90,price_thb:4500}],photos:[{id:'ph_'+'a'.repeat(24),key:'fixture/photo',file_name:'fixture.jpg'}],public_photo_ids:[]};
  env.MMS_PRIVATE_UPLOADS={async get(){return {etag:"fixture-read",text:async()=>JSON.stringify(manifest)};},async put(key,value){manifest=JSON.parse(value);return {etag:"fixture-write"};}};
  try{assert.equal((await call('PUT',{intro:'Updated intro'})).status,200);assert.equal(manifest.photos.length,1);assert.equal(manifest.courses[0].price_thb,4500);const res=await call('GET');assert.equal((await res.json()).data.intro,'Updated intro');}
  finally{mock.restore();env.MMS_PRIVATE_UPLOADS=storage;}
});

test('stale form account context is rejected before any Airtable or R2 mutation',async()=>{
 const mock=installFetchMock(),storage=env.MMS_PRIVATE_UPLOADS;let puts=0;
 env.MMS_PRIVATE_UPLOADS={async get(){return null;},async put(){puts++;}};
 try{for(const [method,suffix] of [['PUT',''],['POST','/photos'],['PUT','/photos/public'],['DELETE','/photos/ph_'+'a'.repeat(24)]]){
  const request=new Request(ORIGIN+'/male-massage/therapists/api/auth/profile'+suffix,{method,headers:{Origin:ORIGIN,Cookie:sessionCookie(),'X-MMS-Therapist-Context':'fixture-other-account','Content-Type':'application/json'},body:JSON.stringify({display_name:'Must not write'})});
  let res;try{res=await handleMmsTherapistProfileRequest(request,env);}catch(e){res=therapistProfileErrorResponse(e,request,env);}
  assert.equal(res.status,409);assert.equal((await res.json()).error.code,'PROFILE_ACCOUNT_CHANGED');
 }assert.equal(mock.patches.length,0);assert.equal(puts,0);}
 finally{mock.restore();env.MMS_PRIVATE_UPLOADS=storage;}
});
