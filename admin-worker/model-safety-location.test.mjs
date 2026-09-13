import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SAFETY_LOCATION_PATH,
  isModelSafetyLocationCurrentRequest,
  handleAdminSafetyLocationRequest,
  modelSafetyLocationContract,
  normalizeSafetyLocationPoint,
} from "./src/model-safety-location.js";

function memoryCoordinator() {
  const stores = new Map();
  return {
    stores,
    idFromName(name) { return name; },
    get(id) {
      return {
        async fetch(url, init = {}) {
          const path = new URL(url).pathname;
          if (path === "/write" && String(init.method || "GET").toUpperCase() === "POST") {
            stores.set(id, JSON.parse(init.body));
            return Response.json({ ok: true });
          }
          if (path === "/read") return Response.json({ ok: true, data: stores.get(id) || null });
          if (path === "/clear" && String(init.method || "GET").toUpperCase() === "POST") {
            stores.delete(id);
            return Response.json({ ok: true });
          }
          return Response.json({ ok: false }, { status: 404 });
        },
      };
    },
  };
}

function envForSession({ state = "work_started" } = {}) {
  const coordinator = memoryCoordinator();
  const audits = [];
  const env = {
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_API_KEY: "patTest",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    MODEL_LOCATION_COORDINATOR: coordinator,
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const table = decodeURIComponent(url.pathname.split("/").pop());
        if (method === "GET" && table === "Sessions") {
          return Response.json({ records: [{ id: "recSession", fields: { session_id: "ses_001", "Assigned Model": ["recModel001"], status: state } }] });
        }
        if (method === "POST" && table === "System — Access Log") {
          const body = await request.json();
          audits.push(body.records[0].fields);
          return Response.json({ records: [{ id: `recAudit${audits.length}`, fields: body.records[0].fields }] });
        }
        return Response.json({ error: "unexpected" }, { status: 500 });
      },
    },
  };
  return { env, coordinator, audits };
}

const owner = { id: "per", role: "owner" };

function adminRequest(method, body, query = "") {
  return new Request(`https://mmdbkk.com${ADMIN_SAFETY_LOCATION_PATH}${query}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("Safety Location contract is internal-only, active-job-only and latest-point only", () => {
  assert.equal(modelSafetyLocationContract.default_active, false);
  assert.equal(modelSafetyLocationContract.active_job_only, true);
  assert.equal(modelSafetyLocationContract.visibility, "internal_safety_only");
  assert.equal(modelSafetyLocationContract.customer_readable, false);
  assert.equal(modelSafetyLocationContract.stores_history, false);
  assert.deepEqual(modelSafetyLocationContract.durations_minutes, [15, 30, 60]);
});

test("Safety point validation accepts only bounded location fields", () => {
  const now = Date.parse("2026-09-10T12:00:00.000Z");
  const ok = normalizeSafetyLocationPoint({ lat: 13.756331, lng: 100.501762, accuracy_m: 18.44, captured_at: "2026-09-10T12:00:00.000Z" }, now);
  assert.equal(ok.ok, true);
  assert.equal(ok.point.accuracy_m, 18.4);
  assert.equal(normalizeSafetyLocationPoint({ lat: 91, lng: 100 }, now).error, "latitude_invalid");
  assert.equal(normalizeSafetyLocationPoint({ lat: 13, lng: 100, customer_id: "x" }, now).error, "unsupported_fields");
});

test("Model safety ingest is opt-in only through explicit mode=safety transport", () => {
  assert.equal(isModelSafetyLocationCurrentRequest(new Request("https://mmdbkk.com/v1/model/location/current?mode=safety")), true);
  assert.equal(isModelSafetyLocationCurrentRequest(new Request("https://mmdbkk.com/v1/model/location/current")), false);
  assert.equal(isModelSafetyLocationCurrentRequest(new Request("https://mmdbkk.com/v1/model/location/current?mode=customer")), false);
});

test("Central start requires owner/admin role and fixed reason/duration", async () => {
  const { env } = envForSession();
  const forbidden = await handleAdminSafetyLocationRequest(adminRequest("POST", { session_id: "ses_001", reason_code: "model_unreachable", duration_minutes: 15 }), env, { id: "partner", role: "mms_partner" });
  assert.equal(forbidden.status, 403);

  const badReason = await handleAdminSafetyLocationRequest(adminRequest("POST", { session_id: "ses_001", reason_code: "just_checking", duration_minutes: 15 }), env, owner);
  assert.equal(badReason.status, 400);
  assert.equal((await badReason.json()).error, "safety_reason_code_invalid");

  const badDuration = await handleAdminSafetyLocationRequest(adminRequest("POST", { session_id: "ses_001", reason_code: "model_unreachable", duration_minutes: 120 }), env, owner);
  assert.equal(badDuration.status, 400);
  assert.equal((await badDuration.json()).error, "safety_duration_invalid");
});

test("Central safety check stores control separately, audits start, and exposes no customer namespace", async () => {
  const { env, coordinator, audits } = envForSession();
  const response = await handleAdminSafetyLocationRequest(adminRequest("POST", {
    session_id: "ses_001",
    reason_code: "session_integrity",
    duration_minutes: 30,
    note: "arrival state disputed",
  }), env, owner);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.safety_check.active, true);
  assert.equal(body.data.location, null);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].Action, "model_safety_location_check_started");
  assert.equal(audits[0].Target, "model_location_safety");
  assert.equal(coordinator.stores.has("safety-control:model:recModel001"), true);
  assert.equal(coordinator.stores.has("safety-point:model:recModel001"), false);
  assert.equal(coordinator.stores.has("model:recModel001"), false);
});

test("Admin read sees only matching active safety point; stop purges both namespaces and audits", async () => {
  const { env, coordinator, audits } = envForSession();
  const started = await handleAdminSafetyLocationRequest(adminRequest("POST", { session_id: "ses_001", reason_code: "safety_incident", duration_minutes: 15 }), env, owner);
  const startedBody = await started.json();
  const checkId = startedBody.data.safety_check.check_id;
  const now = Date.now();
  coordinator.stores.set("safety-point:model:recModel001", {
    source: "mmd_safety_location_check",
    visibility: "internal_safety_only",
    check_id: checkId,
    session_id: "ses_001",
    lat: 13.7563,
    lng: 100.5018,
    accuracy_m: 15,
    captured_at: new Date(now).toISOString(),
    received_at: new Date(now).toISOString(),
    expires_at: new Date(now + 120000).toISOString(),
  });

  const read = await handleAdminSafetyLocationRequest(adminRequest("GET", null, "?session_id=ses_001"), env, owner);
  const readBody = await read.json();
  assert.equal(read.status, 200);
  assert.equal(readBody.data.location.lat, 13.7563);
  assert.equal(readBody.data.location.visibility, "internal_safety_only");

  const stopped = await handleAdminSafetyLocationRequest(adminRequest("DELETE", { session_id: "ses_001", check_id: checkId, reason_code: "manual_stop" }), env, owner);
  assert.equal(stopped.status, 200);
  assert.equal(coordinator.stores.has("safety-control:model:recModel001"), false);
  assert.equal(coordinator.stores.has("safety-point:model:recModel001"), false);
  assert.equal(audits.at(-1).Action, "model_safety_location_check_stopped");
});

test("Safety check cannot start after active-job lifecycle ends", async () => {
  const { env } = envForSession({ state: "separated" });
  const response = await handleAdminSafetyLocationRequest(adminRequest("POST", { session_id: "ses_001", reason_code: "session_integrity", duration_minutes: 15 }), env, owner);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "active_job_required");
});
