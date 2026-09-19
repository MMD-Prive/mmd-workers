import test from "node:test";
import assert from "node:assert/strict";

import { handleShopCatalog } from "../src/shop-catalog.js";
import { validateAndPriceCart } from "../src/mmd-shop-checkout.js";
import { inspectMmdShopStockHealth } from "../src/mmd-shop-stock-health.js";
import { mmdShopStockHealthFingerprint } from "../../shared/mmd-shop-stock-reconciliation.mjs";

const PRODUCT_ID = "recg8CLsPKT3So4uz";

function checkoutProduct() {
  return {
    id: PRODUCT_ID,
    fields: {
      fld0oKjoZrb1IqntV: "Water GG Plus 10ml",
      fldhJE7UEE4VYHjR6: "WGG-10",
      fldve5nrQmymoZgiX: ["MMD Shop"],
      fldxYkkvmK9izvACA: "active",
      fldJCZ7YzsUjIItKf: [],
      fldD6Q5yido7pTlU0: 1000,
    },
  };
}

test("checkout pricing rejects an active MMD product with no tracked stock before order creation", () => {
  const products = new Map([[PRODUCT_ID, checkoutProduct()]]);
  assert.throws(
    () => validateAndPriceCart([{ product_id: PRODUCT_ID, quantity: 1 }], products, new Map()),
    (error) => error?.status === 409 && error?.message === "stock_untracked",
  );
});

test("checkout pricing accepts only tracked positive stock", () => {
  const products = new Map([[PRODUCT_ID, checkoutProduct()]]);
  const priced = validateAndPriceCart(
    [{ product_id: PRODUCT_ID, quantity: 1 }],
    products,
    new Map([[PRODUCT_ID, { available: 2, low: false, active_batches: 1 }]]),
  );
  assert.equal(priced.length, 1);
  assert.equal(priced[0].stock_status, "tracked");
  assert.equal(priced[0].available, 2);
});

test("catalog marks active priced MMD product as stock_untracked when no active batch exists", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("tblzsmNLfP6J0kQ90")) {
      return Response.json({
        records: [{
          id: PRODUCT_ID,
          fields: {
            "Product Name": "Water GG Plus 10ml",
            "SKU": "WGG-10",
            "Brand Availability": ["MMD Shop"],
            "Category": "Selected",
            "Status": "active",
            "Curation Label": "MMD Pick",
            "Supplier": [],
            "Product Note": "MMD curated item",
            "MMD Shop Selling Price THB": 1000,
          },
        }],
      });
    }
    if (url.pathname.includes("tblwFgl4et1TOgtNn")) return Response.json({ records: [] });
    if (url.pathname.includes("tbl81bnFyASeXCj9x")) return Response.json({ records: [] });
    return new Response("not found", { status: 404 });
  };
  try {
    const response = await handleShopCatalog(
      new Request("https://www.mmdbkk.com/mmd-shop/api/product/wgg-10"),
      { AIRTABLE_BASE_ID: "appTest", AIRTABLE_TOKEN: "token" },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.product.stock_status, "untracked");
    assert.equal(body.product.checkout_eligible, false);
    assert.equal(body.product.online_checkout_status, "stock_untracked");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stock health exposes untracked checkout products as actionable", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").filter(Boolean)[2];
    if (table === "tblzsmNLfP6J0kQ90") {
      return Response.json({
        records: [{
          id: PRODUCT_ID,
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
    if (table === "tblwFgl4et1TOgtNn" || table === "tblASifwHdArNKQP2") {
      return Response.json({ records: [] });
    }
    throw new Error("unexpected fetch " + String(input));
  };
  try {
    const report = await inspectMmdShopStockHealth({
      AIRTABLE_BASE_ID: "appTest",
      AIRTABLE_TOKEN: "token",
    });
    assert.equal(report.metrics.active_checkout_products, 1);
    assert.equal(report.metrics.tracked_checkout_products, 0);
    assert.equal(report.metrics.untracked_checkout_products, 1);
    assert.deepEqual(report.actionable.untracked_product_ids, [PRODUCT_ID]);
    assert.match(mmdShopStockHealthFingerprint(report), /"untracked":\["recg8CLsPKT3So4uz"\]/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
