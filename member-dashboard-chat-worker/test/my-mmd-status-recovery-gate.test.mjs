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

test("direct status LIFF stays in the worker-rendered member dashboard", () => {
  const request = new Request("https://www.mmdbkk.com/member/liff?intent=status");
  assert.equal(I.statusReturnTarget(request), "");
  assert.equal(I.stabilizeStatusShell(STATUS_SHELL, request), STATUS_SHELL);
});

test("coupon status LIFF returns to the single /coupon entry after verified start", () => {
  const request = new Request("https://www.mmdbkk.com/member/liff?intent=status&return_to=coupon");
  assert.equal(I.statusReturnTarget(request), "/my-mmd/coupons");
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, request), "/my-mmd/coupons");
});

test("TMIB status LIFF returns to the originating story or checkout after verified start", () => {
  const actTarget = "/tmib/act-001#unlock-v4";
  const actRequest = new Request(`https://www.mmdbkk.com/member/liff?intent=status&return_to=${encodeURIComponent(actTarget)}`);
  assert.equal(I.statusReturnTarget(actRequest), actTarget);
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, actRequest), actTarget);

  const checkoutTarget = "/pay/tmib?episode=act-001";
  const checkoutRequest = new Request(`https://www.mmdbkk.com/member/liff?intent=status&return_to=${encodeURIComponent(checkoutTarget)}`);
  assert.equal(I.statusReturnTarget(checkoutRequest), checkoutTarget);
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, checkoutRequest), checkoutTarget);
});

test("Rich Menu status LIFF returns only to bounded customer destinations after verified start", () => {
  const targets = [
    "/profiles?source=line&entry_route=rich_menu_guest_models",
    "/profiles?source=line&entry_route=rich_menu_public_models",
    "/booking?source=line&entry_route=rich_menu_guest_booking",
    "/booking?source=line&entry_route=rich_menu_public_booking",
    "/services/companion?source=line&entry_route=rich_menu_guest_services",
    "/tmib?source=line&entry_route=rich_menu_guest_stories",
    "/member/private?source=line&entry_route=rich_menu_model_cards#detail-model",
    "/member/private?source=line&entry_route=rich_menu_prive_update#access",
    "/find?source=line&entry_route=rich_menu_private_booking",
  ];
  for (const target of targets) {
    const request = new Request(`https://www.mmdbkk.com/member/liff?intent=status&return_to=${encodeURIComponent(target)}`);
    assert.equal(I.statusReturnTarget(request), target);
    assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, request), target);
  }
});

test("Rich Menu status LIFF fails closed for mismatched, privileged, or expanded return targets", () => {
  const hostileTargets = [
    "/profiles?source=line&entry_route=rich_menu_private_booking",
    "/booking?source=web&entry_route=rich_menu_public_booking",
    "/member/private?source=line&entry_route=rich_menu_model_cards#admin",
    "/find?source=line&entry_route=rich_menu_private_booking&next=/internal/admin",
    "/internal/admin?source=line&entry_route=rich_menu_guest_models",
  ];
  for (const target of hostileTargets) {
    const request = new Request(`https://www.mmdbkk.com/member/liff?intent=status&return_to=${encodeURIComponent(target)}`);
    assert.equal(I.statusReturnTarget(request), "");
  }
});

test("TMIB return-to-origin fails closed inside LIFF for external, privileged, or malformed targets", () => {
  const hostileTargets = [
    "https://evil.example/",
    "//evil.example/tmib/act-001",
    "/internal/admin",
    "/pay/tmib?episode=../../internal/admin",
    "/pay/tmib?episode=act-001&next=https://evil.example/",
    "/tmib/not-an-act",
  ];
  for (const target of hostileTargets) {
    const request = new Request(`https://www.mmdbkk.com/member/liff?intent=status&return_to=${encodeURIComponent(target)}`);
    assert.equal(I.statusReturnTarget(request), "");
    assert.equal(I.stabilizeStatusShell(STATUS_SHELL, request), STATUS_SHELL);
  }
});

test("LINE liff.state status launch stays in the worker-rendered LIFF dashboard", () => {
  const state = encodeURIComponent("/member/liff?intent=status");
  const request = new Request(`https://www.mmdbkk.com/member/liff?liff.state=${state}`);
  assert.equal(I.isStatusLiffShellRequest(request), true);
  assert.equal(I.statusReturnTarget(request), "");
  assert.equal(I.stabilizeStatusShell(STATUS_SHELL, request), STATUS_SHELL);
});

test("LINE liff.state carries the coupon return target without allowing arbitrary redirects", () => {
  const couponState = encodeURIComponent("/member/liff?intent=status&return_to=coupon");
  const couponRequest = new Request(`https://www.mmdbkk.com/member/liff?liff.state=${couponState}`);
  assert.equal(I.isStatusLiffShellRequest(couponRequest), true);
  assert.equal(I.statusReturnTarget(couponRequest), "/my-mmd/coupons");
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, couponRequest), "/my-mmd/coupons");

  const hostileState = encodeURIComponent("/member/liff?intent=status&return_to=https://evil.example/");
  const hostileRequest = new Request(`https://www.mmdbkk.com/member/liff?liff.state=${hostileState}`);
  assert.equal(I.statusReturnTarget(hostileRequest), "/my-mmd/");
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, hostileRequest));
});

test("LINE liff.state carries the bounded TMIB origin", () => {
  const target = "/pay/tmib?episode=act-001";
  const state = encodeURIComponent(`/member/liff?intent=status&return_to=${encodeURIComponent(target)}`);
  const request = new Request(`https://www.mmdbkk.com/member/liff?liff.state=${state}`);
  assert.equal(I.isStatusLiffShellRequest(request), true);
  assert.equal(I.statusReturnTarget(request), target);
  assertDirectReturn(I.stabilizeStatusShell(STATUS_SHELL, request), target);
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
  assert.match(output, /\/my-mmd\/coupons\?care_back=linked/);
  assert.doesNotMatch(output, /\/my-mmd\/\?view=care/);
  assert.doesNotMatch(output, /member_id|approved_discount_percent|line_user_id/);
});