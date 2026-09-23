import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./business-companion-packages-v1.json", import.meta.url), "utf8"));

test("Business Companion public prices and payouts are locked", () => {
  assert.deepEqual(config.public_packages.map((item) => [item.key, item.price_thb, item.worker_payout_thb]), [
    ["business_lunch", 6500, 3000],
    ["smart_presence", 10500, 5000],
    ["context_day", 16500, 8000],
  ]);
  assert.equal(config.money_lane, "public_model");
});

test("Business Companion remains a presence package, never a representative", () => {
  const safety = config.safety_scope;
  assert.equal(config.positioning, "smart_casual_business_presence_not_employee_agent_or_professional_representative");
  assert.equal(safety.employee_or_staff_service_included, false);
  assert.equal(safety.agency_or_negotiation_representation_included, false);
  assert.equal(safety.authority_to_commit_or_sign_on_customer_behalf, false);
  assert.equal(safety.professional_advice_or_service_included, false);
});

test("Business Companion has explicit public-only extension policy", () => {
  const rules = config.public_extension_rules;
  assert.equal(rules.overtime_before_midnight_client_thb_per_hour, 1990);
  assert.equal(rules.overtime_before_midnight_worker_thb_per_hour, 1200);
  assert.equal(rules.overtime_after_midnight_client_thb_per_hour, 2490);
  assert.equal(rules.overtime_after_0300_client_thb_per_hour, 2990);
  assert.equal(rules.no_double_charge_same_minute, true);
  assert.match(config.private_money_separation, /never apply automatically/);
});
