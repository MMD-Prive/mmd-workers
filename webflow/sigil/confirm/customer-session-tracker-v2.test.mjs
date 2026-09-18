import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./customer-session-tracker-v2.js", import.meta.url), "utf8");

test("customer tracker polls the same signed confirmation link and renders final payment", () => {
  assert.match(source, /POLL_MS\s*=\s*25000/);
  assert.match(source, /\/v1\/confirm\/details/);
  assert.match(source, /payment\.stage === "final"/);
  assert.match(source, /ยอดคงเหลือ/);
  assert.match(source, /data-final-payment/);
});

test("final proof upload keeps evidence pending until official verification", () => {
  assert.match(source, /\/v1\/pay\/slip\/evidence/);
  assert.match(source, /form\.append\("payment_ref", paymentRef\)/);
  assert.match(source, /form\.append\("payment_stage", "final"\)/);
  assert.match(source, /form\.append\("source_page", "job_confirmation"\)/);
  assert.match(source, /รับหลักฐานแล้ว · MMD กำลังตรวจยอด/);
  assert.match(source, /ชำระยอดคงเหลือเรียบร้อย · Model สามารถเริ่มงานได้/);
  assert.doesNotMatch(source, /proof_received\)\s*\{[^}]*ชำระยอดคงเหลือเรียบร้อย/s);
});
