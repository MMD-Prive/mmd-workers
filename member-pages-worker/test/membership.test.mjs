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
    assert.match(html, /Standard/);
    assert.match(html, /Premium/);
    assert.match(html, /VIP/);
    assert.match(html, /BLACK CARD NOTE/);
    assert.match(html, /ไม่ใช่ซื้อ แต่ถูกพิจารณา/);
    assert.doesNotMatch(html, /SVIP/i);
    assert.doesNotMatch(html, /name=["']token["']/i);
    assert.ok(html.includes("/pay/membership?t=abc&amp;code=x&amp;promo=y"));
    assert.ok(html.includes("/member/dashboard?t=abc&amp;code=x&amp;promo=y"));
  });

  it("returns no body for HEAD while keeping ownership headers", async () => {
    const response = await request("https://mmdbkk.com/member/membership?t=abc", { method: "HEAD" });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body, "");
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal(response.headers.get("x-mmd-page"), "member-membership");
  });

  it("keeps unknown paths closed", async () => {
    const response = await request("https://mmdbkk.com/member/dashboard?t=abc");

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
  });
});
