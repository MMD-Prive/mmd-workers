import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(import.meta.dirname, "model-console-v3-i18n.js"), "utf8");

test("Model Console renews verified LINE identity before rendering a session-expired dead end", () => {
  assert.match(source, /C="\/v1\/model\/session\/current"/);
  assert.match(source, /"\/v1\/model\/liff\/exchange"/);
  assert.match(source, /l\.init\(\{liffId:/);
  assert.match(source, /JSON\.stringify\(\{id_token:l\.getIDToken\(\),environment:/);
  assert.match(source, /if\(await A\(\)\)return F\(a,b\)/);
  assert.match(source, /x\.status===401/);
  assert.match(source, /model_session_\(required\|invalid\|expired\)/);
  assert.doesNotMatch(source, /x\.status==401\|\|x\.status==403/);
});

test("Model Console gives a LINE-return action instead of instructing the model to reopen HYPE", () => {
  assert.match(source, /ยืนยัน LINE เพื่อกลับเข้างาน/);
  assert.match(source, /ยืนยัน LINE แล้วกลับเข้างาน/);
  assert.match(source, /ระบบจะกลับไปที่งานเดิมให้อัตโนมัติ/);
});
