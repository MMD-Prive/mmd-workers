import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./wellness-companion-packages-v1.json", import.meta.url), "utf8"));

test("Wellness Companion public prices and payouts are locked", () => {
  assert.deepEqual(config.public_packages.map((item) => [item.key, item.price_thb, item.worker_payout_thb]), [
    ["reset_with_me", 5000, 3000],
    ["wellness_day", 8500, 5000],
    ["slow_reset", 13500, 8000],
  ]);
  assert.equal(config.money_lane, "public_model");
});

test("Wellness Companion stays separate from professional and MMS services", () => {
  const safety = config.safety_scope;
  assert.equal(config.positioning, "healthy_lifestyle_companion_not_personal_trainer_therapist_or_mms");
  assert.equal(safety.personal_training_included, false);
  assert.equal(safety.therapy_or_recovery_treatment_included, false);
  assert.equal(safety.massage_included, false);
  assert.equal(safety.medical_or_injury_advice_included, false);
  assert.equal(safety.mms_wellness_route_required_for_massage_or_recovery_service, true);
});

test("Wellness Companion has explicit public-only extension policy", () => {
  const rules = config.public_extension_rules;
  assert.equal(rules.overtime_before_midnight_client_thb_per_hour, 1690);
  assert.equal(rules.overtime_before_midnight_worker_thb_per_hour, 1000);
  assert.equal(rules.overtime_after_midnight_client_thb_per_hour, 2190);
  assert.equal(rules.overtime_after_0300_client_thb_per_hour, 2690);
  assert.equal(rules.no_double_charge_same_minute, true);
  assert.match(config.private_money_separation, /never apply automatically/);
});
