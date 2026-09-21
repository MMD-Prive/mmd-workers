import assert from "node:assert/strict";
import test from "node:test";

import {
  availabilityStateFromModelProfile,
  buildSigilAvailabilitySnapshot,
  safeAvailabilityReceipt,
} from "./sigil-availability-snapshot-v1.mjs";

test("available_now snapshot is sanitized and capped at fifteen minutes", () => {
  const now = Date.parse("2026-09-22T01:00:00.000Z");
  const result = buildSigilAvailabilitySnapshot({
    availability_state: "available_now",
    expires_at: "2026-09-22T06:00:00.000Z",
    location_scope: {
      city: "Bangkok",
      zones: ["Sukhumvit", "hotel room 1205", "Silom"],
    },
    operational_flags: {
      burn: true,
      mk: false,
      live: "yes",
      customer_name: "must not copy",
    },
    customer_name: "PRIVATE CUSTOMER",
    payment_ref: "PAY-PRIVATE",
    exact_gps: { lat: 13.7, lng: 100.5 },
  }, {
    model_key: "mdl_pri_str_master",
    source: "model_console",
    confidence: "operator_confirmed",
    now_ms: now,
  });

  assert.equal(result.ok, true);
  assert.equal(result.ttl_seconds, 15 * 60);
  assert.equal(result.snapshot.expires_at, "2026-09-22T01:15:00.000Z");
  assert.deepEqual(result.snapshot.zones, ["sukhumvit", "silom"]);
  assert.deepEqual(result.snapshot.operational_flags, { burn: true, mk: false, live: true });

  const serialized = JSON.stringify(result.snapshot);
  assert.doesNotMatch(serialized, /PRIVATE CUSTOMER|PAY-PRIVATE|1205|13\.7|100\.5/i);
});

test("model profile availability maps to safe customer states", () => {
  assert.equal(availabilityStateFromModelProfile({ available_now: true, availability_status: "available" }), "available_now");
  assert.equal(availabilityStateFromModelProfile({ available_now: false, availability_status: "available" }), "available_today");
  assert.equal(availabilityStateFromModelProfile({ available_now: false, availability_status: "busy" }), "unavailable");
  assert.equal(availabilityStateFromModelProfile({ available_now: false, availability_status: "vacation" }), "unavailable");
  assert.equal(availabilityStateFromModelProfile({}), "unknown");
});

test("available_soon TTL is bounded to twenty-four hours", () => {
  const now = Date.parse("2026-09-22T01:00:00.000Z");
  const result = buildSigilAvailabilitySnapshot({
    availability_state: "available_soon",
    ttl_seconds: 3 * 24 * 60 * 60,
  }, {
    model_key: "mdl_pri_str_master",
    source: "model_app",
    now_ms: now,
  });
  assert.equal(result.ok, true);
  assert.equal(result.ttl_seconds, 24 * 60 * 60);
  assert.equal(result.snapshot.confidence, "model_confirmed");
});

test("invalid model keys and availability states fail closed", () => {
  assert.equal(buildSigilAvailabilitySnapshot({ availability_state: "available_now" }, { model_key: "rec with spaces" }).error, "model_key_invalid");
  assert.equal(buildSigilAvailabilitySnapshot({ availability_state: "free_forever" }, { model_key: "mdl_ok" }).error, "availability_state_invalid");
});

test("safe receipt never forwards arbitrary snapshot fields", () => {
  const receipt = safeAvailabilityReceipt({
    schema: "sigil_availability_snapshot_v1",
    model_key: "mdl_pri_str_master",
    safe_availability_state: "available_today",
    availability_bucket: "today",
    city: "Bangkok",
    zones: ["sukhumvit"],
    operational_flags: { burn: false, mk: true, live: true },
    confidence: "operator_confirmed",
    updated_at: "2026-09-22T01:00:00.000Z",
    expires_at: "2026-09-22T07:00:00.000Z",
    customer_name: "PRIVATE",
    payment_ref: "PRIVATE",
    raw_note: "PRIVATE",
  });
  assert.equal(receipt.model_key, "mdl_pri_str_master");
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE|payment_ref|raw_note/i);
});
