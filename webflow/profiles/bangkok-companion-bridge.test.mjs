import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const booking=await readFile(new URL("../booking/booking-v4.html",import.meta.url),"utf8");
const admin=await readFile(new URL("../../admin-worker/src/index.js",import.meta.url),"utf8");

test("Bangkok Companion booking handoff is wired",()=>{
  for(const key of ["bangkok_with_me","local_bangkok","your_bangkok_day"]) assert.match(booking,new RegExp(key));
  assert.match(booking,/data-service="Bangkok Companion"/);
  assert.match(booking,/Companion ทั่วไปไม่ใช่ Licensed Tour Guide/);
});

test("admin payout projection recognizes Bangkok Companion package keys",()=>{
  for(const key of ["bangkok_with_me","local_bangkok","your_bangkok_day"]) assert.match(admin,new RegExp(key+": \\{"));
  assert.match(admin,/bangkok_with_me: \{ overtime_before_midnight_payout_thb_per_hour: 800, overtime_after_midnight_payout_thb_per_hour: 1100, overtime_after_0300_payout_thb_per_hour: 1300/);
});
