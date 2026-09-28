import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./creative-companion-packages-v1.json", import.meta.url), "utf8"));

test("Creative Companion public prices and payouts are locked", () => {
  assert.deepEqual(config.public_packages.map((item) => [item.key, item.price_thb, item.worker_payout_thb]), [
    ["gallery_with_me", 5000, 3000],
    ["creative_city", 8500, 5000],
    ["creative_day", 13500, 8000],
  ]);
  assert.equal(config.money_lane, "public_model");
});

test("Creative Companion sells shared interest, not professional creative work", () => {
  const safety = config.safety_scope;
  assert.equal(config.positioning, "shared_interest_creative_context_not_professional_creative_service");
  assert.equal(safety.photography_or_video_production_included, false);
  assert.equal(safety.professional_design_or_creative_service_included, false);
  assert.equal(safety.deliverable_or_usage_rights_included, false);
  assert.equal(safety.commercial_production_included, false);
});

test("Creative Companion has explicit public-only extension policy", () => {
  const rules = config.public_extension_rules;
  assert.equal(rules.overtime_before_midnight_client_thb_per_hour, 1690);
  assert.equal(rules.overtime_before_midnight_worker_thb_per_hour, 1000);
  assert.equal(rules.overtime_after_midnight_client_thb_per_hour, 2190);
  assert.equal(rules.overtime_after_0300_client_thb_per_hour, 2690);
  assert.equal(rules.no_double_charge_same_minute, true);
  assert.match(config.private_money_separation, /never apply automatically/);
});
