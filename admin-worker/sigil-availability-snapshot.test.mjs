import assert from "node:assert/strict";
import test from "node:test";

import {
  handleSigilAvailabilityInternalRequest,
  isSigilAvailabilityInternalRequest,
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
    assert.equal(store.writes.some(entry => entry.key === "availability-adoption:v1:reminder:mdl_pri_str_master"), true);
  assert.equal(store.writes.some(entry => entry.key === "availability-adoption:v1:recovery:mdl_pri_str_master"), true);
    assert.equal(store.writes.at(-1).options.expirationTtl, 86400);

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
