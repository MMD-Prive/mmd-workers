import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_SHOP_ORDERS_PATH,
  handleHypeShopOrders,
} from "../src/hype-shop-orders-projection.js";

const LINE_ID = "U0123456789abcdef0123456789abcdef";

function request(body, caller = "admin-worker", host = "member-pages-worker.internal") {
  return new Request(`https://${host}${HYPE_SHOP_ORDERS_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify(body),
  });
}

function env() {
  return {
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_API_KEY: "test-token",
  };
}

test("HYPE shop orders endpoint is service-binding only", async () => {
  const wrongCaller = await handleHypeShopOrders(request({ line_user_id: LINE_ID }, "telegram-worker"), env());
  assert.equal(wrongCaller.status, 404);

  const publicHost = await handleHypeShopOrders(request({ line_user_id: LINE_ID }, "admin-worker", "www.mmdbkk.com"), env());
  assert.equal(publicHost.status, 404);
});

test("HYPE shop orders returns only owned bounded Order Payment Fulfillment data", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/tbllkfCySeL9fSfZw")) {
      return Response.json({
        records: [
          { id: "recCustomerOwn", fields: { fldhL0PHPwrkT8X3p: LINE_ID, fldCjBe9gqIq6y7rR: "member-own" } },
          { id: "recCustomerOther", fields: { fldhL0PHPwrkT8X3p: "Uffffffffffffffffffffffffffffffff", fldCjBe9gqIq6y7rR: "member-other" } },
        ],
      });
    }
    if (path.endsWith("/tblr8lbi2wMuRM1N4")) {
      return Response.json({
        records: [
          {
            id: "recOrderOwn",
            fields: {
              flde515MCoEq08YzU: "MMD-ORDER-001",
              fldAY7M0IjvQiWdhH: ["recCustomerOwn"],
              fld7NNIA2kYNQNekl: "2026-09-18T10:00:00.000Z",
              fldnCO3H5CpJoYmWD: "confirmed",
              fldUpDeLdO6D9OUcd: "paid",
              fldYIwMzRJdKdznkY: 2500,
              fldWG0u77XQ5W0wpT: "PRIVATE ADMIN NOTE MUST NOT LEAK",
            },
          },
          {
            id: "recOrderOther",
            fields: {
              flde515MCoEq08YzU: "MMD-ORDER-OTHER",
              fldAY7M0IjvQiWdhH: ["recCustomerOther"],
              fld7NNIA2kYNQNekl: "2026-09-18T11:00:00.000Z",
              fldnCO3H5CpJoYmWD: "confirmed",
              fldUpDeLdO6D9OUcd: "paid",
              fldYIwMzRJdKdznkY: 9999,
            },
          },
        ],
      });
    }
    if (path.endsWith("/tbl37Iprxz4OLL65P")) {
      return Response.json({
        records: [
          {
            id: "recItemOwn",
            fields: {
              fldSVk92UcASTOuOK: ["recOrderOwn"],
              fldLR9aIu2m6DTr2e: "GG Water 25ml",
              fldJkKWMZiVQ3g1a6: 1,
              fldr7KTPoSbnblo5I: 2500,
              flddJVVBAjVoyqcpY: "confirmed",
            },
          },
        ],
      });
    }
    throw new Error(`unexpected airtable path ${path}`);
  };

  try {
    const response = await handleHypeShopOrders(request({ line_user_id: LINE_ID }), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.authority, "mmd.hype_shop_orders_projection.v1");
    assert.equal(body.orders.length, 1);
    assert.equal(body.orders[0].order_id, "MMD-ORDER-001");
    assert.equal(body.orders[0].payment_status, "paid");
    assert.equal(body.orders[0].fulfillment.state, "confirmed");
    assert.equal(body.orders[0].items[0].item_name, "GG Water 25ml");
    assert.equal(body.correlation.auto_correlation_allowed, true);
    assert.equal(body.correlation.candidate_order_id, "MMD-ORDER-001");
    assert.equal(body.correlation.method, "single_recent_owned_order");
    assert.equal(body.guardrails.payment_mutation_allowed, false);
    assert.equal(body.guardrails.fulfillment_mutation_allowed, false);
    assert.equal(body.guardrails.refund_mutation_allowed, false);

    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /MMD-ORDER-OTHER|member-own|line_user_id|PRIVATE ADMIN NOTE|address|phone/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("explicit Order correlation never matches an Order owned by another customer", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/tbllkfCySeL9fSfZw")) {
      return Response.json({
        records: [{ id: "recCustomerOwn", fields: { fldhL0PHPwrkT8X3p: LINE_ID } }],
      });
    }
    if (path.endsWith("/tblr8lbi2wMuRM1N4")) {
      return Response.json({
        records: [{
          id: "recOrderOther",
          fields: {
            flde515MCoEq08YzU: "MMD-ORDER-OTHER",
            fldAY7M0IjvQiWdhH: ["recSomeoneElse"],
            fld7NNIA2kYNQNekl: "2026-09-18T11:00:00.000Z",
          },
        }],
      });
    }
    if (path.endsWith("/tbl37Iprxz4OLL65P")) return Response.json({ records: [] });
    throw new Error(`unexpected airtable path ${path}`);
  };

  try {
    const response = await handleHypeShopOrders(request({
      line_user_id: LINE_ID,
      order_id: "MMD-ORDER-OTHER",
    }), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.orders.length, 0);
    assert.equal(body.correlation.exact_owned_match, false);
    assert.equal(body.correlation.auto_correlation_allowed, false);
    assert.equal(body.correlation.method, "explicit_order_id_not_owned_or_missing");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
