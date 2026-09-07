import assert from "node:assert/strict";
import { resolveCanonicalKenjiLineClient } from "../src/kenji-line-canonical-client-resolution.mjs";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const CLIENT_ID = "recClient123456";
const ENTITLEMENT_ID = "recEntitlement123";
const MATRIX_ID = "recMatrix123456";
const MEMORY_ID = "recMemory123456";

const writes = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  const method = String(init.method || "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) : null;

  if (method === "GET" && href.includes("tblVv58TCbwh5j1fS")) {
    return Response.json({
      records: [{
        id: CLIENT_ID,
        fields: {
          line_user_id: LINE_USER_ID,
          mmd_client_name: "Joeka",
          "Verification Status": "Verified",
          "Points Balance": 0,
        },
      }],
    });
  }

  if (method === "GET" && href.includes("tblNImdF9PKAxhXGi")) {
    return Response.json({
      records: [{
        id: ENTITLEMENT_ID,
        fields: {
          line_user_id: LINE_USER_ID,
          member_lifecycle_status: "active",
          access_status: "active",
          relationship_tier: "svip",
          entitlement_level: "svip",
          source: "manual",
        },
      }],
    });
  }

  if (method === "GET" && href.includes("tbl9tUMjJGmoyclS5")) {
    return Response.json({ records: [] });
  }

  if (method === "GET" && href.includes("tblS6iRgPjYLBqZJh")) {
    return Response.json({
      records: [{
        id: MATRIX_ID,
        fields: {
          matrix_id: "kcm1_line_test",
          conversation_id_hash: "hash-does-not-matter-in-mock",
          channel: "line_ofc",
          conversation_scope: "line:test",
          topic: "membership",
          last_customer_intent: "membership_status",
          conversation_stage: "awaiting_entitlement_refresh",
          awaiting_from: "entitlement_authority",
          live_truth_required: true,
          live_truth_domains: ["membership", "entitlement"],
          version: 2,
        },
      }],
    });
  }

  if (method === "POST" && href.includes("tbl9tUMjJGmoyclS5")) {
    writes.push({ table: "memory", method, body });
    return Response.json({ records: [{ id: MEMORY_ID, fields: body.records[0].fields }] });
  }

  if (method === "PATCH" && href.includes("tblS6iRgPjYLBqZJh")) {
    writes.push({ table: "matrix", method, body });
    return Response.json({ records: [{ id: MATRIX_ID, fields: body.records[0].fields }] });
  }

  return Response.json({ records: [] });
};

try {
  const event = {
    type: "message",
    webhookEventId: "evt-canonical-memory-v2",
    message: { id: "630751996672475999", type: "text", text: "ขอเช็กสถานะสมาชิกหน่อยครับ" },
    source: { type: "user", userId: LINE_USER_ID },
  };
  const env = {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
  };

  const context = await resolveCanonicalKenjiLineClient({ env, event, now: "2026-09-07T14:20:00.000Z" });
  assert.equal(context.resolved, true);
  assert.equal(context.reason, "exact_clients_line_user_id");
  assert.equal(context.client_record_id, CLIENT_ID);
  assert.equal(context.relationship_context, "svip_relationship");
  assert.equal(context.voice_context.voice_profile, "per_voice_concierge");
  assert.equal(context.voice_context.familiarity, "established_private");
  assert.equal(context.voice_context.avoid_dashboard_labels, true);
  assert.equal(context.voice_context.avoid_system_voice, true);
  assert.equal(context.voice_context.avoid_repeating_tier_and_status, true);
  assert.equal(context.voice_context.truth_input_mode, "structured_live_truth_only");
  assert.equal(context.voice_context.memory_may_render_truth, false);
  assert.equal(context.safe_context.customer_reply_contract.render_through_voice_context, true);
  assert.equal(context.safe_context.customer_reply_contract.never_render_memory_as_current_truth, true);

  const memoryWrite = writes.find((item) => item.table === "memory");
  assert.ok(memoryWrite, "expected Customer Memory v2 upsert");
  const memoryFields = memoryWrite.body.records[0].fields;
  assert.equal(memoryFields.Client[0], CLIENT_ID);
  assert.equal(memoryFields.relationship_context, "svip_relationship");
  const important = JSON.parse(memoryFields.important_context_json);
  assert.equal(important.conversation.voice_context.voice_profile, "per_voice_concierge");
  assert.equal(important.conversation.voice_context.avoid_dashboard_labels, true);
  assert.equal(important.identity_resolution.match_type, "exact_clients_line_user_id");
  assert.equal(JSON.stringify(memoryFields).includes(LINE_USER_ID), false, "raw LINE user ID must not be persisted into Customer Memory v2");

  const matrixWrite = writes.find((item) => item.table === "matrix");
  assert.ok(matrixWrite, "expected Matrix identity relink");
  assert.deepEqual(matrixWrite.body.records[0].fields.Client, [CLIENT_ID]);
  assert.deepEqual(matrixWrite.body.records[0].fields["Memory Snapshot"], [MEMORY_ID]);
  assert.equal(JSON.stringify(matrixWrite.body).includes(LINE_USER_ID), false, "raw LINE user ID must not be persisted into Matrix relink");

  console.log("kenji canonical client + Customer Memory v2 tests passed");
} finally {
  globalThis.fetch = originalFetch;
}
