import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./legacy-payment-route-bridge-v1.js", import.meta.url), "utf8");

function resolve(urlString) {
  const url = new URL(urlString);
  let replaced = "";
  const location = {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    origin: url.origin,
    replace(value) { replaced = value; },
  };
  const window = {};
  vm.runInNewContext(source, { window, location, URL, URLSearchParams });
  return { replaced, bridge: window.MMDLegacyPaymentRouteBridgeV1 || null };
}

test("renew alias preserves signed authority by handing off directly to canonical private payment", () => {
  const signed = resolve("https://mmdbkk.com/sigil/pay/renew?t=signed&src=legacy#proof");
  assert.equal(signed.replaced, "/sigil/pay?t=signed");

  const unsigned = resolve("https://mmdbkk.com/sigil/pay/renew?src=legacy#proof");
  assert.equal(unsigned.replaced, "/sigil/member/membership?intent=renew&src=legacy#proof");
});

test("signed SIGIL membership alias goes only to canonical signed private payment route", () => {
  const out = resolve("https://mmdbkk.com/sigil/pay/membership?t=signed&amount=999999&account=bad");
  assert.equal(out.replaced, "/sigil/pay?t=signed");
  assert.equal(out.bridge?.canonical, true);
  assert.equal(out.bridge?.updated, "2026-09-19");
});

test("/pay/membership is a real public membership entry and is not hijacked by the legacy bridge", () => {
  const out = resolve("https://mmdbkk.com/pay/membership?package=elite");
  assert.equal(out.replaced, "");
  assert.equal(out.bridge, null);
});

test("unsigned SIGIL membership alias returns to private membership entry and strips money authority params", () => {
  const out = resolve("https://mmdbkk.com/sigil/pay/membership?plan=premium&code=ABC&amount=2999&payment_ref=fake&session_id=fake#join");
  assert.equal(out.replaced, "/sigil/member/membership?plan=premium&code=ABC#join");
});

test("unsigned membership alias forwards only approved entry context", () => {
  const out = resolve("https://mmdbkk.com/sigil/pay/membership?plan=elite&package=care&tier=private&code=C1&promo=P1&src=line&campaign=care-back&from=my-mmd&amount=999999&bank=bad");
  assert.equal(out.replaced, "/sigil/member/membership?plan=elite&package=care&tier=private&code=C1&promo=P1&src=line&campaign=care-back&from=my-mmd");
});

test("retired generic payment route requires signed token or falls back to member payment hub", () => {
  assert.equal(resolve("https://mmdbkk.com/sigil/pay/payment?t=signed&amount=4200").replaced, "/sigil/pay?t=signed");
  assert.equal(resolve("https://mmdbkk.com/sigil/pay/payment?amount=4200").replaced, "/member/payments");
});

test("bridge contains no payment destination or browser amount authority", () => {
  for (const forbidden of ["promptpay.io", "0829528889", "233-2-98800-1", "amount_due_thb", "/v1/pay/verify", "/api/verify-payment"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
