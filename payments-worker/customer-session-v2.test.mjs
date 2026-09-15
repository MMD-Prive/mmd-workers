import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomerSessionTracker,
  customerStage,
  latestEta,
} from "./customer-session-v2.js";

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
    jobFields: {
      job_id: "JOB-1",
      status: "en_route",
      last_update_at: "2026-09-10T10:06:00.000Z",
      events_json: JSON.stringify([
        { event: "eta_update", eta_minutes: 18, ts: "2026-09-10T10:06:00.000Z", private_note: "never expose" },
      ]),
    },
  });

  assert.equal(tracker.customer_stage, "en_route");
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
    jobFields: { status: "work_finished", events_json: "[]" },
  });
  const after = buildCustomerSessionTracker({
    token: "signed.customer.token",
    confirmation: { session_id: "sess_1", payment_ref: "pay_1" },
    jobFields: { status: "separated", events_json: "[]" },
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
