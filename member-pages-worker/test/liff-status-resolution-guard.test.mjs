import assert from "node:assert/strict";
import test from "node:test";
import { rewritePendingStatusStartResponse } from "../src/liff-status-resolution-guard.js";
import { withStatusFirstMemberResolver } from "../src/liff-status-first-member-resolver.js";

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

test("status-first resolver skips Customer 360 for a LINE subject not yet in Members", async () => {
  const calls = [];
  const upstream = {
    async fetch(request) {
      const url = new URL(request.url);
      calls.push(url.pathname);
      if (url.pathname === "/__internal/member-status/resolve") {
        return jsonResponse({ ok: true, data: { member_exists: false } });
      }
      if (url.pathname === "/__internal/member-profile/read") {
        return jsonResponse({ ok: false, error: { code: "MEMBER_PROFILE_RESOLVER_UNAVAILABLE" } }, 503);
      }
      return jsonResponse({ ok: false }, 404);
    },
  };
  const env = withStatusFirstMemberResolver(
    new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" }),
    { MEMBER_STATUS_RESOLVER: upstream, MEMBER_STATUS_RESOLVER_SECRET: "x".repeat(32) },
  );
  const response = await env.MEMBER_STATUS_RESOLVER.fetch(new Request("https://mmd-auth-worker.internal/__internal/member-profile/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ line_user_id: `U${"a".repeat(32)}`, purpose: "liff_member_profile_read" }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { member_exists: false } });
  assert.deepEqual(calls, ["/__internal/member-status/resolve"]);
});

test("status-first resolver keeps full profile read for an existing member", async () => {
  const calls = [];
  const upstream = {
    async fetch(request) {
      const url = new URL(request.url);
      calls.push(url.pathname);
      if (url.pathname === "/__internal/member-status/resolve") {
        return jsonResponse({ ok: true, data: { member_exists: true } });
      }
      if (url.pathname === "/__internal/member-profile/read") {
        return jsonResponse({ ok: true, data: { member_exists: true, member_id: "mmd_1", profile: { tier: "Premium" } } });
      }
      return jsonResponse({ ok: false }, 404);
    },
  };
  const env = withStatusFirstMemberResolver(
    new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" }),
    { MEMBER_STATUS_RESOLVER: upstream, MEMBER_STATUS_RESOLVER_SECRET: "x".repeat(32) },
  );
  const response = await env.MEMBER_STATUS_RESOLVER.fetch(new Request("https://mmd-auth-worker.internal/__internal/member-profile/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ line_user_id: `U${"b".repeat(32)}`, purpose: "liff_member_profile_read" }),
  }));

  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.member_exists, true);
  assert.deepEqual(calls, ["/__internal/member-status/resolve", "/__internal/member-profile/read"]);
});

test("status-first resolver fails closed when authoritative status is unavailable", async () => {
  const calls = [];
  const upstream = {
    async fetch(request) {
      const url = new URL(request.url);
      calls.push(url.pathname);
      if (url.pathname === "/__internal/member-status/resolve") {
        return jsonResponse({ ok: false, error: { code: "MEMBER_STATUS_RESOLVER_UNAVAILABLE" } }, 503);
      }
      return jsonResponse({ ok: false }, 500);
    },
  };
  const env = withStatusFirstMemberResolver(
    new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" }),
    { MEMBER_STATUS_RESOLVER: upstream, MEMBER_STATUS_RESOLVER_SECRET: "x".repeat(32) },
  );
  const response = await env.MEMBER_STATUS_RESOLVER.fetch(new Request("https://mmd-auth-worker.internal/__internal/member-profile/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ line_user_id: `U${"c".repeat(32)}`, purpose: "liff_member_profile_read" }),
  }));

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "MEMBER_STATUS_RESOLVER_UNAVAILABLE");
  assert.deepEqual(calls, ["/__internal/member-status/resolve"]);
});
