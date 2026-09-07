import assert from "node:assert/strict";
import {
  buildConversationContinuityContext,
  buildConversationMatrixV1,
  inferLiveTruthDomains,
  isContinuationCandidate,
  resolveConversationContinuityV1,
} from "./kenji-conversation-matrix.mjs";

assert.deepEqual(inferLiveTruthDomains("membership"), ["membership", "entitlement"]);
assert.deepEqual(inferLiveTruthDomains("payment_status"), ["payment"]);

const matrix = buildConversationMatrixV1({
  matrix_id: "kcm1_line_client123",
  client_record_id: "recClient",
  channel: "line_ofc",
  conversation_scope: "client123",
  topic: "membership",
  subtopic: "premium_renewal",
  relationship_context: "active_member",
  last_customer_intent: "renewal",
  last_customer_request: "renew Premium",
  last_customer_action: "submitted_payment_proof",
  conversation_stage: "awaiting_payment_verification",
  awaiting_from: "payment_authority",
  pending_action: "verify payment and refresh entitlement",
  continuity_summary: "Customer asked to renew Premium and already sent payment proof.",
  do_not_ask_again: ["membership_package", "payment_proof"],
  important_open_loops: ["payment_verification", "entitlement_refresh"],
  state_updated_at: "2026-09-07T10:00:00.000Z",
  state_expires_at: "2026-09-14T10:00:00.000Z",
});

assert.equal(matrix.schema, "mmd.kenji_conversation_matrix.v1");
assert.equal(matrix.conversation_stage, "awaiting_payment_verification");
assert.equal(matrix.live_truth_required, true);
assert.deepEqual(matrix.live_truth_domains, ["membership", "entitlement", "payment"]);
assert.equal(isContinuationCandidate("ได้ยังครับ", matrix), true);

const context = buildConversationContinuityContext(matrix);
assert.equal(context.conversation_topic, "membership");
assert.equal(context.pending_action, "verify payment and refresh entitlement");
assert.deepEqual(context.do_not_ask_again, ["membership_package", "payment_proof"]);

const followup = resolveConversationContinuityV1({
  message: "ได้ยังครับ",
  current_intent: "note_only",
  matrix,
  now: "2026-09-07T11:00:00.000Z",
});
assert.equal(followup.schema, "mmd.kenji_continuity_resolver.v1");
assert.equal(followup.decision, "continuation");
assert.equal(followup.topic, "membership");
assert.equal(followup.conversation_stage, "awaiting_payment_verification");
assert.equal(followup.awaiting_from, "payment_authority");
assert.deepEqual(followup.do_not_ask_again, ["membership_package", "payment_proof"]);
assert.ok(followup.live_truth_domains.includes("payment"));
assert.ok(followup.live_truth_domains.includes("entitlement"));

const sameTopic = resolveConversationContinuityV1({
  message: "เรื่องต่ออายุครับ",
  current_intent: "membership",
  matrix,
  now: "2026-09-07T11:00:00.000Z",
});
assert.equal(sameTopic.decision, "continuation");
assert.equal(sameTopic.reason, "same_topic_open_thread");

const switchedTopic = resolveConversationContinuityV1({
  message: "ขอถามราคาแพ็กเกจอื่นครับ",
  current_intent: "pricing_review",
  matrix,
  now: "2026-09-07T11:00:00.000Z",
});
assert.equal(switchedTopic.decision, "new_topic");
assert.equal(switchedTopic.topic, "pricing");
assert.equal(switchedTopic.do_not_ask_again.length, 0);

const explicitSwitch = resolveConversationContinuityV1({
  message: "อีกเรื่อง ขอถามราคาแพ็กเกจครับ",
  current_intent: "pricing_review",
  matrix,
  now: "2026-09-07T11:00:00.000Z",
});
assert.equal(explicitSwitch.decision, "new_topic");
assert.equal(explicitSwitch.reason, "explicit_new_topic_signal");

const ambiguous = resolveConversationContinuityV1({
  message: "ครับ",
  current_intent: "note_only",
  matrix,
  now: "2026-09-07T11:00:00.000Z",
});
assert.equal(ambiguous.decision, "ambiguous");
assert.equal(ambiguous.inherit_previous_context, false);

const stale = resolveConversationContinuityV1({
  message: "ได้ยังครับ",
  matrix,
  now: "2026-09-15T11:00:00.000Z",
});
assert.equal(stale.decision, "stale_refresh");
assert.equal(stale.conversation_stage, "stale_needs_refresh");
assert.equal(stale.requires_state_refresh, true);
assert.ok(stale.live_truth_domains.includes("payment"));

const resolved = buildConversationMatrixV1({
  topic: "membership",
  conversation_stage: "resolved",
});
assert.equal(isContinuationCandidate("ได้ยัง", resolved), false);

console.log("kenji conversation matrix + continuity resolver tests passed");
