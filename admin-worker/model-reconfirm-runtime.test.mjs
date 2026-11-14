import test from "node:test";
import assert from "node:assert/strict";

import {
  ACK_RECONFIRM_ACTION,
  buildReconfirmSchedule,
  handleModelReconfirmRequest,
  deriveReconfirmStatus,
  isModelReconfirmRequest,
  runModelReconfirmSweep,
  shouldOfferReconfirmAction,
} from "./src/model-reconfirm-runtime.js";

// Every transport in these tests is synthetic; an unhandled request must never
// fall through to Airtable, LINE or another live service.
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("REAL_NETWORK_CALL_BLOCKED"); };
test.after(() => { globalThis.fetch = realFetch; });

test("D-1 schedule is fixed to Bangkok 12:00 notice / 16:00 reminder / 19:00 owner escalation", () => {
  assert.deepEqual(buildReconfirmSchedule("2026-09-06"), {
    status: "scheduled",
    required_at: "2026-09-05T12:00:00+07:00",
    reminder_at: "2026-09-05T16:00:00+07:00",
    overdue_at: "2026-09-05T19:00:00+07:00",
    acknowledged_at: null,
    notified_at: null,
    reminder_notified_at: null,
    ops_alerted_at: null,
    followup_status: "none",
    risk_level: "normal",
    backup_required: false,
  });
});

test("calendar subtraction works across month/year boundaries", () => {
  assert.equal(buildReconfirmSchedule("2027-01-01").required_at, "2026-12-31T12:00:00+07:00");
  assert.equal(buildReconfirmSchedule("2028-03-01").required_at, "2028-02-29T12:00:00+07:00");
  assert.equal(buildReconfirmSchedule("not-a-date"), null);
});

test("reconfirm status advances without changing job lifecycle", () => {
  const schedule = buildReconfirmSchedule("2026-09-06");
  assert.equal(deriveReconfirmStatus(schedule, Date.parse("2026-09-05T11:59:59+07:00")), "scheduled");
  assert.equal(deriveReconfirmStatus(schedule, Date.parse("2026-09-05T12:00:00+07:00")), "pending");
  assert.equal(deriveReconfirmStatus(schedule, Date.parse("2026-09-05T18:00:00+07:00")), "pending");
  assert.equal(deriveReconfirmStatus(schedule, Date.parse("2026-09-05T19:00:00+07:00")), "overdue");
  assert.equal(deriveReconfirmStatus({ ...schedule, acknowledged_at: "2026-09-05T17:10:00+07:00" }, Date.parse("2026-09-05T20:00:00+07:00")), "acknowledged");
});

test("acknowledge_reconfirm is offered only while canonical lifecycle is confirmed", () => {
  assert.equal(ACK_RECONFIRM_ACTION, "acknowledge_reconfirm");
  assert.equal(shouldOfferReconfirmAction("confirmed", "pending"), true);
  assert.equal(shouldOfferReconfirmAction("accepted", "overdue"), true);
  assert.equal(shouldOfferReconfirmAction("confirmed", "acknowledged"), false);
  assert.equal(shouldOfferReconfirmAction("en_route", "pending"), false);
  assert.equal(shouldOfferReconfirmAction("work_started", "overdue"), false);
});

test("route matcher covers create/current/action only", () => {
  assert.equal(isModelReconfirmRequest("/v1/admin/job/create", "POST"), true);
  assert.equal(isModelReconfirmRequest("/v1/model/session/current", "GET"), true);
  assert.equal(isModelReconfirmRequest("/v1/model/session/action", "POST"), true);
  assert.equal(isModelReconfirmRequest("/v1/model/profile", "GET"), false);
});

test("scheduled sweep is disabled by default and performs no storage/network work", async () => {
  const result = await runModelReconfirmSweep({}, { now: Date.now() });
  assert.deepEqual(result, {
    ok: true,
    enabled: false,
    processed: 0,
    notified: 0,
    reminded: 0,
    escalated: 0,
  });
});


