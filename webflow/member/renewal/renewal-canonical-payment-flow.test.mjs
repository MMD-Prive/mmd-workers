import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../global/mmd-canonical-cta-v4.js", import.meta.url), "utf8");

test("renewal UI derives current tier from verified member session and creates signed payment intent", () => {
  assert.match(source, /\/member\/api\/liff\/profile/);
  assert.match(source, /\/member\/api\/liff\/intent/);
  assert.match(source, /\/member\/api\/liff\/package/);
  assert.match(source, /\/member\/api\/liff\/payment-intent/);
  assert.match(source, /payment_stage:\s*"renewal"/);
  assert.match(source, /canonicalPaymentUrl/);
  assert.match(source, /url\.pathname !== "\/sigil\/pay"/);
});

test("renewal UI removes the manual bank section and never asks customer to choose a different private tier", () => {
  assert.match(source, /root\.dataset\.renewalSimple = "1"/);
  assert.match(source, /legacyPay\.hidden = true/);
  assert.match(source, /legacyPaymentLink\.removeAttribute\("href"\)/);
  assert.match(source, /if \(anchorTier !== tier\)/);
  assert.match(source, /card\.hidden = true/);
  assert.match(source, /ระบบจะใช้ประวัติที่ยืนยันแล้วใน 365 วันเพื่อคำนวณอัตราที่ถูกต้อง/);
});

test("Premium renewal presentation keeps the canonical two-year term", () => {
  assert.match(source, /สมัครใหม่ 2,999 บาท \/ 2 ปี/);
});
