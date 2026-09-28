import assert from "node:assert/strict";
import test from "node:test";

import {
  handleSigilAvailabilityInternalRequest,
  isSigilAvailabilityInternalRequest,
  preflightAvailabilityAdoptionReminder,
  readAvailabilityAdoptionCohort,
  startAvailabilityAdoptionCohort,
  writeSigilAvailabilitySnapshot,
} from "./src/sigil-availability-snapshot.js";

function kv(seed = {}) {
  const writes = [];
  const values = new Map(Object.entries(seed));
  return {
    writes,
    async put(key, value, options) {
      writes.push({ key, value, options });
      values.set(key, value);
    },
    async get(key, type) {
      if (!values.has(key)) return null;
      const value = values.get(key);
      return type === "json" ? JSON.parse(value) : value;
    },
  };
}

test("internal availability endpoint is exact GET/POST only", () => {
  assert.equal(isSigilAvailabilityInternalRequest("/v1/internal/sigil/availability-snapshot", "POST"), true);
  assert.equal(isSigilAvailabilityInternalRequest("/v1/internal/sigil/availability-snapshot", "GET"), true);
  assert.equal(isSigilAvailabilityInternalRequest("/v1/internal/sigil/availability-snapshot", "DELETE"), false);
  assert.equal(isSigilAvailabilityInternalRequest("/v1/internal/sigil/availability-snapshot/extra", "POST"), false);
  assert.equal(isSigilAvailabilityInternalRequest("/v1/internal/sigil/availability-adoption/remind", "POST"), true);
  assert.equal(isSigilAvailabilityInternalRequest("/v1/internal/sigil/availability-adoption/remind", "GET"), false);
});

test("internal availability endpoint requires service binding auth", async () => {
  const response = await handleSigilAvailabilityInternalRequest(new Request("https://admin-worker.local/v1/internal/sigil/availability-snapshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model_key: "mdl_pri_str_master", availability_state: "available_now" }),
  }), { INTERNAL_TOKEN: "secret", SIGIL_AVAILABILITY_SNAPSHOTS: kv() });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "internal_auth_required");
});

test("model-console internal write stores sanitized snapshot with bounded TTL", async () => {
  const store = kv();
  const response = await handleSigilAvailabilityInternalRequest(new Request("https://admin-worker.local/v1/internal/sigil/availability-snapshot", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer secret",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "model-console-worker",
    },
    body: JSON.stringify({
      model_key: "mdl_pri_str_master",
      availability_state: "available_now",
      city: "Bangkok",
      zones: ["Sukhumvit"],
      operational_flags: { burn: false, mk: true, live: true },
      customer_name: "PRIVATE",
      payment_ref: "PRIVATE",
    }),
  }), { INTERNAL_TOKEN: "secret", SIGIL_AVAILABILITY_SNAPSHOTS: store });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "model_console");
  assert.equal(payload.model_key, "mdl_pri_str_master");
  assert.equal(payload.confidence, "operator_confirmed");
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].key, "availability:v1:mdl_pri_str_master");
  assert.ok(store.writes[0].options.expirationTtl <= 15 * 60);
  assert.doesNotMatch(store.writes[0].value, /PRIVATE|payment_ref|customer_name/i);
});

test("direct model-app writer defaults to model-confirmed confidence", async () => {
  const store = kv();
  const result = await writeSigilAvailabilitySnapshot(store ? {
    SIGIL_AVAILABILITY_SNAPSHOTS: store,
  } : {}, {
    model_key: "mdl_pri_str_master",
    availability_state: "available_today",
  }, {
    model_key: "mdl_pri_str_master",
    source: "model_app",
    confidence: "model_confirmed",
  });

  assert.equal(result.ok, true);
  assert.equal(result.receipt.confidence, "model_confirmed");
  assert.equal(result.receipt.safe_availability_state, "available_today");
});


test("member-dashboard-chat-worker cannot publish availability snapshots", async () => {
  const store = kv();
  const response = await handleSigilAvailabilityInternalRequest(new Request("https://admin-worker.local/v1/internal/sigil/availability-snapshot", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer secret",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "member-dashboard-chat-worker",
    },
    body: JSON.stringify({
      model_key: "mdl_pri_str_master",
      availability_state: "available_now",
    }),
  }), { INTERNAL_TOKEN: "secret", SIGIL_AVAILABILITY_SNAPSHOTS: store });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "internal_auth_required");
  assert.equal(store.writes.length, 0);
});


