import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

const env = { TURNSTILE_SITE_KEY: "0xTEST" };
const ctx = {};

const required = [
  // root / namespace markers
  "mmd-renewal-redesign",
  "mmd-renewx",
  "Renewal Payment",
  // proof form
  "sigil.mmdbkk.com/api/pay/renewal/proof",
  "display_name",
  "amount_paid",
  "paid_at",
  "proof",
  // consent disclaimer
  "หลักฐานประกอบเท่านั้น",
];

const legacyRenewalSlug = ["sigil", "renewal", "v3"].join("-");
const legacyRenewalBuild = ["SIGIL", "RENEWAL", "V3", "20260612"].join("_");
const legacyTrustInmeUrl = `https://sigil.mmdbkk.com/${["trust", "inme"].join("/")}`;

const banned = [
  // Per's banned production markers (literal — some rendered uppercase by CSS)
  "Payment details",
  "ส่งหลักฐานการชำระเงิน",
  "MMD PRIVÉ — MEMBERSHIP",   // uppercase form (text-transform:uppercase would produce this)
  "MMD Privé — Membership",   // raw-HTML form — must not appear either
  // old page markers
  "mmd-renewal-premium-root",
  "Renew or Upgrade Access",
  legacyRenewalSlug,
  legacyRenewalBuild,
  // prohibited Thai copy
  "ระบบ",
  "ทีมงาน",
  // prohibited English copy
  "admin confirmation",
];

for (const path of ["/sigil/pay/renewal", "/sigil/pay/renewal/", "/pay/renewal", "/pay/renewal/"]) {
  test(`GET ${path} renders mmd-renewx redesign (banned markers absent)`, async () => {
    const response = await worker.fetch(new Request(`https://www.mmdbkk.com${path}`), env, ctx);
    assert.equal(response.status, 200, `expected 200 for ${path}`);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    for (const marker of required) assert.ok(html.includes(marker), `missing required: ${marker}`);
    for (const marker of banned) assert.ok(!html.includes(marker), `must not contain: ${marker}`);
  });
}

test("HEAD /pay/renewal returns 200 with empty body", async () => {
  const response = await worker.fetch(
    new Request("https://www.mmdbkk.com/pay/renewal", { method: "HEAD" }), env, ctx
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("GET /trust/inme redirects to https://mmdbkk.com/sigil/pay/renewal", async () => {
  const response = await worker.fetch(
    new Request(legacyTrustInmeUrl), env, ctx
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://mmdbkk.com/sigil/pay/renewal");
});

test("proof endpoint is absolute sigil.mmdbkk.com URL in rendered HTML", async () => {
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/pay/renewal"), env, ctx);
  const html = await response.text();
  assert.ok(
    html.includes("https://sigil.mmdbkk.com/api/pay/renewal/proof"),
    "CONFIG.endpoint must be absolute sigil.mmdbkk.com proof URL"
  );
});

test("build ID is MMD_RENEWX_20260620b", async () => {
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/pay/renewal"), env, ctx);
  const html = await response.text();
  assert.ok(html.includes("MMD_RENEWX_20260620b"), "data-build should be MMD_RENEWX_20260620b");
});

test("hero images present in HTML", async () => {
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/pay/renewal"), env, ctx);
  const html = await response.text();
  assert.ok(html.includes("Hero%20renew43.webp"), "missing desktop hero");
  assert.ok(html.includes("Hero%20Renew%20Mob.webp"), "missing mobile hero");
});
