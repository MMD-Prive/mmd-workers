import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = new URL("./care-back-per-voice-v2.js", import.meta.url);

test("CARE BACK Existing Member cards use the owner-approved Verify +1Y rule", async () => {
  const js = await readFile(file, "utf8");

  assert.match(js, /currentBody:\s*"ถ้าเป็นสมาชิกเดิมและ Verify ผ่าน MY MMD เปอร์ต่อสมาชิกให้ 1 ปีจากวันหมดอายุจริง/);
  assert.match(js, /formerBody:\s*"ถ้าเคยเป็นสมาชิกแต่หมดอายุแล้ว Verify ผ่าน MY MMD จะได้สิทธิ์สมาชิก 1 ปีจากวันที่ Verify/);

  assert.match(js, /currentBody:\s*"Existing members who complete MY MMD Verify receive one year added from the verified current expiry/);
  assert.match(js, /formerBody:\s*"Former or expired members who complete MY MMD Verify receive one year from the Verify date/);

  assert.match(js, /currentBody:\s*"现有会员完成 MY MMD Verify 后，会从已核实的当前到期日增加 1 年/);
  assert.match(js, /formerBody:\s*"曾经或已过期会员完成 MY MMD Verify 后，会从 Verify 日期起获得 1 年会员期/);
});

test("legacy Existing Member Verify 180/90-day wording is not present in per-voice cards", async () => {
  const js = await readFile(file, "utf8");
  const current = js.match(/currentBody:\s*"([^"]+)"/g) || [];
  const former = js.match(/formerBody:\s*"([^"]+)"/g) || [];
  const cardCopy = [...current, ...former].join("\n");

  assert.doesNotMatch(cardCopy, /เพิ่มให้ 180 วัน|adds 180 days|增加 180 天/);
  assert.doesNotMatch(cardCopy, /รับเพิ่ม 90 วัน|\+90 days|增加 90 天/);
});
