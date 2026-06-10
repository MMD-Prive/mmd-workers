import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

const env = { TURNSTILE_SITE_KEY: "0xTEST" };
const ctx = {};

const required = [
  "Renew with Kenji",
  "mmd-renewal-kenji-public",
  "/api/pay/renewal/proof",
  "Krungsri",
  "Tatcha",
  "Security Check",
  "สลิปยังไม่ใช่การยืนยันสำเร็จ",
  "Signup",
  "Renewal",
  "Black Card Review",
  "payment_type",
  "selected_package",
  "payment_method",
  "session_id",
  "payment_ref",
  "transaction_ref",
  "cf_turnstile_response",
  'name="t"',
];

const banned = [
  "8034847793",
  "PromptPay",
  "TTB",
  "233-2-98800-1",
  "082-952-8889",
  "PayPal",
  "Krungthai",
  "KTB",
  "1420335898",
];

for (const path of ["/sigil/pay/renewal", "/sigil/pay/renewal/", "/pay/renewal"]) {
  test(`GET ${path} renders the Kenji renewal page`, async () => {
    const response = await worker.fetch(new Request(`https://www.mmdbkk.com${path}`), env, ctx);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");

    const html = await response.text();
    for (const marker of required) assert.ok(html.includes(marker), `missing ${marker}`);
    for (const marker of banned) assert.ok(!html.includes(marker), `must not expose ${marker}`);
  });
}

test("GET /sigil/pay/renewal preserves t query param", async () => {
  const response = await worker.fetch(
    new Request("https://www.mmdbkk.com/sigil/pay/renewal?t=test123"),
    env,
    ctx
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('name="t" value="test123"'));
});

test("HEAD /sigil/pay/renewal returns headers only", async () => {
  const response = await worker.fetch(
    new Request("https://www.mmdbkk.com/sigil/pay/renewal", { method: "HEAD" }),
    env,
    ctx
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});
