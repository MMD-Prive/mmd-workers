import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./confidential-money-lane-note-v1.html", import.meta.url), "utf8");

test("confidential work is explicitly separate from the money lane", () => {
  assert.match(source, /Confidential ไม่ได้แปลว่า Private Money โดยอัตโนมัติ/);
  assert.match(source, /PUBLIC MONEY/);
  assert.match(source, /PRIVATE MONEY/);
  assert.match(source, /MMD MODEL จะแสดงประเภทเงินและเรทถึงตัว/);
});

test("copy supports Thai English and Chinese", () => {
  assert.match(source, /MONEY LANE · ระบุในทุกข้อเสนอ/);
  assert.match(source, /Confidential does not automatically mean Private Money/);
  assert.match(source, /Confidential 并不自动等同于 Private Money/);
  assert.match(source, /MutationObserver/);
});
