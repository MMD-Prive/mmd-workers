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
        records: [
          {
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
          },
          {
            id: "recBTujDAFw2GolT5",
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
            id: "recSod352ioZ17aMr",
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
          {
            id: "recBatch123456789",
            fields: {
              "Product": ["recg8CLsPKT3So4uz"],
              "Quantity Remaining": 5,
              "Low Stock Flag": "OK",
              "Batch Status": "active"
            }
          },
          {
            id: "recBatch250000000",
            fields: {
              "Product": ["recBTujDAFw2GolT5"],
              "Quantity Remaining": 0,
              "Low Stock Flag": "Low",
              "Batch Status": "active"
            }
          },
          {
            id: "recBatch500000000",
            fields: {
              "Product": ["recSod352ioZ17aMr"],
              "Quantity Remaining": 0,
              "Low Stock Flag": "Low",
              "Batch Status": "active"
            }
          }
        ]
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
    assert.equal(body.product.variant_group, "WGG");
    assert.equal(body.product.variant_type, "size");
    assert.equal(body.product.variant_value, "10ml");
    assert.deepEqual(
      body.variants.map((item) => [item.sku, item.variant_value, item.checkout_eligible]),
      [
        ["WGG-10", "10ml", true],
        ["WGG-25", "25ml", false],
        ["WGG-50", "50ml", false]
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("MMD Shop product API returns perfume-decant Pod flavour family with stock-backed checkout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("tblzsmNLfP6J0kQ90")) {
      return Response.json({
        records: [
          {
            id: "recPodKyo",
            fields: {
              "Product Name": "Pod Premium Plus 2.5mg — KyoHo Grape",
              "SKU": "PPP25-KYO",
              "Brand Availability": ["MMD Shop"],
              "Status": "active",
              "Supplier": [],
              "Product Note": "Pod flavour",
              "MMD Shop Selling Price THB": 2500
            }
          },
          {
            id: "recPodMgo",
            fields: {
              "Product Name": "Pod Premium Plus 2.5mg — Mango",
              "SKU": "PPP25-MGO",
              "Brand Availability": ["MMD Shop"],
              "Status": "active",
              "Supplier": [],
              "Product Note": "Pod flavour",
              "MMD Shop Selling Price THB": 2500
            }
          }
        ]
      });
    }
    if (url.pathname.includes("tblwFgl4et1TOgtNn")) {
      return Response.json({
        records: [
          {
            id: "recPodBatchKyo",
            fields: {
              "Product": ["recPodKyo"],
              "Quantity Remaining": 4,
              "Low Stock Flag": "Low",
              "Batch Status": "active"
            }
          },
          {
            id: "recPodBatchMgo",
            fields: {
              "Product": ["recPodMgo"],
              "Quantity Remaining": 5,
              "Low Stock Flag": "Low",
              "Batch Status": "active"
            }
          }
        ]
      });
    }
    if (url.pathname.includes("tbl81bnFyASeXCj9x")) return Response.json({ records: [] });
    return new Response("not found", { status: 404 });
  };

  try {
    const response = await handleShopCatalog(
      new Request("https://www.mmdbkk.com/mmd-shop/api/product/ppp25-kyo"),
      { AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_TOKEN: "test-token" }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.product.variant_group, "PPP25");
    assert.equal(body.product.variant_type, "flavour");
    assert.equal(body.product.variant_value, "KyoHo Grape");
    assert.equal(body.product.checkout_eligible, true);
    assert.equal(body.variants.length, 2);
    assert.deepEqual(body.variants.map((item) => item.variant_value), ["KyoHo Grape", "Mango"]);
    assert.equal(body.variants.every((item) => item.checkout_eligible === true), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("MMD Shop product API returns Glenburgies as one bottle-variant family", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("tblzsmNLfP6J0kQ90")) {
      return Response.json({
        records: [
          {
            id: "recGlenBlk",
            fields: {
              "Product Name": "Glenburgies Pop Plus — Black Bottle",
              "SKU": "GLEN-POP15-BLK",
              "Brand Availability": ["MMD Shop"],
              "Status": "active",
              "Supplier": ["recSupplierGlen"],
              "Product Note": "on-demand",
              "MMD Shop Selling Price THB": 1500
            }
          },
          {
            id: "recGlenWht",
            fields: {
              "Product Name": "Glenburgies Pop Plus — White Bottle",
              "SKU": "GLEN-POP15-WHT",
              "Brand Availability": ["MMD Shop"],
              "Status": "active",
              "Supplier": ["recSupplierGlen"],
              "Product Note": "on-demand",
              "MMD Shop Selling Price THB": 1500
            }
          }
        ]
      });
    }
    if (url.pathname.includes("tblwFgl4et1TOgtNn")) return Response.json({ records: [] });
    if (url.pathname.includes("tbl81bnFyASeXCj9x")) {
      return Response.json({ records: [{ id: "recSupplierGlen", fields: { "Supplier Name": "SUP — Glenburgies Pop Plus" } }] });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const response = await handleShopCatalog(
      new Request("https://www.mmdbkk.com/mmd-shop/api/product/glen-pop15-blk"),
      { AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_TOKEN: "test-token" }
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.product.variant_group, "GLEN");
    assert.equal(body.product.variant_type, "bottle");
    assert.equal(body.product.variant_value, "Black Bottle");
    assert.equal(body.product.checkout_eligible, true);
    assert.deepEqual(
      body.variants.map((item) => [item.sku, item.variant_value, item.checkout_eligible]),
      [
        ["GLEN-POP15-BLK", "Black Bottle", true],
        ["GLEN-POP15-WHT", "White Bottle", true]
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
