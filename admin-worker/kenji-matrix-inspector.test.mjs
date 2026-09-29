import test from "node:test";
import assert from "node:assert/strict";
import { handleKenjiControlRequest } from "./src/kenji-control-endpoints.js";

test("Matrix Inspector returns bounded current state and last event without raw LINE/chat payload", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("tblVv58TCbwh5j1fS")) {
      return Response.json({ records: [{
        id: "recClient12345678",
        fields: {
          "Client Name": "E2E Test Client",
          line_user_id: "U-real-line-secret",
          email: "secret@example.com",
        },
      }] });
    }
    if (url.includes("tblS6iRgPjYLBqZJh")) {
      assert.match(decodeURIComponent(url), /conversation_id_hash/);
      return Response.json({ records: [{
        id: "recMatrix12345678",
        fields: {
          matrix_id: "kcm1_line_safe",
          Client: ["recClient12345678"],
          schema_version: "mmd.kenji_conversation_matrix.v1",
          channel: "line_ofc",
          conversation_scope: "line:safe-ref",
          topic: "membership",
          relationship_context: "active_member",
          last_customer_intent: "payment_status",
          last_customer_action: "asked for status",
          last_kenji_action: "routed to payment truth",
          conversation_stage: "awaiting_payment_verification",
          awaiting_from: "payment_authority",
          pending_action: "refresh payment truth before answering status",
          continuity_summary: "Renewal proof is under verification.",
          do_not_ask_again_json: JSON.stringify(["membership package", "payment proof"]),
          important_open_loops_json: JSON.stringify(["payment verification"]),
          handoff_required: true,
          handoff_owner: "payment_authority",
          live_truth_required: true,
          live_truth_domains: ["payment", "entitlement"],
          last_event_id: "evt_safe_1",
          last_interaction_at: "2026-09-07T12:30:00.000Z",
          state_updated_at: "2026-09-07T12:30:01.000Z",
          state_expires_at: "2026-09-14T12:30:01.000Z",
          matrix_status: "active",
          version: 4,
          conversation_id_hash: "SECRET HASH MUST NOT LEAK",
          payload_json: "SECRET MATRIX PAYLOAD MUST NOT LEAK",
        },
      }] });
    }
    if (url.includes("tbljCYfYqfm8gBTPq")) {
      return Response.json({ records: [{
        id: "recEvent123456789",
        fields: {
          event_id: "evt_safe_1",
          created_at: "2026-09-07T12:30:00.000Z",
          channel: "line_ofc",
          detected_intent: "payment_status",
          risk_level: "low",
          response_mode: "handoff",
          handoff_required: true,
          handoff_reason: "payment_truth_required",
          final_status: "handoff",
          line_user_id: "U-real-line-secret",
          user_message: "RAW CUSTOMER MESSAGE MUST NOT LEAK",
          generated_reply: "RAW GENERATED REPLY MUST NOT LEAK",
          payload_json: "RAW EVENT PAYLOAD MUST NOT LEAK",
        },
      }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await handleKenjiControlRequest(
      new Request("https://mmdbkk.com/v1/admin/kenji/control/conversations?line_user_id=U-real-line-secret&view=matrix"),
      { AIRTABLE_API_KEY: "pat-test" }
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data_status, "live");
    assert.equal(payload.context_only, true);
    assert.equal(payload.live_truth_wins, true);
    assert.equal(payload.matrix.conversation_stage, "awaiting_payment_verification");
    assert.deepEqual(payload.matrix.do_not_ask_again, ["membership package", "payment proof"]);
    assert.deepEqual(payload.matrix.live_truth_domains, ["payment", "entitlement"]);
    assert.equal(payload.last_event.intent, "payment_status");
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /U-real-line-secret|secret@example\.com|SECRET HASH|SECRET MATRIX PAYLOAD|RAW CUSTOMER MESSAGE|RAW GENERATED REPLY|RAW EVENT PAYLOAD/);
    assert.ok(seen.some((url) => url.includes("tblS6iRgPjYLBqZJh")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Matrix Inspector returns an honest empty state when no persisted Matrix exists", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("tblVv58TCbwh5j1fS")) {
      return Response.json({ records: [{ id: "recClient12345678", fields: { line_user_id: "U-no-matrix" } }] });
    }
    if (url.includes("tblS6iRgPjYLBqZJh")) return Response.json({ records: [] });
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await handleKenjiControlRequest(
      new Request("https://mmdbkk.com/v1/admin/kenji/control/conversations?line_user_id=U-no-matrix&view=matrix"),
      { AIRTABLE_API_KEY: "pat-test" }
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data_status, "empty");
    assert.equal(payload.matrix, null);
    assert.equal(payload.last_event, null);
    assert.equal(payload.context_only, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Internal Kenji history view returns bounded real conversation turns for owner learning without exposing identity keys", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const decoded = decodeURIComponent(url);
    if (url.includes("tblVv58TCbwh5j1fS")) {
      return Response.json({ records: [{
        id: "recClientHistory1234",
        fields: {
          "Client Name": "Boss Client",
          line_user_id: "U0123456789abcdef0123456789abcdef",
          email: "private@example.com",
          "Last Contacted": "2026-09-29T02:00:00.000Z",
        },
      }] });
    }
    if (url.includes("tblFHmfpB2TTrzO2e")) {
      assert.match(decoded, /line_user_id/);
      return Response.json({ records: [{
        id: "recInboxHistory001",
        createdTime: "2026-09-29T01:00:00.000Z",
        fields: {
          inbox_id: "line_msg_history_1",
          line_id: "msg_history_1",
          created_at: "2026-09-29T01:00:00.000Z",
          source: "line_oa",
          admin_note: "เอาคนเดิมที่คุยไว้ครับ",
          status: "open",
          line_user_id: "U0123456789abcdef0123456789abcdef",
          payload_json: JSON.stringify({
            raw_text: "เอาคนเดิมที่คุยไว้ครับ",
            source_message_id: "msg_history_1",
            received_at: "2026-09-29T01:00:00.000Z",
          }),
        },
      }] });
    }
    if (url.includes("tblS6iRgPjYLBqZJh")) {
      return Response.json({ records: [{
        id: "recMatrixHistory001",
        fields: {
          matrix_id: "matrix_history_1",
          schema_version: "mmd.kenji_conversation_matrix.v1",
          channel: "line_ofc",
          topic: "model",
          subtopic: "repeat_model",
          continuity_summary: "ลูกค้ากำลังอ้างถึง Model คนเดิมจากบทสนทนาก่อนหน้า",
          important_open_loops_json: JSON.stringify(["resolve previous model referent"]),
          do_not_ask_again_json: JSON.stringify(["member package"]),
          last_event_id: "kai_line_msg_history_1",
          state_updated_at: "2026-09-29T01:01:00.000Z",
          matrix_status: "active",
        },
      }] });
    }
    if (url.includes("tbljCYfYqfm8gBTPq")) {
      return Response.json({ records: [{
        id: "recAiHistory001",
        createdTime: "2026-09-29T01:00:05.000Z",
        fields: {
          event_id: "kai_line_msg_history_1",
          created_at: "2026-09-29T01:00:05.000Z",
          channel: "LINE_OFC",
          line_user_id: "U0123456789abcdef0123456789abcdef",
          generated_reply: "ครับ คนเดิมที่คุยไว้",
          detected_intent: "model_lookup",
          risk_level: "low",
          response_mode: "auto_reply",
          handoff_required: false,
          final_status: "sent",
          payload_json: JSON.stringify({
            line_delivery_attempted: true,
            line_delivery_status: 200,
            line_delivery_succeeded: true,
            sent_text: "ครับ คนเดิมที่คุยไว้",
          }),
        },
      }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await handleKenjiControlRequest(
      new Request("https://mmdbkk.com/v1/admin/kenji/control/conversations?client_id=Boss%20Client&view=history&history_limit=50&q=คนเดิม"),
      { AIRTABLE_API_KEY: "pat-test" }
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.context_only, true);
    assert.equal(payload.live_truth_wins, true);
    assert.equal(payload.coverage.full_legacy_line_archive, false);
    assert.equal(payload.memory.display_name, "Boss Client");
    assert.equal(payload.memory.latest_topic, "model");
    assert.equal(payload.count, 2);
    assert.deepEqual(payload.turns.map((turn) => turn.role), ["customer", "assistant"]);
    assert.match(payload.turns[0].content, /เอาคนเดิม/);
    assert.match(payload.turns[1].content, /คนเดิมที่คุยไว้/);
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /U0123456789abcdef0123456789abcdef|private@example\.com/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
