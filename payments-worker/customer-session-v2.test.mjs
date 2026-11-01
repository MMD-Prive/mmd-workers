import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomerSessionTracker,
  customerStage,
  handleCustomerSessionDetails,
  latestEta,
} from "./customer-session-v2.js";
import { COMPLETION_SCHEMA } from "../shared/session-completion.mjs";

const nativeFetch = globalThis.fetch;
test.before(() => { globalThis.fetch = () => { throw new Error("network_forbidden"); }; });
test.after(() => { globalThis.fetch = nativeFetch; });

test("latestEta returns only the newest valid model ETA", () => {
  const eta = latestEta(JSON.stringify([
    { event: "eta_update", eta_minutes: 25, ts: "2026-09-10T10:00:00.000Z" },
    { event: "nearby", ts: "2026-09-10T10:05:00.000Z" },
    { event: "eta_update", eta_minutes: 18, ts: "2026-09-10T10:06:00.000Z" },
  ]));
  assert.deepEqual(eta, { minutes: 18, updated_at: "2026-09-10T10:06:00.000Z" });
});

test("customer stages follow canonical session lifecycle", () => {
  assert.equal(customerStage("confirmed"), "confirmed");
  assert.equal(customerStage("en_route"), "en_route");
  assert.equal(customerStage("nearby"), "nearby");
  assert.equal(customerStage("arrived"), "arrived");
  assert.equal(customerStage("work_started"), "service");
  assert.equal(customerStage("work_finished"), "service");
  assert.equal(customerStage("separated"), "aftercare");
  assert.equal(customerStage("under_review"), "aftercare");
});

test("ETA is exposed only while travelling and raw events never leave adapter", () => {
  const tracker = buildCustomerSessionTracker({
    token: "signed.customer.token",
    confirmation: { session_id: "sess_1", payment_ref: "pay_1" },
    sessionFields: {
      model_session_state: "en_route",
      model_session_state_updated_at: "2026-09-10T10:06:00.000Z",
    },
    jobFields: {
      job_id: "JOB-1",
      status: "separated",
      last_update_at: "2026-09-10T09:00:00.000Z",
      events_json: JSON.stringify([
        { event: "eta_update", eta_minutes: 18, ts: "2026-09-10T10:06:00.000Z", private_note: "never expose" },
      ]),
    },
  });

  assert.equal(tracker.customer_stage, "en_route");
  assert.equal(tracker.source, "Sessions");
  assert.equal(tracker.status_updated_at, "2026-09-10T10:06:00.000Z");
  assert.equal(tracker.eta.minutes, 18);
  assert.equal(tracker.privacy.live_gps, false);
  assert.equal(tracker.privacy.exposes_events_json, false);
  assert.equal(JSON.stringify(tracker).includes("private_note"), false);
  assert.equal(JSON.stringify(tracker).includes("events_json"), true, "privacy contract may name the field but never expose its value");
  assert.equal(tracker.aftercare.available, false);
  assert.equal(tracker.aftercare.url, null);
  assert.match(tracker.private_care.url, /^\/sigil\/recovery\?t=/);
});

test("Aftercare unlocks only at separated or later", () => {
  const before = buildCustomerSessionTracker({
    token: "signed.customer.token",
    confirmation: { session_id: "sess_1", payment_ref: "pay_1" },
    sessionFields: { model_session_state: "work_finished" },
    jobFields: { status: "separated", events_json: "[]" },
  });
  const after = buildCustomerSessionTracker({
    token: "signed.customer.token",
    confirmation: { session_id: "sess_1", payment_ref: "pay_1" },
    sessionFields: { model_session_state: "separated" },
    jobFields: { status: "work_finished", events_json: "[]" },
  });

  assert.equal(before.customer_stage, "service");
  assert.equal(before.aftercare.available, false);
  assert.equal(before.aftercare.url, null);
  assert.equal(after.customer_stage, "aftercare");
  assert.equal(after.aftercare.available, true);
  assert.match(after.aftercare.url, /^\/aftercare\?t=/);
  assert.equal(after.aftercare.unlock_state, "separated");
  assert.deepEqual(after.private_care.suggested_when.tags, ["privacy", "safety", "payment", "brief_mismatch"]);
  assert.equal(after.private_care.suggested_when.rating_lte, 2);
});

