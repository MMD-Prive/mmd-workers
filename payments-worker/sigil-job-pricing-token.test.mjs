import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSigilPricing, pricingFromNote } from "./sigil-job-pricing-token.js";

test("SIGIL pricing keeps deposit basis on full price", () => {
  const pricing = normalizeSigilPricing({
    full_price_thb: 45000,
    discount_mode: "percent",
    discount_percent: 10,
    discount_thb: 4500,
    net_price_thb: 40500,
    deposit_basis_thb: 45000,
    deposit_percent: 30,
    deposit_due_thb: 13500,
    deposit_received_thb: 13500,
    balance_thb: 27000,
  });
  assert.equal(pricing.full_price_thb, 45000);
  assert.equal(pricing.discount_thb, 4500);
  assert.equal(pricing.net_price_thb, 40500);
  assert.equal(pricing.deposit_basis_thb, 45000);
  assert.equal(pricing.deposit_due_thb, 13500);
  assert.equal(pricing.balance_thb, 27000);
});

test("pricing snapshot can be recovered from the internal note", () => {
  const note = `operator note\n[SIGIL Pricing v1] ${JSON.stringify({
    full_price_thb: 45000,
    discount_mode: "amount",
    discount_thb: 5000,
    net_price_thb: 40000,
    deposit_basis_thb: 45000,
    deposit_percent: 30,
    deposit_due_thb: 13500,
    deposit_received_thb: 13500,
    balance_thb: 26500,
  })}`;
  const pricing = pricingFromNote(note);
  assert.equal(pricing.full_price_thb, 45000);
  assert.equal(pricing.discount_mode, "amount");
  assert.equal(pricing.discount_thb, 5000);
  assert.equal(pricing.deposit_due_thb, 13500);
});

test("pricing rejects a discounted deposit basis", () => {
  assert.equal(normalizeSigilPricing({
    full_price_thb: 45000,
    discount_thb: 4500,
    net_price_thb: 40500,
    deposit_basis_thb: 40500,
  }), null);
});
