import test from "node:test";
import assert from "node:assert/strict";

import { handleShopCatalog } from "../src/shop-catalog.js";
import { isMmdShopProductPageRequest } from "../src/mmd-shop-product-page.js";

test("MMD Shop product page wildcard owns only product detail paths", () => {
  assert.equal(
    isMmdShopProductPageRequest(new Request("https://www.mmdbkk.com/mmd-shop/product/wgg-10")),
    true
  );
  assert.equal(
    isMmdShopProductPageRequest(new Request("https://www.mmdbkk.com/mmd-shop/product")),
    false
  );
  assert.equal(
    isMmdShopProductPageRequest(new Request("https://www.mmdbkk.com/mmd-shop/api/product/wgg-10")),
    false
  );
});

test("MMD Shop product API resolves SKU slug and returns server checkout eligibility", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("tblzsmNLfP6J0kQ90")) {
      return Response.json({
        records: [{
          id: "recg8CLsPKT3So4uz",
          fields: {
            "Product Name": "Water GG Plus 10ml",
            "SKU": "WGG-10",
            "Brand Availability": ["MMD Shop"],
            "Category": "Selected",
            "Status": "active",
            "Curation Label": "MMD Pick",
            "Supplier": [],
            "Product Note": "MMD curated item",
            "MMD Shop Selling Price THB": 1000
          }
        }]
      });
    }
    if (url.pathname.includes("tblwFgl4et1TOgtNn")) {
      return Response.json({
        records: [{
          id: "recBatch123456789",
          fields: {
            "Product": ["recg8CLsPKT3So4uz"],
            "Quantity Remaining": 5,
            "Low Stock Flag": "OK",
            "Batch Status": "active"
          }
        }]
      });
    }
    if (url.pathname.includes("tbl81bnFyASeXCj9x")) {
      return Response.json({ records: [] });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const response = await handleShopCatalog(
      new Request("https://www.mmdbkk.com/mmd-shop/api/product/wgg-10"),
      {
        AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
        AIRTABLE_TOKEN: "test-token"
      }
    );
    assert.ok(response);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.schema, "mmd_shop_product_v1");
    assert.equal(body.product.sku, "WGG-10");
    assert.equal(body.product.selling_price_thb, 1000);
    assert.equal(body.product.checkout_eligible, true);
    assert.equal(body.product.product_url, "/mmd-shop/product/wgg-10");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("MMD Shop product API returns canonical size variants for GG Water", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("tblzsmNLfP6J0kQ90")) {
      return Response.json({
        records: [
          {
            id: "recWgg10",
            fields: {
              "Product Name": "Water GG Plus 10ml",
              "SKU": "WGG-10",
              "Brand Availability": ["MMD Shop"],
              "Category": "Selected",
              "Status": "active",
              "Curation Label": "MMD Pick",
              "Supplier": [],
              "Product Note": "MMD curated item",
              "MMD Shop Selling Price THB": 1000
            }
          },
          {
            id: "recWgg25",
            fields: {
              "Product Name": "Water GG Plus 25ml",
              "SKU": "WGG-25",
              "Brand Availability": ["MMD Shop"],
              "Category": "Selected",
              "Status": "active",
              "Curation Label": "MMD Pick",
              "Supplier": [],
              "Product Note": "MMD curated item",
              "MMD Shop Selling Price THB": 2500
            }
          },
          {
            id: "recWgg50",
            fields: {
              "Product Name": "Water GG Plus 50ml",
              "SKU": "WGG-50",
              "Brand Availability": ["MMD Shop"],
              "Category": "Selected",
              "Status": "active",
              "Curation Label": "MMD Pick",
              "Supplier": [],
              "Product Note": "MMD curated item",
              "MMD Shop Selling Price THB": 4500
            }
          }
        ]
      });
    }
    if (url.pathname.includes("tblwFgl4et1TOgtNn")) {
      return Response.json({
        records: [
          { id:"b10", fields:{ "Product":["recWgg10"], "Quantity Remaining":4, "Low Stock Flag":"OK", "Batch Status":"active" } },
          { id:"b25", fields:{ "Product":["recWgg25"], "Quantity Remaining":3, "Low Stock Flag":"OK", "Batch Status":"active" } },
          { id:"b50", fields:{ "Product":["recWgg50"], "Quantity Remaining":2, "Low Stock Flag":"Low", "Batch Status":"active" } }
        ]
      });
    }
    if (url.pathname.includes("tbl81bnFyASeXCj9x")) return Response.json({ records: [] });
    return new Response("not found", { status: 404 });
  };

  try {
    const response = await handleShopCatalog(
      new Request("https://www.mmdbkk.com/mmd-shop/api/product/wgg-25"),
      { AIRTABLE_BASE_ID:"appsV1ILPRfIjkaYg", AIRTABLE_TOKEN:"test-token" }
    );
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.product.sku, "WGG-25");
    assert.equal(body.variant_group, "wgg-water");
    assert.equal(body.variant_type, "size");
    assert.deepEqual(body.variants.map((item) => item.variant_value), ["10ml", "25ml", "50ml"]);
    assert.deepEqual(body.variants.map((item) => item.selling_price_thb), [1000, 2500, 4500]);
    assert.equal(body.variants[2].low_stock, true);
    assert.equal(body.variants.every((item) => item.checkout_eligible === true), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MMD Shop product API groups Pod flavours while preserving checkout restriction", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("tblzsmNLfP6J0kQ90")) {
      return Response.json({
        records: [
          {
            id: "recPodApple",
            fields: {
              "Product Name": "Pod Premium Plus 2.5mg — Apple",
              "SKU": "PPP25-APPLE",
              "Brand Availability": ["MMD Shop"],
              "Category": "Selected",
              "Status": "active",
              "Curation Label": "MMD Pick",
              "Supplier": [],
              "Product Note": "Selected flavour",
              "MMD Shop Selling Price THB": 2500
            }
          },
          {
            id: "recPodGrape",
            fields: {
              "Product Name": "Pod Premium Plus 2.5mg — Grape",
              "SKU": "PPP25-GRAPE",
              "Brand Availability": ["MMD Shop"],
              "Category": "Selected",
              "Status": "active",
              "Curation Label": "MMD Pick",
              "Supplier": [],
              "Product Note": "Selected flavour",
              "MMD Shop Selling Price THB": 2500
            }
          }
        ]
      });
    }
    if (url.pathname.includes("tblwFgl4et1TOgtNn")) return Response.json({ records: [] });
    if (url.pathname.includes("tbl81bnFyASeXCj9x")) return Response.json({ records: [] });
    return new Response("not found", { status: 404 });
  };

  try {
    const response = await handleShopCatalog(
      new Request("https://www.mmdbkk.com/mmd-shop/api/product/ppp25-grape"),
      { AIRTABLE_BASE_ID:"appsV1ILPRfIjkaYg", AIRTABLE_TOKEN:"test-token" }
    );
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.variant_group, "pod-premium-plus-25");
    assert.equal(body.variant_type, "flavour");
    assert.deepEqual(body.variants.map((item) => item.variant_value), ["Apple", "Grape"]);
    assert.equal(body.variants.every((item) => item.checkout_eligible === false), true);
    assert.equal(body.variants.every((item) => item.online_checkout_status === "restricted"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
