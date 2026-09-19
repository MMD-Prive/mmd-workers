import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../../webflow/mmd-shop/mmd-shop-commerce-footer.html", import.meta.url);

test("MMD Shop Webflow cart is gated by canonical checkout_eligible", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /p\.checkout_eligible===true/);
  assert.match(source, /online_checkout_status/);
  assert.match(source, /function reconcileCart\(\)/);
  assert.match(source, /Cart ถูกอัปเดตตามสต๊อกล่าสุดแล้ว/);
  assert.match(source, /สต๊อกที่พร้อมสั่งมี/);

  const addStart = source.indexOf("function add(id)");
  const addEnd = source.indexOf("function syncShippingVisibility", addStart);
  const addBlock = source.slice(addStart, addEnd);
  assert.match(addBlock, /p\.checkout_eligible!==true/);

  const checkoutStart = source.indexOf("async function checkout()");
  const checkoutEnd = source.indexOf("grid&&grid.addEventListener", checkoutStart);
  const checkoutBlock = source.slice(checkoutStart, checkoutEnd);
  assert.match(checkoutBlock, /reconcileCart\(\)/);
  assert.match(checkoutBlock, /p\.checkout_eligible!==true/);
});
