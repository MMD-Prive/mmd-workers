import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const paymentBinding = readFileSync(new URL("../src/liff-payment-binding.js", import.meta.url), "utf8");

test("member-pages-worker remains service-only for production payment/member browser routes", () => {
  assert.match(wrangler, /^routes\s*=\s*\[\s*\]/m);
  for (const forbidden of [
    'pattern = "mmdbkk.com/pay/membership',
    'pattern = "www.mmdbkk.com/pay/membership',
    'pattern = "mmdbkk.com/sigil/pay/membership',
    'pattern = "www.mmdbkk.com/sigil/pay/membership',
    'pattern = "mmdbkk.com/sigil/member/membership',
    'pattern = "www.mmdbkk.com/sigil/member/membership',
  ]) {
    assert.equal(wrangler.includes(forbidden), false, forbidden);
  }
});

test("verified LIFF payment binding hands off only to signed canonical /sigil/pay", () => {
  assert.match(paymentBinding, /\/member\/api\/liff\/payment-intent/);
  assert.match(paymentBinding, /\/v1\/pay\/verify/);
  assert.match(paymentBinding, /url\.pathname\s*!==\s*["']\/sigil\/pay["']/);
  assert.match(paymentBinding, /url\.searchParams\.get\(["']t["']\)/);
  assert.match(paymentBinding, /url\.searchParams\.keys\(\)\]\s*\.some|searchParams\.keys\(\)\]\.some/);
  assert.match(paymentBinding, /selected\.amount_thb/);
  assert.doesNotMatch(paymentBinding, /browserBody\?\.amount|browserBody\.amount/);
});

test("LIFF payment binding contains no browser-owned payment destination", () => {
  for (const forbidden of [
    "promptpay.io",
    "0829528889",
    "233-2-98800-1",
    "data-promptpay-base",
  ]) {
    assert.equal(paymentBinding.includes(forbidden), false, forbidden);
  }
});
