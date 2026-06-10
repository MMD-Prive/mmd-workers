import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://sigil.mmdbkk.com",
  TURNSTILE_SITE_KEY: "test_turnstile_site_key",
};

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
  'name="payment_type" value="renewal"',
  'name="selected_package"',
  'name="payment_method"',
  'name="session_id"',
  'name="payment_ref"',
  'name="transaction_ref"',
  'name="cf_turnstile_response"',
  'name="proof" accept="image/*,.pdf" required',
  'name="t"',
];

const banned = [
  "PromptPay",
  "082-952-8889",
  "TTB",
  "233-2-98800-1",
  "KTB",
  "Krungthai",
  "1420335898",
  "PayPal",
  "8034847793",
];

for (const path of ["/pay/renewal", "/pay/renewal/", "/sigil/pay/renewal", "/sigil/pay/renewal/"]) {
  test(`SIGIL renewal page ${path} renders Kenji public proof contract`, async () => {
    const response = await worker.fetch(new Request(`https://sigil.mmdbkk.com${path}`), env, {});
    const html = await response.text();
    const shouldRedirect = path === "/sigil/pay/renewal" || path === "/sigil/pay/renewal/" || path === "/pay/renewal/";

    assert.equal(response.status, shouldRedirect ? 301 : 200);

    if (response.status === 301) {
      assert.equal(response.headers.get("location"), "https://sigil.mmdbkk.com/pay/renewal");
      const followed = await worker.fetch(
        new Request(response.headers.get("location")),
        env,
        {},
      );
      assert.equal(followed.status, 200);
      const followedHtml = await followed.text();
      for (const marker of required) assert.ok(followedHtml.includes(marker), `missing ${marker}`);
      for (const marker of banned) assert.ok(!followedHtml.includes(marker), `must not expose ${marker}`);
      return;
    }

    for (const marker of required) assert.ok(html.includes(marker), `missing ${marker}`);
    for (const marker of banned) assert.ok(!html.includes(marker), `must not expose ${marker}`);
  });
}

test("SIGIL renewal page preserves t query param", async () => {
  const response = await worker.fetch(
    new Request("https://sigil.mmdbkk.com/pay/renewal?t=test123"),
    env,
    {},
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.ok(html.includes('name="t" value="test123"'));
});
