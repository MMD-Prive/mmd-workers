import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./personalized-benefits.js", import.meta.url), "utf8");

test("wish bridge reads only trusted same-site CARE BACK contracts", () => {
  assert.match(source, /\/member\/api\/liff\/care-back\/state/);
  assert.match(source, /\/member\/api\/liff\/care-back\/wallet/);
  assert.match(source, /credentials:\s*"same-origin"/);
  assert.doesNotMatch(source, /Promise\.all/);
  assert.doesNotMatch(source, /line_user_id|member_id|localStorage|sessionStorage|getProfile\(/);
});

test("wish bridge points sign-in to the canonical Member Status Mini App CTA", () => {
  assert.match(source, /https:\/\/miniapp\.line\.me\/2010862595-yT4DCEMc\?liff\.state=%2Fmember%2Fliff%3Fintent%3Dstatus/);
  assert.match(source, /ตรวจสิทธิ์ของฉันผ่าน LINE/);
  assert.doesNotMatch(source, /https:\/\/liff\.line\.me\/2010862595-yT4DCEMc\?intent=promo&campaign=care_back/);
  assert.doesNotMatch(source, /เปิด CARE BACK ใน LINE/);
  assert.doesNotMatch(source, /2010298002-mbx9kqQn/);
});

test("wish bridge renders customer text without innerHTML", () => {
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotThrow(() => new Function(source));
});

test("Wish completion refreshes Benefits and Wallet through the existing sequential loader", () => {
  assert.match(source, /mmd:care-back:wish-completed/);
  assert.match(source, /loadPersonalState\(\)/);
  assert.doesNotMatch(source, /Promise\.all/);
});
