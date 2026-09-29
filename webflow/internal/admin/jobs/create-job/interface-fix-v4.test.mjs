import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const patchPath = new URL("./interface-fix-v3.js", import.meta.url);

test("Create Job output labels payment URL before held Model URL", async () => {
  const js = await readFile(patchPath, "utf8");
  assert.match(js, /Customer Payment URL \/ ลิงก์ชำระเงินลูกค้า/);
  assert.match(js, /Model URL \/ ออกหลัง Official Verify/);
  assert.match(js, /ส่งลิงก์นี้ให้ลูกค้าชำระเงินก่อน/);
  assert.match(js, /หน้า Create Job ไม่ปล่อย Model URL ก่อนสลิปผ่าน/);
});

test("Create Job success copy no longer says customer and model URLs are both ready", async () => {
  const js = await readFile(patchPath, "utf8");
  assert.match(js, /Customer Payment URL พร้อมส่ง · Model URL จะออกหลัง Official Verify/);
  assert.doesNotMatch(js, /มี URL ลูกค้าและนายแบบด้านล่าง','/);
});
