import assert from "node:assert/strict";
import test from "node:test";

import {
  availabilityAdoptionCounts,
  availabilityAdoptionRow,
  availabilityCoverageCounts,
  availabilityCoverageRow,
  boundedConsoleAvailabilityBody,
  matchConsoleAvailabilityReminderPath,
  matchConsoleAvailabilitySnapshotPath,
  modelAvailabilityAdoptionIdentity,
  modelAvailabilityCoverageIdentity,
  resolveConsoleAvailabilityTarget,
} from "../src/sigil-availability-producer.mjs";

test("Model Console availability route is exact and model-bound", () => {
  assert.equal(
    matchConsoleAvailabilitySnapshotPath("/v1/console/models/mdl_pri_str_master/availability-snapshot"),
    "mdl_pri_str_master",
  );
  assert.equal(matchConsoleAvailabilitySnapshotPath("/v1/console/models/x/availability"), "");
  assert.equal(
    matchConsoleAvailabilityReminderPath("/v1/console/models/mdl_pri_str_master/availability-reminder"),
    "mdl_pri_str_master",
  );
  assert.equal(matchConsoleAvailabilityReminderPath("/v1/console/models/x/availability"), "");
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

test("adoption identity exposes contact readiness without raw LINE or Telegram IDs", () => {
  const identity = modelAvailabilityAdoptionIdentity({
    id: "recMaster",
    fields: {
      unique_key: "mdl_pri_str_master",
      working_name: "Master",
      status: "active",
      line_user_id: "U0123456789abcdef0123456789abcdef",
      telegram_user_id: "222222222",
      telegram_verification_status: "verified",
      admin_note: "PRIVATE",
    },
  });
  assert.deepEqual(identity, {
    id: "recMaster",
    model_key: "mdl_pri_str_master",
    display_name: "Master",
    canonical_status: "active",
    excluded: false,
    line_connected: true,
    telegram_connected: true,
  });
  assert.doesNotMatch(JSON.stringify(identity), /U0123456789abcdef|222222222|PRIVATE/i);
});

test("adoption row keeps missing canonical key as identity recovery instead of guessing", () => {
  const row = availabilityAdoptionRow({
    id: "recLegacy",
    model_key: "",
    display_name: "Legacy Model",
    canonical_status: "unreviewed",
    line_connected: true,
    telegram_connected: false,
  }, {});
  assert.equal(row.snapshot_state, "identity_missing");
  assert.equal(row.fresh, false);
  assert.equal(row.reminder_eligible, false);
  assert.equal(row.recovery_action, "link_canonical_model_key");
  assert.equal(row.recovery_stage, "identity_recovery_required");
});

test("adoption row makes only non-fresh LINE-linked models reminder-eligible", () => {
  const missing = availabilityAdoptionRow({
    id: "recMaster",
    model_key: "mdl_pri_str_master",
    display_name: "Master",
    canonical_status: "active",
    line_connected: true,
    telegram_connected: true,
  }, {
    ok: true,
    data: { snapshot_state: "missing", fresh: false, snapshot: null },
  });
  assert.equal(missing.reminder_eligible, true);
  assert.equal(missing.reminder_channel, "line");
  assert.equal(missing.recovery_action, "remind_model");
  assert.equal(missing.recovery_stage, "availability_confirmation_required");

  const fresh = availabilityAdoptionRow({
    id: "recMaster",
    model_key: "mdl_pri_str_master",
    display_name: "Master",
    canonical_status: "active",
    line_connected: true,
  }, {
    ok: true,
    data: {
      snapshot_state: "fresh",
      fresh: true,
      age_seconds: 40,
      ttl_remaining_seconds: 1000,
      snapshot: {
        safe_availability_state: "available_today",
        confidence: "model_confirmed",
        updated_at: "2026-09-23T01:00:00.000Z",
        expires_at: "2026-09-23T06:00:00.000Z",
      },
    },
  });
  assert.equal(fresh.reminder_eligible, false);
  assert.equal(fresh.recovery_action, "none");
  assert.equal(fresh.recovery_stage, "coverage_current");
});

test("adoption recovery evidence only advances stages after observed canonical facts", () => {
  const pending = availabilityAdoptionRow({ id: "recMaster", model_key: "mdl_pri_str_master", display_name: "Master", line_connected: false }, { ok: true, data: { snapshot_state: "missing", fresh: false, adoption_evidence: { activation_link_issued_at: "2026-09-23T01:00:00.000Z" } } });
  assert.equal(pending.recovery_stage, "line_link_issued_waiting_for_connection");
  const recovered = availabilityAdoptionRow({ id: "recMaster", model_key: "mdl_pri_str_master", display_name: "Master", line_connected: true }, { ok: true, data: { snapshot_state: "fresh", fresh: true, snapshot: { safe_availability_state: "available_today" }, adoption_evidence: { reminder_sent_at: "2026-09-23T01:00:00.000Z" } } });
  assert.equal(recovered.recovery_stage, "coverage_recovered");
  assert.doesNotMatch(JSON.stringify(recovered), /activation_url|U[0-9a-f]{32}/i);
});

test("adoption counts separate fresh, remindable, no-channel and identity gaps", () => {
  assert.deepEqual(availabilityAdoptionCounts([
    { snapshot_state: "fresh", fresh: true },
    { snapshot_state: "missing", fresh: false, reminder_eligible: true },
    { snapshot_state: "stale", fresh: false, reminder_eligible: false },
    { snapshot_state: "identity_missing", fresh: false, reminder_eligible: false },
    { snapshot_state: "excluded", fresh: false, reminder_eligible: false },
  ]), {
    total: 5,
    fresh: 1,
    needs_confirmation: 3,
    remindable: 1,
    no_channel: 1,
    identity_missing: 1,
    excluded: 1,
    line_link_required: 0,
    line_link_issued: 0,
    availability_confirmation_required: 0,
    reminder_sent_waiting_for_confirmation: 0,
    coverage_recovered: 0,
  });
});
