import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const here = new URL(".", import.meta.url);
const [body, head, footer] = await Promise.all([
  readFile(new URL("./body.html", here), "utf8"),
  readFile(new URL("./head.html", here), "utf8"),
  readFile(new URL("./footer.html", here), "utf8"),
]);

test("SIGIL Pay v19 owns one scoped mobile-first root", () => {
  assert.match(body, /id="sigil-pay-v19"/);
  assert.match(body, /data-sp19/);
  assert.match(head, /#sigil-pay-v19/);
  assert.match(head, /@media\(min-width:700px\)/);
  assert.match(head, /FINAL MMD CONTRAST SAFETY LAYER/);
  assert.doesNotMatch(head, /(?:^|[,{]\s*)(?:body|h1|h2|button|input|textarea)\s*[{,]/m);
});

test("SIGIL Pay v19 hydrates full customer truth, never claims-only verify", () => {
  assert.match(body, /data-details-path="\/v1\/confirm\/details"/);
  assert.match(footer, /\/v1\/confirm\/details/);
  assert.doesNotMatch(footer, /\/v1\/confirm\/verify/);
  assert.match(footer, /authority!=="payments-worker"/);
  assert.match(footer, /schema!=="confirmation_details_v1"/);
  for (const hook of [
    "data-sp19-client",
    "data-sp19-model",
    "data-sp19-date",
    "data-sp19-time",
    "data-sp19-location",
    "data-sp19-net",
    "data-sp19-due",
  ]) {
    assert.match(body, new RegExp(hook));
  }
});

test("SIGIL Pay v19 restores all three server-authorized payment methods", () => {
  assert.match(body, /data-instructions-path="\/v1\/confirm\/payment-instructions"/);
  assert.match(footer, /\/v1\/confirm\/payment-instructions/);
  assert.match(footer, /schema!=="mmd_payment_instructions_v1"/);
  for (const method of ["promptpay", "bank_transfer", "paypal_card"]) {
    assert.match(body, new RegExp('data-sp19-method="' + method + '"'));
    assert.match(body, new RegExp('data-sp19-panel="' + method + '"'));
  }
  assert.match(body, /QR PromptPay/);
  assert.match(body, /โอนธนาคาร/);
  assert.match(body, /Credit \/ Debit Card/);
  assert.match(body, /PayPal/);
  assert.match(footer, /card\.fee_percent/);
  assert.match(footer, /bank\.account_number/);
  assert.match(footer, /pp\.qr_url/);
});

test("bank details use progressive disclosure and card destination stays server-returned", () => {
  assert.match(body, /data-sp19-account-number>••••••••••/);
  assert.match(body, /data-sp19-bank-reveal/);
  assert.match(body, /data-sp19-bank-copy disabled/);
  assert.match(footer, /instructions&&instructions\.bank_transfer&&instructions\.bank_transfer\.account_number/);
  assert.match(footer, /card\.enabled===true\?safeHttps\(card\.url\)/);
  assert.doesNotMatch(footer, /paypal\.com\/(?:checkout|pay)/i);
});

test("signed Webflow preview handoff preserves the canonical token/query", () => {
  assert.match(body, /data-canonical-origin="https:\/\/mmdbkk\.com"/);
  assert.match(footer, /host\.endsWith\("\.webflow\.io"\)/);
  assert.match(footer, /location\.pathname\+location\.search\+location\.hash/);
  assert.match(footer, /location\.replace\(target\)/);
  assert.doesNotMatch(footer, /params\.delete\(["']t["']\)/);
});

test("slip submission remains evidence-only and never declares payment verified", () => {
  assert.match(body, /data-proof-path="\/v1\/pay\/slip\/evidence"/);
  assert.match(body, /ยังไม่ถือว่าชำระสำเร็จจนกว่า MMD จะยืนยันยอด/);
  assert.match(footer, /source_page","sigil_pay_v19"/);
  assert.match(footer, /ได้รับสลิปแล้วครับ · เดี๋ยว MMD ดูแลต่อให้/);
  assert.match(footer, /กำลังตรวจสอบ/);
  assert.doesNotMatch(footer, /payment\.status\s*=\s*["']paid["']/);
  assert.doesNotMatch(footer, /verification_status\s*=\s*["']verified["']/);
});

test("SIGIL Pay v19 has no LIFF login dependency", () => {
  assert.doesNotMatch(body + head + footer, /liff\.login|liff\.init|static\.line-scdn\.net\/liff/i);
});
