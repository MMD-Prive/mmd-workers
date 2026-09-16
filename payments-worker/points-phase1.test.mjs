import test from "node:test";
import assert from "node:assert/strict";
import { computePhase1Points } from "./points-phase1.js";

test("100 THB = 1 point and no remainder", () => {
  assert.deepEqual(computePhase1Points(0, 100), {
    prior_remainder_thb: 0,
    eligible_amount_thb: 100,
    pool_thb: 100,
    points: 1,
    remainder_after_thb: 0,
    rate_thb_per_point: 100,
  });
});

test("remainder carries across eligible payments", () => {
  assert.deepEqual(computePhase1Points(60, 50), {
    prior_remainder_thb: 60,
    eligible_amount_thb: 50,
    pool_thb: 110,
    points: 1,
    remainder_after_thb: 10,
    rate_thb_per_point: 100,
  });
});

test("sub-100 payment still produces a remainder state", () => {
  const result = computePhase1Points(0, 99);
  assert.equal(result.points, 0);
  assert.equal(result.remainder_after_thb, 99);
});

test("whole THB math never produces negative wallet input", () => {
  assert.deepEqual(computePhase1Points(-40, 250.9), {
    prior_remainder_thb: 0,
    eligible_amount_thb: 250,
    pool_thb: 250,
    points: 2,
    remainder_after_thb: 50,
    rate_thb_per_point: 100,
  });
});
