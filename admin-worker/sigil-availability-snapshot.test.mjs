import assert from "node:assert/strict";
import test from "node:test";

import {
  handleSigilAvailabilityInternalRequest,
  isSigilAvailabilityInternalRequest,
  writeSigilAvailabilitySnapshot,
} from "./src/sigil-availability-snapshot.js";

function kv() {
  const writes = [];
  return {
    writes,
    async put(key, value, options) {
      writes.push({ key, value, options });
    },
  };
}

test("internal availability endpoint is exact POST only", () => {
  assert.equal(isSigilAvailabilityInternalRequest("/v1/internal/sigil/availability-snapshot", "POST"), true);
  assert.equal(isSigilAvailabilityInternalRequest("/v1/internal/sigil/availability-snapshot", "GET"), false);
  assert.equal(isSigilAvailabilityInternalRequest("/v1/internal/sigil/availability-snapshot/extra", "POST"), false);
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
