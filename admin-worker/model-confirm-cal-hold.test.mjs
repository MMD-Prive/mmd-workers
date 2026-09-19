import test from "node:test";
import assert from "node:assert/strict";

import { createInternalHoldForSession, ensureInternalHoldThroughBridge, isModelConfirmActionRequest } from "./src/model-confirm-cal-hold.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("model confirm creates one Cal Internal Hold with canonical metadata", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || "GET").toUpperCase();
    calls.push({ url, method, init });

    if (url.includes("tbl6saWYEQrEdnMIK") && method === "GET") {
      return jsonResponse({ records: [] });
    }
    if (url.includes("tblC98mKWbzmPuNzX") && method === "GET") {
      return jsonResponse({ records: [{ id: "recSession", fields: {
        session_id: "sess_123",
        job_id: "job_456",
        model_name: "Model A",
        start_time: "2026-09-17T09:30:00.000Z",
        end_time: "2026-09-17T14:30:00.000Z",
        duration_hours: 5,
        payment_status: "pending",
        model_session_state: "confirmed",
      } }] });
    }
    if (url === "https://api.cal.com/v2/bookings" && method === "POST") {
      const body = JSON.parse(init.body);
      assert.equal(init.headers["cal-api-version"], "2026-02-25");
      assert.equal(body.eventTypeId, 7057823);
      assert.equal(body.lengthInMinutes, 300);
      assert.equal(body.metadata.session_id, "sess_123");
      assert.equal(body.metadata.job_id, "job_456");
      assert.equal(body.metadata.source, "mmd_model_confirm");
      assert.equal(body.allowConflicts, true);
      assert.equal(body.allowBookingOutOfBounds, true);
      assert.equal(body.attendee.email, "malemodel.bkk@gmail.com");
      return jsonResponse({ status: "success", data: {
        id: 9001,
        uid: "cal_uid_123",
        start: "2026-09-17T09:30:00.000Z",
        end: "2026-09-17T14:30:00.000Z",
      } }, 201);
    }
    if (url.includes("tbl6saWYEQrEdnMIK") && method === "POST") {
      const body = JSON.parse(init.body);
      assert.equal(body.fields["Session ID"], "sess_123");
      assert.equal(body.fields["Job ID"], "job_456");
      assert.equal(body.fields["Cal Booking UID"], "cal_uid_123");
      assert.equal(body.fields.Source, "mmd_admin");
      return jsonResponse({ id: "recCalLink" });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  const result = await createInternalHoldForSession({
    AIRTABLE_API_KEY: "pat-test",
    CAL_API_KEY: "cal-test",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    MMD_TIMEZONE: "Asia/Bangkok",
  }, "sess_123", { fetchImpl });

  assert.deepEqual(result, {
    ok: true,
    state: "created",
    booking_uid: "cal_uid_123",
    mapping_record_id: "recCalLink",
  });
  assert.equal(calls.filter((call) => call.url === "https://api.cal.com/v2/bookings").length, 1);
});

test("existing Cal mapping makes model-confirm hold idempotent", async () => {
  let calCalls = 0;
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("tbl6saWYEQrEdnMIK")) {
      return jsonResponse({ records: [{ id: "recExisting", fields: { "Cal Booking UID": "cal_existing" } }] });
    }
    if (url.startsWith("https://api.cal.com/")) calCalls += 1;
    throw new Error(`unexpected fetch ${url}`);
  };

  const result = await createInternalHoldForSession({
    AIRTABLE_API_KEY: "pat-test",
    CAL_API_KEY: "cal-test",
  }, "sess_existing", { fetchImpl });

  assert.deepEqual(result, { ok: true, state: "existing", booking_uid: "cal_existing" });
  assert.equal(calCalls, 0);
});

test("verified deposit skips Internal Hold creation", async () => {
  let calCalls = 0;
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("tbl6saWYEQrEdnMIK")) return jsonResponse({ records: [] });
    if (url.includes("tblC98mKWbzmPuNzX")) {
      return jsonResponse({ records: [{ id: "recSession", fields: {
        session_id: "sess_paid",
        job_id: "job_paid",
        start_time: "2026-09-17T09:30:00.000Z",
        end_time: "2026-09-17T11:00:00.000Z",
        payment_status: "official_verified",
        model_session_state: "confirmed",
      } }] });
    }
    if (url.startsWith("https://api.cal.com/")) calCalls += 1;
    throw new Error(`unexpected fetch ${String(init.method || "GET")} ${url}`);
  };

  const result = await createInternalHoldForSession({
    AIRTABLE_API_KEY: "pat-test",
    CAL_API_KEY: "cal-test",
  }, "sess_paid", { fetchImpl });

  assert.deepEqual(result, { ok: true, state: "skipped", reason: "deposit_already_verified" });
  assert.equal(calCalls, 0);
});

test("only the canonical model session action route is eligible", () => {
  assert.equal(isModelConfirmActionRequest(new Request("https://mmdbkk.com/v1/model/session/action", { method: "POST" })), true);
  assert.equal(isModelConfirmActionRequest(new Request("https://mmdbkk.com/v1/model/session/current", { method: "POST" })), false);
  assert.equal(isModelConfirmActionRequest(new Request("https://mmdbkk.com/v1/model/session/action", { method: "GET" })), false);
});


test("production Model Confirm bridge uses private cal-sync service binding only", async () => {
  const calls = [];
  const env = {
    CAL_SYNC_WORKER: {
      async fetch(request) {
        calls.push(request);
        const url = new URL(request.url);
        assert.equal(url.hostname, "cal-sync.internal");
        assert.equal(url.pathname, "/internal/holds/ensure");
        assert.equal(request.method, "POST");
        const body = await request.json();
        assert.equal(body.session_id, "sess_bridge_1");
        return Response.json({ ok:true, state:"created", booking_uid:"cal_bridge_uid_1" });
      },
    },
  };
  const result = await ensureInternalHoldThroughBridge(env, "sess_bridge_1");
  assert.deepEqual(result, { ok:true, state:"created", booking_uid:"cal_bridge_uid_1" });
  assert.equal(calls.length,1);
});

test("production Model Confirm bridge fails closed without cal-sync binding", async () => {
  const result = await ensureInternalHoldThroughBridge({}, "sess_bridge_missing");
  assert.deepEqual(result, {
    ok:false,
    state:"deferred",
    reason:"cal_sync_service_binding_missing",
  });
});
