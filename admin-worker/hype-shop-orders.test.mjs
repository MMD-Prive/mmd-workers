import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_SHOP_ORDERS_PATH,
  HYPE_SHOP_ORDERS_SMOKE_PATH,
  handleHypeShopOrdersRpc,
  handleHypeShopOrdersSmokeRpc,
  readBoundedShopOrdersForTelegram,
} from "./src/hype-shop-orders.js";

function request(body, caller = "telegram-worker") {
  return new Request(`https://admin-worker.internal${HYPE_SHOP_ORDERS_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify(body),
  });
}


function smokeRequest(body, caller = "hype-shop-production-smoke", host = "admin-worker.internal") {
  return new Request(`https://${host}${HYPE_SHOP_ORDERS_SMOKE_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify(body),
  });
}

function baseEnv(overrides = {}) {
  return {
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_API_KEY: "test-token",
    AIRTABLE_TABLE_CLIENTS_ID: "tblClients",
    ...overrides,
  };
}

test("HYPE shop bridge is Telegram service-binding only", async () => {
  const response = await handleHypeShopOrdersRpc(request({
    telegram_user_id: "111111",
  }, "browser"), baseEnv());
  assert.equal(response.status, 403);
});

test("HYPE Shop production smoke route is internal-service-only", async () => {
  const wrongCaller = await handleHypeShopOrdersSmokeRpc(
    smokeRequest({ line_user_id: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, "browser"),
    baseEnv(),
  );
  assert.equal(wrongCaller.status, 403);

  const publicHost = await handleHypeShopOrdersSmokeRpc(
    smokeRequest({ line_user_id: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, "hype-shop-production-smoke", "admin-worker.malemodel-bkk.workers.dev"),
    baseEnv(),
  );
  assert.equal(publicHost.status, 403);
});

test("HYPE Shop production smoke verifies empty synthetic ownership without returning customer data", async () => {
  let upstream = null;
  const response = await handleHypeShopOrdersSmokeRpc(
    smokeRequest({ line_user_id: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    baseEnv({
      MEMBER_PAGES_SHOP_ORDERS: {
        async fetch(req) {
          upstream = {
            url: req.url,
            headers: Object.fromEntries(req.headers.entries()),
            body: JSON.parse(await req.clone().text()),
          };
          return Response.json({
            ok: true,
            authority: "mmd.hype_shop_orders_projection.v1",
            orders: [],
            correlation: {
              requested_order_id: null,
              exact_owned_match: false,
              auto_correlation_allowed: false,
              candidate_count: 0,
              candidate_order_id: null,
              method: "no_recent_owned_order",
            },
            guardrails: {
              read_only: true,
              customer_safe_projection_only: true,
              canonical_line_identity_required: true,
              ownership_filtered_server_side: true,
              payment_mutation_allowed: false,
              fulfillment_mutation_allowed: false,
              refund_mutation_allowed: false,
              raw_notes_exposed: false,
              address_exposed: false,
              phone_exposed: false,
            },
          });
        },
      },
    }),
  );

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.state, "pass");
  assert.equal(body.checks.zero_owned_orders, true);
  assert.equal(body.checks.zero_candidates, true);
  assert.equal(body.checks.ownership_filtered_server_side, true);
  assert.equal(body.guardrails.customer_data_returned, false);
  assert.equal(body.guardrails.business_truth_mutated, false);
  assert.deepEqual(upstream.body, { line_user_id: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  assert.equal(new URL(upstream.url).pathname, "/__internal/hype/shop-orders");
  assert.equal(upstream.headers["x-mmd-internal-call"], "true");
  assert.equal(upstream.headers["x-mmd-service-binding"], "admin-worker");
  assert.doesNotMatch(JSON.stringify(body), /line_user_id|order_id|tracking|display_name|address|phone/i);
});

test("HYPE Shop production smoke fails closed if synthetic identity ever resolves to customer data", async () => {
  const response = await handleHypeShopOrdersSmokeRpc(
    smokeRequest({ line_user_id: "Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
    baseEnv({
      MEMBER_PAGES_SHOP_ORDERS: {
        async fetch() {
          return Response.json({
            ok: true,
            authority: "mmd.hype_shop_orders_projection.v1",
            orders: [{ order_id: "MMD-ORDER-SHOULD-NOT-LEAK" }],
            correlation: {
              candidate_count: 1,
              candidate_order_id: "MMD-ORDER-SHOULD-NOT-LEAK",
              auto_correlation_allowed: true,
              method: "single_recent_owned_order",
            },
            guardrails: {
              read_only: true,
              ownership_filtered_server_side: true,
              payment_mutation_allowed: false,
              fulfillment_mutation_allowed: false,
              refund_mutation_allowed: false,
              address_exposed: false,
              phone_exposed: false,
            },
          });
        },
      },
    }),
  );

  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.ok, false);
  assert.equal(body.state, "synthetic_collision_or_projection_violation");
  assert.equal(body.checks.zero_owned_orders, false);
  assert.equal(body.guardrails.customer_data_returned, false);
  assert.doesNotMatch(JSON.stringify(body), /MMD-ORDER-SHOULD-NOT-LEAK|order_id/i);
});

test("HYPE shop bridge resolves canonical LINE then returns bounded owned projection", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let upstream = null;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) {
      return Response.json({
        records: [{
          id: "recClientA1",
          fields: {
            telegram_user_id: "111111",
            telegram_verification_status: "verified",
            line_user_id: "U0123456789abcdef0123456789abcdef",
            "Client Name": "Client A",
          },
        }],
      });
    }
    throw new Error(`unexpected fetch ${parsed.pathname}`);
  };

  try {
    const result = await readBoundedShopOrdersForTelegram(baseEnv({
      MEMBER_PAGES_SHOP_ORDERS: {
        async fetch(req) {
          upstream = {
            url: req.url,
            headers: Object.fromEntries(req.headers.entries()),
            body: JSON.parse(await req.clone().text()),
          };
          return Response.json({
            ok: true,
            authority: "mmd.hype_shop_orders_projection.v1",
            orders: [{
              order_id: "MMD-ORDER-001",
              order_date: "2026-09-18T10:00:00.000Z",
              order_status: "confirmed",
              payment_status: "paid",
              total_thb: 2500,
              items: [{ item_name: "GG Water 25ml", quantity: 1, line_total_thb: 2500, status: "confirmed", secret: "drop-me" }],
              fulfillment: {
                state: "shipped",
                delivery_method: "delivery",
                courier: "Example Express",
                tracking_number: "TRACK123",
                updated_at: "2026-09-19T08:00:00.000Z",
                address: "must-not-pass",
              },
              raw_notes: "must-not-pass",
            }],
            correlation: {
              requested_order_id: "MMD-ORDER-001",
              exact_owned_match: true,
              auto_correlation_allowed: true,
              candidate_count: 1,
              candidate_order_id: "MMD-ORDER-001",
              method: "explicit_owned_order_id",
              internal_record_id: "must-not-pass",
            },
          });
        },
      },
    }), "111111", "MMD-ORDER-001");

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.display_name, "Client A");
    assert.equal(result.body.orders[0].order_id, "MMD-ORDER-001");
    assert.equal(result.body.orders[0].payment_status, "paid");
    assert.equal(result.body.orders[0].fulfillment.tracking_number, "TRACK123");
    assert.equal(result.body.correlation.exact_owned_match, true);
    assert.equal(result.body.guardrails.refund_mutation_allowed, false);

    assert.equal(new URL(upstream.url).pathname, "/__internal/hype/shop-orders");
    assert.equal(upstream.headers["x-mmd-internal-call"], "true");
    assert.equal(upstream.headers["x-mmd-service-binding"], "admin-worker");
    assert.deepEqual(upstream.body, {
      line_user_id: "U0123456789abcdef0123456789abcdef",
      order_id: "MMD-ORDER-001",
    });

    const serialized = JSON.stringify(result.body);
    assert.doesNotMatch(serialized, /raw_notes|internal_record_id|drop-me|must-not-pass|address/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE shop bridge fails closed before member authority when Telegram identity is unresolved", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;

  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("/tblClients")) return Response.json({ records: [] });
    throw new Error(`unexpected fetch ${parsed.pathname}`);
  };

  try {
    const result = await readBoundedShopOrdersForTelegram(baseEnv({
      MEMBER_PAGES_SHOP_ORDERS: {
        async fetch() {
          upstreamCalled = true;
          throw new Error("must not call without canonical identity");
        },
      },
    }), "111111");

    assert.equal(result.status, 404);
    assert.equal(result.body.state, "connect_required");
    assert.equal(upstreamCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
