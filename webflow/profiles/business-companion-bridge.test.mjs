import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = await readFile(new URL("./profiles-r2-catalog.js", import.meta.url), "utf8");
const booking = await readFile(new URL("../booking/booking-v4.html", import.meta.url), "utf8");
const admin = await readFile(new URL("../../admin-worker/src/index.js", import.meta.url), "utf8");

const packageKeys = ["business_lunch", "smart_presence", "context_day"];

test("Business Companion packages are visible from Profiles and lock to booking", () => {
  assert.match(catalog, /data-business-packages/);
  assert.match(catalog, /ไม่ใช่พนักงานบริษัท.*ตัวแทนเจรจา.*เซ็นเอกสาร/);
  for (const key of packageKeys) assert.match(catalog, new RegExp(`package=${key}`));
  assert.match(catalog, /activeRole !== "business_companion"/);
});

test("Business booking handoff keeps the Model out of professional representation", () => {
  assert.match(booking, /data-service="Business Companion"/);
  assert.match(booking, /if \(role === "business_companion"\) \{[\s\S]*service = "Business Companion"/);
  assert.match(booking, /not an employee, representative or signatory/);
  for (const key of packageKeys) assert.match(booking, new RegExp(`${key}: \\{[\\s\\S]*role: "business_companion"`));
});

test("Business payout projection recognizes every premium package key", () => {
  for (const key of packageKeys) assert.match(admin, new RegExp(`${key}: \\{ overtime_before_midnight_payout_thb_per_hour: 1200`));
});
