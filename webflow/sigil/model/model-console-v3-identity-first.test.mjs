import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(import.meta.dirname, "model-console-v3-i18n.js"), "utf8");

test("Model Console renews verified LINE identity before rendering a session-expired dead end", () => {
  assert.match(source, /new Set\(\["\/v1\/model\/session\/current","\/v1\/model\/session\/action"\]\)/);
  assert.match(source, /"\/v1\/model\/liff\/exchange"/);
  assert.match(source, /l\.init\(\{liffId:/);
  assert.match(source, /JSON\.stringify\(\{id_token:l\.getIDToken\(\),environment:/);
  assert.match(source, /u\.searchParams\.delete\("t"\)/);
  assert.match(source, /return F\(q,b\)/);
  assert.match(source, /x\.status===401/);
  assert.match(source, /model_session_\(required\|invalid\|expired\)/);
  assert.doesNotMatch(source, /x\.status==401\|\|x\.status==403/);
  assert.match(source, /setTimeout\(q\)/);
});

test("Model Console gives a LINE-return action instead of instructing the model to reopen HYPE", () => {
  assert.match(source, /ยืนยัน LINE เพื่อกลับเข้างาน/);
  assert.match(source, /ยืนยัน LINE แล้วกลับเข้างาน/);
  assert.match(source, /ระบบจะกลับไปที่งานเดิมให้อัตโนมัติ/);
});

test("Model Console renders only the authenticated model payout returned by the server", () => {
  assert.match(source, /session\?\.pay_model_thb/);
  assert.match(source, /data-model-payout-row/);
  assert.match(source, /เรทถึงตัว/);
  assert.match(source, /currency:\"THB\"/);
  assert.doesNotMatch(source, /customer_amount_due_thb/);
});
