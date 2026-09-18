import assert from "node:assert/strict";
import { describe, it } from "node:test";

import worker from "../src/index.js";
import { handleCareBackLiffOrchestrator } from "../src/care-back-liff-orchestrator.js";

function env(overrides = {}) {
  return {
    LINE_LIFF_ID: "2000000000-AbCdEfGh",
    LIFF_SESSION_SECRET: "must-not-render-secret",
    AIRTABLE_API_KEY: "must-not-render-airtable-key",
    ...overrides,
  };
}

async function shell(path = "/member/liff", { method = "GET", runtime = env() } = {}) {
  return worker.fetch(new Request(`https://mmdbkk.com${path}`, { method }), runtime);
}

async function stagingShell(hostname, path, runtime) {
  return worker.fetch(new Request(`https://${hostname}${path}`), runtime);
}

describe("same-site /member/liff shell", () => {
  it("renders the dedicated published Member Dashboard LIFF ID", async () => {
    const response = await shell("/member/liff?intent=status&view=profile", {
      runtime: env({ LINE_LIFF_ID: "2010862595-yT4DCEMc" }),
    });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /"liffId":"2010862595-yT4DCEMc"/);
    assert.doesNotMatch(html, /2010298002-mbx9kqQn/);
  });

  it("serves a no-store same-site LIFF shell that bootstraps only through the LIFF start API", async () => {
    const response = await shell("/member/liff?intent=renew&code=KJ-PRV-ABC123");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /^text\/html/);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    assert.match(response.headers.get("content-security-policy") || "", /static\.line-scdn\.net/);
    assert.match(html, /https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js/);
    assert.match(html, /\/member\/api\/liff\/start/);
    assert.match(html, /"liffId":"2000000000-AbCdEfGh"/);
    assert.match(html, /"intent":"renew"/);
    assert.match(html, /"promoCode":"kj-prv-abc123"/);
    assert.match(html, /credentials:\s*"same-origin"/);
    assert.match(html, /window\.liff\.getIDToken\(\)/);
    assert.match(html, /\/member\/api\/liff\/care-back\/state/);
    assert.match(html, /\/member\/api\/liff\/care-back\/wallet/);
    assert.match(html, /\/member\/api\/liff\/care-back\/wish/);
    assert.doesNotMatch(html, /line_user_id|lineUserId|decodedIDToken|getProfile\(/);
    assert.doesNotMatch(html, /must-not-render-secret|must-not-render-airtable-key/);
    assert.doesNotMatch(html, /https:\/\/mmdprive\.webflow\.io/);
  });

  it("checks the existing same-site member session before any LIFF init or login", async () => {
    const response = await shell("/member/liff?intent=promo&campaign=care_back&view=care_back");
    const html = await response.text();

    assert.equal(response.status, 200);
    const sessionCheck = html.indexOf("const existingProfile = await readProfile()");
    const liffInit = html.indexOf("await window.liff.init({ liffId: CONFIG.liffId })");
    const inClientGuard = html.indexOf("if (!window.liff.isInClient())");
    const liffLogin = html.indexOf("window.liff.login()");
    assert.ok(sessionCheck >= 0, "same-site session check must be rendered");
    assert.ok(liffInit > sessionCheck, "LIFF init must happen only after same-site session check");
    assert.ok(inClientGuard > liffInit, "LIFF login must remain guarded to the LINE client");
    assert.ok(liffLogin > inClientGuard, "LIFF login must happen only after the LINE-client guard");
    assert.ok(liffLogin > liffInit, "LIFF login must remain a fallback after LIFF init");
    assert.match(html, /if \(existingProfile\) return/);
  });

  it("binds the canonical CARE BACK campaign to guarded same-site state and wish APIs", async () => {
    const response = await shell("/member/liff?intent=promo&campaign=care_back");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /"intent":"promo"/);
    assert.match(html, /"campaign":"care_back"/);
    assert.match(html, /body\.campaign = CONFIG\.campaign/);
    assert.match(html, /crypto\.randomUUID\(\)/);
    assert.match(html, /final_display/);
    assert.match(html, /CONFIG\.intent === "promo" && CONFIG\.campaign === "care_back"/);
    assert.match(html, /กำลังตรวจสอบสิทธิ์ CARE BACK อย่างปลอดภัยครับ/);
    assert.doesNotMatch(html, /localStorage|sessionStorage|line_user_id|claim_id/);
  });

  it("normalizes untrusted query intent and promo values before embedding them", async () => {
    const response = await shell("/member/liff?intent=admin_override&code=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /"intent":"unknown"/);
    assert.match(html, /"promoCode":""/);
    assert.match(html, /"campaign":""/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  });

  it("fails safely in rendered copy when the public LIFF id is not configured", async () => {
    const response = await shell("/member/liff", { runtime: env({ LINE_LIFF_ID: "" }) });
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /"liffId":""/);
    assert.match(html, /ช่องทางนี้ยังไม่พร้อมใช้งานครับ/);
  });

  it("renders only bounded member expiry and payment states", async () => {
    const response = await shell("/member/liff?intent=status");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /id="profile-expiry"/);
    assert.match(html, /id="profile-payment"/);
    assert.match(html, /id="expiry-card" class="card hidden"/);
    assert.match(html, /classList\.toggle\("hidden", !expiry\)/);
    assert.match(html, /verified:"Verified"/);
    assert.match(html, /pending_review:"Pending review"/);
    assert.match(html, /unavailable:"Unavailable"/);
    assert.match(html, /\|\| "Unavailable"/);
    assert.match(html, /function safeDate\(value\)/);
    assert.doesNotMatch(html, /payment_ref|receipt_url|member_email|Verification Status/);
  });

  it("renders the Customer 360 shell plus Coupon Wallet with TH, EN, and ZH fallbacks", async () => {
    const response = await shell("/member/liff?intent=status&view=jobs&lang=th");
    const html = await response.text();

    assert.equal(response.status, 200);
    for (const section of ["home", "points", "package", "jobs", "history-panel", "care", "coupons"]) {
      assert.match(html, new RegExp(`id="${section}"`));
    }
    for (const view of ["home", "points", "package", "jobs", "history", "care", "coupons"]) {
      assert.match(html, new RegExp(`data-view="${view}"`));
    }
    assert.match(html, /scroll-snap-type:x mandatory/);
    assert.match(html, /prefers-reduced-motion/);
    assert.match(html, /"LINE Seed Sans TH"/);
    assert.match(html, /customer_360/);
    assert.match(html, /points\.status === "verified"/);
    assert.match(html, /navHome:"👤 HOME"/);
    assert.match(html, /navHome:"👤 HOME"[\s\S]*navPackage:"📦 PACKAGE"/);
    assert.match(html, /pointsTitle:"⭐ 积分"/);
    assert.doesNotMatch(html, /payment_ref|provider_transaction_id|line_user_id|telegram_user_id|Airtable|R2 key|slip_url/i);
    const scriptStart = html.lastIndexOf("<script nonce=");
    const scriptBodyStart = html.indexOf(">", scriptStart) + 1;
    const scriptBodyEnd = html.indexOf("</script>", scriptBodyStart);
    assert.ok(scriptStart >= 0 && scriptBodyStart > scriptStart && scriptBodyEnd > scriptBodyStart);
    assert.doesNotThrow(() => new Function(html.slice(scriptBodyStart, scriptBodyEnd)));
  });

  it("supports HEAD without a response body and rejects unsupported shell methods", async () => {
    const head = await shell("/member/liff", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");

    const put = await shell("/member/liff", { method: "PUT" });
    assert.equal(put.status, 405);
    assert.equal(put.headers.get("allow"), "GET, HEAD");
  });

  it("keeps LIFF API routing delegated to the guarded foundation", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/not-a-route", {
      method: "GET",
      headers: { origin: "https://mmdbkk.com" },
    }), env());
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.error.code, "LIFF_ROUTE_NOT_FOUND");
  });

  it("renders bounded current-member and returning-member synthetic launch cases without requiring real customer data", async () => {
    const runtime = env({ CARE_BACK_STAGING_MODE: "synthetic" });
    const current = await stagingShell(
      "member-dashboard-chat-worker-staging.example.workers.dev",
      "/member/liff?intent=promo&campaign=care_back&scenario=current",
      runtime,
    );
    const returning = await stagingShell(
      "member-dashboard-chat-worker-staging.example.workers.dev",
      "/member/liff?intent=promo&campaign=care_back&scenario=returning",
      runtime,
    );

    assert.equal(current.status, 200);
    assert.equal(returning.status, 200);
    assert.match(await current.text(), /"stagingScenario":"current"/);
    assert.match(await returning.text(), /"stagingScenario":"returning"/);
  });

  it("enables bounded synthetic scenarios only on the staging workers.dev host", async () => {
    const runtime = env({ CARE_BACK_STAGING_MODE: "synthetic" });
    const staging = await stagingShell(
      "member-dashboard-chat-worker-staging.example.workers.dev",
      "/member/liff?intent=promo&campaign=care_back&scenario=current",
      runtime,
    );
    const production = await stagingShell(
      "mmdbkk.com",
      "/member/liff?intent=promo&campaign=care_back&scenario=current",
      runtime,
    );
    const invalid = await stagingShell(
      "member-dashboard-chat-worker-staging.example.workers.dev",
      "/member/liff?intent=promo&campaign=care_back&scenario=admin",
      runtime,
    );

    assert.match(await staging.text(), /"stagingScenario":"current"/);
    assert.match(await production.text(), /"stagingScenario":""/);
    assert.match(await invalid.text(), /"stagingScenario":""/);
  });
});

