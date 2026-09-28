import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = await readFile(new URL("./profiles-r2-catalog.js", import.meta.url), "utf8");
const booking = await readFile(new URL("../booking/booking-v4.html", import.meta.url), "utf8");
const admin = await readFile(new URL("../../admin-worker/src/index.js", import.meta.url), "utf8");

const packageKeys = ["gallery_with_me", "creative_city", "creative_day"];

test("Creative Companion packages are visible from Profiles and lock to booking", () => {
  assert.match(catalog, /data-creative-packages/);
  assert.match(catalog, /shared-interest companion.*ไม่ใช่ช่างภาพ.*usage rights/);
  for (const key of packageKeys) assert.match(catalog, new RegExp(`package=${key}`));
  assert.match(catalog, /activeRole !== "creative_companion"/);
});

test("Creative booking handoff remains a shared-interest activity", () => {
  assert.match(booking, /data-service="Creative Companion"/);
  assert.match(booking, /if \(role === "creative_companion"\) \{[\s\S]*service = "Creative Companion"/);
  assert.match(booking, /not professional creative service/);
  for (const key of packageKeys) assert.match(booking, new RegExp(`${key}: \\{[\\s\\S]*role: "creative_companion"`));
});

test("Creative payout projection recognizes every package key", () => {
  for (const key of packageKeys) assert.match(admin, new RegExp(`${key}: \\{ overtime_before_midnight_payout_thb_per_hour: 1000`));
});