test("model-console can read a sanitized fresh availability receipt", async () => {
  const store = kv({
    "availability:v1:mdl_pri_str_master": JSON.stringify({
      schema: "sigil_availability_snapshot_v1",
      model_key: "mdl_pri_str_master",
      safe_availability_state: "available_today",
      availability_bucket: "today",
      city: "Bangkok",
      zones: ["sukhumvit"],
      operational_flags: { burn: false, mk: true, live: false },
      confidence: "operator_confirmed",
      updated_at: "2099-01-01T00:00:00.000Z",
      expires_at: "2099-01-01T06:00:00.000Z",
      customer_name: "PRIVATE",
      payment_ref: "PRIVATE",
    }),
  });

  const response = await handleSigilAvailabilityInternalRequest(new Request(
    "https://admin-worker.local/v1/internal/sigil/availability-snapshot?model_key=mdl_pri_str_master",
    {
      method: "GET",
      headers: {
        authorization: "Bearer secret",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "model-console-worker",
      },
    },
  ), { INTERNAL_TOKEN: "secret", SIGIL_AVAILABILITY_SNAPSHOTS: store });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.model_key, "mdl_pri_str_master");
  assert.equal(payload.snapshot_state, "fresh");
  assert.equal(payload.fresh, true);
  assert.equal(payload.snapshot.safe_availability_state, "available_today");
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE|payment_ref|customer_name/i);
});

test("model-console read reports missing without inventing availability", async () => {
  const response = await handleSigilAvailabilityInternalRequest(new Request(
    "https://admin-worker.local/v1/internal/sigil/availability-snapshot?model_key=mdl_pri_str_missing",
    {
      method: "GET",
      headers: {
        authorization: "Bearer secret",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "model-console-worker",
      },
    },
  ), { INTERNAL_TOKEN: "secret", SIGIL_AVAILABILITY_SNAPSHOTS: kv() });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.snapshot_state, "missing");
  assert.equal(payload.fresh, false);
  assert.equal(payload.snapshot, null);
});

test("model-app cannot read operator availability coverage", async () => {
  const response = await handleSigilAvailabilityInternalRequest(new Request(
    "https://admin-worker.local/v1/internal/sigil/availability-snapshot?model_key=mdl_pri_str_master",
    {
      method: "GET",
      headers: {
        authorization: "Bearer secret",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "model-app-worker",
      },
    },
  ), { INTERNAL_TOKEN: "secret", SIGIL_AVAILABILITY_SNAPSHOTS: kv() });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "internal_auth_required");
});

test("availability cohort receipt freezes at most five canonical Models without storing LINE identity or activation URLs", async () => {
  const store = kv();
  const started = await startAvailabilityAdoptionCohort({ SIGIL_AVAILABILITY_SNAPSHOTS: store }, {
    cohort_number: 1,
    members: [
      { model_key: "mdl_one", record_id: "recModel1234567890", display_name: "One", priority_bucket: "upcoming_job", upcoming_job_at: "2026-10-02T12:00:00.000Z" },
      { model_key: "mdl_two", record_id: "recModel1234567891", display_name: "Two", priority_bucket: "line_ready" },
      { model_key: "mdl_three", record_id: "recModel1234567892", display_name: "Three", priority_bucket: "line_ready" },
      { model_key: "mdl_four", record_id: "recModel1234567893", display_name: "Four", priority_bucket: "commercial_active" },
      { model_key: "mdl_five", record_id: "recModel1234567894", display_name: "Five", priority_bucket: "backfill" },
    ],
  });
  assert.equal(started.ok, true);
  assert.equal(started.already_started, false);
  assert.equal(started.receipt.cohort_number, 1);
  assert.equal(started.receipt.members.length, 5);
  assert.deepEqual(started.receipt.members.map(item => item.model_key), ["mdl_one","mdl_two","mdl_three","mdl_four","mdl_five"]);
  assert.equal(store.writes.some(entry => entry.key === "availability-adoption:v1:cohort:current"), true);
  assert.equal(store.writes.some(entry => entry.key.startsWith("availability-adoption:v1:cohort:receipt:")), true);
  assert.doesNotMatch(JSON.stringify(started.receipt), /U[0-9a-f]{32}|activation_url|access_token/i);

  const second = await startAvailabilityAdoptionCohort({ SIGIL_AVAILABILITY_SNAPSHOTS: store }, {
    cohort_number: 1,
    members: [{ model_key: "mdl_six", record_id: "recModel1234567895", display_name: "Six" }],
  });
  assert.equal(second.ok, true);
  assert.equal(second.already_started, true);
  assert.deepEqual(second.receipt.members.map(item => item.model_key), ["mdl_one","mdl_two","mdl_three","mdl_four","mdl_five"]);

  const read = await readAvailabilityAdoptionCohort({ SIGIL_AVAILABILITY_SNAPSHOTS: store });
  assert.equal(read.ok, true);
  assert.equal(read.receipt.cohort_id, started.receipt.cohort_id);
});