function completionFields(review = null) {
  const completedAt = "2026-10-30T10:00:00.000Z";
  return {
    session_id: "sess_1",
    model_session_state: "under_review",
    model_session_state_updated_at: completedAt,
    customer_completed_at: completedAt,
    customer_aftercare_json: JSON.stringify({
      schema: COMPLETION_SCHEMA,
      session_id: "sess_1",
      approved_at: completedAt,
      approval_id: "approval-fixture-1",
      review,
    }),
  };
}

test("canonical approval and optional review are independent private projections", () => {
  const approved = buildCustomerSessionTracker({ sessionFields: completionFields() });
  assert.equal(approved.aftercare.customer_approved, true);
  assert.equal(approved.aftercare.review_submitted, false);
  const reviewed = buildCustomerSessionTracker({
    sessionFields: completionFields({ ts: "2026-10-30T10:01:00.000Z", rating: 4, private_mmd_message: "PRIVATE_MESSAGE_SENTINEL" }),
  });
  assert.equal(reviewed.aftercare.customer_approved, true);
  assert.equal(reviewed.aftercare.review_submitted, true);
  assert.equal(JSON.stringify(reviewed).includes("PRIVATE_MESSAGE_SENTINEL"), false);
  assert.equal(JSON.stringify(reviewed).includes("approval-fixture-1"), false);
});

test("incomplete, mismatched or malformed completion evidence never implies approval or review", () => {
  for (const fields of [
    { customer_completed_at: "2026-10-30T10:00:00.000Z" },
    { customer_aftercare_json: "{" },
    { customer_aftercare_json: "[]" },
    { customer_aftercare_json: JSON.stringify({ rating: 5, ts: "2026-10-30T10:00:00.000Z" }) },
    { ...completionFields(), session_id: "other-session" },
    { ...completionFields(), customer_completed_at: "2026-10-30T11:00:00.000Z" },
  ]) {
    const tracker = buildCustomerSessionTracker({ sessionFields: { model_session_state: "separated", ...fields } });
    assert.equal(tracker.aftercare.customer_approved, false);
    assert.equal(tracker.aftercare.review_submitted, false);
  }
});

test("legacy job and confirmation status cannot supply canonical lifecycle", () => {
  for (const sessionFields of [null, { status: "separated" }]) {
    const tracker = buildCustomerSessionTracker({
      sessionFields,
      jobFields: { status: "separated" },
      confirmation: { session_status: "separated" },
      token: "fixture-token",
    });
    assert.equal(tracker.lifecycle_state, null);
    assert.equal(tracker.aftercare.available, false);
    assert.equal(tracker.aftercare.url, null);
  }
});

test("customer console links remain reachable from separated through closed, including reviewed sessions", () => {
  for (const state of ["separated", "under_review", "payout_pending", "closed"]) {
    const tracker = buildCustomerSessionTracker({
      sessionFields: { ...completionFields({ ts: "2026-10-30T10:01:00.000Z", rating: 5 }), model_session_state: state },
      token: "fixture-token",
    });
    assert.equal(tracker.customer_stage, "aftercare");
    assert.equal(tracker.aftercare.available, true);
    assert.match(tracker.aftercare.url, /^\/aftercare\?t=/);
    assert.match(tracker.private_care.url, /^\/sigil\/recovery\?t=/);
  }
});

function mockStorage({ fields = { model_session_state: "separated" }, records, status = 200, table = "Sessions", jobsFail = false } = {}) {
  const requests = [];
  const env = {
    AIRTABLE_BASE_ID: "base-fixture",
    AIRTABLE_API_KEY: "key-fixture",
    AIRTABLE_TABLE_SESSIONS: table,
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const requestedTable = decodeURIComponent(url.pathname.split("/").at(-1));
        requests.push({ method: request.method, table: requestedTable, query: url.searchParams });
        assert.equal(request.method, "GET", "projection must never write storage");
        assert.equal(url.searchParams.get("maxRecords"), "2");
        if (requestedTable === "jobs") {
          if (jobsFail) throw new Error("eta_unavailable");
          return Response.json({ records: [{ id: "recJob", fields: {
            session_id: "sess_1",
            status: "separated",
            events_json: JSON.stringify([{ event: "eta_update", eta_minutes: 15 }]),
          } }] });
        }
        assert.equal(requestedTable, table);
        return Response.json({ records: records ?? [{ id: "recSession", fields }] }, { status });
      },
    },
  };
  return { env, requests };
}

