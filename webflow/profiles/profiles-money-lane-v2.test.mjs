import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./profiles-money-lane-v2.js", import.meta.url), "utf8");

test("money lane runtime keeps Confidential separate from Private Money", () => {
  assert.match(source, /ไม่ได้เปลี่ยนงานเป็น Private Money อัตโนมัติ/);
  assert.match(source, /Confidential controls disclosure only/);
  assert.match(source, /Confidential 只控制信息披露/);
  assert.match(source, /PUBLIC MONEY หรือ PRIVATE MONEY/);
  assert.match(source, /CONFIDENTIAL ≠ PRIVATE MONEY/);
});

test("money lane runtime follows the Profiles language state", () => {
  assert.match(source, /document\.documentElement\.lang/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /\[data-lang\]/);
});

test("money lane runtime does not expose financial internals", () => {
  assert.doesNotMatch(source, /customer_amount_due_thb|customer_sell_rate_thb|margin_thb|commission_thb|payment_ref|bank_account/);
});
