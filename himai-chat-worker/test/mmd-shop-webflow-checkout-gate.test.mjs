import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../../webflow/mmd-shop/mmd-shop-commerce-footer.html", import.meta.url);
const productHtmlUrl = new URL("../../webflow/mmd-shop/product/product.html", import.meta.url);
const productJsUrl = new URL("../../webflow/mmd-shop/product/product.js", import.meta.url);
const orderFooterUrl = new URL("../../webflow/mmd-shop/order/order-footer.html", import.meta.url);

test("MMD Shop Webflow cart is gated by canonical checkout_eligible", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /p\.checkout_eligible===true/);
  assert.match(source, /online_checkout_status/);
  assert.match(source, /function reconcileCart\(\)/);
  assert.match(source, /อัปเดต Cart ตามสต๊อกล่าสุดแล้ว/);
  assert.match(source, /สต๊อกที่พร้อมสั่งมี/);

  const addStart = source.indexOf("function add(id)");
  const addEnd = source.indexOf("function syncShippingVisibility", addStart);
  const addBlock = source.slice(addStart, addEnd);
  assert.match(addBlock, /p\.checkout_eligible!==true/);

  const checkoutStart = source.indexOf("async function checkout()");
  const checkoutEnd = source.indexOf("grid&&grid.addEventListener", checkoutStart);
  const checkoutBlock = source.slice(checkoutStart, checkoutEnd);
  assert.match(checkoutBlock, /submitReliableOrder/);
  const reliability = await readFile(new URL("../../webflow/shared/shop-reliability-runtime.mjs", import.meta.url), "utf8");
  assert.match(reliability, /await refresh\(\)/);
  assert.match(reliability, /if \(reconcile\(\)\)/);
  assert.match(reliability, /p\.checkout_eligible === true/);
});

test("MMD Shop root presents exactly the three Per product families", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /return "pod"/);
  assert.match(source, /return "gg"/);
  assert.match(source, /return "glen"/);
  assert.match(source, /type:"pod_group"/);
  assert.match(source, /type:"gg_group"/);
  assert.match(source, /type:"glen_group"/);
  assert.match(source, /function renderGlenGroup\(card,item\)/);
  assert.match(source, /Glenburgies Pop Plus/);
  assert.match(source, /Black Bottle \/ White Bottle/);
});

test("MMD Shop presentation runtime supports TH EN ZH across shop routes", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const order = await readFile(orderFooterUrl, "utf8");

  assert.match(source, /var LOCALES=\{th:"th-TH",en:"en-US",zh:"zh-CN"\}/);
  assert.match(source, /\[\["th","TH"\],\["en","EN"\],\["zh","中文"\]\]/);
  assert.match(source, /window\.MMDShopI18n=api/);
  assert.match(source, /searchParams\.set\("lang",lang\)/);
  assert.match(source, /rulesP12b/);
  assert.match(order, /window\.MMDShopI18n/);
  assert.match(order, /locale\(\)/);
});

test("MMD Shop product detail switches canonical variants without bypassing backend eligibility", async () => {
  const html = await readFile(productHtmlUrl, "utf8");
  const js = await readFile(productJsUrl, "utf8");

  assert.match(html, /data-variant-wrap/);
  assert.match(html, /data-variant-select/);
  assert.match(js, /variant_group/);
  assert.match(js, /variant_type/);
  assert.match(js, /variantBottle/);
  assert.match(js, /variant_value/);
  assert.match(js, /renderVariantControl\(\)/);
  assert.match(js, /updateVariantUrl\(selected\)/);
  assert.match(js, /function canCheckout\(item\)/);
  assert.match(js, /item\.checkout_eligible!==true/);
  assert.match(js, /product\.stock_status==="tracked"/);
});


test("MMD Shop product detail variant UX keeps URL and active SKU in sync", async () => {
  const js = await readFile(productJsUrl, "utf8");

  assert.match(js, /function canCheckout\(item\)/);
  assert.match(js, /item\.checkout_eligible!==true/);
  assert.match(js, /render\(selected,\{resetQty:true\}\)/);
  assert.match(js, /updateVariantUrl\(selected\)/);
  assert.match(js, /u\.searchParams\.delete\("sku"\)/);
  assert.match(js, /root\.dataset\.activeSku=item\.sku/);
  assert.match(js, /variantSelect\.setAttribute\("aria-label",label\)/);
});
