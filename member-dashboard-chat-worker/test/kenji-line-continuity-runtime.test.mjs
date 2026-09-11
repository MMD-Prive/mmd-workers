import assert from "node:assert/strict";
import test from "node:test";

import { buildConversationMatrixV1 } from "../../shared/kenji-conversation-matrix.mjs";
import {
  buildKenjiPostTurnMatrix,
  resolveKenjiLineContinuity,
  writeKenjiLineMatrixTurn,
} from "../src/kenji-line-continuity-runtime.mjs";

const MATRIX_TABLE = "tblS6iRgPjYLBqZJh";
const NOW = "2026-09-07T12:00:00.000Z";
const ENV = {
  AIRTABLE_API_KEY: "test-key",
  AIRTABLE_BASE_ID: "test-base",
  AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID: MATRIX_TABLE,
  AIRTABLE_TABLE_CLIENTS_ID: "tblVv58TCbwh5j1fS",
};

function event(message = "ได้ยังครับ") {
  return {
    type: "message",
    source: { type: "user", userId: "Utest123" },
    message: { id: "msg-test", type: "text", text: message },
  };
}

function storedFields(hash = "stored-hash") {
  return {
    matrix_id: "kcm1_line_test",
    Client: ["recClient"],
    schema_version: "mmd.kenji_conversation_matrix.v1",
    conversation_id_hash: hash,
    channel: "line_ofc",
    conversation_scope: "line:test",
    topic: "membership",
    subtopic: "premium_renewal",
    relationship_context: "active_member",
    last_customer_intent: "membership_renewal",
    last_customer_action: "submitted_payment_proof",
    conversation_stage: "awaiting_payment_verification",
    awaiting_from: "payment_authority",
    pending_action: "refresh payment truth before answering status",
    do_not_ask_again_json: JSON.stringify(["membership_package", "payment_proof"]),
    important_open_loops_json: JSON.stringify(["payment_verification", "entitlement_refresh"]),
    handoff_required: true,
    handoff_owner: "Per",
    handoff_reason: "payment_status:protected_truth",
    live_truth_required: true,
    live_truth_domains: ["membership", "entitlement", "payment"],
    state_updated_at: "2026-09-07T11:00:00.000Z",
    state_expires_at: "2026-09-14T11:00:00.000Z",
    matrix_status: "active",
    version: 3,
  };
}

