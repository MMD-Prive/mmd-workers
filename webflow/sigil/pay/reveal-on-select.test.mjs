import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Payment destinations (QR URL, PromptPay number, bank name / account name / account number)
// must be written into the page only after the customer picks a method.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const v18 = read("./sigil-pay-v18-payment-methods.js");
const blackcard = read("./blackcard/footer.html");
const v20 = read("./v20/footer.html");
const v21 = read("./sigil-pay-v21.js");
const popup = read("../confirm/payment-instructions-popup-v1.js");
const tracker = read("../confirm/customer-session-tracker-v2.js");

const runtimeOf = (source) => {
  const marker = "mmd-sigil-pay-v18-methods-runtime";
  return source.includes(marker) ? source.slice(source.indexOf(marker)) : source;
};

for (const [name, full] of [["v18 methods", v18], ["blackcard footer", blackcard]]) {
  const source = runtimeOf(full);
  test(`${name}: no method preselected and destinations are written by renderQr/renderBank only`, () => {
    assert.match(source, /let selected="";/);
    assert.doesNotMatch(source, /let selected="promptpay"/);
    assert.doesNotMatch(source, /class="spkpm__tab is-active"/);
    assert.match(source, /data-method-panel="promptpay" hidden/);
    // load() must not write the QR or bank text directly
    const load = source.slice(source.indexOf("async function load()"));
    assert.doesNotMatch(load, /qr\.src\s*=/);
    assert.doesNotMatch(load, /bankName\.textContent/);
    assert.doesNotMatch(load, /accountName\.textContent/);
    assert.doesNotMatch(load, /setSelected\(first\)/);
    assert.match(source, /function renderQr\(\)/);
    assert.match(source, /function renderBank\(\)/);
    assert.match(source, /selected==="promptpay"/);
    assert.match(source, /selected==="bank_transfer"/);
    assert.match(source, /qr\.removeAttribute\("src"\)/);
    assert.match(source, /bankDetails\.open=false/);
  });
}

for (const [name, source, p] of [["v20", v20, "sp20"], ["v21", v21, "sp21"]]) {
  test(`${name}: destinations render only for the chosen method`, () => {
    assert.match(source, /selectedMethod=""/);
    assert.match(source, /function renderQr\(\)/);
    assert.match(source, /function renderBank\(\)/);
    assert.match(source, /selectedMethod==="promptpay"/);
    assert.match(source, /selectedMethod==="bank_transfer"/);
    assert.match(source, /bankRevealed&&selectedMethod==="bank_transfer"/);
    assert.match(source, /qr\.removeAttribute\("src"\)/);
    const renderInstructions = source.slice(source.indexOf("function renderInstructions"), source.indexOf("async function loadInstructions"));
    assert.doesNotMatch(renderInstructions, /qr\.src\s*=/);
    assert.doesNotMatch(renderInstructions, new RegExp(`\\[data-${p}-bank-name\\]`));
    assert.doesNotMatch(renderInstructions, new RegExp(`\\[data-${p}-account-name\\]`));
    assert.doesNotMatch(renderInstructions, new RegExp(`\\[data-${p}-promptpay-ref`));
    assert.doesNotMatch(renderInstructions, /setMethod\(methods\[0\]\)/);
  });
}

test("confirm popup: customer picks a method before any destination is written", () => {
  assert.match(popup, /data-c/);
  assert.match(popup, /QR PromptPay/);
  assert.match(popup, /โอนธนาคาร/);
  assert.match(popup, /e\.onclick=/);
  // the fetch handler must not write the QR src or bank text outside the onclick handler
  const afterFetch = popup.slice(popup.indexOf("let i=j.instructions"), popup.indexOf("e.onclick="));
  assert.doesNotMatch(afterFetch, /Q\.src\s*=/);
  assert.doesNotMatch(afterFetch, /B\.textContent\s*=\s*\(/);
});

test("customer tracker: final-payment methods are chosen before QR / bank details render", () => {
  assert.match(tracker, /data-final-method-choice/);
  assert.match(tracker, /data-final-method-detail/);
  const render = tracker.slice(tracker.indexOf("function renderPaymentMethods"), tracker.indexOf("async function loadPaymentInstructions"));
  const beforeClick = render.slice(0, render.indexOf('addEventListener("click"'));
  assert.doesNotMatch(beforeClick, /pay-qr/);
  assert.doesNotMatch(beforeClick, /account_number\)\}/);
  assert.doesNotMatch(beforeClick, /display_ref/);
});