describe("POST /member/liff CARE BACK orchestration", () => {
  it("saves Wish before Claim/link and surfaces the canonical coupon in My MMD", async () => {
    const order = [];
    const request = new Request("https://www.mmdbkk.com/member/liff", {
      method: "POST",
      headers: {
        origin: "https://www.mmdbkk.com",
        "content-type": "application/json",
        cookie: "__Host-mmd_liff_session=session-original",
      },
      body: JSON.stringify({
        wish_text: "สุขสันต์วันเกิด MMD ครับ",
        request_id: "wish-orchestrator-0001",
        language: "th",
      }),
    });

    const response = await handleCareBackLiffOrchestrator(request, {}, undefined, {
      async publicWishHandler(publicRequest) {
        order.push("wish_save");
        assert.equal(new URL(publicRequest.url).pathname, "/member/api/care-back/public-wish");
        return Response.json({
          ok: true,
          state: "completed",
          wish: { text: "สุขสันต์วันเกิด MMD ครับ" },
          wish_link_token: "pw_abcdefghijklmnopqrstuvwxyz012345",
        }, {
          headers: { "set-cookie": "mmd_care_back_wish_link=pw_abcdefghijklmnopqrstuvwxyz012345; Path=/; Secure; SameSite=Lax" },
        });
      },
      async canonicalLinkHandler(linkRequest) {
        order.push("claim_link_coupon");
        assert.equal(new URL(linkRequest.url).pathname, "/member/api/care-back/link-wish");
        assert.deepEqual(await linkRequest.json(), { wish_link_token: "pw_abcdefghijklmnopqrstuvwxyz012345" });
        return Response.json({
          ok: true,
          linked: true,
          wish: { text: "สุขสันต์วันเกิด MMD ครับ" },
          claim: { claim_reference: "CB6-2026-TEST", claim_status: "benefit_approved" },
          coupon: {
            state: "ready",
            code: "ABC234",
            approved_discount_percent: 7,
            activated_at: "2026-09-15T00:00:00.000Z",
            expires_at: "2026-11-15T00:00:00.000Z",
          },
          benefits: { coupon: true },
        }, {
          headers: { "set-cookie": "__Host-mmd_liff_session=session-rotated; Path=/; Secure; HttpOnly; SameSite=Lax" },
        });
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(order, ["wish_save", "claim_link_coupon"]);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.coupon.state, "ready");
    assert.equal(payload.coupon.approved_discount_percent, 7);
    assert.equal(payload.my_mmd.coupons_endpoint, "/api/member/app/coupons");
    assert.equal(response.headers.get("x-mmd-care-back-orchestrator"), "v1");
  });

  it("rejects browser member/coupon authority before any write", async () => {
    let called = false;
    const request = new Request("https://www.mmdbkk.com/member/liff", {
      method: "POST",
      headers: { origin: "https://www.mmdbkk.com", "content-type": "application/json" },
      body: JSON.stringify({
        wish_text: "test",
        request_id: "wish-orchestrator-reject-0001",
        member_id: "mem_fake",
        approved_discount_percent: 10,
      }),
    });
    const response = await handleCareBackLiffOrchestrator(request, {}, undefined, {
      async publicWishHandler() { called = true; return Response.json({ ok: true }); },
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "BROWSER_AUTHORITY_REJECTED");
    assert.equal(called, false);
  });
});
