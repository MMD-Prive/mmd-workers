import test from "node:test";
import assert from "node:assert/strict";

import adminEntry from "./src/admin-payment-review-entry.js";
import { isHistoricalSlipBackfillRequest } from "./src/historical-slip-backfill-runtime.js";

test("historical backfill route matcher stays exact inside the canonical subtree", () => {
  assert.equal(isHistoricalSlipBackfillRequest("/v1/admin/payments/historical-backfill", "GET"), true);
  assert.equal(isHistoricalSlipBackfillRequest("/v1/admin/payments/historical-backfill", "OPTIONS"), true);
  assert.equal(isHistoricalSlipBackfillRequest("/v1/admin/payments/historical-backfill/intake", "POST"), true);
  assert.equal(isHistoricalSlipBackfillRequest("/v1/admin/payments/historical-backfill/review", "POST"), true);

  assert.equal(isHistoricalSlipBackfillRequest("/v1/admin/payments/historical-backfill", "POST"), false);
  assert.equal(isHistoricalSlipBackfillRequest("/v1/admin/payments/historical-backfill/intake", "GET"), false);
  assert.equal(isHistoricalSlipBackfillRequest("/v1/admin/payments/historical-backfill/review", "GET"), false);
  assert.equal(isHistoricalSlipBackfillRequest("/v1/admin/payments/historical-backfill-anything", "GET"), false);
});

test("canonical historical backfill API fails closed before evidence access without admin auth", async () => {
  for (const url of [
    "https://mmdbkk.com/v1/admin/payments/historical-backfill",
    "https://www.mmdbkk.com/v1/admin/payments/historical-backfill?limit=20",
  ]) {
    const response = await adminEntry.fetch(new Request(url, { method: "GET" }), {}, {});
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload?.error, "unauthorized");
  }
});

test("historical review mutation also fails closed before parsing review body", async () => {
  const response = await adminEntry.fetch(new Request(
    "https://mmdbkk.com/v1/admin/payments/historical-backfill/review",
    {
      method: "POST",
      headers: {
        Origin: "https://mmdbkk.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        proof_id: "smoke-proof",
        decision: "approve",
        review_reason: "must never reach runtime without admin auth",
      }),
    },
  ), {}, {});

  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload?.error, "unauthorized");
});
