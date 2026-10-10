import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./footer.html", import.meta.url), "utf8");
const runtime = source.match(/<script id="mmd-sigil-pay-v18-methods-runtime">([\s\S]*?)<\/script>/)?.[1] || "";
const loadFn = runtime.slice(runtime.indexOf("async function load()"));

test("checkout methods runtime script is present and parses", () => {
  assert.ok(runtime.length > 1000);
  assert.doesNotThrow(() => new Function(runtime));
});

test("no payment method is preselected in the markup", () => {
  assert.doesNotMatch(runtime, /class="spkpm__tab is-active"/);
  assert.doesNotMatch(runtime, /aria-selected="true"/);
  assert.match(runtime, /data-method-panel="promptpay" hidden/);
  assert.match(runtime, /let selected="";/);
});

test("load() does not write QR URL or bank destination into the page", () => {
  assert.ok(loadFn.length > 200);
  assert.doesNotMatch(loadFn, /\bqr\.src\s*=/);
  assert.doesNotMatch(loadFn, /data-method-bank-name/);
  assert.doesNotMatch(loadFn, /data-method-account-name/);
  assert.doesNotMatch(loadFn, /data-method-account-number/);
  assert.doesNotMatch(loadFn, /setSelected\(first\)/);
});

test("QR URL is written only when the customer selects PromptPay", () => {
  const setSelected = runtime.slice(runtime.indexOf("function setSelected"), runtime.indexOf("function closeShopModal"));
  assert.match(setSelected, /method==="promptpay"/);
  assert.match(setSelected, /qrImg\.src=qrSrc/);
  assert.match(setSelected, /removeAttribute\("src"\)/);
});

test("bank name, account name and number are rendered only when the bank details are opened", () => {
  assert.match(runtime, /function renderBankDetails\(open\)/);
  assert.match(runtime, /bankDetails\.addEventListener\("toggle",\(\)=>renderBankDetails\(bankDetails\.open\)\)/);
  assert.match(runtime, /bankBox\.open=false/);
});

test("PayPal link behaviour is unchanged", () => {
  assert.match(loadFn, /paypal\.href=paypalUrl/);
});
