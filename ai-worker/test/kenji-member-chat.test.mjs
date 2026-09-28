import test from "node:test";
import assert from "node:assert/strict";
import worker from "../index.js";

const NOW = "2026-09-28T13:00:00.000Z";
const resolver = {
  schema_version: "my_mmd_entitlement_resolver_v1",
  fail_closed: true,
  evaluated_at: NOW,
  member_blocked: false,
  capability_state: {
    active: ["private_premium"],
    expiring_soon: [],
    grace: [],
    inactive: [],
    recognized: ["private_premium"],
  },
  access: {
    public_service_access: true,
    guest_pass_access: false,
    red_card_request_lane: false,
    private_visibility_envelope: "premium",
    protected_allowlist_required: false,
    protected_capabilities_active: [],
    new_model_reveals_allowed: true,
  },
};
const evidence = {
  rename_identity: { state: "FOUND" },
  line_oa_1to1: { state: "SOURCE_UNAVAILABLE" },
  line_crew: { state: "SOURCE_UNAVAILABLE" },
  chat_exports_attachments: { state: "SOURCE_UNAVAILABLE" },
  hashtags_tenure: { state: "SOURCE_UNAVAILABLE" },
  recognition_history: { state: "SOURCE_UNAVAILABLE" },
  membership_cycles: { state: "FOUND" },
  payment_evidence: { state: "SOURCE_UNAVAILABLE" },
  resolver_snapshot: { state: "FOUND" },
};

function request(message) {
  return new Request("https://ai-worker.local/v1/ai/kenji/member-chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "member-dashboard-chat-worker",
      "x-service-name": "member-dashboard-chat-worker",
    },
    body: JSON.stringify({
      actor: { role: "system" },
      message,
      member_truth: {
        display_name: "Per Test",
        membership: { label: "Premium", lifecycle: "active" },
        points: { status: "verified", active_points: 321 },
        resolver_snapshot: resolver,
      },
      context_bundle: {
        evaluated_at: NOW,
        identity: { state: "known", preferred_name: "Per Test", confidence: "high", source: "verified_member_session" },
        customer_context: {
          rename: "Per Test",
          latest_cycle: { package_code: "private_premium", expire_at: "2027-09-28T00:00:00.000Z" },
          entitlement_snapshot: resolver,
          evidence_sources: evidence,
        },
      },
    }),
  });
}

test("member chat runs inside ai-worker and returns customer-safe Points truth", async () => {
  const response = await worker.fetch(request("เช็ก Points ให้หน่อย"), {});
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.schema_version, "mmd.kenji_member_chat.v1");
  assert.equal(payload.data.read_only, true);
  assert.equal(payload.data.intent, "points_status");
  assert.match(payload.data.reply, /321/);
  assert.equal(payload.data.action.url, "/my-mmd/points");
  assert.equal(payload.data.safety.customer_side_effects, false);
});

test("member chat keeps payment confirmation outside ai-worker authority", async () => {
  const response = await worker.fetch(request("สลิปนี้จ่ายแล้วใช่ไหม"), {});
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.intent, "payment_status");
  assert.equal(payload.data.matrix.safety.may_confirm_payment, false);
  assert.match(payload.data.reply, /ยืนยันยอดต้องยึดสถานะจาก Payments/);
});
