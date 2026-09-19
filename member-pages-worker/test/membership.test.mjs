import assert from "node:assert/strict";
import { describe, it } from "node:test";

import worker from "../src/index.js";

async function request(url, init) {
  return worker.fetch(new Request(url, init));
}

describe("member-pages-worker membership page", () => {
  it("renders the latest SIGIL member membership packages without SVIP and preserves query params", async () => {
    const response = await request("https://mmdbkk.com/sigil/member/membership?t=abc&code=x&promo=y");
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-membership");
    assert.equal(response.headers.get("x-mmd-version"), "20260801-sigil-member-membership-v3");
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
    assert.match(html, /LINE Seed Sans TH/);
    assert.match(html, /Noto Sans Thai/);
    assert.doesNotMatch(html, /VIP/i);
    assert.doesNotMatch(html, /SVIP/i);
    assert.doesNotMatch(html, /Membership routes stay membership routes/);
    assert.doesNotMatch(html, /Route rule/);
    assert.doesNotMatch(html, /name=["']token["']/i);
    assert.ok(html.includes("/pay/membership?t=abc&amp;code=x&amp;promo=y"));
    assert.ok(html.includes("/blackcard/black-card?t=abc&amp;code=x&amp;promo=y"));
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
    assert.ok(html.includes("/sigil/member/membership?t=abc&amp;code=x&amp;promo=y&amp;payment_ref=pay123&amp;session_id=sess123"));
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
    const response = await request("https://mmdbkk.com/sigil/member/membership?t=abc", { method: "HEAD" });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body, "");
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-membership");
  });

  it("redirects the legacy member membership path to the SIGIL canonical route with the full query preserved", async () => {
    for (const path of ["/member/membership", "/member/membership/"]) {
      const response = await request(`https://mmdbkk.com${path}?t=abc&code=x&promo=y&source=line`);

      assert.equal(response.status, 301, path);
      assert.equal(response.headers.get("location"), "https://mmdbkk.com/sigil/member/membership?t=abc&code=x&promo=y&source=line", path);
    }
  });

  it("serves the member dashboard route with guarded member-pages ownership", async () => {
    const response = await request("https://mmdbkk.com/member/dashboard?t=abc");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-dashboard");
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    const html = await response.text();
    assert.match(html, /2010862595-yT4DCEMc/);
    assert.doesNotMatch(html, /2010298002-mbx9kqQn/);
  });
});
