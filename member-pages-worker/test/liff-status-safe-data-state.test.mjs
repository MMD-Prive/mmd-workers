import assert from "node:assert/strict";
import test from "node:test";
import { rewritePendingStatusStartResponse } from "../src/liff-status-resolution-guard.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const RECOVERY_REQUIRED_FIELDS = ["email", "phone", "nickname"];

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
  assert.match(payload.data.screen.copy, /1–2 อย่าง/);
  assert.match(payload.data.screen.copy, /อีเมล \/ เบอร์ \/ ชื่อเล่นหรือนามแฝง/);
  assert.match(payload.data.screen.copy, /โน้ตเดิมของ Per/);
  assert.doesNotMatch(payload.data.screen.copy, /Guest/);
  assert.doesNotMatch(payload.data.screen.copy, /Telegram/);
  assert.doesNotMatch(payload.data.screen.copy, /Member ID/);
  assert.doesNotMatch(payload.data.screen.copy, /LINE OFC note/);
  assert.doesNotMatch(payload.data.screen.copy, /Tier, Points, Wallet/);
  assert.deepEqual(payload.data.screen.copy.split("\n"), [
    "ยืนยัน LINE สำเร็จแล้ว",
    "กด Verify เพื่อให้ MMD ตรวจข้อมูลสมาชิกเดิมของคุณ",
  ]);
  assert.match(payload.data.screen.copy, /Verify/);
  assert.doesNotMatch(payload.data.screen.copy, /Per note|LINE OFC note|Console Inbox|Tier|Points|Wallet|Private Access|Guest/);

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
    recovery_required_fields: RECOVERY_REQUIRED_FIELDS,
  });
  assert.equal(payload.data.entitlement_display_state, "review_required");
  assert.equal(payload.data.points_display_state, "pending_backend");
  assert.equal(payload.data.wallet_display_state, "pending_backend");
  assert.equal(payload.data.history_display_state, "pending_backend");
  assert.equal(payload.data.private_access_state, "fail_closed");
  assert.equal(payload.data.payment_truth_state, "pending_backend");
  assert.deepEqual(payload.data.recovery_required_fields, RECOVERY_REQUIRED_FIELDS);
  assert.equal("recovery_match_evidence" in payload.data, false);
  assert.equal("membership_date_authority" in payload.data, false);
  assert.equal("membership_date_customer_input_authority" in payload.data, false);
});

test("unmatched status exposes a lightweight recovery action before signup", async () => {
test("unmatched status exposes compact Verify action before signup using the live backend fields", async () => {
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
    label: "ยืนยันข้อมูลสมาชิกเดิม",
    label: "Verify",
    endpoint: "/member/api/liff/recovery",
    method: "POST",
    fields: RECOVERY_REQUIRED_FIELDS,
  });
  assert.deepEqual(payload.data.screen.actions[1], {
    id: "signup",
    label: "สมัครสมาชิก",
    endpoint: "/member/api/liff/intent",
  });
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
