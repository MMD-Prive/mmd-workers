import test from "node:test";
import assert from "node:assert/strict";

import { createPaymentIntent } from "../src/mmd-shop-checkout.js";

test("MMD Shop checkout uses PAYMENTS_WORKER service binding before public network fallback", async () => {
  const originalFetch = globalThis.fetch;
  let publicFetchCalled = false;
  let seenRequest = null;

  globalThis.fetch = async () => {
    publicFetchCalled = true;
    throw new Error("public_fetch_must_not_run");
  };

  try {
    const env = {
      PAYMENTS_WORKER: {
        async fetch(request) {
          seenRequest = request.clone();
          return Response.json({
            ok: true,
            authority: "payments-worker",
            payment_ref: "PAY-SHOP-TEST",
            customer_payment_url: "https://mmdbkk.com/pay/checkout?t=signed-test-token",
          });
        },
      },
    };

    const result = await createPaymentIntent(env, {
      orderId: "MMD-20260921-SMOKE",
      total: 2500,
      email: "",
    });

    assert.equal(result.ok, true);
    assert.equal(publicFetchCalled, false);
    assert.ok(seenRequest);
    assert.equal(new URL(seenRequest.url).hostname, "payments.internal");
    assert.equal(new URL(seenRequest.url).pathname, "/v1/pay/shop-intent");

    const body = await seenRequest.json();
    assert.equal(body.order_id, "MMD-20260921-SMOKE");
    assert.equal(body.session_id, "MMD-20260921-SMOKE");
    assert.equal(body.payment_stage, "shop");
    assert.equal(body.amount, 2500);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
