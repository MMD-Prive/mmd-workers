import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./sport-activity-packages-v1.json", import.meta.url), "utf8"));

test("Sport Activity public prices and payouts are locked", () => {
  assert.deepEqual(config.public_packages.map((item) => [item.key, item.price_thb, item.worker_payout_thb]), [
    ["move_with_me", 3500, 2100],
    ["game_day", 5500, 3300],
    ["active_day", 8500, 5100],
  ]);
  assert.equal(config.money_lane, "public_model");
});

test("Sport Activity never makes a trainer, therapy, or medical claim", () => {
  const safety = config.safety_scope;
  assert.equal(config.positioning, "activity_companion_not_personal_trainer_or_therapist");
  assert.equal(safety.personal_training_included, false);
  assert.equal(safety.therapy_or_recovery_treatment_included, false);
  assert.equal(safety.medical_or_injury_advice_included, false);
  assert.equal(safety.mmd_must_confirm_model_activity_fit_and_availability, true);
});

test("Sport Activity has explicit public-only extension policy", () => {
  const rules = config.public_extension_rules;
  assert.equal(rules.overtime_before_midnight_client_thb_per_hour, 990);
  assert.equal(rules.overtime_after_midnight_client_thb_per_hour, 1490);
  assert.equal(rules.overtime_after_0300_client_thb_per_hour, 1790);
  assert.equal(rules.no_double_charge_same_minute, true);
  assert.match(config.private_money_separation, /never apply automatically/);
});
