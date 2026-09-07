import assert from "node:assert/strict";
import {
  buildConversationContinuityContext,
  buildConversationMatrixV1,
  inferLiveTruthDomains,
  isContinuationCandidate,
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

const resolved = buildConversationMatrixV1({
  topic: "membership",
  conversation_stage: "resolved",
});
assert.equal(isContinuationCandidate("ได้ยัง", resolved), false);

console.log("kenji conversation matrix tests passed");
