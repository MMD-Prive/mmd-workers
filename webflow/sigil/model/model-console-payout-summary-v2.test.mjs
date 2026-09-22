import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./model-console-payout-summary-v2.html", import.meta.url), "utf8");

test("payout summary accepts canonical model payout and terms", () => {
  assert.match(source, /expected_payout_thb\?\?session\.pay_model_thb/);
  assert.match(source, /session&&session\.payout_terms/);
  assert.match(source, /PAYOUT SUMMARY · คุณได้รับ/);
  assert.match(source, /เวลาจบที่ MMD ยืนยัน/);
});

test("payout summary distinguishes Public and Private money systems", () => {
  assert.match(source, /PUBLIC MONEY · PACKAGE \/ SESSION/);
  assert.match(source, /PRIVATE MONEY · CASE LOCKED/);
  assert.match(source, /ไม่ใช้ราคา Package, OT หรือ After Midnight Matrix ของ Public โดยอัตโนมัติ/);
  assert.match(source, /MMD ออกเรท Private ของเคสใหม่และยืนยันก่อน/);
});

test("payout summary explains official extension boundary", () => {
  assert.match(source, /MY MMD → คุณกด Approve ใน MMD MODEL → MMD ยืนยัน/);
  assert.match(source, /OT หลัง 00:00/);
  assert.match(source, /OT หลัง 03:00/);
});

test("payout summary does not expose customer pricing or MMD margin", () => {
  assert.doesNotMatch(source, /customer_sell_rate_thb|customer_amount_due_thb|margin_thb|commission_thb/);
});
