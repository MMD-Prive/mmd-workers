import assert from "node:assert/strict";
import test from "node:test";

import {
  isRenewalRoute,
  renderRenewalHtml,
  renderRenewalResponse,
  renewalHeaders,
  resolveRenewalRedirect,
} from "../src/renderers/single-renewal-renderer.js";
import worker from "../src/index.js";

const ROUTES = [
  "https://mmdbkk.com/pay/renewal",
  "https://www.mmdbkk.com/pay/renewal",
  "https://sigil.mmdbkk.com/pay/renewal",
  "https://mmdbkk.com/sigil/pay/renewal",
  "https://www.mmdbkk.com/sigil/pay/renewal",
  "https://sigil.mmdbkk.com/sigil/pay/renewal",
];

test("matches renewal compatibility route family", () => {
  assert.equal(isRenewalRoute("/pay/renewal"), true);
  assert.equal(isRenewalRoute("/pay/renewal/"), true);
  assert.equal(isRenewalRoute("/sigil/pay/renewal"), true);
  assert.equal(isRenewalRoute("/sigil/pay/renewal/"), true);
  assert.equal(isRenewalRoute("/member/payments"), false);
});

test("signed renewal links redirect to canonical signed SIGIL Pay only", () => {
  assert.equal(
    resolveRenewalRedirect("https://www.mmdbkk.com/sigil/pay/renewal?t=SIGNED_TOKEN&package=premium&amount=5000"),
    "https://mmdbkk.com/sigil/pay?t=SIGNED_TOKEN",
  );
});

test("unsigned renewal links redirect to canonical renewal entry and preserve safe context only", () => {
  assert.equal(
    resolveRenewalRedirect("https://mmdbkk.com/sigil/pay/renewal?package=premium&promo=CARE&amount=5000&payment_ref=BAD"),
    "https://mmdbkk.com/sigil/member/membership?intent=renewal&package=premium&promo=CARE",
  );
});

test("all renewal hosts return redirect-only responses with canonical owner headers", async () => {
  for (const url of ROUTES) {
    const response = renderRenewalResponse(new Request(url));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-pay-renewal");
    assert.equal(response.headers.get("x-mmd-route-source"), "member-dashboard-chat-worker:renewal-redirect-bridge");
    assert.equal(response.headers.get("x-mmd-upstream-source"), "redirect-bridge");
    assert.equal(response.headers.get("location"), "https://mmdbkk.com/sigil/member/membership?intent=renewal");
    assert.equal(await response.text(), "");
  }
});

test("fallback HTML renderer is empty", () => {
  assert.equal(renderRenewalHtml(), "");
});

test("handles HEAD and rejects mutations on compatibility route", async () => {
  const head = renderRenewalResponse(new Request("https://mmdbkk.com/sigil/pay/renewal?t=X", { method: "HEAD" }));
  assert.equal(head.status, 307);
  assert.equal(head.headers.get("location"), "https://mmdbkk.com/sigil/pay?t=X");
  assert.equal(await head.text(), "");

  const post = renderRenewalResponse(new Request("https://mmdbkk.com/sigil/pay/renewal", { method: "POST" }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("production entrypoint redirects renewal before unrelated routes", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/sigil/pay/renewal?package=trial&t=abc"), {});
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-route-source"), "member-dashboard-chat-worker:renewal-redirect-bridge");
  assert.equal(response.headers.get("location"), "https://mmdbkk.com/sigil/pay?t=abc");
});

test("header helper exposes redirect bridge and no rendered upstream", () => {
  const headers = renewalHeaders();
  assert.equal(headers["x-mmd-upstream-source"], "redirect-bridge");
});
