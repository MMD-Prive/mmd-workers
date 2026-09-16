import "./my-mmd-status-recovery-gate.runtime.test.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { MMD_LIFF_STABILITY_INTERNALS } from "../src/mms-line-front-gate.js";

const I = MMD_LIFF_STABILITY_INTERNALS;

const STATUS_SHELL = `const existingProfile = await readProfile();\n      if (existingProfile) return;\n      if (started && started.member_resolved) await readProfile();`;

function assertDirectReturn(output, target = "/my-mmd/") {
  assert.doesNotMatch(output, /await readProfile\(\)/);
  assert.match(output, /auth-only bridge/);
  assert.match(output, /ยืนยัน LINE สำเร็จแล้วครับ/);
  assert.match(output, new RegExp(`window\\.location\\.replace\\(${JSON.stringify(target).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
  assert.match(output, /if \(started\)/);
}

test("status LIFF shell becomes auth-only and returns directly to My MMD after verified start", () => {
  const request = new Request("https://www.mmdbkk.com/member/liff?intent=status");
  assert.equal(I.statusReturnTarget(request), "/my-mmd/");
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, request));
});

test("coupon status LIFF returns to the single /coupon entry after verified start", () => {
  const request = new Request("https://www.mmdbkk.com/member/liff?intent=status&return_to=coupon");
  assert.equal(I.statusReturnTarget(request), "/coupon");
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, request), "/coupon");
});

test("LINE liff.state status launch gets the same direct My MMD return", () => {
  const state = encodeURIComponent("/member/liff?intent=status");
  const request = new Request(`https://www.mmdbkk.com/member/liff?liff.state=${state}`);
  assert.equal(I.isStatusLiffShellRequest(request), true);
  assert.equal(I.statusReturnTarget(request), "/my-mmd/");
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, request));
});

test("LINE liff.state carries the coupon return target without allowing arbitrary redirects", () => {
  const couponState = encodeURIComponent("/member/liff?intent=status&return_to=coupon");
  const couponRequest = new Request(`https://www.mmdbkk.com/member/liff?liff.state=${couponState}`);
  assert.equal(I.isStatusLiffShellRequest(couponRequest), true);
  assert.equal(I.statusReturnTarget(couponRequest), "/coupon");
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, couponRequest), "/coupon");

  const hostileState = encodeURIComponent("/member/liff?intent=status&return_to=https://evil.example/");
  const hostileRequest = new Request(`https://www.mmdbkk.com/member/liff?liff.state=${hostileState}`);
  assert.equal(I.statusReturnTarget(hostileRequest), "/my-mmd/");
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, hostileRequest));
});

test("status shell defaults to status when LINE omits intent, but never steals campaign LIFF", () => {
  assert.equal(I.isStatusLiffShellRequest(new Request("https://www.mmdbkk.com/member/liff")), true);
  assert.equal(I.isStatusLiffShellRequest(new Request("https://www.mmdbkk.com/member/liff?liff_intent=unknown")), true);
  assert.equal(I.isStatusLiffShellRequest(new Request("https://www.mmdbkk.com/member/liff?intent=promo&campaign=care_back")), false);
});

test("anonymous late 401 cannot clear a newly established LIFF session", async () => {
  const request = new Request("https://www.mmdbkk.com/member/api/liff/status");
  const response = new Response(JSON.stringify({ ok:false }), { status:401, headers:{ "set-cookie":"__Host-mmd_liff_session=; Max-Age=0; Path=/; Secure; HttpOnly" } });
  const guarded = I.guardAnonymousSessionClear(request, response);
  assert.equal(guarded.headers.get("set-cookie"), null);
  assert.equal(guarded.headers.get("x-mmd-liff-cookie-race-guard"), "ignored-anonymous-stale-clear-v2");
});

test("CARE BACK LIFF bridge carries only a bounded opaque Wish token and returns to /coupon after link", () => {
  const html = `<html><head></head><body><script nonce="abcdefgh12345678">async function readProfile(){ if (CONFIG.intent === "promo" && CONFIG.campaign === "care_back") await readCareBackState();\n    return payload.data || {}; }</script></body></html>`;
  const request = new Request("https://www.mmdbkk.com/member/liff?intent=promo&campaign=care_back&wish_link_token=pw_abcdefghijklmnopqrstuvwxyz123456");
  const output = I.injectCareBackWishBridge(html, request);
  assert.match(output, /mmd-care-back-wish-liff-bridge/);
  assert.match(output, /mmd:liff:member-ready/);
  assert.match(output, /care-back\/link-wish/);
  assert.match(output, /\/coupon\?care_back=linked/);
  assert.doesNotMatch(output, /\/my-mmd\/\?view=care/);
  assert.doesNotMatch(output, /member_id|approved_discount_percent|line_user_id/);
});