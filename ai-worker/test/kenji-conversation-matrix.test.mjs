import test from "node:test";
import assert from "node:assert/strict";

import worker from "../index.js";
import { buildKenjiConversationMatrix } from "../src/services/kenji-conversation-matrix.js";

const NOW = "2026-09-07T11:00:00.000Z";

function snapshot({ active = [], inactive = [], envelope = "none", evaluatedAt = NOW, memberBlocked = false } = {}) {
  const hasActive = active.length > 0;
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    fail_closed: true,
    member_blocked: memberBlocked,
    evaluated_at: evaluatedAt,
    capability_state: {
      active,
      expiring_soon: [],
      grace: [],
      inactive,
      recognized: [...active, ...inactive],
    },
    access: {
      public_service_access: hasActive,
      guest_pass_access: active.includes("guest_pass"),
      red_card_request_lane: false,
      private_visibility_envelope: envelope,
      protected_allowlist_required: active.some((item) => ["vip", "svip", "black_card"].includes(item)),
      protected_capabilities_active: active.filter((item) => ["vip", "svip", "black_card"].includes(item)),
      new_model_reveals_allowed: hasActive && envelope !== "none",
    },
  };
}

function completeEvidence() {
  return {
    rename_identity: { state: "FOUND" },
    line_oa_1to1: { state: "SEARCHED_NO_MATCH" },
    line_crew: { state: "SEARCHED_NO_MATCH" },
    chat_exports_attachments: { state: "SEARCHED_NO_MATCH" },
    hashtags_tenure: { state: "FOUND" },
    recognition_history: { state: "SEARCHED_NO_MATCH" },
    membership_cycles: { state: "FOUND" },
    payment_evidence: { state: "SEARCHED_NO_MATCH" },
    resolver_snapshot: { state: "FOUND" },
  };
}

function knownBundle(overrides = {}) {
  return {
    evaluated_at: NOW,
    identity: {
      state: "known",
      canonical_client_ref: "client:abc123",
      preferred_name: "พี่ต้น",
      confidence: "high",
      source: "reviewed_line_identity",
    },
    customer_context: {
      rename: "พี่ต้น",
      hashtags: ["#client", "#mem65", "#mem66"],
      latest_cycle: {
        package_code: "premium",
        renewal_date: "2026-06-01T00:00:00Z",
        expire_at: "2027-06-01T00:00:00Z",
      },
      entitlement_snapshot: snapshot({ active: ["private_premium"], envelope: "premium" }),
      evidence_sources: completeEvidence(),
    },
    reviewed_preferences: [
      {
        evidence_id: "evidence:pref01",
        review_status: "reviewed",
        evidence_type: "model_preference",
        normalized_summary: "ชอบลุคอบอุ่น พูดคุยสบาย ๆ",
        preference_strength: "strong",
        privacy_level: "internal_safe",
      },
    ],
    prior_model_touches: [
      { model_key: "GWs34", relationship: "previous_session", last_seen_at: "2026-08-01T00:00:00Z" },
    ],
    continuity: {
      last_intent: "membership_renewal",
      last_topic: "คุยเรื่องต่ออายุไว้เมื่อครั้งก่อน",
      last_model_key: "GWs34",
      last_reply_summary: "แจ้งขั้นตอนต่ออายุและรอให้ลูกค้าเลือกวัน",
      updated_at: "2026-09-06T11:00:00Z",
      unresolved_threads: [
        { type: "renewal", status: "waiting_customer", ref: "renewal:req01", summary: "รอวันสะดวก", handoff_required: false },
      ],
    },
    ...overrides,
  };
}

test("known returning customer resolves bounded identity, relationship, current state, and continuity", () => {
  const result = buildKenjiConversationMatrix(knownBundle(), { now: NOW });

  assert.equal(result.schema_version, "mmd.kenji_conversation_matrix.v1");
  assert.equal(result.identity.state, "known");
  assert.equal(result.identity.preferred_name, "พี่ต้น");
  assert.equal(result.relationship.returning_customer, true);
  assert.equal(result.relationship.reviewed_preferences.length, 1);
  assert.equal(result.relationship.prior_model_touches[0].model_key, "GWs34");
  assert.equal(result.current_state.rights_authority, "my_mmd_entitlement_resolver_v1");
  assert.equal(result.current_state.lifecycle, "active");
  assert.ok(result.current_state.capabilities.includes("private_visibility:premium"));
  assert.equal(result.continuity.last_intent, "membership_renewal");
  assert.equal(result.continuity.unresolved_threads[0].status, "waiting_customer");
  assert.equal(result.safety.may_personalize, true);
  assert.equal(result.safety.may_reference_history, true);
  assert.equal(result.safety.may_grant_entitlement, false);
});

test("unknown identity stays anonymous and cannot inherit supplied history", () => {
  const result = buildKenjiConversationMatrix({
    evaluated_at: NOW,
    identity: { state: "unknown", preferred_name: "Should Not Leak", confidence: "high" },
    reviewed_preferences: [{ review_status: "reviewed", normalized_summary: "secret preference" }],
    prior_model_touches: ["EMs99"],
    continuity: { last_intent: "private_talent", last_topic: "old private topic" },
  }, { now: NOW });

  assert.equal(result.identity.state, "unknown");
  assert.equal(result.identity.preferred_name, "");
  assert.equal(result.relationship.returning_customer, false);
  assert.deepEqual(result.relationship.reviewed_preferences, []);
  assert.deepEqual(result.relationship.prior_model_touches, []);
  assert.equal(result.continuity.last_intent, "");
  assert.equal(result.safety.may_personalize, false);
  assert.equal(result.safety.may_reference_history, false);
});

