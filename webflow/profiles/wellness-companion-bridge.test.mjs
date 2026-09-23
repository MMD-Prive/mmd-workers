import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = await readFile(new URL("./profiles-r2-catalog.js", import.meta.url), "utf8");
const booking = await readFile(new URL("../booking/booking-v4.html", import.meta.url), "utf8");
const admin = await readFile(new URL("../../admin-worker/src/index.js", import.meta.url), "utf8");

const packageKeys = ["reset_with_me", "wellness_day", "slow_reset"];

test("Wellness Companion packages are visible from Profiles and lock to booking", () => {
  assert.match(catalog, /data-wellness-packages/);
  assert.match(catalog, /MMS Wellness route แยก/);
  for (const key of packageKeys) assert.match(catalog, new RegExp(`package=${key}`));
  assert.match(catalog, /activeRole !== "wellness_companion"/);
});

test("Wellness booking handoff stays separate from training, therapy, and MMS", () => {
  assert.match(booking, /data-service="Wellness Companion"/);
  assert.match(booking, /if \(role === "wellness_companion"\) \{[\s\S]*service = "Wellness Companion"/);
  assert.match(booking, /not PT, therapy, massage or medical advice/);
  for (const key of packageKeys) assert.match(booking, new RegExp(`${key}: \\{[\\s\\S]*role: "wellness_companion"`));
});

test("Wellness payout projection protects the qualified-rate floor", () => {
  for (const key of packageKeys) assert.match(admin, new RegExp(`${key}: \\{ overtime_before_midnight_payout_thb_per_hour: 1000`));
});
