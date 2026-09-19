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
