import assert from "node:assert/strict";
import test from "node:test";

import { writeKenjiLineMatrixTurn } from "../src/kenji-line-continuity-runtime.mjs";

const ENV = {
  AIRTABLE_API_KEY: "airtable-token",
  AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID: "tblS6iRgPjYLBqZJh",
};

async function withFetch(mock, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("Matrix write retries existing row after transient continuity read failure", async () => {
  const conversationHash = "9874615572ffff1845a4abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const matrixRecordId = "recMatrixExisting";
  const existing = {
    id: matrixRecordId,
    fields: {
      matrix_id: "kcm1_line_9874615572ffff1845a4",
      schema_version: "mmd.kenji_conversation_matrix.v1",
      conversation_id_hash: conversationHash,
      channel: "line_ofc",
      conversation_scope: "line:9874615572ffff1845a4",
      topic: "membership",
      relationship_context: "new_contact",
      last_customer_intent: "membership",
      last_customer_request: "intent:membership",
      last_customer_action: "asked:membership",
      last_kenji_action: "replied:seed_knowledge",
      last_confirmed_outcome: "customer_reply_sent; no protected truth granted from memory",
      conversation_stage: "in_progress",
      awaiting_from: "none",
      pending_action: "continue current conversation",
      pending_reference: "kai_line_previous",
      continuity_summary: "Started membership conversation. Kenji reply was delivered; state is in_progress.",
      do_not_ask_again_json: "[]",
      important_open_loops_json: "[]",
      handoff_required: false,
      handoff_owner: "none",
      handoff_reason: "",
      live_truth_required: true,
      live_truth_domains: ["membership", "entitlement"],
      last_event_id: "kai_line_previous",
      last_interaction_at: "2026-09-07T13:24:18.122Z",
      state_updated_at: "2026-09-07T13:24:18.122Z",
      state_expires_at: "2026-09-14T13:24:18.122Z",
      matrix_status: "active",
      version: 1,
    },
  };

  let getCalls = 0;
  let patchCalls = 0;
  let postCalls = 0;
  let patchBody = null;

  const result = await withFetch(async (url, init = {}) => {
    const target = String(url);
    assert.match(target, /tblS6iRgPjYLBqZJh/);
    const method = String(init.method || "GET").toUpperCase();
    if (method === "GET") {
      getCalls += 1;
      return new Response(JSON.stringify({ records: [existing] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "PATCH") {
      patchCalls += 1;
      patchBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ records: [{ id: matrixRecordId, fields: patchBody.records[0].fields }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "POST") {
      postCalls += 1;
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`unexpected method ${method}`);
  }, () => writeKenjiLineMatrixTurn({
    env: ENV,
    continuity: {
      schema: "mmd.kenji_continuity_resolver.v1",
      decision: "new_topic",
      reason: "explicit_current_intent",
      topic: "membership",
      current_intent: "membership_status",
      effective_intent: "membership_status",
      storage_status: "airtable_read_failed",
      available: false,
      conversation_hash: conversationHash,
      client_record_id: "",
      matrix_record_id: "",
      matrix: {
        matrix_id: "kcm1_line_9874615572ffff1845a4",
        conversation_id_hash: conversationHash,
        channel: "line_ofc",
        conversation_scope: "line:9874615572ffff1845a4",
        relationship_context: "unknown",
        version: 0,
      },
    },
    decision: {
      intent: "membership_status",
      reply_source: "system_truth",
      handoff_required: true,
      handoff_reason: "membership_status:protected_truth",
    },
    delivered: true,
    attempted: true,
    lastEventId: "kai_line_630751084410831386",
    now: "2026-09-07T13:37:31.221Z",
  }));

  assert.equal(getCalls, 1, "write recovery should perform one bounded Matrix reread");
  assert.equal(patchCalls, 1, "existing Matrix row must be PATCHed");
  assert.equal(postCalls, 0, "recovery must never create a duplicate Matrix row");
  assert.equal(result.recovered, true);
  assert.equal(result.created, false);
  assert.equal(result.version, 2);
  assert.equal(result.stage, "awaiting_entitlement_refresh");
  assert.equal(patchBody.records[0].id, matrixRecordId);
  assert.equal(patchBody.records[0].fields.version, 2);
  assert.equal(patchBody.records[0].fields.last_event_id, "kai_line_630751084410831386");
  assert.equal(patchBody.records[0].fields.last_customer_intent, "membership_status");
  assert.equal(patchBody.records[0].fields.conversation_stage, "awaiting_entitlement_refresh");
  assert.equal(patchBody.records[0].fields.awaiting_from, "entitlement_authority");
  assert.equal(patchBody.records[0].fields.handoff_required, true);
  assert.equal(patchBody.records[0].fields.handoff_reason, "membership_status:protected_truth");
  assert.deepEqual(patchBody.records[0].fields.live_truth_domains, ["membership", "entitlement"]);
});
