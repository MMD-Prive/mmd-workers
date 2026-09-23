import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./culinary-packages-v1.json", import.meta.url), "utf8"));

test("culinary package public keys and prices are locked", () => {
  const expected = new Map([
    ["cook_with_me", 1990],
    ["dinner_made_for_you", 2990],
    ["market_to_table", 3790],
    ["private_table", 4990],
  ]);
  assert.equal(config.product, "culinary_companion");
  assert.equal(config.currency, "THB");
  assert.equal(config.public_packages.length, expected.size);
  const keys = config.public_packages.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const item of config.public_packages) {
    assert.equal(item.price_thb, expected.get(item.key), item.key);
    assert.ok(item.included_minutes > 0, item.key);
    assert.equal(item.base_guests, 2, item.key);
  }
});

test("private table is credential-sensitive and ingredients remain pass-through", () => {
  const privateTable = config.public_packages.find((item) => item.key === "private_table");
  assert.equal(privateTable.verified_culinary_required, true);
  assert.equal(config.public_rules.ingredients, "actual_cost");
  assert.equal(config.public_rules.severe_allergy, "manual_review_required");
  assert.equal(config.query_contract.role, "culinary_companion");
  assert.equal(config.query_contract.booking_service, "Culinary Companion");
  assert.equal(config.query_contract.booking_path, "/booking");
});
