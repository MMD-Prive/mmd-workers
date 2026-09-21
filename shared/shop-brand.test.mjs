import assert from "node:assert/strict";
import test from "node:test";
import { SHOP_BRANDS, SHOP_INVENTORY_TABLE_ID, shopForCheckoutPath, shopFromOrder, shopFromPaymentRecord } from "./shop-brand.mjs";
for (const shop of Object.values(SHOP_BRANDS)) {
  test(`${shop.key}: route, price and message lanes remain separate`, () => {
    assert.equal(shopForCheckoutPath(shop.path), shop);
    assert.equal(shopFromOrder({ fields: { "Shop Brand": shop.publicName, "Order ID": `${shop.orderPrefix}-TEST`, Notes: `shop_brand=${shop.key}` } }), shop);
    assert.equal(shopFromPaymentRecord({ fields: { "Session ID": `${shop.orderPrefix}-TEST`, Notes: `shop_brand=${shop.key}` } }), shop);
    assert.equal(shop.paymentProfile, "mmd_shop_himai_v1");
  });
}
test("shared physical stock does not imply shared selling price", () => {
  assert.equal(SHOP_INVENTORY_TABLE_ID, "tblwFgl4et1TOgtNn");
  assert.notEqual(SHOP_BRANDS.shop.priceField, SHOP_BRANDS["mmd-shop"].priceField);
  assert.notEqual(SHOP_BRANDS.shop.paymentThread, SHOP_BRANDS["mmd-shop"].paymentThread);
});
test("only exact checkout paths resolve a shop", () => {
  for (const path of ["/shop", "/shop/api/checkout/evil", "/shop/api/checkout?shop=mmd-shop", "/shop/admin"]) assert.equal(shopForCheckoutPath(path), null);
});
test("canonical order evidence conflicts fail closed", () => {
  assert.throws(() => shopFromOrder({ fields: { "Shop Brand": "Himai Shop", "Order ID": "MMD-TEST" } }), /shop_brand_conflict/);
  assert.throws(() => shopFromOrder({ fields: { Notes: "shop_brand=shop; shop_brand=mmd-shop" } }), /shop_brand_conflict/);
  assert.throws(() => shopFromOrder({ fields: { "Shop Brand": "unrecognized" } }), /shop_brand_unknown/);
});
test("legacy unlabelled MMD orders remain compatible", () => {
  assert.equal(shopFromOrder({ fields: {} }).key, "mmd-shop");
  assert.equal(shopFromOrder({ fields: { "Order ID": "HIMAI-OLD" } }).key, "shop");
});
