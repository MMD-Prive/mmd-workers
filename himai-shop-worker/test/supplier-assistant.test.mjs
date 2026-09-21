import test from "node:test";
import assert from "node:assert/strict";
import { SUPPLIER_ASSISTANT_INTERNALS as assistant } from "../src/supplier-assistant.js";

test("supplier token config supports object and array shapes", () => {
  const objectConfig = assistant.parseSupplierTokenConfig(JSON.stringify({
    tokenA: { supplier_name: "Glen", line_user_id: "U1" },
  }));
  assert.equal(objectConfig.get("tokenA").supplier_name, "Glen");

  const arrayConfig = assistant.parseSupplierTokenConfig(JSON.stringify([
    { token: "tokenB", supplier_name: "Pod", telegram_chat_id: "T1" },
  ]));
  assert.equal(arrayConfig.get("tokenB").telegram_chat_id, "T1");
});

test("supplier assistant answers only from the scoped snapshot", () => {
  const snapshot = {
    supplier: "Glen",
    products: [
      {
        id: "rec-product-1",
        product_name: "Pop Plus",
        sku: "POP-PLUS",
        available: 5,
        sold_total: 12,
        reserved_total: 2,
        selling_price_thb: 900,
        low_stock: true,
        refill_signal: "check_next_refill",
      },
    ],
  };

  assert.match(assistant.deterministicReply("stock", snapshot), /Pop Plus: 5/);
  assert.match(assistant.deterministicReply("ขายแล้ว", snapshot), /12/);
  assert.match(assistant.deterministicReply("เติมสินค้า", snapshot), /check_next_refill/);
  assert.match(assistant.deterministicReply("ราคา", snapshot), /900/);
});

test("notification channels are bounded", () => {
  assert.equal(assistant.normalizeChannel("LINE"), "line");
  assert.equal(assistant.normalizeChannel("telegram"), "telegram");
  assert.equal(assistant.normalizeChannel("email"), "");
  assert.equal(assistant.normalizeChannel("none"), "none");
});

test("refill product matching is exact after normalization", () => {
  const products = [
    { id: "rec-1", sku: "PPP-1", product_name: "Pod Plus" },
    { id: "rec-2", sku: "PPP-2", product_name: "Pod Plus Green" },
  ];
  assert.equal(assistant.findProduct(products, { sku: "PPP-1" }).id, "rec-1");
  assert.equal(assistant.findProduct(products, { product_name: "Pod Plus Green" }).id, "rec-2");
  assert.equal(assistant.findProduct(products, { product_name: "Unknown" }), undefined);
});
