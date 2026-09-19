import assert from "node:assert/strict";
import {
  buildCustomerMemorySnapshotV2,
  buildKenjiNextActionPolicy,
  buildKenjiSafeContextV2,
  buildKenjiVoiceContext,
} from "./kenji-customer-memory-v2.mjs";
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
assert.equal(v2.authority_guard.cta_cannot_bypass_authority, true);
assert.equal(v2.conversation.conversation_stage, "awaiting_payment_verification");
assert.equal(v2.voice_context.voice_profile, "per_voice_concierge");
assert.equal(v2.voice_context.familiarity, "known_customer");
assert.equal(v2.voice_context.avoid_dashboard_labels, true);
assert.equal(v2.voice_context.avoid_system_voice, true);
assert.equal(v2.voice_context.avoid_repeating_tier_and_status, true);
assert.equal(v2.voice_context.truth_input_mode, "structured_live_truth_only");
assert.equal(v2.voice_context.memory_may_render_truth, false);
assert.equal(v2.conversation.voice_context.voice_profile, "per_voice_concierge");
assert.equal(v2.next_action_policy.schema, "mmd.kenji_next_action_policy.v1");
assert.equal(v2.next_action_policy.goal, "answer_then_best_next_action");
assert.equal(v2.next_action_policy.no_dead_end_when_actionable, true);
assert.equal(v2.next_action_policy.max_primary_cta, 1);
assert.equal(v2.next_action_policy.cta_must_not_imply_approval, true);
assert.equal(v2.next_action_policy.cta_must_not_grant_rights, true);
assert.deepEqual(v2.conversation.next_action_policy.allowed_cta_types, [
  "continue_in_chat",
  "request_missing_input",
  "open_action_route",
  "handoff_per",
]);

const privateVoice = buildKenjiVoiceContext({
  relationship_context: "svip_relationship",
  identity_status: "resolved",
});
assert.equal(privateVoice.familiarity, "established_private");
assert.equal(privateVoice.addressing_mode, "continue_existing_relationship");
assert.equal(privateVoice.continuity_first, true);
assert.equal(privateVoice.avoid_reverification_prompt_when_identity_resolved, true);
assert.equal(privateVoice.next_action_policy.relationship_mode, "known_customer_continuation");
assert.equal(privateVoice.next_action_policy.do_not_repeat_known_inputs, true);

const unresolvedVoice = buildKenjiVoiceContext({
  relationship_context: "new_contact",
  identity_status: "candidate",
});
assert.equal(unresolvedVoice.familiarity, "new_or_unresolved");
assert.equal(unresolvedVoice.addressing_mode, "neutral_first_contact");
assert.equal(unresolvedVoice.continuity_first, false);
assert.equal(unresolvedVoice.memory_may_grant_rights, false);
assert.equal(unresolvedVoice.next_action_policy.relationship_mode, "neutral_action");

const directPolicy = buildKenjiNextActionPolicy({
  relationship_context: "known_customer",
  identity_status: "resolved",
});
assert.equal(directPolicy.mode, "contextual_not_forced");
assert.equal(directPolicy.prefer_specific_input_over_generic_help, true);
assert.equal(directPolicy.allow_direct_route_when_customer_can_act_now, true);
assert.equal(directPolicy.handoff_when_authority_required, true);

const safe = buildKenjiSafeContextV2(v2, compatV1);
assert.equal(safe.display_name, "เจย์");
assert.equal(safe.memory_schema, "mmd.customer_memory_snapshot.v2");
assert.equal(safe.live_truth_required, true);
assert.deepEqual(safe.live_truth_domains, ["membership", "entitlement", "payment"]);
assert.equal(safe.voice_context.voice_profile, "per_voice_concierge");
assert.equal(safe.voice_context.avoid_system_voice, true);
assert.equal(safe.next_action_policy.no_dead_end_when_actionable, true);

console.log("kenji customer memory v2 tests passed");
