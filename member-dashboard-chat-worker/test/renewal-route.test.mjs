import assert from "node:assert/strict";
import test from "node:test";

import {
  isRenewalRoute,
  renderRenewalResponse,
  renewalHeaders,
} from "../src/renderers/single-renewal-renderer.js";

const FORBIDDEN_MARKERS = [
  "Renew with Kenji",
  "Proof enters official review only",
  "mmd-renewal-kenji-public",
  "Ready to Start",
  "data-bank-display",
  "fetchSigilPayRenewalFromWebflow",
  "RENEWAL_WEBFLOW_SOURCE_ORIGIN",
  "RENEWAL_WEBFLOW_SOURCE_PATH",
];

const ROUTES = [
  "https://mmdbkk.com/pay/renewal",
  "https://www.mmdbkk.com/pay/renewal",
  "https://sigil.mmdbkk.com/pay/renewal",
  "https://mmdbkk.com/sigil/pay/renewal",
  "https://www.mmdbkk.com/sigil/pay/renewal",
  "https://sigil.mmdbkk.com/sigil/pay/renewal",
];

test("matches canonical renewal route family", () => {
  assert.equal(isRenewalRoute("/pay/renewal"), true);
  assert.equal(isRenewalRoute("/pay/renewal/"), true);
  assert.equal(isRenewalRoute("/sigil/pay/renewal"), true);
  assert.equal(isRenewalRoute("/sigil/pay/renewal/"), true);
  assert.equal(isRenewalRoute("/member/payments"), false);
});

test("returns canonical headers", async () => {
  for (const url of ROUTES) {
    const response = renderRenewalResponse(new Request(url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-pay-renewal");
    assert.equal(response.headers.get("x-mmd-route-source"), "member-dashboard-chat-worker:single-renewal-renderer");
    assert.equal(response.headers.get("x-mmd-upstream-source"), "local-renderer");
  }
});

test("renders canonical body markers and excludes forbidden legacy markers", async () => {
  const response = renderRenewalResponse(new Request("https://mmdbkk.com/pay/renewal?status=confirmed&amount=5000&t=TEST"));
  const body = await response.text();

  assert.match(body, /mmd-renewal-single/);
  assert.match(body, /MMD \/ SIGIL/);
  assert.match(body, /Renewal Payment Review/);
  assert.match(body, /ส่งหลักฐานไว้ให้ MMD ตรวจรายการได้เลยครับ/);
  assert.doesNotMatch(body, /Member updated<\/strong>/);

  for (const marker of FORBIDDEN_MARKERS) {
    assert.equal(body.includes(marker), false, `Forbidden legacy marker found: ${marker}`);
  }
});

test("header helper exposes no Webflow upstream", () => {
  const headers = renewalHeaders();
  assert.equal(headers["x-mmd-upstream-source"], "local-renderer");
});
