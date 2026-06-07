import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://sigil.mmdbkk.com",
  TURNSTILE_SITE_KEY: "test_turnstile_site_key",
};

test("SIGIL renewal page renders locked TTB transfer details and proof contract", async () => {
  const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/pay/renewal"), env, {});
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Renew Membership/);
  assert.match(html, /TTB/);
  assert.match(html, /ธัชชะ ป/);
  assert.match(html, /233-2-98800-1/);
  assert.doesNotMatch(html, /KTB|Krungthai|1420335898/);

  assert.ok(
    html.includes('"endpoint":"/api/pay/renewal/proof"') ||
      html.includes("POST /api/pay/renewal/proof"),
    "renders renewal proof endpoint contract",
  );
  assert.match(html, /name="payment_type" value="renewal"/);
  assert.match(html, /name="selected_package"/);
  assert.match(html, /name="payment_method"/);
  assert.match(html, /name="session_id"/);
  assert.match(html, /name="payment_ref"/);
  assert.match(html, /name="transaction_ref"/);
  assert.match(html, /name="cf_turnstile_response"/);
  assert.match(html, /name="proof" type="file"/);
  assert.match(html, /ส่งสลิป = แจ้งว่าชำระแล้ว ยังไม่ใช่การยืนยันสำเร็จทันที/);
});
