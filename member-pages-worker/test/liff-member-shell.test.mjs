import assert from "node:assert/strict";
import { describe, it } from "node:test";

import worker from "../src/index.js";

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
    const liffLogin = html.indexOf("window.liff.login()");
    assert.ok(sessionCheck >= 0, "same-site session check must be rendered");
    assert.ok(liffInit > sessionCheck, "LIFF init must happen only after same-site session check");
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

  it("supports HEAD without a response body and rejects mutating shell methods", async () => {
    const head = await shell("/member/liff", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");

    const post = await shell("/member/liff", { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
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
