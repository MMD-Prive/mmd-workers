import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [head, body, footer] = await Promise.all([
  readFile(new URL("./head.html", import.meta.url), "utf8"),
  readFile(new URL("./body.html", import.meta.url), "utf8"),
  readFile(new URL("./footer.html", import.meta.url), "utf8"),
]);

assert.match(body, /id="sigil-pay-v20"/);
assert.match(body, /data-details-path="\/v1\/confirm\/details"/);
assert.match(body, /data-instructions-path="\/v1\/confirm\/payment-instructions"/);
assert.match(body, /data-proof-path="\/v1\/pay\/slip\/evidence"/);

for (const method of ["promptpay", "bank_transfer", "paypal_card"]) {
  assert.match(body, new RegExp('data-sp20-method="' + method + '"'));
  assert.match(body, new RegExp('data-sp20-panel="' + method + '"'));
}

for (const hook of [
  "data-sp20-model",
  "data-sp20-date",
  "data-sp20-time",
  "data-sp20-location",
  "data-sp20-full",
  "data-sp20-discount",
  "data-sp20-net",
  "data-sp20-due",
  "data-sp20-balance",
]) assert.match(body, new RegExp(hook));

assert.match(head, /#sigil-pay-v20/);
assert.match(head, /@media\(min-width:680px\)/);
assert.match(head, /@media\(min-width:960px\)/);
assert.doesNotMatch(head, /(^|[},\s])(body|button|input|textarea)\s*\{/m);

assert.match(footer, /expected_role:"customer"/);
assert.match(footer, /mmd_payment_instructions_v1/);
assert.match(footer, /authority!=="payments-worker"/);
assert.match(footer, /source_page","sigil_pay_v20"/);
assert.match(footer, /credentials:"omit"/);
assert.match(footer, /new AbortController\(\)/);
assert.match(footer, /\.webflow\.io\$/);
assert.doesNotMatch(footer, /Account Number|PromptPay Ref|paypal\.com\/ncp\/payment/i);

const runtime = footer.replace(/^\s*<script[^>]*>/i, "").replace(/<\/script>\s*$/i, "");
assert.doesNotThrow(() => new Function(runtime), "v20 footer runtime must compile");

console.log("SIGIL Pay v20 contract OK");
