import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source=await readFile(new URL("../../admin-worker/src/index.js",import.meta.url),"utf8");

test("admin payout projection recognizes Social Appearance package keys",()=>{
  for(const key of ["dinner_guest","event_partner","formal_evening"]) assert.match(source,new RegExp(key+": \\{"));
  assert.match(source,/dinner_guest: \{ overtime_before_midnight_payout_thb_per_hour: 850, overtime_after_midnight_payout_thb_per_hour: 1200, overtime_after_0300_payout_thb_per_hour: 1400/);
});
