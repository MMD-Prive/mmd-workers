import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMmdShopStockReconciliation,
  mmdShopStockHealthFingerprint,
} from "./mmd-shop-stock-reconciliation.mjs";

const batch = {
  id: "recBatch123456789",
  product_id: "recProduct1234567",
  batch_code: "WGG10-001",
  quantity_in: 10,
  quantity_remaining: 5,
  batch_status: "active",
  low_stock: true,
};

function movement(type, quantity, action = type) {
  return {
    batch_id: batch.id,
    movement_type: type,
    quantity,
    reference_id: "MMD-ORDER-1:" + action + ":" + batch.id + ":" + batch.product_id,
  };
}

test("stock reconciliation does not deduct committed out twice after reserve", () => {
  const report = buildMmdShopStockReconciliation({
    batches: [{ ...batch, quantity_remaining: 7, low_stock: false }],
    movements: [
      { batch_id: batch.id, movement_type: "in", quantity: 10, reference_id: "receive-1" },
      movement("reserve", 3, "reserve"),
      movement("out", 3, "out"),
    ],
  });
  const row = report.batches[0];
  assert.equal(row.ledger_expected_remaining, 7);
  assert.equal(row.quantity_remaining, 7);
  assert.equal(row.reserved_units, 0);
  assert.equal(row.reconciliation_status, "ok");
});

test("stock reconciliation exposes outstanding reserve separately from available", () => {
  const report = buildMmdShopStockReconciliation({
    batches: [{ ...batch, quantity_remaining: 5 }],
    movements: [
      { batch_id: batch.id, movement_type: "in", quantity: 10, reference_id: "receive-1" },
      movement("reserve", 3, "reserve"),
      movement("out", 3, "out"),
      {
        batch_id: batch.id,
        movement_type: "reserve",
        quantity: 2,
        reference_id: "MMD-ORDER-2:reserve:" + batch.id + ":" + batch.product_id,
      },
    ],
  });
  const row = report.batches[0];
  assert.equal(row.available_units, 5);
  assert.equal(row.reserved_units, 2);
  assert.equal(row.physical_estimate_units, 7);
  assert.equal(row.reconciliation_status, "ok");
  assert.equal(report.metrics.reserved_units, 2);
  assert.equal(report.metrics.low_stock_batches, 1);
});

test("release restores stock and clears outstanding reserve", () => {
  const report = buildMmdShopStockReconciliation({
    batches: [{ ...batch, quantity_remaining: 10, low_stock: false }],
    movements: [
      { batch_id: batch.id, movement_type: "in", quantity: 10, reference_id: "receive-1" },
      movement("reserve", 2, "reserve"),
      movement("release", 2, "release"),
    ],
  });
  const row = report.batches[0];
  assert.equal(row.ledger_expected_remaining, 10);
  assert.equal(row.reserved_units, 0);
  assert.equal(row.reconciliation_status, "ok");
});

test("manual adjustment participates in reconciliation and mismatch is explicit", () => {
  const report = buildMmdShopStockReconciliation({
    batches: [{ ...batch, quantity_remaining: 8, low_stock: false }],
    movements: [
      { batch_id: batch.id, movement_type: "in", quantity: 10, reference_id: "receive-1" },
      { batch_id: batch.id, movement_type: "adjustment", quantity: -1, reference_id: "manual-1" },
    ],
  });
  const row = report.batches[0];
  assert.equal(row.ledger_expected_remaining, 9);
  assert.equal(row.reconciliation_delta, -1);
  assert.equal(row.reconciliation_status, "mismatch");
  assert.deepEqual(report.actionable.mismatch_batch_ids, [batch.id]);
});

test("stock health fingerprint is stable regardless of actionable ordering", () => {
  const a = mmdShopStockHealthFingerprint({
    actionable: { low_stock_batch_ids: ["b", "a"], mismatch_batch_ids: ["d", "c"] },
  });
  const b = mmdShopStockHealthFingerprint({
    actionable: { low_stock_batch_ids: ["a", "b"], mismatch_batch_ids: ["c", "d"] },
  });
  assert.equal(a, b);
});
