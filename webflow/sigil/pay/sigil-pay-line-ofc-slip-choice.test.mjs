import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./sigil-pay-line-ofc-slip-choice.js", import.meta.url), "utf8");
const html = readFileSync(new URL("./sigil-pay-v21.html", import.meta.url), "utf8");
const runtime = readFileSync(new URL("./sigil-pay-v21.js", import.meta.url), "utf8");

test("SIGIL Pay keeps three server-gated payment methods and web proof upload", () => {
  for (const method of ["promptpay", "bank_transfer", "paypal_card"]) {
    assert.match(html, new RegExp('data-sp21-method="'+method+'"'));
  }
  assert.match(runtime, /\/v1\/confirm\/payment-instructions/);
  assert.match(runtime, /\/v1\/pay\/slip\/evidence/);
  assert.match(runtime, /data\.role!=="customer"/);
  assert.match(runtime, /fd\.append\("t",token\)/);
  assert.match(runtime, /fd\.append\("file",proofFile\)/);
});

test("LINE OFC is a clearly separate payment proof option only in the proof form", () => {
  assert.match(source, /ROOT = "sigil-pay-v21"/);
  assert.match(source, /proof\?\.querySelector\("\[data-sp21-proof-form\]"\)/);
  assert.match(source, /form\.querySelector\("\[data-sp21-line-slip-choice\]"\)/);
  assert.match(source, /https:\/\/lin\.ee\/xRqsALs/);
  assert.match(source, /ส่งสลิปทาง LINE OFC/);
  assert.match(source, /ส่งครั้งเดียว ไม่ต้องอัปโหลดซ้ำสองทาง/);
  assert.doesNotMatch(source, /LINE_OFC_URL\s*\+|LINE_OFC_URL\s*\.searchParams|link\.href\s*=\s*.*token/);
});

test("LINE slip link never settles a Payment or exposes signed customer tokens", () => {
  assert.doesNotMatch(source, /fetch\s*\(|payment_ref|location\.search|searchParams|pay\/slip\/evidence/);
  assert.match(source, /ระบบจะพยายามผูกหลักฐาน/);
  assert.match(source, /รอตรวจสอบจนกว่าจะยืนยันยอด/);
});
