import assert from "node:assert/strict";
import test from "node:test";

import {
  isRenewalRoute,
  renderRenewalResponse,
  renewalHeaders,
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

const FORBIDDEN_PAYMENT_AUTHORITY = [
  "promptpay.io/0829528889",
  "data-promptpay-base",
  "RENEWAL_BANK_ACCOUNT_NUMBER",
  "RENEWAL_BANK_ACCOUNT_NAME",
  "RENEWAL_BANK_NAME",
  "data-amount-input",
  "data-ref-input",
  "กรอกยอดตามที่ได้รับแจ้ง",
];

test("matches canonical renewal route family", () => {
  assert.equal(isRenewalRoute("/pay/renewal"), true);
  assert.equal(isRenewalRoute("/pay/renewal/"), true);
  assert.equal(isRenewalRoute("/sigil/pay/renewal"), true);
  assert.equal(isRenewalRoute("/sigil/pay/renewal/"), true);
  assert.equal(isRenewalRoute("/member/payments"), false);
});

test("returns canonical route-owner headers", async () => {
  for (const url of ROUTES) {
    const response = renderRenewalResponse(new Request(url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-pay-renewal");
    assert.equal(response.headers.get("x-mmd-route-source"), "member-dashboard-chat-worker:single-renewal-renderer");
    assert.equal(response.headers.get("x-mmd-upstream-source"), "local-renderer");
  }
});

test("renders Payment Instructions v1 consumer and canonical proof intake", async () => {
  const response = renderRenewalResponse(new Request(
    "https://mmdbkk.com/sigil/pay/renewal?t=SIGNED_TOKEN&package=premium&session_id=SESSION&payment_ref=PAYMENT&amount=5000",
  ));
  const body = await response.text();

  assert.match(body, /mmd-renewal-single/);
  assert.match(body, /data-payment-instructions-url="https:\/\/sigil\.mmdbkk\.com\/v1\/confirm\/payment-instructions"/);
  assert.match(body, /data-proof-url="https:\/\/sigil\.mmdbkk\.com\/v1\/pay\/slip\/evidence"/);
  assert.match(body, /data-token="SIGNED_TOKEN"/);
  assert.match(body, /mmd_payment_instructions_v1/);
  assert.match(body, /authority!==AUTHORITY/);
  assert.match(body, /fd\.append\("payment_ref",state\.paymentRef\)/);
  assert.match(body, /fd\.append\("source_page","sigil_pay"\)/);
  assert.doesNotMatch(body, /data-initial-amount=/);
  assert.doesNotMatch(body, />5,?000</);

  for (const marker of FORBIDDEN_PAYMENT_AUTHORITY) {
    assert.equal(body.includes(marker), false, `Forbidden browser payment authority found: ${marker}`);
  }
});

test("query amount is ignored and unsigned renewal fails closed", async () => {
  const response = renderRenewalResponse(new Request("https://mmdbkk.com/sigil/pay/renewal?amount=2500&package=standard"));
  const body = await response.text();

  assert.match(body, /data-token=""/);
  assert.match(body, /Signed token required/);
  assert.match(body, /ไม่แสดงเลขบัญชีหรือ QR/);
  assert.doesNotMatch(body, /data-initial-amount=/);
  assert.doesNotMatch(body, /2,500/);
});

test("keeps package as UI context only", async () => {
  const response = renderRenewalResponse(new Request("https://sigil.mmdbkk.com/sigil/pay/renewal?t=X&package=standard"));
  const body = await response.text();

  assert.match(body, /data-initial-plan="standard"/);
  assert.match(body, /PACKAGE CONTEXT/);
  assert.doesNotMatch(body, /data-package="standard"/);
  assert.doesNotMatch(body, /data-package="premium"/);
  assert.doesNotMatch(body, /data-package="trial"/);
});

test("allows only HTTPS endpoint overrides", async () => {
  const response = renderRenewalResponse(
    new Request("https://sigil.mmdbkk.com/sigil/pay/renewal?t=T"),
    {
      PAYMENT_INSTRUCTIONS_URL: "https://payments.example.test/v1/confirm/payment-instructions",
      PAYMENT_PROOF_URL: "javascript:alert(1)",
    },
  );
  const body = await response.text();

  assert.match(body, /data-payment-instructions-url="https:\/\/payments\.example\.test\/v1\/confirm\/payment-instructions"/);
  assert.match(body, /data-proof-url="https:\/\/sigil\.mmdbkk\.com\/v1\/pay\/slip\/evidence"/);
  assert.doesNotMatch(body, /javascript:/i);
});

test("handles HEAD and rejects mutations on page route", async () => {
  const head = renderRenewalResponse(new Request("https://mmdbkk.com/sigil/pay/renewal", { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = renderRenewalResponse(new Request("https://mmdbkk.com/sigil/pay/renewal", { method: "POST" }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("production entrypoint still serves renewal before unrelated routes", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/sigil/pay/renewal?package=trial&t=abc"), {});
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-route-source"), "member-dashboard-chat-worker:single-renewal-renderer");
  assert.match(body, /data-initial-plan="trial"/);
  assert.doesNotMatch(body, /not_found|line_webhook/);
});

test("header helper exposes no Webflow upstream", () => {
  const headers = renewalHeaders();
  assert.equal(headers["x-mmd-upstream-source"], "local-renderer");
});
