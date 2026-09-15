import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./payment-instructions-v1.js", import.meta.url), "utf8");

const FORBIDDEN = [
  "promptpay.io/",
  "0829528889",
  "233-2-98800-1",
  "amount: 1199",
  "amount: 2999",
  "makeEvidenceId",
  "Date.now().toString(36)",
];

test("membership Webflow adapter consumes Payment Instructions v1 only", () => {
  assert.match(source, /mmd_payment_instructions_v1/);
  assert.match(source, /payments-worker/);
  assert.match(source, /\/v1\/confirm\/payment-instructions/);
  assert.match(source, /payload\.amount_due_thb/);
  assert.match(source, /promptpay\.qr_url/);
  assert.match(source, /bank\.account_number/);
  assert.match(source, /payload\.payment_ref/);
  assert.match(source, /payload\.session_id/);
});

test("membership adapter fails closed when signed token or canonical contract is unavailable", () => {
  assert.match(source, /if \(!token\)/);
  assert.match(source, /payload\.authority !== AUTHORITY/);
  assert.match(source, /payload\.schema !== SCHEMA/);
  assert.match(source, /submit\.disabled = true/);
  assert.match(source, /qr\.hidden = true/);
});

test("membership adapter contains no hard-coded payment destination or canonical amount table", () => {
  for (const marker of FORBIDDEN) {
    assert.equal(source.includes(marker), false, `Forbidden legacy payment authority found: ${marker}`);
  }
});
