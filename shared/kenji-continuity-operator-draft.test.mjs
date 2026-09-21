import assert from "node:assert/strict";
import test from "node:test";

import {
  KENJI_CONTINUITY_OPERATOR_DRAFT_SCHEMA,
  buildKenjiContinuityOperatorDraft,
} from "./kenji-continuity-operator-draft.mjs";

const NOW = "2026-09-21T10:30:00.000Z";

function eligible(overrides = {}) {
  const value = {
    evaluated_at: NOW,
    channel: "line_ofc",
    identity: {
      state: "known",
      confidence: "high",
      verified: true,
      preferred_name: "วินนี่",
    },
    relationship: {
      context: "active_member",
      returning_customer: false,
    },
    continuity: {
      decision: "continuation",
      confidence: 0.95,
      topic: "payment",
      conversation_stage: "awaiting_payment_verification",
      matrix_status: "active",
      matrix_version: 7,
      updated_at: "2026-09-21T10:20:00.000Z",
      expires_at: "2026-09-28T10:20:00.000Z",
      live_truth_domains: ["payment", "entitlement"],
      context_only: true,
      live_truth_wins: true,
    },
    safety: {
      review_required: false,
      stale: false,
      handoff_required: false,
      live_truth_required: true,
    },
  };
  return {
    ...value,
    ...overrides,
    identity: { ...value.identity, ...(overrides.identity || {}) },
    relationship: { ...value.relationship, ...(overrides.relationship || {}) },
    continuity: { ...value.continuity, ...(overrides.continuity || {}) },
    safety: { ...value.safety, ...(overrides.safety || {}) },
  };
}

test("builds a deterministic LINE operator draft for a verified fresh returning-client thread", () => {
  const draft = buildKenjiContinuityOperatorDraft(eligible(), {
    mode: "operator_draft",
    now: NOW,
  });

  assert.equal(draft.schema, KENJI_CONTINUITY_OPERATOR_DRAFT_SCHEMA);
  assert.equal(draft.available, true);
  assert.equal(draft.channel, "line_ofc");
  assert.equal(draft.send_allowed, false);
  assert.equal(draft.requires_owner_review, true);
  assert.equal(draft.reason, "operator_review_required");
  assert.match(draft.text, /คุณวินนี่ครับ/);
  assert.match(draft.text, /เรื่องชำระเงิน/);
  assert.match(draft.text, /ตรวจสถานะล่าสุดจากระบบเจ้าของข้อมูล/);
  assert.equal(draft.guardrails.customer_auto_send, false);
  assert.equal(draft.guardrails.business_truth_claims, false);
  assert.equal(draft.guardrails.memory_is_context_only, true);
  assert.equal(draft.guardrails.protected_truth_refresh_required, true);
});

test("handoff draft stays generic and requires Per plus fresh authority review", () => {
  const draft = buildKenjiContinuityOperatorDraft(eligible({
    continuity: { topic: "membership" },
    safety: { handoff_required: true },
  }), { mode: "operator_draft", now: NOW });

  assert.equal(draft.available, true);
  assert.match(draft.text, /ให้เปอร์ตรวจข้อมูลล่าสุด/);
  assert.match(draft.text, /เรื่องสมาชิก/);
  assert.equal(draft.guardrails.protected_truth_refresh_required, true);
  assert.equal(draft.send_allowed, false);
});

test("never interpolates raw Matrix notes, references, statuses, or credentials", () => {
  const draft = buildKenjiContinuityOperatorDraft(eligible({
    continuity: {
      topic: "unreviewed custom topic SECRET SUMMARY",
      continuity_summary: "RAW CUSTOMER PRIVATE NOTE",
      pending_action: "mark paid",
      pending_reference: "proof_123",
      live_truth_domains: [],
    },
    safety: { live_truth_required: false },
    canonical_state: {
      payment_status: "paid",
      membership_status: "active",
      access_token: "secret-token-value",
    },
  }), { mode: "operator_draft", now: NOW });

  assert.equal(draft.available, true);
  assert.match(draft.text, /เรื่องที่คุยค้างไว้/);
  assert.doesNotMatch(
    JSON.stringify(draft),
    /SECRET SUMMARY|RAW CUSTOMER PRIVATE NOTE|proof_123|mark paid|secret-token-value|"paid"|"active"/,
  );
});

test("fails closed for disabled or unknown rollout modes", () => {
  const off = buildKenjiContinuityOperatorDraft(eligible(), { mode: "off", now: NOW });
  const unknown = buildKenjiContinuityOperatorDraft(eligible(), { mode: "customer_auto_send", now: NOW });

  assert.equal(off.available, false);
  assert.equal(off.reason, "phase4_mode_off");
  assert.equal(unknown.available, false);
  assert.equal(unknown.reason, "unsupported_phase4_mode");
  assert.equal(off.send_allowed, false);
  assert.equal(unknown.send_allowed, false);
});

test("fails closed when identity, relationship, Matrix boundary, review, or freshness is unsafe", () => {
  const cases = [
    [eligible({ identity: { verified: false } }), "verified_canonical_identity_required"],
    [eligible({ identity: { confidence: "medium" } }), "high_confidence_identity_required"],
    [eligible({ relationship: { context: "new_contact" } }), "reviewed_returning_relationship_required"],
    [eligible({ continuity: { decision: "ambiguous" } }), "verified_open_thread_required"],
    [eligible({ continuity: { matrix_status: "review_required" } }), "active_matrix_required"],
    [eligible({ continuity: { context_only: false } }), "continuity_authority_boundary_required"],
    [eligible({ continuity: { matrix_version: 0 } }), "matrix_version_required"],
    [eligible({ continuity: { conversation_stage: "resolved" } }), "open_conversation_stage_required"],
    [eligible({ safety: { review_required: true } }), "continuity_review_required"],
    [eligible({ safety: { stale: true } }), "continuity_stale"],
    [eligible({ continuity: { expires_at: "2026-09-21T10:29:59.000Z" } }), "matrix_stale_or_expired"],
    [eligible({ continuity: { updated_at: "2026-08-01T00:00:00.000Z" } }), "matrix_stale_or_expired"],
  ];

  for (const [input, reason] of cases) {
    const draft = buildKenjiContinuityOperatorDraft(input, { mode: "operator_draft", now: NOW });
    assert.equal(draft.available, false, reason);
    assert.equal(draft.reason, reason);
    assert.equal(draft.text, null);
    assert.equal(draft.send_allowed, false);
  }
});

test("rejects names that resemble identifiers, contact data, or secrets", () => {
  const unsafeNames = [
    "person@example.com",
    "https://example.com",
    "0812345678",
    "recABCDEFGHIJKLMN",
    "U12345678901234567890123456789012",
    "Bearer secret",
    "sk-secretvalue",
    "Client",
    "Name\nInjected",
  ];

  for (const preferredName of unsafeNames) {
    const draft = buildKenjiContinuityOperatorDraft(eligible({
      identity: { preferred_name: preferredName },
    }), { mode: "operator_draft", now: NOW });
    assert.equal(draft.available, false, preferredName);
    assert.equal(draft.reason, "customer_safe_name_required", preferredName);
    assert.equal(draft.text, null, preferredName);
  }
});
