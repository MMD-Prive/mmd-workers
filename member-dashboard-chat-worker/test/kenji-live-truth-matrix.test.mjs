import assert from "node:assert/strict";
import test from "node:test";
import { buildKenjiPostTurnMatrix } from "../src/kenji-line-continuity-runtime.mjs";

test("verified membership truth closes the pending entitlement Matrix loop", () => {
  const matrix = buildKenjiPostTurnMatrix({
    continuity: {
      decision: "continuation",
      effective_intent: "membership_status",
      topic: "membership",
      conversation_hash: "abc123",
      client_record_id: "recKnownCustomer",
      storage_status: "ready",
      live_truth_required: true,
      live_truth_domains: ["membership", "entitlement"],
      important_open_loops: ["entitlement_refresh", "handoff_review"],
      matrix: {
        matrix_id: "kcm1_line_abc123",
        client_record_id: "recKnownCustomer",
        conversation_id_hash: "abc123",
        conversation_scope: "line:abc123",
        topic: "membership",
        relationship_context: "svip_relationship",
        last_customer_intent: "membership_status",
        conversation_stage: "awaiting_entitlement_refresh",
        important_open_loops: ["entitlement_refresh", "handoff_review"],
        live_truth_required: true,
        live_truth_domains: ["membership", "entitlement"],
        version: 4,
      },
    },
    decision: {
      intent: "membership_status",
      reply_source: "live_truth",
      live_truth_verified: true,
      live_truth_used: true,
      truth_authority: "my_mmd_entitlement_resolver_v1",
      truth_status: "verified",
      handoff_required: false,
    },
    delivered: true,
    attempted: true,
    lastEventId: "kai_line_test",
    now: "2026-09-07T14:45:00.000Z",
  });

  assert.equal(matrix.conversation_stage, "resolved");
  assert.equal(matrix.matrix_status, "resolved");
  assert.equal(matrix.awaiting_from, "none");
  assert.equal(matrix.pending_action, "");
  assert.equal(matrix.handoff_required, false);
  assert.deepEqual(matrix.important_open_loops, []);
  assert.match(matrix.last_confirmed_outcome, /current truth confirmed/);
});
