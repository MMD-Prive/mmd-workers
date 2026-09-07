import assert from "node:assert/strict";
import { buildCustomerMemorySnapshotV2, buildKenjiSafeContextV2 } from "./kenji-customer-memory-v2.mjs";
import { buildConversationMatrixV1 } from "./kenji-conversation-matrix.mjs";

const compatV1 = {
  schema: "mmd.kenji_memory_snapshot.v1",
  client_record_id: "recClient",
  display_name_for_kenji: "เจย์",
  mmd_client_name: "เจย์",
  client_id_display: "Jay Pm",
  client_id_canonical: "jaypm",
  membership_package: "Premium",
  membership_status: "active",
  membership_expiry: "2027-09-07",
  points_balance_confirmed: 88,
  service_history_summary: "Known repeat customer.",
  client_preference_summary: "Prefers calm service style.",
  kenji_handling_note: "Continue naturally.",
  updated_at: "2026-09-07T10:00:00.000Z",
};

const matrix = buildConversationMatrixV1({
  matrix_id: "kcm1_line_x",
  topic: "membership",
  subtopic: "premium_renewal",
  relationship_context: "active_member",
  last_customer_intent: "renewal",
  conversation_stage: "awaiting_payment_verification",
  pending_action: "verify payment",
  do_not_ask_again: ["payment_proof"],
});

const v2 = buildCustomerMemorySnapshotV2({ compat_v1: compatV1, conversation_matrix: matrix });
assert.equal(v2.schema, "mmd.customer_memory_snapshot.v2");
assert.equal(v2.relationship_context, "active_member");
assert.equal(v2.points_balance_confirmed_observed, 88);
assert.equal(v2.authority_guard.live_truth_wins_over_memory, true);
assert.equal(v2.conversation.conversation_stage, "awaiting_payment_verification");

const safe = buildKenjiSafeContextV2(v2, compatV1);
assert.equal(safe.display_name, "เจย์");
assert.equal(safe.memory_schema, "mmd.customer_memory_snapshot.v2");
assert.equal(safe.live_truth_required, true);
assert.deepEqual(safe.live_truth_domains, ["membership", "entitlement", "payment"]);

console.log("kenji customer memory v2 tests passed");
