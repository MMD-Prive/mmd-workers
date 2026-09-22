import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./model-money-lane-v1.html", import.meta.url), "utf8");

test("Create Job distinguishes Public Money from Private Money", () => {
  assert.match(source, /PUBLIC MONEY · Package \/ Session/);
  assert.match(source, /PRIVATE MONEY · Case Locked/);
  assert.match(source, /NO PUBLIC MATRIX/);
  assert.match(source, /ไม่ดึงราคา Package, OT หรือ After Midnight ของ Public มาใช้/);
});

test("Confidential handling is separate from the money lane", () => {
  assert.match(source, /Confidential handling/);
  assert.match(source, /ไม่เปลี่ยน PUBLIC MONEY เป็น PRIVATE MONEY อัตโนมัติ/);
  assert.match(source, /confidential_handling/);
});

test("only active Driver and Culinary packages are selectable", () => {
  for (const key of [
    "pick_me_up",
    "airport_please",
    "wait_for_me",
    "half_day_with_him",
    "cook_with_me",
    "dinner_made_for_you",
    "market_to_table",
    "private_table",
  ]) assert.match(source, new RegExp(key));

  assert.doesNotMatch(source, /night_out|day_off_short|day_off_full_day|own_the_night/);
});

test("Create Job sends scoped model money context without reusing Membership package_code", () => {
  assert.match(source, /searchParams\.set\('model_work_lane'/);
  assert.match(source, /searchParams\.set\('model_package_code'/);
  assert.match(source, /searchParams\.set\('confidential_handling'/);
  assert.doesNotMatch(source, /searchParams\.set\(['"]package_code/);
});

test("Public package selection fills separate customer and worker amounts", () => {
  assert.match(source, /price:1490,payout:900/);
  assert.match(source, /price:1890,payout:1100/);
  assert.match(source, /price:1990,payout:1250/);
  assert.match(source, /setField\('price',item\.price\)/);
  assert.match(source, /setField\('modelPayout',item\.payout\)/);
});
