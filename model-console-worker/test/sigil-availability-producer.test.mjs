import assert from "node:assert/strict";
import test from "node:test";

import {
  boundedConsoleAvailabilityBody,
  matchConsoleAvailabilitySnapshotPath,
  resolveConsoleAvailabilityTarget,
} from "../src/sigil-availability-producer.mjs";

test("Model Console availability route is exact and model-bound", () => {
  assert.equal(
    matchConsoleAvailabilitySnapshotPath("/v1/console/models/mdl_pri_str_master/availability-snapshot"),
    "mdl_pri_str_master",
  );
  assert.equal(matchConsoleAvailabilitySnapshotPath("/v1/console/models/x/availability"), "");
});

test("Model Console resolves one exact canonical model key", () => {
  const result = resolveConsoleAvailabilityTarget({
    items: [{
      id: "recqUSBH4H6LFH7ay",
      fields: {
        unique_key: "mdl_pri_str_master",
        working_name: "Master",
        status: "active",
      },
    }],
  }, "recqUSBH4H6LFH7ay");
  assert.deepEqual(result, { ok: true, model_key: "mdl_pri_str_master" });
});

test("Model Console refuses inactive models", () => {
  const result = resolveConsoleAvailabilityTarget({
    items: [{
      id: "recInactive",
      fields: {
        unique_key: "mdl_inactive",
        status: "inactive",
      },
    }],
  }, "recInactive");
  assert.equal(result.ok, false);
  assert.equal(result.error, "model_not_available_for_snapshot");
});

test("Model Console strips raw operational fields before forwarding", () => {
  const safe = boundedConsoleAvailabilityBody({
    availability_state: "available_today",
    city: "Bangkok",
    zones: ["sukhumvit"],
    operational_flags: { burn: false, mk: true, live: true, secret: true },
    customer_name: "PRIVATE",
    payment_ref: "PRIVATE",
    raw_note: "PRIVATE",
    exact_location: { lat: 13.7, lng: 100.5 },
  }, "mdl_pri_str_master");

  assert.equal(safe.model_key, "mdl_pri_str_master");
  assert.equal(safe.availability_state, "available_today");
  assert.deepEqual(safe.location_scope, { city: "Bangkok", zones: ["sukhumvit"] });
  assert.deepEqual(safe.operational_flags, { burn: false, mk: true, live: true });
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE|payment_ref|raw_note|13\.7|100\.5|secret/i);
});
