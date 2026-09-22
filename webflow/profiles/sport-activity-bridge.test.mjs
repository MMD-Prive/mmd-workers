import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = await readFile(new URL("./profiles-r2-catalog.js", import.meta.url), "utf8");
const booking = await readFile(new URL("../booking/booking-v4.html", import.meta.url), "utf8");
const admin = await readFile(new URL("../../admin-worker/src/index.js", import.meta.url), "utf8");

const packageKeys = ["move_with_me", "game_day", "active_day"];

test("Sport Activity packages are visible from Profiles and lock to booking", () => {
  assert.match(catalog, /data-sport-packages/);
  assert.match(catalog, /activity_companion_not_personal_trainer_or_therapist|Personal Trainer, Therapist/);
  for (const key of packageKeys) assert.match(catalog, new RegExp(`package=${key}`));
  assert.match(catalog, /activeRole !== "sport_activity"/);
});

test("Sport Activity booking handoff stays in the Sport Activity service lane", () => {
  assert.match(booking, /data-service="Sport Activity"/);
  assert.match(booking, /if\(role==='sport_activity'\)\{service='Sport Activity'/);
  assert.match(booking, /not Personal Training or therapy/);
  for (const key of packageKeys) assert.match(booking, new RegExp(`${key}:\\{role:'sport_activity'`));
});

test("admin payout projection recognizes every Sport Activity package key", () => {
  for (const key of packageKeys) assert.match(admin, new RegExp(`${key}: \\{ overtime_before_midnight_payout_thb_per_hour: 650`));
});
