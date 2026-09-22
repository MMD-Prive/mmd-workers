import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./profiles-money-lane-clarity-v1.js", import.meta.url), "utf8");

test("confidential is disclosure handling, not automatic Private Money", () => {
  assert.match(source, /Confidential คือการซ่อนรายละเอียดงาน ไม่ได้เปลี่ยนระบบเงินอัตโนมัติ/);
  assert.match(source, /งาน Public ใช้ Public Money/);
  assert.match(source, /งาน Private ใช้เรทเฉพาะเคสที่ MMD ยืนยันและล็อกให้เท่านั้น/);
});

test("copy exists in TH EN ZH and stays scoped to Profiles", () => {
  assert.match(source, /Confidential controls disclosure, not the money lane/);
  assert.match(source, /Confidential 只控制信息披露/);
  assert.match(source, /#mmdProfilesV8 \.mp8-confidential-talent/);
  assert.match(source, /data-money-lane-note/);
});
