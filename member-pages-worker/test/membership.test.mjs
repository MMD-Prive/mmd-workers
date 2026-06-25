import assert from "node:assert/strict";
import { describe, it } from "node:test";

import worker from "../src/index.js";

async function request(url, init) {
  return worker.fetch(new Request(url, init));
}

describe("member-pages-worker membership page", () => {
  it("renders the latest member membership packages without SVIP and preserves query params", async () => {
    const response = await request("https://mmdbkk.com/member/membership?t=abc&code=x&promo=y");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-membership");
    assert.match(html, /Membership/);
    assert.match(html, /membership-hero/);
    assert.match(html, /membership-card/);
    assert.match(html, /Choose package/);
    assert.match(html, /Official verification/);
    assert.match(html, /Trial/);
    assert.match(html, /Standard/);
    assert.match(html, /Premium/);
    assert.match(html, /BLACK CARD NOTE/);
    assert.match(html, /ไม่ใช่แพ็กเกจที่กดซื้อ/);
    assert.doesNotMatch(html, /VIP/i);
    assert.doesNotMatch(html, /SVIP/i);
    assert.doesNotMatch(html, /name=["']token["']/i);
    assert.ok(html.includes("/pay/membership?t=abc&amp;code=x&amp;promo=y"));
    assert.ok(html.includes("/member/dashboard?t=abc&amp;code=x&amp;promo=y"));
  });

  it("renders SIGIL membership renewal/access conditions without checkout claims", async () => {
    const response = await request("https://mmdbkk.com/sigil/membership?t=abc&code=x&promo=y&payment_ref=pay123&session_id=sess123");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-membership");
    assert.match(html, /Renewal \/ Access Conditions/);
    assert.match(html, /ไม่ใช่หน้า checkout/);
    assert.match(html, /official verification/);
    assert.match(html, /Trial/);
    assert.match(html, /Standard/);
    assert.match(html, /Premium/);
    assert.match(html, /private consideration\/review/);
    assert.doesNotMatch(html, /SVIP/i);
    assert.doesNotMatch(html, /VIP/i);
    assert.ok(html.includes("/member/membership?t=abc&amp;code=x&amp;promo=y&amp;payment_ref=pay123&amp;session_id=sess123"));
    assert.ok(html.includes("/member/dashboard?t=abc&amp;code=x&amp;promo=y&amp;payment_ref=pay123&amp;session_id=sess123"));
  });

  it("returns no body for SIGIL membership HEAD while keeping ownership headers", async () => {
    const response = await request("https://mmdbkk.com/sigil/membership/?t=abc", { method: "HEAD" });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body, "");
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-membership");
  });

  it("returns no body for HEAD while keeping ownership headers", async () => {
    const response = await request("https://mmdbkk.com/member/membership?t=abc", { method: "HEAD" });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body, "");
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-membership");
  });

  it("renders member profile in pending safe state by default", async () => {
    const response = await request("https://mmdbkk.com/member/profile");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-profile");
    assert.match(html, /Pending Profile/);
    assert.match(html, /Pending Verification/);
    assert.match(html, /Waiting official verification/);
    assert.match(html, /verified funds only/);
    assert.match(html, /proof is not payment truth/);
    assert.match(html, /points pending official verification/);
    assert.match(html, /review unavailable until official verification/);
    assert.doesNotMatch(html, /Active Profile/);
    assert.doesNotMatch(html, /Verified Points/);
    assert.doesNotMatch(html, /Review Eligible/);
  });

  it("does not trust verified status, amount, points, or payment ref from query params", async () => {
    const response = await request("https://mmdbkk.com/member/profile?status=verified&amount=35000&plan=premium&payment_ref=fake-ref");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-profile");
    assert.match(html, /Pending Profile/);
    assert.match(html, /Pending Verification/);
    assert.match(html, /official verification/);
    assert.match(html, /proof is not payment truth/);
    assert.match(html, /verified funds only/);
    assert.doesNotMatch(html, /Active Profile/);
    assert.doesNotMatch(html, /350 points/);
    assert.doesNotMatch(html, /Review Eligible/);
    assert.match(html, /<span>Payment Ref<\/span><b>Waiting official verification<\/b>/);
    assert.doesNotMatch(html, /Verified payment truth/i);
  });

  it("keeps member profile slash variant in pending safe state", async () => {
    const response = await request("https://mmdbkk.com/member/profile/?status=active&amount=35000&payment_ref=fake-ref");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-profile");
    assert.match(html, /Pending Profile/);
    assert.match(html, /Pending Verification/);
    assert.match(html, /points pending official verification/);
    assert.doesNotMatch(html, /Active Profile/);
    assert.doesNotMatch(html, /350 points/);
    assert.doesNotMatch(html, /Review Eligible/);
    assert.match(html, /<span>Payment Ref<\/span><b>Waiting official verification<\/b>/);
  });

  it("keeps unknown paths closed", async () => {
    const response = await request("https://mmdbkk.com/member/dashboard?t=abc");

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
  });
});
