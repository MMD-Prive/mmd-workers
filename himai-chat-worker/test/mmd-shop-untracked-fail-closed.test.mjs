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

test("checkout pricing allows explicit on-demand supplier fulfillment without inventory", () => {
  const product = checkoutProduct();
  product.fields.fldAT8hnluV4CtF3c = "15ml / black bottle / on-demand / no stock";
  product.fields.fldJCZ7YzsUjIItKf = ["recSupplier123456"];
  const products = new Map([[PRODUCT_ID, product]]);
  const priced = validateAndPriceCart([{ product_id: PRODUCT_ID, quantity: 1 }], products, new Map());
  assert.equal(priced.length, 1);
  assert.equal(priced[0].stock_status, "on_demand");
  assert.equal(priced[0].available, null);
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

test("catalog classifies explicit on-demand product separately from untracked stock", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("tblzsmNLfP6J0kQ90")) {
      return Response.json({
        records: [{
          id: PRODUCT_ID,
          fields: {
            "Product Name": "Glenburgies Pop Plus 10ml — Black Bottle",
            "SKU": "GLEN-POP15-BLK",
            "Brand Availability": ["MMD Shop"],
            "Category": "Selected",
            "Status": "active",
            "Curation Label": "MMD Pick",
            "Supplier": ["recSupplier123456"],
            "Product Note": "15ml / black bottle / on-demand / no stock",
            "MMD Shop Selling Price THB": 1500,
          },
        }],
      });
    }
    if (url.pathname.includes("tblwFgl4et1TOgtNn")) return Response.json({ records: [] });
    if (url.pathname.includes("tbl81bnFyASeXCj9x")) {
      return Response.json({ records: [{ id: "recSupplier123456", fields: { "Supplier Name": "SUP — Glenburgies Pop Plus" } }] });
    }
    return new Response("not found", { status: 404 });
  };
  try {
    const response = await handleShopCatalog(
      new Request("https://www.mmdbkk.com/mmd-shop/api/product/glen-pop15-blk"),
      { AIRTABLE_BASE_ID: "appTest", AIRTABLE_TOKEN: "token" },
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.product.stock_status, "on_demand");
    assert.equal(body.product.checkout_eligible, true);
    assert.equal(body.product.online_checkout_status, "on_demand");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stock health excludes explicit on-demand products from untracked alerts", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").filter(Boolean)[2];
    if (table === "tblzsmNLfP6J0kQ90") {
      return Response.json({
        records: [{
          id: PRODUCT_ID,
          fields: {
            fld0oKjoZrb1IqntV: "Glenburgies Pop Plus 10ml — Black Bottle",
            fldhJE7UEE4VYHjR6: "GLEN-POP15-BLK",
            fldve5nrQmymoZgiX: ["MMD Shop"],
            fldxYkkvmK9izvACA: "active",
            fldAT8hnluV4CtF3c: "15ml / black bottle / on-demand / no stock",
            fldD6Q5yido7pTlU0: 1500,
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
    const report = await inspectMmdShopStockHealth({ AIRTABLE_BASE_ID: "appTest", AIRTABLE_TOKEN: "token" });
    assert.equal(report.metrics.active_checkout_products, 1);
    assert.equal(report.metrics.on_demand_checkout_products, 1);
    assert.equal(report.metrics.untracked_checkout_products, 0);
    assert.deepEqual(report.actionable.untracked_product_ids, []);
    assert.equal(report.on_demand_products[0].sku, "GLEN-POP15-BLK");
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