test("ambiguous identity fails personalization closed and requires review", () => {
  const result = buildKenjiConversationMatrix({
    evaluated_at: NOW,
    identity: { state: "ambiguous", confidence: "low" },
  }, { now: NOW });

  assert.equal(result.identity.state, "ambiguous");
  assert.equal(result.safety.review_required, true);
  assert.equal(result.safety.may_personalize, false);
  assert.equal(result.safety.may_reference_history, false);
});

test("unreviewed or private intelligence evidence is excluded", () => {
  const bundle = knownBundle({
    reviewed_preferences: [
      { evidence_id: "evidence:ok", review_status: "reviewed", evidence_type: "service_preference", normalized_summary: "ชอบคุยสั้น กระชับ" },
      { evidence_id: "evidence:no", review_status: "pending", evidence_type: "model_preference", normalized_summary: "must not appear" },
      { evidence_id: "evidence:private", review_status: "reviewed", privacy_level: "sensitive", evidence_type: "service_preference", normalized_summary: "must not appear either" },
    ],
  });
  const result = buildKenjiConversationMatrix(bundle, { now: NOW });

  assert.equal(result.relationship.reviewed_preferences.length, 1);
  assert.equal(result.relationship.reviewed_preferences[0].summary, "ชอบคุยสั้น กระชับ");
});

test("historical VIP recognition cannot create current entitlement", () => {
  const bundle = knownBundle();
  bundle.customer_context.rename = "พี่ต้น VIP";
  bundle.customer_context.entitlement_snapshot = snapshot({ inactive: ["vip", "private_premium"], envelope: "none" });
  const result = buildKenjiConversationMatrix(bundle, { now: NOW });

  assert.ok(result.relationship.recognition_history.includes("vip"));
  assert.equal(result.current_state.lifecycle, "expired");
  assert.deepEqual(result.current_state.capabilities, []);
  assert.equal(result.safety.may_restore_vip_svip_black_card, false);
});

test("stale resolver snapshot is never exposed as current authority", () => {
  const bundle = knownBundle();
  bundle.customer_context.entitlement_snapshot = snapshot({
    active: ["black_card"],
    envelope: "black_card",
    evaluatedAt: "2026-09-07T10:00:00Z",
  });
  const result = buildKenjiConversationMatrix(bundle, { now: NOW });

  assert.equal(result.current_state.stale, true);
  assert.equal(result.current_state.resolver_snapshot_valid, false);
  assert.equal(result.current_state.lifecycle, "unknown");
  assert.deepEqual(result.current_state.capabilities, []);
  assert.equal(result.safety.review_required, true);
});

test("payment and availability intents remain protected regardless of remembered continuity", () => {
  const payment = buildKenjiConversationMatrix(knownBundle({
    current_intent: "payment_status",
    domain_guard: { handoff_required: false },
  }), { now: NOW });
  assert.equal(payment.safety.handoff_required, true);
  assert.equal(payment.safety.may_confirm_payment, false);

  const availability = buildKenjiConversationMatrix(knownBundle({ current_intent: "availability_request" }), { now: NOW });
  assert.equal(availability.safety.handoff_required, true);
  assert.equal(availability.safety.may_confirm_booking_or_availability, false);
});

test("matrix output excludes raw sensitive fields and unrestricted chat payloads", () => {
  const bundle = knownBundle({
    access_token: "supersecret-token",
    raw_private_note: "supersecret-note",
    user_message: "full raw chat should not be persisted as memory",
    continuity: {
      ...knownBundle().continuity,
      raw_message: "Bearer supersecret",
      password: "supersecret-password",
    },
  });
  const serialized = JSON.stringify(buildKenjiConversationMatrix(bundle, { now: NOW }));

  assert.equal(serialized.includes("supersecret"), false);
  assert.equal(serialized.includes("full raw chat should not be persisted as memory"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.equal(serialized.includes("raw_private_note"), false);
});

test("Conversation Matrix route is internal-only and read-only", async () => {
  const body = { actor: { role: "system" }, context_bundle: knownBundle() };

  const denied = await worker.fetch(new Request("https://ai-worker.local/v1/ai/kenji/conversation-matrix", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { INTERNAL_TOKEN: "secret" });
  assert.equal(denied.status, 401);

  const allowed = await worker.fetch(new Request("https://ai-worker.local/v1/ai/kenji/conversation-matrix", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer secret" },
    body: JSON.stringify(body),
  }), { INTERNAL_TOKEN: "secret" });
  assert.equal(allowed.status, 200);
  const payload = await allowed.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.read_only, true);
  assert.equal(payload.data.safety.memory_is_context_only, true);
  assert.equal(payload.meta.authority, "context_projection_only");
  assert.equal(payload.meta.rights_authority, "my_mmd_entitlement_resolver_v1");
});
