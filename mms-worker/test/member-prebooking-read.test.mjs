import test from "node:test";
import assert from "node:assert/strict";

import { handleMmsMemberReadRequest, isMmsMemberReadRequest } from "../src/member-read-runtime.mjs";

const env = {
  AIRTABLE_API_TOKEN: "test-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_PREBOOKINGS_TABLE_ID: "tblnSw3MY79MwWONe",
};

test("recognizes only the internal member prebooking read path", () => {
  assert.equal(isMmsMemberReadRequest("/internal/mms/member/prebookings"), true);
  assert.equal(isMmsMemberReadRequest("/mms/api/prebookings"), false);
});

test("returns only customer-safe prebookings for the verified member reference", async () => {
  const originalFetch = globalThis.fetch;
  let seenUrl = "";
  globalThis.fetch = async (url, init = {}) => {
    assert.match(String(init.headers?.Authorization || ""), /^Bearer /);
    if (new URL(String(url)).pathname.includes("tbl0p7UdOH9BjzmFX")) return Response.json({ records: [] });
    seenUrl = String(url);
    return Response.json({
      records: [{
        id: "recPrivateAirtableId",
        fields: {
          "Prebooking ID": "mmspre_1234567890abcdef12345678",
          "Member Ref": "member_001",
          "LINE User Hash": "must-not-leak",
          "Recipient Gender": "ผู้ชาย",
          Zone: "Sukhumvit",
          "Service Date": "2026-09-04",
          "Service Time": "19:30",
          "Duration Minutes": 90,
          "Selected Skills": ["Thai Massage", "Sport Massage"],
          "Requested Therapist IDs": "[\"mmst_private\"]",
          "Matched Therapist IDs": "[\"mmst_private\"]",
          Status: "Pending Coordination",
          "Idempotency Key": "private-idempotency-key",
          "Coordinator Key": "private-coordinator-key",
          "Created At": "2026-09-03T12:00:00.000Z",
          "Updated At": "2026-09-03T12:01:00.000Z",
          "Payload JSON": "{\"private\":true}",
          "Internal Notes": "never expose",
        },
      }],
    });
  };

  try {
    const response = await handleMmsMemberReadRequest(new Request(
      "https://mms.internal/internal/mms/member/prebookings?member_ref=member_001",
    ), { ...env, AIRTABLE_JOBS_TABLE_ID: "tbl0p7UdOH9BjzmFX" });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.requests.length, 1);
    assert.deepEqual(payload.data.requests[0], {
      request_id: "mmspre_1234567890abcdef12345678",
      prebooking_id: "mmspre_1234567890abcdef12345678",
      type: "mms",
      request_type: "mms_prebooking",
      service_family: "mms",
      title: "MMS Pre-booking",
      status: "coordination_pending",
      service_date: "2026-09-04",
      service_time: "19:30",
      zone: "Sukhumvit",
      skills: ["Thai Massage", "Sport Massage"],
      created_at: "2026-09-03T12:00:00.000Z",
      updated_at: "2026-09-03T12:01:00.000Z",
    });
    assert.equal(new URL(seenUrl).searchParams.get("filterByFormula"), "{Member Ref}='member_001'");
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /must-not-leak|private-idempotency|private-coordinator|Internal Notes|Payload JSON|mmst_private|recPrivate/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects public-host access and malformed member references", async () => {
  const publicResponse = await handleMmsMemberReadRequest(new Request(
    "https://mms-worker.example.com/internal/mms/member/prebookings?member_ref=member_001",
  ), env);
  assert.equal(publicResponse.status, 404);

  const malformed = await handleMmsMemberReadRequest(new Request(
    "https://mms.internal/internal/mms/member/prebookings?member_ref=member'bad",
  ), env);
  assert.equal(malformed.status, 400);
});

test("returns only numeric ETA for a verified member while a job is accepted and en route", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    if (target.pathname.includes("tblnSw3MY79MwWONe")) return Response.json({ records: [{ fields: {
      "Prebooking ID": "mmspre_1234567890abcdef12345678", "Member Ref": "member_001", "Service Date": "2026-09-04", "Status": "Confirmed",
    } }] });
    return Response.json({ records: [{ fields: {
      "Prebooking ID": "mmspre_1234567890abcdef12345678", "Job Status": "Accepted", "Travel Label": "กำลังเดินทาง",
      "ETA Label": "1 ชม. 5 นาที", "Exact Address Private": "private destination", "Therapist GPS": "private coordinate",
    } }] });
  };
  try {
    const response = await handleMmsMemberReadRequest(new Request("https://mms.internal/internal/mms/member/prebookings?member_ref=member_001"), {
      ...env, AIRTABLE_JOBS_TABLE_ID: "tbl0p7UdOH9BjzmFX",
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.requests[0].travel_status, "en_route");
    assert.equal(payload.data.requests[0].eta_minutes, 65);
    assert.doesNotMatch(JSON.stringify(payload), /private destination|private coordinate|Exact Address/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps ETA checking distinct from no departure when the jobs read is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    if (target.pathname.includes("tblnSw3MY79MwWONe")) return Response.json({ records: [{ fields: {
      "Prebooking ID": "mmspre_1234567890abcdef12345678", "Member Ref": "member_001", "Service Date": "2026-09-04", Status: "Confirmed",
    } }] });
    return new Response(null, { status: 503 });
  };
  try {
    const response = await handleMmsMemberReadRequest(new Request("https://mms.internal/internal/mms/member/prebookings?member_ref=member_001"), {
      ...env, AIRTABLE_JOBS_TABLE_ID: "tbl0p7UdOH9BjzmFX",
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.requests[0].travel_status, "checking");
    assert.equal("eta_minutes" in payload.data.requests[0], false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps a departure with no ETA in checking state instead of publishing a fabricated arrival time", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    if (target.pathname.includes("tblnSw3MY79MwWONe")) return Response.json({ records: [{ fields: {
      "Prebooking ID": "mmspre_1234567890abcdef12345678", "Member Ref": "member_001", "Service Date": "2026-09-04", Status: "Confirmed",
    } }] });
    return Response.json({ records: [{ fields: {
      "Prebooking ID": "mmspre_1234567890abcdef12345678", "Job Status": "Accepted", "Travel Label": "กำลังเดินทาง", "ETA Label": "",
    } }] });
  };
  try {
    const response = await handleMmsMemberReadRequest(new Request("https://mms.internal/internal/mms/member/prebookings?member_ref=member_001"), {
      ...env, AIRTABLE_JOBS_TABLE_ID: "tbl0p7UdOH9BjzmFX",
    });
    const payload = await response.json();
    assert.equal(payload.data.requests[0].travel_status, "checking");
    assert.equal("eta_minutes" in payload.data.requests[0], false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
