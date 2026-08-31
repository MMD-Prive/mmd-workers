import assert from "node:assert/strict";
import test from "node:test";
import { rewritePendingStatusStartResponse } from "../src/liff-status-resolution-guard.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

test("rewrites unresolved status start into explicit final state", async () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });
  const response = jsonResponse({
    ok: true,
    data: {
      member_resolved: false,
      pending_identity: true,
      next_screen_key: "status_result",
      screen: { key: "status_result", copy: "HYPE กำลังดูแลเส้นทางตรวจสอบข้อมูลสมาชิกให้อย่างปลอดภัยครับ", actions: [] },
    },
  });

  const rewritten = await rewritePendingStatusStartResponse(request, response);
  const payload = await rewritten.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.member_resolved, false);
  assert.equal(payload.data.next_screen_key, "status_unresolved");
  assert.equal(payload.data.screen.key, "status_unresolved");
  assert.match(payload.data.screen.copy, /ยังไม่พบข้อมูลสมาชิก/);
  assert.deepEqual(payload.data.screen.actions, [{
    id: "signup",
    label: "ยังไม่เคยเป็นสมาชิก · สมัครสมาชิก",
    endpoint: "/member/api/liff/intent",
  }]);
});

test("keeps resolved status response unchanged", async () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });
  const payload = {
    ok: true,
    data: {
      member_resolved: true,
      pending_identity: false,
      next_screen_key: "status_result",
      screen: { key: "status_result", copy: "status", actions: [] },
    },
  };
  const response = jsonResponse(payload);
  const rewritten = await rewritePendingStatusStartResponse(request, response);
  assert.deepEqual(await rewritten.json(), payload);
});

test("does not rewrite non-start endpoints", async () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/profile", { method: "POST" });
  const payload = {
    ok: true,
    data: {
      member_resolved: false,
      pending_identity: true,
      next_screen_key: "status_result",
      screen: { key: "status_result", actions: [] },
    },
  };
  const response = jsonResponse(payload);
  const rewritten = await rewritePendingStatusStartResponse(request, response);
  assert.deepEqual(await rewritten.json(), payload);
});
