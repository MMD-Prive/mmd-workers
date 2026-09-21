import assert from "node:assert/strict";
import test from "node:test";
import { evaluateObserverHealth } from "../src/payment-observer-health.mjs";

const T = {
  silenceWarningHours: 24,
  silenceCriticalHours: 48,
  heldNew1hWarning: 5,
  heldOpenWarning: 10,
  extractor1hCritical: 5,
  extractorConsecutiveCritical: 3,
};

test("48h silence is critical and alertable", () => {
  const h = evaluateObserverHealth({
    proof:{ silence_hours:72, accepted_last_24h:0, real_v4_event_seen:false },
    runtime:{ available:true, held_open:0, held_new_1h:0, extractor_failures_1h:0, extractor_consecutive_failures:0, outbox_failed_terminal:0 },
    nowMs:Date.parse("2026-09-21T00:00:00Z"),
    config:{ thresholds:T },
  });
  assert.equal(h.overall_status,"critical");
  assert.equal(h.hype_alert_required,true);
  assert.ok(h.alert_codes.includes("slip_silent_48h"));
  assert.equal(h.membership_v4_seen_after_deploy,true);
  assert.equal(h.alert_codes.includes("membership_v4_absent"),false);
});

test("held spike warns without inventing payment truth", () => {
  const h = evaluateObserverHealth({
    proof:{ silence_hours:3, accepted_last_24h:2, real_v4_event_seen:true },
    runtime:{ available:true, held_open:11, held_new_1h:6, extractor_failures_1h:0, extractor_consecutive_failures:0, outbox_failed_terminal:0 },
    nowMs:Date.now(),
    config:{ thresholds:T },
  });
  assert.equal(h.overall_status,"warning");
  assert.deepEqual(h.alert_codes,["held_spike"]);
});

test("extractor degradation and terminal outbox are critical", () => {
  const h = evaluateObserverHealth({
    proof:{ silence_hours:2, accepted_last_24h:1, real_v4_event_seen:true },
    runtime:{ available:true, held_open:2, held_new_1h:1, extractor_failures_1h:5, extractor_consecutive_failures:3, outbox_failed_terminal:1 },
    nowMs:Date.now(),
    config:{ thresholds:T },
  });
  assert.equal(h.overall_status,"critical");
  assert.ok(h.alert_codes.includes("extractor_degraded"));
  assert.ok(h.alert_codes.includes("outbox_failed_terminal"));
});

test("recovery emits one recovery transition from prior alert", () => {
  const previous={ fields:{ hype_alert_required:true, alert_codes:["slip_silent_48h"], overall_status:"critical" } };
  const h = evaluateObserverHealth({
    proof:{ silence_hours:1, accepted_last_24h:1, real_v4_event_seen:true },
    runtime:{ available:true, held_open:0, held_new_1h:0, extractor_failures_1h:0, extractor_consecutive_failures:0, outbox_failed_terminal:0 },
    previous,
    nowMs:Date.now(),
    config:{ thresholds:T },
  });
  assert.equal(h.overall_status,"recovering");
  assert.equal(h.recovered,true);
  assert.equal(h.should_notify,true);
  assert.deepEqual(h.alert_codes,["observer_recovered"]);
});

test("stable healthy state does not notify repeatedly", () => {
  const previous={ fields:{ hype_alert_required:false, alert_codes:[], overall_status:"healthy" } };
  const h = evaluateObserverHealth({
    proof:{ silence_hours:1, accepted_last_24h:1, real_v4_event_seen:false },
    runtime:{ available:true, held_open:0, held_new_1h:0, extractor_failures_1h:0, extractor_consecutive_failures:0, outbox_failed_terminal:0 },
    previous,
    nowMs:Date.now(),
    config:{ thresholds:T },
  });
  assert.equal(h.overall_status,"healthy");
  assert.equal(h.should_notify,false);
  assert.equal(h.real_v4_event_seen,false);
  assert.equal(h.membership_v4_seen_after_deploy,true);
});
