import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../webflow/mmd-shop/", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("MMD Shop shared i18n supports TH EN ZH without rewrite loops", async () => {
  const i18n = await source("i18n.js");
  assert.match(i18n, /mmd_shop_lang/);
  assert.match(i18n, /th:\s*\{/);
  assert.match(i18n, /en:\s*\{/);
  assert.match(i18n, /zh:\s*\{/);
  assert.match(i18n, /\?lang=th\|en\|zh/);
  assert.match(i18n, /mmd:shop-language-change/);
  assert.match(i18n, /if\(raw!==next\)el\.textContent=next/);
  assert.match(i18n, /rulesP12b/);
});

test("Product detail keeps canonical variants gated by backend eligibility", async () => {
  const html = await source("product/product.html");
  const js = await source("product/product.js");
  const footer = await source("product/footer.html");
  assert.match(html, /data-variant-wrap/);
  assert.match(html, /data-variant-select/);
  assert.match(js, /data\.variants/);
  assert.match(js, /product\.variant_group/);
  assert.match(js, /product\.checkout_eligible===true/);
  assert.match(js, /history\.replaceState/);
  assert.match(js, /item\.product_url/);
  assert.match(footer, /MMD Shop TH \/ EN \/ ZH runtime i18n/);
  assert.match(footer, /GLEN-POP/);
});

test("Rules and Order mirrors carry recovery, i18n, and transaction state contracts", async () => {
  const rules = await source("rules/rules.html");
  const rulesFooter = await source("rules/footer.html");
  const orderHead = await source("order/head.html");
  const orderFooter = await source("order/footer.html");

  assert.match(rules, /6aaf1d69f661aa2fdfa998d4/);
  assert.match(rules, /On-demand/);
  assert.match(rulesFooter, /mmd_shop_lang/);
  assert.match(rulesFooter, /scrollIntoView/);

  assert.match(orderHead, /mmdshop-order-next/);
  assert.match(orderFooter, /mmd_shop_lang/);
  assert.match(orderFooter, /payment_status/);
  assert.match(orderFooter, /reservation/);
  assert.match(orderFooter, /fulfillment/);
  assert.match(orderFooter, /refund/);
});

test("Root mirror keeps Per voice and the shared i18n contract", async () => {
  const html = await source("main.html");
  const footer = await source("mmd-shop-commerce-footer.html");
  assert.match(html, /ของที่ผมใช้เวลาเลือกให้แล้ว/);
  assert.match(html, /ผมให้ MMD เช็ก/);
  assert.match(footer, /MMD Shop TH \/ EN \/ ZH runtime i18n/);
  assert.match(footer, /p\.checkout_eligible===true/);
  assert.match(footer, /mmd:shop-language-change/);
});
