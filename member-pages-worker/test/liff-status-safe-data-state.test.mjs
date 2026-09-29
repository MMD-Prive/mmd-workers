import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { rewritePendingStatusStartResponse } from "../src/liff-status-resolution-guard.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const RECOVERY_REQUIRED_FIELDS = ["email", "phone", "nickname"];
const COMPACT_COPY = [
  "ยืนยัน LINE สำเร็จแล้ว",
  "กรอก 1–2 อย่างที่เคยให้ไว้: อีเมล / เบอร์ / ชื่อเล่นหรือนามแฝง แล้วกด Verify",
];

test("unmatched LINE-verified MY MMD status returns safe pending state with compact recovery copy", async () => {
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
  assert.deepEqual(payload.data.screen.copy.split("\n"), COMPACT_COPY);
  assert.match(payload.data.screen.copy, /ชื่อเล่นหรือนามแฝง/);
  assert.match(payload.data.screen.copy, /Verify/);
  assert.doesNotMatch(payload.data.screen.copy, /Guest|Telegram|Member ID|LINE OFC note|Per note|Console Inbox|Tier|Points|Wallet|Private Access/);

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

test("unresolved status source keeps only one customer-facing Verify label", async () => {
  const source = await readFile(new URL("../src/liff-status-resolution-guard.js", import.meta.url), "utf8");
  assert.equal((source.match(/label: "Verify"/g) || []).length, 1);
  assert.equal(source.includes('label: "ยืนยันข้อมูลสมาชิกเดิม"'), false);
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
