import assert from "node:assert/strict";
import test from "node:test";
import { handleMmsAdminRuntime } from "../src/admin-runtime.mjs";

const env = {
  MMS_INTERNAL_HOST: "mms.internal",
  AIRTABLE_API_TOKEN: "test-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_APPLICATIONS_TABLE_ID: "tblogwnxtIG19I2WB",
  AIRTABLE_THERAPISTS_TABLE_ID: "tblTC9ZHQa4hAUwLu",
  AIRTABLE_PREBOOKINGS_TABLE_ID: "tblnSw3MY79MwWONe",
};

function airtableMock() {
  const application = {
    id: "recApplication001",
    fields: {
      "Application ID": "mmsapp_1234567890abcdef12345678",
      "Applicant Name": "Therapist Test",
      Nickname: "Test",
      "Gender Identity": "ชาย",
      "Customer Gender Scope": "ได้ทั้งคู่",
      "Skills Claimed": ["Aroma Therapy Oil Massage", "Thai Massage"],
      "Base Zone": "Sukhumvit",
      "Coverage Zones": ["Sathorn / Silom"],
      "Application Status": "Under Review",
    },
  };
  const therapists = [];

  return {
    application,
    therapists,
    async fetch(input, init = {}) {
      const url = new URL(String(input));
      const method = String(init.method || "GET").toUpperCase();
      const path = decodeURIComponent(url.pathname);

      if (path.endsWith("/tblogwnxtIG19I2WB") && method === "GET") {
        return Response.json({ records: [application] });
      }
      if (path.endsWith(`/tblogwnxtIG19I2WB/${application.id}`) && method === "PATCH") {
        Object.assign(application.fields, JSON.parse(init.body).fields);
        return Response.json(application);
      }
      if (path.endsWith("/tblTC9ZHQa4hAUwLu") && method === "GET") {
        const therapistId = url.searchParams.get("filterByFormula")?.match(/='([^']+)'/)?.[1];
        return Response.json({ records: therapists.filter((record) => record.fields["Therapist ID"] === therapistId) });
      }
      if (path.endsWith("/tblTC9ZHQa4hAUwLu") && method === "POST") {
        const record = { id: `recTherapist${therapists.length + 1}`, fields: JSON.parse(init.body).fields };
        therapists.push(record);
        return Response.json(record);
      }
      if (/\/tblTC9ZHQa4hAUwLu\/recTherapist/.test(path) && method === "PATCH") {
        const record = therapists.find((item) => path.endsWith(`/${item.id}`));
        Object.assign(record.fields, JSON.parse(init.body).fields);
        return Response.json(record);
      }
      throw new Error(`Unexpected Airtable request: ${method} ${url}`);
    },
  };
}

async function approve(applicationId) {
  return handleMmsAdminRuntime(new Request(`https://mms.internal/internal/mms/admin/applications/${applicationId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "Approved", approve_to_therapist: true, internal_notes: "approved for therapist review" }),
  }), env);
}

for (const body of [{status:'Approved'},{approve_to_therapist:true},{status:' Approved ',internal_notes:'No partial approval'}]) test('paused promotion rejects before application or therapist effects '+JSON.stringify(body),async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Must not reach Airtable');});
 const request=new Request('https://mms.internal/internal/mms/admin/applications/mmsapp_1234567890abcdef12345678',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 await assert.rejects(()=>handleMmsAdminRuntime(request,{...env,MMS_PROFILE_WRITES_PAUSED:'true'}),{status:503,code:'PROFILE_WRITES_PAUSED'});assert.equal(calls,0);
});

for(const body of [{display_name:'New name'},{matching_enabled:true},{internal_notes:'Paused edit'}])test('paused Back Office therapist PATCH has no external effects '+JSON.stringify(body),async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Must not reach Airtable');});
 const response=await handleMmsAdminRuntime(new Request('https://mms.internal/internal/mms/admin/therapists/mmst_fixture',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{...env,MMS_PROFILE_WRITES_PAUSED:'true'});
 assert.equal(response.status,503);assert.equal((await response.json()).error.code,'PROFILE_WRITES_PAUSED');assert.equal(calls,0);
});

test('pause retains non-promotion application review',async t=>{
 const store=airtableMock();t.mock.method(globalThis,'fetch',store.fetch);
 const r=await handleMmsAdminRuntime(new Request('https://mms.internal/internal/mms/admin/applications/'+store.application.fields['Application ID'],{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'Under Review',internal_notes:'Review only'})}),{...env,MMS_PROFILE_WRITES_PAUSED:'true'});
 assert.equal(r.status,200);assert.equal(store.therapists.length,0);assert.equal(store.application.fields['Internal Notes'],'Review only');
});

test('pause does not bypass internal authorization',async()=>{
 await assert.rejects(()=>handleMmsAdminRuntime(new Request('https://untrusted.invalid/internal/mms/admin/therapists/mmst_fixture',{method:'PATCH'}),{...env,MMS_PROFILE_WRITES_PAUSED:'true'}),{status:404});
});

test("approve promotes applicant into a safe review-stage therapist exactly once", async (t) => {
  const store = airtableMock();
  t.mock.method(globalThis, "fetch", store.fetch);

  const first = await approve(store.application.fields["Application ID"]);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.application.status, "Approved");
  assert.equal(firstBody.therapist.status, "Review");
  assert.equal(firstBody.therapist.availability_status, "Paused");
  assert.equal(firstBody.therapist.matching_enabled, false);
  assert.equal(firstBody.therapist.manual_review_only, true);
  assert.equal(store.therapists.length, 1);
  assert.equal(store.therapists[0].fields["Application Ref"], store.application.fields["Application ID"]);
  assert.equal(Array.isArray(store.therapists[0].fields["Application Ref"]), false);

  const second = await approve(store.application.fields["Application ID"]);
  assert.equal(second.status, 200);
  assert.equal(store.therapists.length, 1);
  const secondBody = await second.json();
  assert.equal(secondBody.therapist.therapist_id, firstBody.therapist.therapist_id);
});

test("matching cannot be enabled until therapist is Active and manual-review lock is cleared", async (t) => {
  const store = airtableMock();
  t.mock.method(globalThis, "fetch", store.fetch);
  const promoted = await (await approve(store.application.fields["Application ID"])).json();

  const blocked = await handleMmsAdminRuntime(new Request(`https://mms.internal/internal/mms/admin/therapists/${promoted.therapist.therapist_id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ matching_enabled: true }),
  }), env).catch((error) => error);
  assert.equal(blocked.code, "MATCHING_REQUIRES_ACTIVE");

  const active = await handleMmsAdminRuntime(new Request(`https://mms.internal/internal/mms/admin/therapists/${promoted.therapist.therapist_id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "Active", manual_review_only: false, matching_enabled: true, availability_status: "Available" }),
  }), env);
  assert.equal(active.status, 200);
  const activeBody = await active.json();
  assert.equal(activeBody.therapist.status, "Active");
  assert.equal(activeBody.therapist.matching_enabled, true);
  assert.equal(activeBody.therapist.manual_review_only, false);
  assert.ok(activeBody.therapist.verified_at);
});