async function withFetch(mock, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("follow-up on renewal payment thread resolves to payment_status", async () => {
  const continuity = await withFetch(async (url) => {
    const parsed = new URL(String(url));
    const filter = parsed.searchParams.get("filterByFormula") || "";
    const hash = filter.match(/=\"([^\"]+)/)?.[1] || "stored-hash";
    return new Response(JSON.stringify({ records: [{ id: "recMatrix", fields: storedFields(hash) }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, () => resolveKenjiLineContinuity({ env: ENV, event: event(), currentIntent: "unknown", now: NOW }));

  assert.equal(continuity.available, true);
  assert.equal(continuity.decision, "continuation");
  assert.equal(continuity.reason, "continuation_cue_with_open_thread");
  assert.equal(continuity.effective_intent, "payment_status");
  assert.equal(continuity.conversation_stage, "awaiting_payment_verification");
  assert.deepEqual(continuity.do_not_ask_again, ["membership_package", "payment_proof"]);
  assert.ok(continuity.live_truth_domains.includes("payment"));
});

test("post-turn matrix keeps open payment state without claiming verification", () => {
  const prior = buildConversationMatrixV1({
    matrix_id: "kcm1_line_test",
    client_record_id: "recClient",
    conversation_id_hash: "abc123",
    channel: "line_ofc",
    conversation_scope: "line:test",
    topic: "membership",
    subtopic: "premium_renewal",
    relationship_context: "active_member",
    last_customer_intent: "membership_renewal",
    conversation_stage: "awaiting_payment_verification",
    awaiting_from: "payment_authority",
    do_not_ask_again: ["membership_package", "payment_proof"],
    important_open_loops: ["payment_verification", "entitlement_refresh"],
    live_truth_domains: ["membership", "entitlement", "payment"],
    version: 3,
  });
  const continuity = {
    schema: "mmd.kenji_continuity_resolver.v1",
    decision: "continuation",
    reason: "continuation_cue_with_open_thread",
    topic: "membership",
    subtopic: "premium_renewal",
    effective_intent: "payment_status",
    conversation_stage: "awaiting_payment_verification",
    do_not_ask_again: ["membership_package", "payment_proof"],
    important_open_loops: ["payment_verification", "entitlement_refresh"],
    live_truth_required: true,
    live_truth_domains: ["membership", "entitlement", "payment"],
    conversation_hash: "abc123",
    client_record_id: "recClient",
    matrix_record_id: "recMatrix",
    storage_status: "ready",
    matrix: prior,
  };

  const matrix = buildKenjiPostTurnMatrix({
    continuity,
    decision: { intent: "payment_status", handoff_required: true, handoff_reason: "payment_status:protected_truth", reply_source: "seed_handoff" },
    delivered: false,
    attempted: false,
    lastEventId: "kai_line_msg-test",
    now: NOW,
  });

  assert.equal(matrix.conversation_stage, "awaiting_payment_verification");
  assert.equal(matrix.awaiting_from, "payment_authority");
  assert.equal(matrix.last_customer_intent, "payment_status");
  assert.equal(matrix.last_customer_action, "followed_up_on_open_thread");
  assert.deepEqual(matrix.do_not_ask_again, ["membership_package", "payment_proof"]);
  assert.ok(matrix.important_open_loops.includes("payment_verification"));
  assert.match(matrix.last_confirmed_outcome, /not confirmed/i);
  assert.equal(matrix.version, 4);
});

test("write-back PATCH contains bounded state and no raw customer message", async () => {
  let posted = null;
  const continuity = {
    schema: "mmd.kenji_continuity_resolver.v1",
    decision: "continuation",
    reason: "continuation_cue_with_open_thread",
    topic: "membership",
    subtopic: "premium_renewal",
    effective_intent: "payment_status",
    conversation_stage: "awaiting_payment_verification",
    do_not_ask_again: ["membership_package", "payment_proof"],
    important_open_loops: ["payment_verification", "entitlement_refresh"],
    live_truth_required: true,
    live_truth_domains: ["membership", "entitlement", "payment"],
    conversation_hash: "abc123",
    client_record_id: "recClient",
    matrix_record_id: "recMatrix",
    storage_status: "ready",
    matrix: buildConversationMatrixV1({
      matrix_id: "kcm1_line_test",
      client_record_id: "recClient",
      conversation_id_hash: "abc123",
      channel: "line_ofc",
      conversation_scope: "line:test",
      topic: "membership",
      relationship_context: "active_member",
      last_customer_intent: "membership_renewal",
      conversation_stage: "awaiting_payment_verification",
      do_not_ask_again: ["membership_package", "payment_proof"],
      important_open_loops: ["payment_verification", "entitlement_refresh"],
      live_truth_domains: ["membership", "entitlement", "payment"],
      version: 3,
    }),
  };

  const result = await withFetch(async (_url, init = {}) => {
    assert.equal(init.method, "PATCH");
    posted = JSON.parse(init.body);
    return new Response(JSON.stringify({ records: [{ id: "recMatrix", fields: posted.records[0].fields }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, () => writeKenjiLineMatrixTurn({
    env: ENV,
    continuity,
    decision: { intent: "payment_status", handoff_required: true, handoff_reason: "payment_status:protected_truth", reply_source: "seed_handoff" },
    delivered: false,
    attempted: false,
    lastEventId: "kai_line_msg-test",
    now: NOW,
  }));

  assert.equal(result.id, "recMatrix");
  assert.equal(posted.records[0].fields.conversation_stage, "awaiting_payment_verification");
  assert.equal(posted.records[0].fields.last_customer_intent, "payment_status");
  assert.deepEqual(JSON.parse(posted.records[0].fields.do_not_ask_again_json), ["membership_package", "payment_proof"]);
  const serialized = JSON.stringify(posted);
  assert.equal(serialized.includes("ได้ยังครับ"), false);
  assert.equal(serialized.includes("Utest123"), false);
});
