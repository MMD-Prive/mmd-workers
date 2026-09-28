import test from "node:test";
import assert from "node:assert/strict";

import { MmdShopStockCoordinator } from "../src/mmd-shop-stock-coordinator.js";

const F = {
  inventoryProduct: "fldVc73xUxjrfSjHY",
  inventoryCode: "fldavW4g5y3e3Mdx1",
  quantityIn: "fldY4BJKDzpi2f844",
  remaining: "fldvjoRuM1mrR6ItQ",
  low: "fldYtzXtBvK3HuqQa",
  status: "fldZW2m1Xq8q0ZH9Z",
  movementBatch: "fldjF7wcc65dJIxt8",
  movementType: "fld95ubumrh0GQCgj",
  movementQuantity: "fldRoDWshlUAg8aOy",
  movementReference: "flddxY12JXrNsAUpE",
};

test("stock health coordinator alerts only when actionable fingerprint changes", { concurrency: false }, async () => {
  const batchId = "recBatch123456789";
  const productId = "recProduct1234567";
  const originalFetch = globalThis.fetch;
  let telegramCalls = 0;
  const telegramPayloads = [];

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.airtable.com") {
      const table = url.pathname.split("/").filter(Boolean)[2];
      if (table === "tblzsmNLfP6J0kQ90") {
        return Response.json({
          records: [{
            id: productId,
            fields: {
              fld0oKjoZrb1IqntV: "Water GG Plus 10ml",
              fldhJE7UEE4VYHjR6: "WGG-10",
              fldve5nrQmymoZgiX: ["MMD Shop"],
              fldxYkkvmK9izvACA: "active",
              fldD6Q5yido7pTlU0: 1000,
            },
          }],
        });
      }
      if (table === "tblwFgl4et1TOgtNn") {
        return Response.json({
          records: [{
            id: batchId,
            fields: {
              [F.inventoryProduct]: [productId],
              [F.inventoryCode]: "WGG10-SMOKE",
              [F.quantityIn]: 10,
              [F.remaining]: 2,
              [F.low]: "Low",
              [F.status]: "active",
            },
          }],
        });
      }
      if (table === "tblASifwHdArNKQP2") {
        return Response.json({
          records: [
            {
              id: "recMove1234567890",
              fields: {
                [F.movementBatch]: [batchId],
                [F.movementType]: "in",
                [F.movementQuantity]: 10,
                [F.movementReference]: "receive-1",
              },
            },
            {
              id: "recMove2234567890",
              fields: {
                [F.movementBatch]: [batchId],
                [F.movementType]: "reserve",
                [F.movementQuantity]: 8,
                [F.movementReference]: "MMD-SMOKE:reserve:" + batchId + ":" + productId,
              },
            },
            {
              id: "recMove3234567890",
              fields: {
                [F.movementBatch]: [batchId],
                [F.movementType]: "out",
                [F.movementQuantity]: 8,
                [F.movementReference]: "MMD-SMOKE:out:" + batchId + ":" + productId,
              },
            },
          ],
        });
      }
    }
    throw new Error("unexpected fetch " + String(input));
  };

  const values = new Map();
  const state = {
    storage: {
      async get(key) { return values.get(key); },
      async put(key, value) { values.set(key, value); },
    },
  };
  const env = {
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_TOKEN: "token",
    AUTH_SERVICE_HIMAI_TO_TELEGRAM: "himai-router-secret",
    TELEGRAM_WORKER: {
      async fetch(request) {
        telegramCalls += 1;
        telegramPayloads.push({
          url: request.url,
          auth: request.headers.get("authorization"),
          body: await request.json(),
        });
        return Response.json({
          ok: true,
          telegram: { ok: true, result: { message_id: telegramCalls, message_thread_id: 162 } },
        });
      },
    },
  };

  try {
    const coordinator = new MmdShopStockCoordinator(state, env);
    const first = await coordinator.fetch(new Request("https://mmd-shop-stock.internal/stock-health", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.report.metrics.low_stock_batches, 1);
    assert.equal(firstBody.report.metrics.reconciliation_mismatches, 0);
    assert.equal(firstBody.report.metrics.untracked_checkout_products, 0);
    assert.equal(firstBody.fingerprint_changed, true);
    assert.equal(firstBody.alert.ok, true);
    assert.equal(telegramCalls, 1);
    assert.match(telegramPayloads[0].url, /telegram-worker\.internal\/telegram\/internal\/send$/);
    assert.equal(telegramPayloads[0].auth, "Bearer himai-router-secret");
    assert.equal(telegramPayloads[0].body.flow, "mmd_shop_alerts");
    assert.equal("chat_id" in telegramPayloads[0].body, false);
    assert.equal("message_thread_id" in telegramPayloads[0].body, false);

    const second = await coordinator.fetch(new Request("https://mmd-shop-stock.internal/stock-health", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    const secondBody = await second.json();
    assert.equal(secondBody.ok, true);
    assert.equal(secondBody.fingerprint_changed, false);
    assert.equal(secondBody.alert.skipped, true);
    assert.equal(secondBody.alert.reason, "unchanged");
    assert.equal(telegramCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
