import assert from "node:assert/strict";
import test from "node:test";

import {
  isRenewalRoute,
  renderRenewalResponse,
  renewalHeaders,
} from "../src/renderers/single-renewal-renderer.js";
import worker from "../src/index.js";

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
  const response = renderRenewalResponse(new Request("https://mmdbkk.com/pay/renewal?status=confirmed&amount=5000&t=TEST&package=premium&session_id=SESSION&payment_ref=PAYMENT"));
  const body = await response.text();

  assert.match(body, /mmd-renewal-single/);
  assert.match(body, /MMD \/ SIGIL/);
  assert.match(body, /Renewal Payment Review/);
  assert.match(body, /ต่ออายุสมาชิกจากหน้านี้ได้เลยครับ/);
  assert.match(body, /ส่งสลิปให้เปอร์ตรวจ/);
  assert.match(body, /data-ui-status-title>เตรียมต่ออายุ<\/strong>/);
  assert.match(body, /data-proof-url="https:\/\/sigil\.mmdbkk\.com\/api\/pay\/renewal\/proof"/);
  assert.match(body, /data-initial-plan="premium"/);
  assert.match(body, /data-token="TEST"/);
  assert.match(body, /data-session-id="SESSION"/);
  assert.match(body, /data-payment-ref="PAYMENT"/);
  assert.doesNotMatch(body, /Kenji|เคนจิ|ทีม|ระบบ/);
  assert.doesNotMatch(body, />Upgrade</);

  for (const marker of FORBIDDEN_MARKERS) {
    assert.equal(body.includes(marker), false, `Forbidden legacy marker found: ${marker}`);
  }
});

test("keeps exactly the three approved customer packages and preserves query-selected package", async () => {
  const response = renderRenewalResponse(new Request("https://sigil.mmdbkk.com/sigil/pay/renewal?package=standard"));
  const body = await response.text();

  assert.equal((body.match(/data-package="trial"/g) || []).length, 1);
  assert.equal((body.match(/data-package="standard"/g) || []).length, 1);
  assert.equal((body.match(/data-package="premium"/g) || []).length, 1);
  assert.match(body, /data-initial-plan="standard"/);
  assert.match(body, /data-selected-package value="standard"/);
  assert.doesNotMatch(body, /data-package="(?:current|upgrade|vip|svip|black-card)"/i);
});

test("supports environment-backed payment connections without exposing unsafe schemes", async () => {
  const response = renderRenewalResponse(
    new Request("https://sigil.mmdbkk.com/sigil/pay/renewal"),
    {
      RENEWAL_PROOF_ENDPOINT: "https://payments.example.test/api/proof",
      RENEWAL_STATUS_ENDPOINT: "https://payments.example.test/api/status",
      RENEWAL_BANK_NAME: "TTB",
      RENEWAL_BANK_ACCOUNT_NAME: "MMD TEST",
      RENEWAL_BANK_ACCOUNT_NUMBER: "1234567890",
      RENEWAL_CARD_URL: "javascript:alert(1)",
    },
  );
  const body = await response.text();

  assert.match(body, /data-proof-url="https:\/\/payments\.example\.test\/api\/proof"/);
  assert.match(body, /data-status-url="https:\/\/payments\.example\.test\/api\/status"/);
  assert.match(body, /MMD TEST/);
  assert.match(body, /1234567890/);
  assert.doesNotMatch(body, /javascript:/i);
  assert.doesNotMatch(body, /data-method-button="card"/);
});

test("handles HEAD and rejects mutations on the page route", async () => {
  const head = renderRenewalResponse(new Request("https://mmdbkk.com/sigil/pay/renewal", { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const post = renderRenewalResponse(new Request("https://mmdbkk.com/sigil/pay/renewal", { method: "POST" }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("production entrypoint serves renewal before unrelated member and LINE routes", async () => {
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