test("successful job creation queues the notification without coupling it to booking state", async () => {
  const calls = [];
  const queued = [];
  const request = new Request("https://admin-worker.internal/v1/admin/job/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const downstream = {
    async fetch() {
      return Response.json({ ok: true, session_id: "session-new-1" });
    },
  };
  const env = {
    CONFIRM_KEY: "service-token",
    EVENTS_WORKER: {
      async fetch(input, init = {}) {
        const request = input instanceof Request ? input : new Request(input, init);
        calls.push(request);
        return Response.json({ ok: true, channel: "line" });
      },
    },
  };

  const response = await handleModelReconfirmRequest(request, env, {
    waitUntil(promise) { queued.push(promise); },
  }, downstream);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://events-worker.internal/__internal/model/session/new-job-notification");
  assert.equal(calls[0].headers.get("x-internal-token"), "service-token");
  assert.deepEqual(await calls[0].json(), { session_id: "session-new-1" });
  assert.equal(queued.length, 1);
  await Promise.all(queued);
});

test("pending client-link outcomes never notify a Model", async () => {
  let sent = false;
  const request = new Request("https://admin-worker.internal/v1/admin/job/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const response = await handleModelReconfirmRequest(request, {
    CONFIRM_KEY: "service-token",
    EVENTS_WORKER: { async fetch() { sent = true; return Response.json({ ok: true }); } },
  }, { waitUntil() {} }, {
    async fetch() {
      return Response.json({ ok: true, operational_status: "pending_client_link", session_id: "session-pending" });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(sent, false);
});

const READ_NOW = Date.parse("2026-10-17T11:00:00+07:00");
const READ_ENV = {
  AIRTABLE_BASE_ID: "appFixture",
  AIRTABLE_API_KEY: "fixture-only",
  AIRTABLE_TABLE_SESSIONS: "sessions",
  AIRTABLE_TABLE_MODELS: "models",
  MODEL_LINE_CHANNEL_ACCESS_TOKEN: "fixture-only",
};
const STORED_SCHEDULE = {
  reconfirm_status: "scheduled",
  reconfirm_required_at: "2026-10-17T12:00:00+07:00",
  reconfirm_reminder_at: "2026-10-17T16:00:00+07:00",
  reconfirm_overdue_at: "2026-10-17T19:00:00+07:00",
};

function reconfirmStorage(t, overrides = {}, { records, status = 200 } = {}) {
  const record = { id: "recSESSIONAAAAAAA", fields: {
    session_id: "sess_read_fixture",
    model_session_state: "confirmed",
    job_date: "2026-10-18",
    start_time: "2026-10-18T18:00:00+07:00",
    end_time: "2026-10-18T19:30:00+07:00",
    "Canonical Model": ["recMODELAAAAAAAAAA"],
    ...overrides,
  } };
  const calls = [];
  t.mock.method(Date, "now", () => READ_NOW);
  t.mock.method(globalThis, "fetch", async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const [, , , table, id] = url.pathname.split("/");
    calls.push({ method: request.method, table });
    if (url.hostname !== "api.airtable.com") throw new Error("UNEXPECTED_TRANSPORT");
    if (table === "sessions" && request.method === "GET") {
      return Response.json(status === 200 ? { records: records ?? [structuredClone(record)] } : { error: "fixture_unavailable" }, { status });
    }
    if (table === "sessions" && id === record.id && request.method === "PATCH") {
      const patch = (await request.json()).fields;
      assert.ok(Object.keys(patch).every(key => key.startsWith("reconfirm_")));
      Object.assign(record.fields, patch);
      return Response.json(structuredClone(record));
    }
    if (table === "models" && request.method === "GET") {
      return Response.json({ id, fields: { line_user_id: `U${"a".repeat(32)}` } });
    }
    if (table === "tblhQGfJc4GgiteZr" && request.method === "GET") return Response.json({ records: [] });
    throw new Error("UNEXPECTED_STORAGE_REQUEST");
  });
  const payload = { ok: true, session: {
    session_id: record.fields.session_id,
    normalized_state: record.fields.model_session_state,
    allowed_actions: ["start_travel"],
  } };
  const downstream = { async fetch() { return Response.json(payload); } };
  const current = () => handleModelReconfirmRequest(
    new Request("https://admin-worker.internal/v1/model/session/current"), READ_ENV, {}, downstream,
  );
  return { record, calls, payload, downstream, current };
}

for (const state of ["confirmed", "accepted"]) {
  for (const missing of ["all", "reminder", "overdue"]) {
    test(`current GET never repairs ${missing} schedule fields for ${state}, including repeated reads`, async t => {
      const fields = missing === "all" ? {} : { ...STORED_SCHEDULE };
      if (missing !== "all") delete fields[`reconfirm_${missing}_at`];
      const h = reconfirmStorage(t, { ...fields, model_session_state: state });
      const before = structuredClone(h.record);
      for (let i = 0; i < 2; i++) assert.deepEqual(await (await h.current()).json(), h.payload);
      assert.deepEqual(h.record, before);
      assert.deepEqual(h.calls.map(call => call.method), ["GET", "GET"]);
    });
  }
}

for (const [status, now, extra] of [
  ["scheduled", READ_NOW, {}],
  ["pending", Date.parse("2026-10-17T12:00:00+07:00"), {}],
  ["overdue", Date.parse("2026-10-17T19:00:00+07:00"), {}],
  ["acknowledged", READ_NOW, { reconfirm_acknowledged_at: "2026-10-17T10:00:00+07:00" }],
]) {
  test(`current GET projects persisted ${status} schedule without writing or sending`, async t => {
    const h = reconfirmStorage(t, { ...STORED_SCHEDULE, ...extra });
    t.mock.method(Date, "now", () => now);
    const before = structuredClone(h.record);
    const result = await (await h.current()).json();
    assert.equal(result.session.session_id, h.payload.session.session_id);
    assert.equal(result.session.normalized_state, "confirmed");
    assert.equal(result.session.reconfirm.status, status);
    assert.equal(result.session.reconfirm.required_at, STORED_SCHEDULE.reconfirm_required_at);
    assert.equal(result.session.reconfirm.reminder_at, STORED_SCHEDULE.reconfirm_reminder_at);
    assert.equal(result.session.reconfirm.overdue_at, STORED_SCHEDULE.reconfirm_overdue_at);
    assert.deepEqual(result.session.allowed_actions, status === "acknowledged" ? ["start_travel"] : ["start_travel", ACK_RECONFIRM_ACTION]);
    assert.deepEqual(h.record, before);
    assert.deepEqual(h.calls.map(call => call.method), ["GET"]);
  });
}

test("current GET keeps legacy schedule presentation and never replaces stored timestamps", async t => {
  const h = reconfirmStorage(t, {
    ...STORED_SCHEDULE,
    reconfirm_required_at: "2026-10-17T16:00:00+07:00",
    reconfirm_reminder_at: "2026-10-17T18:00:00+07:00",
  });
  const before = structuredClone(h.record);
  const result = await (await h.current()).json();
  assert.equal(result.session.reconfirm.required_at, STORED_SCHEDULE.reconfirm_required_at);
  assert.equal(result.session.reconfirm.reminder_at, STORED_SCHEDULE.reconfirm_reminder_at);
  assert.deepEqual(h.record, before);
  assert.deepEqual(h.calls.map(call => call.method), ["GET"]);
});

for (const status of [401, 403, 404, 503]) {
  test(`current GET preserves downstream ${status} without storage work`, async t => {
    const h = reconfirmStorage(t);
    const response = Response.json({ ok: false, error: "fixture_error" }, { status });
    const actual = await handleModelReconfirmRequest(new Request("https://admin-worker.internal/v1/model/session/current"), READ_ENV, {}, {
      async fetch() { return response; },
    });
    assert.equal(actual, response);
    assert.deepEqual(h.calls, []);
  });
}

for (const [name, options] of [["missing", { records: [] }], ["ambiguous", { records: [{ id: "recA" }, { id: "recB" }] }], ["unavailable", { status: 503 }]]) {
  test(`current GET does not invent a schedule when storage is ${name}`, async t => {
    const h = reconfirmStorage(t, {}, options);
    assert.deepEqual(await (await h.current()).json(), h.payload);
    assert.deepEqual(h.calls.map(call => call.method), ["GET"]);
  });
}

test("job creation still persists all three schedule times before subsequent read-only GET", async t => {
  const h = reconfirmStorage(t);
  const response = await handleModelReconfirmRequest(new Request("https://admin-worker.internal/v1/admin/job/create", {
    method: "POST", body: JSON.stringify({ job_date: "2026-10-18" }),
  }), READ_ENV, {}, { async fetch() { return Response.json({ ok: true, session_id: h.record.fields.session_id }); } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reconfirm.status, "scheduled");
  for (const [field, value] of Object.entries(STORED_SCHEDULE)) assert.equal(h.record.fields[field], value);
  assert.equal(h.calls.filter(call => call.method === "PATCH").length, 1);
  h.calls.length = 0;
  assert.equal((await (await h.current()).json()).session.reconfirm.status, "scheduled");
  assert.deepEqual(h.calls.map(call => call.method), ["GET"]);
});

for (const guard of ["false", "true"]) {
  test(`existing gated sweep repairs legacy schedule without a GET write (guard ${guard})`, async t => {
    const h = reconfirmStorage(t);
    assert.deepEqual(await (await h.current()).json(), h.payload);
    assert.ok(h.calls.every(call => call.method === "GET"));
    const before = structuredClone(h.record);
    await runModelReconfirmSweep({ ...READ_ENV, MODEL_RECONFIRM_GUARD_V2: guard }, { now: READ_NOW });
    assert.deepEqual(h.record, before);
    assert.ok(h.calls.every(call => call.method === "GET"));
    const result = await runModelReconfirmSweep({ ...READ_ENV, MODEL_RECONFIRM_ENABLED: "true", MODEL_RECONFIRM_GUARD_V2: guard }, { now: READ_NOW });
    assert.equal(result.ok, true);
    for (const [field, value] of Object.entries(STORED_SCHEDULE)) assert.equal(h.record.fields[field], value);
    assert.equal(h.calls.filter(call => call.method === "PATCH").length, 1);
    h.calls.length = 0;
    const after = structuredClone(h.record);
    await runModelReconfirmSweep({ ...READ_ENV, MODEL_RECONFIRM_ENABLED: "true", MODEL_RECONFIRM_GUARD_V2: guard }, { now: READ_NOW });
    assert.deepEqual(h.record, after);
    assert.ok(h.calls.every(call => call.method === "GET"));
    assert.equal((await (await h.current()).json()).session.reconfirm.status, "scheduled");
    assert.ok(h.calls.every(call => call.method === "GET"));
  });
}

test("explicit reconfirm action retains legacy schedule repair; reads and action replay do not write", async t => {
  const h = reconfirmStorage(t);
  assert.deepEqual(await (await h.current()).json(), h.payload);
  assert.ok(h.calls.every(call => call.method === "GET"));
  const acknowledge = () => handleModelReconfirmRequest(new Request("https://admin-worker.internal/v1/model/session/action", {
    method: "POST", body: JSON.stringify({ action: ACK_RECONFIRM_ACTION, session_id: h.record.fields.session_id }),
  }), READ_ENV, {}, h.downstream);
  const response = await acknowledge();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).session.reconfirm.status, "acknowledged");
  for (const [field, value] of Object.entries(STORED_SCHEDULE)) {
    if (field !== "reconfirm_status") assert.equal(h.record.fields[field], value);
  }
  assert.equal(h.calls.filter(call => call.method === "PATCH").length, 2);
  const before = structuredClone(h.record);
  h.calls.length = 0;
  const read = await (await h.current()).json();
  assert.equal(read.session.reconfirm.status, "acknowledged");
  assert.ok(!read.session.allowed_actions.includes(ACK_RECONFIRM_ACTION));
  assert.equal((await (await acknowledge()).json()).idempotent, true);
  assert.deepEqual(h.record, before);
  assert.ok(h.calls.every(call => call.method === "GET"));
});
