import assert from "node:assert/strict";
import test from "node:test";

import {
  CLIENT_INTELLIGENCE_PATH,
  buildClientIntelligenceProjection,
  isClientIntelligenceRequest,
} from "./src/client-intelligence-endpoint.js";

test("client intelligence route is exact GET-only", () => {
  assert.equal(isClientIntelligenceRequest(CLIENT_INTELLIGENCE_PATH, "GET"), true);
  assert.equal(isClientIntelligenceRequest(`${CLIENT_INTELLIGENCE_PATH}/extra`, "GET"), false);
  assert.equal(isClientIntelligenceRequest(CLIENT_INTELLIGENCE_PATH, "POST"), false);
});

test("projection keeps canonical truth separate from advisory intelligence", () => {
  const clientId = "recCLIENT12345678";
  const projection = buildClientIntelligenceProjection({
    clientId,
    generatedAt: "2026-09-08T06:00:00.000Z",
    memoryPayload: {
      ok: true,
      data_status: "live",
      memory: {
        record_id: clientId,
        display_name: "วินนี่",
        primary_channel: "line",
        membership_status: "active",
        membership_tier: "premium",
        package_code: "premium",
        access_status: "active",
        relationship_tier: "premium",
        source: "Clients + MMD — Member Entitlements",
      },
    },
    matrixPayload: {
      ok: true,
      data_status: "live",
      matrix: {
        record_id: "recMATRIX12345678",
        channel: "line",
        relationship_context: "ลูกค้าเดิม ใช้งานต่อเนื่อง",
        continuity_summary: "ลูกค้าถามเรื่อง access หลังชำระ renewal",
        pending_action: "review payment",
        pending_reference: "proof_123",
        important_open_loops: ["ตรวจ payment truth ก่อนคืน access"],
        live_truth_required: true,
        live_truth_domains: ["payment", "access"],
        last_interaction_at: "2026-09-07T14:36:40.000Z",
      },
    },
    conversationsPayload: {
      ok: true,
      data_status: "live",
      conversations: [
        {
          event_id: "evt_1",
          linked_session_id: "sess_123",
        },
      ],
    },
  });

  assert.equal(projection.ok, true);
  assert.equal(projection.identity.status, "canonical");
  assert.equal(projection.identity.display_name, "วินนี่");
  assert.equal(projection.current_state.membership.status, "active");
  assert.equal(projection.current_state.payment.status, "unknown");
  assert.equal(projection.current_state.payment.authority, "canonical_backend");
  assert.equal(projection.current_state.session.session_id, "sess_123");
  assert.equal(projection.ai.advisory_only, true);
  assert.equal(projection.ai.next_best_action.mode, "ready_for_per");
  assert.equal(projection.ai.next_best_action.target_url, `/internal/admin/payments?client_id=${clientId}`);
  assert.equal(projection.ai.suggested_reply.available, false);
  assert.equal(projection.ai.suggested_reply.send_allowed, false);
  assert.equal(projection.authority.payment, "canonical_backend");
  assert.equal(projection.authority.membership, "resolver");
  assert.equal(projection.authority.access, "resolver");
  assert.equal(projection.authority.ai, "advisory");
  assert.ok(projection.ai.notices.some((item) => item.type === "payment_context"));
  assert.ok(projection.unresolved.some((item) => item.startsWith("live_truth_required:")));
});

test("projection does not invent next action or reply without evidence", () => {
  const clientId = "recEMPTY123456789";
  const projection = buildClientIntelligenceProjection({
    clientId,
    memoryPayload: {
      data_status: "live",
      memory: {
        record_id: clientId,
        display_name: "Client",
      },
    },
    matrixPayload: { data_status: "empty", matrix: null },
    conversationsPayload: { data_status: "empty", conversations: [] },
  });

  assert.equal(projection.ai.next_best_action, null);
  assert.equal(projection.ai.suggested_reply.available, false);
  assert.equal(projection.ai.suggested_reply.text, null);
  assert.equal(projection.ai.follow_up.recommended, false);
  assert.deepEqual(projection.ai.notices, []);
});