function detailsRequest(body = { t: "fixture-token", session_id: "untrusted-session" }) {
  return new Request("https://fixture.invalid/v1/confirm/details", { method: "POST", body: JSON.stringify(body) });
}

function verifiedResponse(extra = {}) {
  return Response.json({ ok: true, role: "customer", session_id: "sess_1", payment: { verified: false }, ...extra }, {
    headers: { "access-control-allow-origin": "https://fixture.invalid" },
  });
}

test("handler reads Sessions by verified identity and preserves delegated payment truth and headers", async () => {
  for (const table of ["Sessions", "Canonical Sessions"]) {
    const { env, requests } = mockStorage({ table, fields: { ...completionFields(), bank_account: "PRIVATE_ACCOUNT_SENTINEL" } });
    if (table === "Sessions") delete env.AIRTABLE_TABLE_SESSIONS;
    const request = detailsRequest();
    let delegated = 0;
    const response = await handleCustomerSessionDetails(request, env, async (received) => {
      assert.equal(received, request);
      assert.equal((await received.json()).session_id, "untrusted-session");
      delegated++;
      return verifiedResponse();
    });
    const payload = await response.json();
    assert.equal(delegated, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].table, table);
    assert.equal(requests[0].query.get("filterByFormula"), "{session_id}='sess_1'");
    assert.equal(payload.customer_session.lifecycle_state, "under_review");
    assert.equal(payload.customer_session.aftercare.customer_approved, true);
    assert.deepEqual(payload.payment, { verified: false });
    assert.equal(response.headers.get("access-control-allow-origin"), "https://fixture.invalid");
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    assert.equal(JSON.stringify(payload).includes("PRIVATE_ACCOUNT_SENTINEL"), false);
  }
});

test("handler never looks up legacy jobs when canonical session is missing, ambiguous, failed or has no state", async () => {
  for (const options of [
    { records: [] },
    { records: [{ id: "first" }, { id: "second" }] },
    { status: 503 },
    { fields: { status: "separated" } },
  ]) {
    const { env, requests } = mockStorage(options);
    const response = await handleCustomerSessionDetails(detailsRequest(), env, () => verifiedResponse({ session_status: "separated" }));
    const { customer_session: tracker } = await response.json();
    assert.equal(requests.length, 1);
    assert.equal(tracker.lifecycle_state, null);
    assert.equal(tracker.aftercare.available, false);
    assert.equal(tracker.aftercare.customer_approved, false);
    if (!options.fields) assert.equal(tracker.source_available, false);
  }
});

test("handler keeps model ETA as optional metadata without trusting jobs lifecycle", async () => {
  for (const jobsFail of [false, true]) {
    const { env, requests } = mockStorage({ fields: { session_id: "sess_1", model_session_state: "en_route" }, jobsFail });
    const response = await handleCustomerSessionDetails(detailsRequest(), env, () => verifiedResponse());
    const { customer_session: tracker } = await response.json();
    assert.deepEqual(requests.map((item) => item.table), ["Sessions", "jobs"]);
    assert.equal(tracker.lifecycle_state, "en_route");
    assert.equal(tracker.source_available, true);
    assert.equal(tracker.aftercare.available, false);
    assert.equal(tracker.eta?.minutes ?? null, jobsFail ? null : 15);
  }
});

test("token verification remains entirely delegated and rejected/non-customer requests do not query storage", async () => {
  const cases = [
    [detailsRequest(), Response.json({ ok: false }, { status: 401 })],
    [detailsRequest(), verifiedResponse({ role: "model" })],
    [detailsRequest(), verifiedResponse({ session_id: "" })],
    [detailsRequest(), Response.json({ ok: false })],
    [new Request("https://fixture.invalid/v1/confirm/details", { method: "OPTIONS" }), new Response(null, { status: 204 })],
  ];
  for (const [request, baseResponse] of cases) {
    const { env, requests } = mockStorage();
    const response = await handleCustomerSessionDetails(request, env, () => baseResponse);
    assert.equal(response, baseResponse);
    assert.equal(requests.length, 0);
  }
});