test("availability adoption reminder sends one bounded LINE push and writes a 24h cooldown receipt", async () => {
  const store = kv();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com") {
      return Response.json({
        records: [{
          id: "recModel1234567890",
          fields: {
            unique_key: "mdl_pri_str_master",
            working_name: "Master",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            status: "active",
          },
        }],
      });
    }
    if (url.hostname === "api.line.me") return Response.json({}, { status: 200 });
    return new Response("not found", { status: 404 });
  };
  try {
    const response = await handleSigilAvailabilityInternalRequest(new Request(
      "https://admin-worker.local/v1/internal/sigil/availability-adoption/remind",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret",
          "x-mmd-internal-call": "true",
          "x-mmd-service-binding": "model-console-worker",
        },
        body: JSON.stringify({ model_key: "mdl_pri_str_master" }),
      },
    ), {
      INTERNAL_TOKEN: "secret",
      AIRTABLE_API_KEY: "airtable-secret",
      AIRTABLE_BASE_ID: "app_test",
      MODEL_LINE_CHANNEL_ACCESS_TOKEN: "line-secret",
      SIGIL_AVAILABILITY_SNAPSHOTS: store,
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.model_key, "mdl_pri_str_master");
    assert.equal(payload.channel, "line");
    assert.equal(payload.cooldown_seconds, 86400);
    assert.doesNotMatch(JSON.stringify(payload), /U0123456789abcdef|line-secret|airtable-secret/i);
    assert.equal(calls.filter(call => new URL(call.url).hostname === "api.line.me").length, 1);
    const lineCall = calls.find(call => new URL(call.url).hostname === "api.line.me");
    const lineBody = JSON.parse(lineCall.init.body);
    assert.equal(lineBody.to, "U0123456789abcdef0123456789abcdef");
    assert.match(lineBody.messages[0].text, /อัปเดตสถานะวันนี้/);
    assert.match(lineBody.messages[0].text, /\/sigil\/model\/dashboard\/availability/);
    const reminderReceipt = store.writes.find(entry => entry.key === "availability-adoption:v1:reminder:mdl_pri_str_master");
    const recoveryEvidence = store.writes.find(entry => entry.key === "availability-adoption:v1:recovery:mdl_pri_str_master");
    assert.equal(Boolean(reminderReceipt), true);
    assert.equal(Boolean(recoveryEvidence), true);
    assert.equal(reminderReceipt.options.expirationTtl, 86400);
    assert.equal(recoveryEvidence.options.expirationTtl, 90 * 24 * 60 * 60);

    const second = await handleSigilAvailabilityInternalRequest(new Request(
      "https://admin-worker.local/v1/internal/sigil/availability-adoption/remind",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret",
          "x-mmd-internal-call": "true",
          "x-mmd-service-binding": "model-console-worker",
        },
        body: JSON.stringify({ model_key: "mdl_pri_str_master" }),
      },
    ), {
      INTERNAL_TOKEN: "secret",
      AIRTABLE_API_KEY: "airtable-secret",
      AIRTABLE_BASE_ID: "app_test",
      MODEL_LINE_CHANNEL_ACCESS_TOKEN: "line-secret",
      SIGIL_AVAILABILITY_SNAPSHOTS: store,
    });
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error, "availability_reminder_cooldown");
    assert.equal(calls.filter(call => new URL(call.url).hostname === "api.line.me").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("availability reminder preflight resolves canonical Model and performs no send", async () => {
  const store = kv();
  const originalFetch = globalThis.fetch;
  let eventsCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.airtable.com") {
      return Response.json({
        records: [{
          id: "recModel1234567890",
          fields: {
            unique_key: "mdl_pri_str_master",
            working_name: "EMs16",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            status: "active",
          },
        }],
      });
    }
    throw new Error("unexpected network call " + url.hostname);
  };

  const eventsBinding = {
    async fetch(request) {
      eventsCalls += 1;
      assert.equal(new URL(request.url).pathname, "/__internal/model/availability-reminder/preflight");
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("x-internal-token"), "admin-events-secret");
      const body = await request.clone().json();
      assert.equal(body.line_user_id, "U0123456789abcdef0123456789abcdef");
      return Response.json({
        ok: true,
        ready: true,
        state: "ready",
        token_mode: "model",
        transport: "events-worker-model-line",
        recipient_reachable: true,
        provider_status: 200,
        message_sent: false,
      });
    },
  };

  try {
    const result = await preflightAvailabilityAdoptionReminder({
      AIRTABLE_API_KEY: "airtable-secret",
      AIRTABLE_BASE_ID: "app_test",
      AUTH_SERVICE_ADMIN_TO_EVENTS: "admin-events-secret",
      EVENTS_WORKER: eventsBinding,
      SIGIL_AVAILABILITY_SNAPSHOTS: store,
    }, "mdl_pri_str_master");

    assert.equal(result.ok, true);
    assert.equal(result.ready, true);
    assert.equal(result.state, "ready");
    assert.equal(result.transport, "events-worker-model-line");
    assert.equal(result.recipient_reachable, true);
    assert.equal(result.message_sent, false);
    assert.equal(eventsCalls, 1);
    assert.equal(store.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /U0123456789abcdef|airtable-secret|admin-events-secret/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("availability adoption reminder prefers events-worker Model LINE lane when service auth is ready", async () => {
  const store = kv();
  const bindingCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.airtable.com") {
      return Response.json({
        records: [{
          id: "recModel1234567890",
          fields: {
            unique_key: "mdl_pri_str_master",
            working_name: "EMs16",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            status: "active",
          },
        }],
      });
    }
    return new Response("not found", { status: 404 });
  };

  const eventsBinding = {
    async fetch(request) {
      bindingCalls.push(request);
      assert.equal(new URL(request.url).hostname, "events-worker.internal");
      assert.equal(new URL(request.url).pathname, "/__internal/model/availability-reminder");
      assert.equal(request.headers.get("x-internal-token"), "admin-events-secret");
      const body = await request.clone().json();
      assert.equal(body.line_user_id, "U0123456789abcdef0123456789abcdef");
      assert.equal(body.display_name, "EMs16");
      return Response.json({ ok: true, channel: "line", transport: "events-worker-model-line" });
    },
  };

  const memberBinding = {
    async fetch() {
      throw new Error("customer LINE lane must not be used when Model LINE owner is ready");
    },
  };

  try {
    const response = await handleSigilAvailabilityInternalRequest(new Request(
      "https://admin-worker.local/v1/internal/sigil/availability-adoption/remind",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret",
          "x-mmd-internal-call": "true",
          "x-mmd-service-binding": "calendar-owner",
        },
        body: JSON.stringify({ model_key: "mdl_pri_str_master" }),
      },
    ), {
      INTERNAL_TOKEN: "secret",
      AIRTABLE_API_KEY: "airtable-secret",
      AIRTABLE_BASE_ID: "app_test",
      AUTH_SERVICE_ADMIN_TO_EVENTS: "admin-events-secret",
      EVENTS_WORKER: eventsBinding,
      MEMBER_DASHBOARD_CHAT_WORKER: memberBinding,
      SIGIL_AVAILABILITY_SNAPSHOTS: store,
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.transport, "events-worker-model-line");
    assert.equal(bindingCalls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("availability adoption reminder prefers canonical member-dashboard LINE service binding without admin LINE token", async () => {
  const store = kv();
  const fetchCalls = [];
  const bindingCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    fetchCalls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com") {
      return Response.json({
        records: [{
          id: "recModel1234567890",
          fields: {
            unique_key: "mdl_pri_str_master",
            working_name: "EMs16",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            status: "active",
          },
        }],
      });
    }
    if (url.hostname === "api.line.me") throw new Error("admin-worker must not call LINE directly when binding exists");
    return new Response("not found", { status: 404 });
  };

  const lineBinding = {
    async fetch(request) {
      bindingCalls.push(request);
      assert.equal(new URL(request.url).hostname, "member-dashboard-chat-worker.local");
      assert.equal(new URL(request.url).pathname, "/__internal/line/model-availability-reminder");
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("x-mmd-internal-call"), "true");
      assert.equal(request.headers.get("x-mmd-service-binding"), "admin-worker");
      const body = await request.clone().json();
      assert.equal(body.line_user_id, "U0123456789abcdef0123456789abcdef");
      assert.equal(body.display_name, "EMs16");
      return Response.json({ ok: true, status: "sent", transport: "member-dashboard-chat-worker" });
    },
  };

  try {
    const response = await handleSigilAvailabilityInternalRequest(new Request(
      "https://admin-worker.local/v1/internal/sigil/availability-adoption/remind",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret",
          "x-mmd-internal-call": "true",
          "x-mmd-service-binding": "calendar-owner",
        },
        body: JSON.stringify({ model_key: "mdl_pri_str_master" }),
      },
    ), {
      INTERNAL_TOKEN: "secret",
      AIRTABLE_API_KEY: "airtable-secret",
      AIRTABLE_BASE_ID: "app_test",
      MEMBER_DASHBOARD_CHAT_WORKER: lineBinding,
      SIGIL_AVAILABILITY_SNAPSHOTS: store,
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.transport, "member-dashboard-chat-worker");
    assert.equal(bindingCalls.length, 1);
    assert.equal(fetchCalls.filter(call => new URL(call.url).hostname === "api.line.me").length, 0);
    assert.doesNotMatch(JSON.stringify(payload), /U0123456789abcdef|airtable-secret/i);
    assert.equal(store.writes.some(entry => entry.key === "availability-adoption:v1:reminder:mdl_pri_str_master"), true);
    assert.equal(store.writes.some(entry => entry.key === "availability-adoption:v1:recovery:mdl_pri_str_master"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("availability adoption reminder refuses fresh state and never guesses that a reminder is needed", async () => {
  const store = kv({
    "availability:v1:mdl_pri_str_master": JSON.stringify({
      schema: "sigil_availability_snapshot_v1",
      model_key: "mdl_pri_str_master",
      safe_availability_state: "available_today",
      availability_bucket: "today",
      city: "Bangkok",
      zones: [],
      operational_flags: {},
      confidence: "model_confirmed",
      updated_at: "2099-01-01T00:00:00.000Z",
      expires_at: "2099-01-01T06:00:00.000Z",
    }),
  });
  const response = await handleSigilAvailabilityInternalRequest(new Request(
    "https://admin-worker.local/v1/internal/sigil/availability-adoption/remind",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "model-console-worker",
      },
      body: JSON.stringify({ model_key: "mdl_pri_str_master" }),
    },
  ), {
    INTERNAL_TOKEN: "secret",
    SIGIL_AVAILABILITY_SNAPSHOTS: store,
  });
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.error, "availability_already_fresh");
  assert.equal(payload.safe_availability_state, "available_today");
});

test("calendar-owner reminder relay cannot publish availability snapshots", async () => {
  const store = kv();
  const response = await handleSigilAvailabilityInternalRequest(new Request(
    "https://admin-worker.local/v1/internal/sigil/availability-snapshot",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "calendar-owner",
      },
      body: JSON.stringify({
        model_key: "mdl_pri_str_master",
        availability_state: "available_now",
      }),
    },
  ), {
    INTERNAL_TOKEN: "secret",
    SIGIL_AVAILABILITY_SNAPSHOTS: store,
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "internal_auth_required");
  assert.equal(store.writes.length, 0);
});

test("model app cannot send adoption reminders", async () => {
  const response = await handleSigilAvailabilityInternalRequest(new Request(
    "https://admin-worker.local/v1/internal/sigil/availability-adoption/remind",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "model-app-worker",
      },
      body: JSON.stringify({ model_key: "mdl_pri_str_master" }),
    },
  ), {
    INTERNAL_TOKEN: "secret",
    SIGIL_AVAILABILITY_SNAPSHOTS: kv(),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "internal_auth_required");
});
