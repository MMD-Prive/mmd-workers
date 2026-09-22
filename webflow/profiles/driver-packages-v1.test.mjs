import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile(new URL("./driver-packages-v1.json", import.meta.url), "utf8"));

test("driver package public keys and prices are locked", () => {
  const expected = new Map([
    ["pick_me_up", 1490],
    ["airport_please", 1890],
    ["wait_for_me", 2690],
    ["half_day_with_him", 3490],
  ]);
  assert.equal(config.product, "driver_companion");
  assert.equal(config.currency, "THB");
  assert.equal(config.public_packages.length, expected.size);
  const keys = config.public_packages.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const item of config.public_packages) {
    assert.equal(item.price_thb, expected.get(item.key), item.key);
    assert.ok(item.included_minutes > 0, item.key);
    assert.ok(item.included_km > 0, item.key);
  }
});

test("driver package booking contract stays on public booking route", () => {
  assert.equal(config.query_contract.role, "driver_companion");
  assert.equal(config.query_contract.package_param, "package");
  assert.equal(config.query_contract.booking_path, "/booking");
  assert.equal(config.public_rules.overtime_thb_per_hour, 790);
  assert.equal(config.public_rules.extra_km_thb, 25);
  assert.equal(config.public_rules.late_night_surcharge_thb, 300);
});
