import test from "node:test";
import assert from "node:assert/strict";

import {
  EVIDENCE_SOURCE_STATES,
  reasonKenjiCustomerContext,
} from "../src/services/kenji-customer-reasoning.js";

function snapshot() {
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    fail_closed: true,
    member_blocked: false,
    capability_state: {
      active: [],
      expiring_soon: [],
      grace: [],
      inactive: ["private_premium"],
      recognized: ["private_premium"],
    },
    access: {
      public_service_access: false,
      guest_pass_access: false,
      red_card_request_lane: false,
      private_visibility_envelope: "none",
      protected_allowlist_required: false,
      protected_capabilities_active: [],
      new_model_reveals_allowed: false,
    },
  };
}

function baseContext(extra = {}) {
  return {
    rename: "โป้ Blackcard",
    hashtags: ["#client", "#mem65", "#mem66", "#memaug23", "#memBlackCard"],
    latest_cycle: {
      package_code: "premium",
      renewed_at: "2023-08-15T00:00:00+07:00",
      expire_at: "2025-08-15T23:59:59+07:00",
    },
    entitlement_snapshot: snapshot(),
    ...extra,
  };
}

test("missing LINE OA and Crew access is SOURCE_UNAVAILABLE, never no-match", () => {
  const result = reasonKenjiCustomerContext(baseContext(), { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.evidence_discovery.sources.line_oa_1to1.state, EVIDENCE_SOURCE_STATES.SOURCE_UNAVAILABLE);
  assert.equal(result.evidence_discovery.sources.line_crew.state, EVIDENCE_SOURCE_STATES.SOURCE_UNAVAILABLE);
  assert.equal(result.evidence_discovery.unavailable_is_not_not_found, true);
  assert.equal(result.evidence_discovery.evidence_incomplete, true);
  assert.equal(result.evidence_discovery.note_ready, false);
  assert.equal(result.review_required, true);
  assert.ok(result.warnings.includes("evidence_incomplete"));
});

test("SEARCHED_NO_MATCH is accepted only when the source explicitly reports that state", () => {
  const result = reasonKenjiCustomerContext(baseContext({
    evidence_sources: {
      line_oa_1to1: { state: "SEARCHED_NO_MATCH" },
      line_crew: { state: "FOUND", evidence_count: 2 },
      chat_exports_attachments: { state: "SEARCHED_NO_MATCH" },
      recognition_history: { state: "FOUND", evidence_count: 1 },
      membership_cycles: { state: "FOUND", evidence_count: 3 },
      payment_evidence: { state: "SEARCHED_NO_MATCH" },
    },
  }), { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.evidence_discovery.sources.line_oa_1to1.state, EVIDENCE_SOURCE_STATES.SEARCHED_NO_MATCH);
  assert.equal(result.evidence_discovery.sources.line_crew.state, EVIDENCE_SOURCE_STATES.FOUND);
  assert.equal(result.evidence_discovery.sources.payment_evidence.state, EVIDENCE_SOURCE_STATES.SEARCHED_NO_MATCH);
  assert.equal(result.evidence_discovery.evidence_incomplete, false);
  assert.equal(result.evidence_discovery.note_ready, true);
  assert.equal(result.review_required, false);
});

test("ambiguous not_found input does not get promoted to SEARCHED_NO_MATCH", () => {
  const result = reasonKenjiCustomerContext(baseContext({
    evidence_sources: {
      line_oa_1to1: "not_found",
    },
  }), { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.evidence_discovery.sources.line_oa_1to1.state, EVIDENCE_SOURCE_STATES.SOURCE_UNAVAILABLE);
  assert.equal(result.evidence_discovery.evidence_incomplete, true);
  assert.equal(result.review_required, true);
});

test("Blackcard Rename history does not fabricate payment evidence discovery", () => {
  const result = reasonKenjiCustomerContext(baseContext(), { now: "2026-09-03T12:00:00Z" });

  assert.equal(result.historical_recognition.historical_blackcard_paid_confirmed, true);
  assert.equal(result.evidence_discovery.sources.payment_evidence.state, EVIDENCE_SOURCE_STATES.SOURCE_UNAVAILABLE);
  assert.equal(result.canonical_current_state.lifecycle, "expired");
});
