import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../webflow/mmd-shop/", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("MMD Shop shared i18n supports TH EN ZH with safe persisted locale", async () => {
  const i18n = await source("i18n.js");
  assert.match(i18n, /mmd_shop_lang/);
  assert.match(i18n, /th:\s*\{/);
  assert.match(i18n, /en:\s*\{/);
  assert.match(i18n, /zh:\s*\{/);
  assert.match(i18n, /\?lang=th\|en\|zh/);
  assert.match(i18n, /mmd:shop-language-change/);
  assert.match(i18n, /if\(raw!==next\)el\.textContent=next/);
});

test("MMD Shop product detail binds canonical variants without bypassing checkout eligibility", async () => {
  const html = await source("product/product.html");
  const js = await source("product/product.js");
  assert.match(html, /data-variant-wrap/);
  assert.match(html, /data-variant-select/);
  assert.match(js, /data\.variants/);
  assert.match(js, /product\.variant_group/);
  assert.match(js, /product\.checkout_eligible===true/);
  assert.match(js, /history\.replaceState/);
  assert.match(js, /item\.product_url/);
});

test("MMD Shop root rules and order mirrors carry the shared language and recovery contracts", async () => {
  const rootFooter = await source("mmd-shop-commerce-footer.html");
  const rules = await source("rules/rules.html");
  const order = await source("order/footer.html");
  assert.match(rootFooter, /MMDShopI18n/);
  assert.match(rootFooter, /mmd:shop-language-change/);
  assert.match(rules, /6aaf1d69f661aa2fdfa998d4/);
  assert.match(rules, /mmdr__recovery-visual/);
  assert.match(order, /MMD Shop TH \/ EN \/ ZH runtime i18n/);
  assert.match(order, /payment_status/);
  assert.match(order, /reservation/);
  assert.match(order, /fulfillment/);
  assert.match(order, /refund/);
});
