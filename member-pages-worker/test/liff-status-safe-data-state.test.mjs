import assert from "node:assert/strict";
import test from "node:test";
import { rewritePendingStatusStartResponse } from "../src/liff-status-resolution-guard.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const RECOVERY_EVIDENCE_SOURCES = [
  "members_email",
  "members_member_id",
  "clients_email",
  "pre_session_identity_seed",
  "client_access_evidence",
  "line_ofc_email_candidate",
];

test("unmatched LINE-verified MY MMD status returns safe pending state, not guest data", async () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });
  const response = jsonResponse({
    ok: true,
    data: {
      member_resolved: false,
      pending_identity: true,
      next_screen_key: "status_result",
      screen: { key: "status_result", copy: "status", actions: [] },
    },
  });

  const rewritten = await rewritePendingStatusStartResponse(request, response);
  const payload = await rewritten.json();

  assert.equal(payload.ok, true);
  assert.equal(payload.data.next_screen_key, "status_unresolved");
  assert.equal(payload.data.screen.key, "status_unresolved");
  assert.match(payload.data.screen.copy, /ยืนยัน LINE สำเร็จแล้ว/);
  assert.match(payload.data.screen.copy, /อีเมลเดิม หรือ Member ID/);
  assert.match(payload.data.screen.copy, /เบอร์โทรหรือ Telegram ให้แจ้ง Per\/HYPE/);
  assert.match(payload.data.screen.copy, /LINE OFC note \/ Per note \/ Console Inbox note/);
  assert.match(payload.data.screen.copy, /วันที่ล่าสุดที่ Per ทับไว้ในโน้ต/);
  assert.match(payload.data.screen.copy, /ไม่เดา Tier, Points, Wallet/);
  assert.doesNotMatch(payload.data.screen.copy, /Guest/);

  assert.deepEqual(payload.data.my_mmd_safe_state, {
    line_verified: true,
    member_resolved: false,
    member_display_state: "review_required",
    entitlement_display_state: "review_required",
    points_display_state: "pending_backend",
    wallet_display_state: "pending_backend",
    history_display_state: "pending_backend",
    access_display_state: "fail_closed",
    private_access_state: "fail_closed",
    payment_truth_state: "pending_backend",
    browser_authority: "presentation_only",
    recovery_required_fields: ["email", "member_id_candidate"],
    recovery_match_evidence: RECOVERY_EVIDENCE_SOURCES,
  });
  assert.equal(payload.data.entitlement_display_state, "review_required");
  assert.equal(payload.data.points_display_state, "pending_backend");
  assert.equal(payload.data.wallet_display_state, "pending_backend");
  assert.equal(payload.data.history_display_state, "pending_backend");
  assert.equal(payload.data.private_access_state, "fail_closed");
  assert.equal(payload.data.payment_truth_state, "pending_backend");
  assert.deepEqual(payload.data.recovery_required_fields, ["email", "member_id_candidate"]);
  assert.deepEqual(payload.data.recovery_match_evidence, RECOVERY_EVIDENCE_SOURCES);
  assert.equal("membership_date_authority" in payload.data, false);
  assert.equal("membership_date_customer_input_authority" in payload.data, false);
});

test("unmatched status exposes recovery evidence action before signup using the live backend fields", async () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });
  const response = jsonResponse({
    ok: true,
    data: {
      member_resolved: false,
      pending_identity: true,
      next_screen_key: "status_result",
      screen: { key: "status_result", copy: "status", actions: [] },
    },
  });

  const rewritten = await rewritePendingStatusStartResponse(request, response);
  const payload = await rewritten.json();

  assert.deepEqual(payload.data.screen.actions[0], {
    id: "recovery_evidence",
    label: "เคยเป็นสมาชิก · กรอกอีเมลเดิม / Member ID",
    endpoint: "/member/api/liff/recovery",
    method: "POST",
    fields: ["email", "member_id_candidate"],
  });
  assert.equal(payload.data.screen.actions[1].id, "signup");
});

test("resolved MY MMD status is not overwritten by safe pending state", async () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });
  const payload = {
    ok: true,
    data: {
      member_resolved: true,
      pending_identity: false,
      tier: "Premium",
      points: 120,
      next_screen_key: "status_result",
      screen: { key: "status_result", copy: "status", actions: [] },
    },
  };

  const rewritten = await rewritePendingStatusStartResponse(request, jsonResponse(payload));
  assert.deepEqual(await rewritten.json(), payload);
});
