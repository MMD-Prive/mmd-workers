import assert from "node:assert/strict";
import test from "node:test";

import { buildIncidentRootCauseDigest } from "./src/hype-incident-root-cause.js";

function router(status = "partial") {
  return {
    available: true,
    status,
    counts: { legacy_direct_senders: status === "partial" ? 4 : 0, partial: status === "partial" ? 7 : 0, unavailable: status === "degraded" ? 1 : 0 },
    causes: status === "degraded" ? ["telegram_api_unreachable"] : status === "partial" ? ["legacy_direct_senders_present"] : [],
  };
}

function recovery() {
  return { available: true, overdue_count: 0, attention_count: 0, attention_unassigned_count: 0 };
}

test("silence with non-degraded Telegram points to LINE ingress, not Telegram", () => {
  const digest = buildIncidentRootCauseDigest({
    observer: {
      available: true,
      alert_codes: ["slip_silent_48h"],
      silence_hours: 72,
      accepted_last_24h: 0,
      last_accepted_slip_at: "2026-09-13T04:54:10Z",
    },
    router: router("partial"),
    recovery: recovery(),
  });
  assert.equal(digest.status, "critical");
  assert.equal(digest.primary.code, "line_payment_ingress_silent_48h");
  assert.equal(digest.primary.likely_layer, "line_payment_ingress");
  assert.match(digest.primary.explanation, /LINE image ingress/i);
});

test("extractor degradation outranks silence as likely root cause", () => {
  const digest = buildIncidentRootCauseDigest({
    observer: {
      available: true,
      alert_codes: ["slip_silent_48h", "extractor_degraded", "held_spike"],
      silence_hours: 72,
      accepted_last_24h: 0,
      extractor_failures_1h: 5,
      extractor_consecutive_failures: 3,
      held_open: 12,
      held_new_1h: 6,
    },
    router: router("partial"),
    recovery: recovery(),
  });
  assert.equal(digest.primary.code, "payment_extractor_degraded");
  assert.equal(digest.primary.likely_layer, "slip_extractor");
  assert.equal(digest.primary.confidence, "high");
});

test("terminal outbox plus degraded router points to Telegram delivery chain", () => {
  const digest = buildIncidentRootCauseDigest({
    observer: {
      available: true,
      alert_codes: ["outbox_failed_terminal"],
      outbox_failed_terminal: 2,
      outbox_retryable: 1,
    },
    router: router("degraded"),
    recovery: recovery(),
  });
  assert.equal(digest.primary.code, "telegram_delivery_chain_degraded");
  assert.equal(digest.primary.likely_layer, "telegram_transport");
  assert.equal(digest.primary.confidence, "high");
});

test("legacy direct senders are governance attention, not a business-truth incident", () => {
  const digest = buildIncidentRootCauseDigest({
    observer: { available: true, alert_codes: [] },
    router: router("partial"),
    recovery: recovery(),
  });
  assert.equal(digest.status, "attention");
  assert.equal(digest.primary.code, "telegram_router_legacy_sender_drift");
  assert.equal(digest.authority.diagnostic_only, true);
  assert.equal(digest.authority.business_truth_inferred, false);
});

test("healthy sources produce no active incident", () => {
  const digest = buildIncidentRootCauseDigest({
    observer: { available: true, alert_codes: [] },
    router: { available: true, status: "configured", counts: { legacy_direct_senders: 0, partial: 0, unavailable: 0 }, causes: [] },
    recovery: recovery(),
  });
  assert.equal(digest.status, "healthy");
  assert.equal(digest.incident_count, 0);
  assert.equal(digest.primary.code, "no_active_incident");
});
