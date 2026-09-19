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

test("final payment reuses canonical SIGIL PAY and never owns a second proof uploader", () => {
  assert.match(source, /\/sigil\/pay\?t=/);
  assert.match(source, /data-final-pay-link/);
  assert.match(source, /ไม่ต้องส่งซ้ำ/);
  assert.match(source, /ชำระยอดคงเหลือเรียบร้อย · Model สามารถเริ่มงานได้/);
  assert.doesNotMatch(source, /\/v1\/pay\/slip\/evidence/);
  assert.doesNotMatch(source, /FormData\(/);
  assert.doesNotMatch(source, /data-final-proof-file/);
});
