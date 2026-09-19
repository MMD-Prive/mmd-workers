import test from "node:test";
import assert from "node:assert/strict";

import { runMmdShopTransactionSmoke } from "../src/mmd-shop-transaction-smoke.js";

test("isolated MMD Shop transaction smoke covers reserve expiry payment inventory fulfillment and LINE dry-run", async () => {
  const calls = [];
  const env = {
    MEMBER_DASHBOARD_CHAT_WORKER: {
      async fetch(request) {
        calls.push({
          url: request.url,
          service: request.headers.get("x-mmd-service-binding"),
          internal: request.headers.get("x-mmd-internal-call"),
          body: await request.json(),
        });
        return Response.json({
          ok: true,
          status: "dry_run",
          line_push_sent: false,
          checks: {
            contains_order: true,
            contains_tracking: true,
            contains_my_mmd_orders: true,
          },
        });
      },
    },
  };

  const result = await runMmdShopTransactionSmoke(env);

  assert.equal(result.ok, true);
  assert.equal(result.state, "pass");
  assert.equal(result.checks.reserve_created, true);
  assert.equal(result.checks.expiry_releases_stock, true);
  assert.equal(result.checks.payment_review_blocks_expiry, true);
  assert.equal(result.checks.inventory_out_once, true);
  assert.equal(result.checks.reservation_movement_sequence, true);
  assert.equal(result.checks.fulfillment_delivery_lifecycle, true);
  assert.equal(result.checks.aftercare_refund_projection, true);
  assert.equal(result.checks.line_shipping_dry_run, true);
  assert.equal(result.checks.customer_projection_contract, true);
  assert.equal(result.guardrails.production_airtable_called, false);
  assert.equal(result.guardrails.business_truth_mutated, false);
  assert.equal(result.guardrails.line_push_sent, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /shop-shipping-notify\/smoke$/);
  assert.equal(calls[0].service, "hype-shop-production-smoke");
  assert.equal(calls[0].internal, "true");
  assert.equal(calls[0].body.order_id, "MMD-SMOKE-PAY");
  assert.equal(calls[0].body.tracking_number, "SMOKE-TRACK-260919");
});
