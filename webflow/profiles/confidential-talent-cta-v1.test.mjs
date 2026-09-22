import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./confidential-talent-cta-v1.html", import.meta.url), "utf8");

test("public profile page offers a controlled confidential-work path", () => {
  assert.match(source, /FOR MMD PROFILES · CONFIDENTIAL WORK/);
  assert.match(source, /https:\/\/t\.me\/mmdapply/);
  assert.match(source, /MMD MODEL ACCEPTANCE/);
  assert.match(source, /เรทถึงตัวจะไม่แสดงบนหน้า Public/);
});

test("Confidential disclosure never silently becomes Private Money", () => {
  assert.match(source, /Confidential เป็นเพียงรูปแบบการปกปิดรายละเอียดงาน/);
  assert.match(source, /ไม่ได้เปลี่ยนงานเป็น Private Money อัตโนมัติ/);
  assert.match(source, /PUBLIC MONEY หรือ PRIVATE MONEY/);
  assert.match(source, /CONFIDENTIAL ≠ PRIVATE MONEY/);
  assert.match(source, /MONEY LANE SHOWN BEFORE ACCEPT/);
});

test("confidential CTA opens Telegram safely", () => {
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
});
