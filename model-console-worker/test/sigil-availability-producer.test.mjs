import assert from "node:assert/strict";
import test from "node:test";

import {
  availabilityCoverageCounts,
  availabilityCoverageRow,
  boundedConsoleAvailabilityBody,
  matchConsoleAvailabilitySnapshotPath,
  modelAvailabilityCoverageIdentity,
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


test("coverage identity exposes only canonical key and display name", () => {
  const identity = modelAvailabilityCoverageIdentity({
    id: "recMaster",
    fields: {
      unique_key: "mdl_pri_str_master",
      working_name: "Master",
      raw_note: "PRIVATE",
      source_rate: 999,
    },
  });
  assert.deepEqual(identity, {
    id: "recMaster",
    model_key: "mdl_pri_str_master",
    display_name: "Master",
  });
  assert.doesNotMatch(JSON.stringify(identity), /PRIVATE|source_rate|999/i);
});

test("coverage row projects freshness without raw snapshot fields", () => {
  const row = availabilityCoverageRow({
    id: "recMaster",
    model_key: "mdl_pri_str_master",
    display_name: "Master",
  }, {
    ok: true,
    data: {
      snapshot_state: "fresh",
      fresh: true,
      age_seconds: 30,
      ttl_remaining_seconds: 570,
      snapshot: {
        safe_availability_state: "available_now",
        confidence: "operator_confirmed",
        updated_at: "2026-09-22T01:00:00.000Z",
        expires_at: "2026-09-22T01:10:00.000Z",
        customer_name: "PRIVATE",
        payment_ref: "PRIVATE",
      },
    },
  });

  assert.equal(row.snapshot_state, "fresh");
  assert.equal(row.fresh, true);
  assert.equal(row.safe_availability_state, "available_now");
  assert.equal(row.confidence, "operator_confirmed");
  assert.doesNotMatch(JSON.stringify(row), /PRIVATE|payment_ref|customer_name/i);
});

test("coverage row fails display-safe when availability reader is unavailable", () => {
  const row = availabilityCoverageRow({
    id: "recMaster",
    model_key: "mdl_pri_str_master",
    display_name: "Master",
  }, {
    ok: false,
    status: 503,
    data: { error: "internal" },
  });

  assert.equal(row.snapshot_state, "unavailable");
  assert.equal(row.fresh, false);
  assert.equal(row.safe_availability_state, "");
});

test("coverage counts aggregate only projected states", () => {
  assert.deepEqual(availabilityCoverageCounts([
    { snapshot_state: "fresh" },
    { snapshot_state: "missing" },
    { snapshot_state: "missing" },
    { snapshot_state: "unavailable" },
  ]), {
    fresh: 1,
    missing: 2,
    unavailable: 1,
  });
});
