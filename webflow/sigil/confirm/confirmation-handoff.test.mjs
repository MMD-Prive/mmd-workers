import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./confirmation-handoff.js", import.meta.url), "utf8");

test("confirmation handoff uses canonical same-origin website paths", () => {
  assert.match(source, /CUSTOMER_CONFIRM_PATH = "\/sigil\/confirm\/job-confirmation"/);
  assert.match(source, /MODEL_CONFIRM_PATH = "\/sigil\/confirm\/job-model"/);
  assert.match(source, /MEMBER_WEB_PATH = "\/my-mmd\/"/);
  assert.match(source, /MODEL_WEB_PATH = "\/sigil\/model\/dashboard"/);
  assert.match(source, /PAYMENT_WEB_PATH = "\/sigil\/pay"/);
  assert.match(source, /ดูสถานะงานปัจจุบันใน MY MMD/);
  assert.match(source, /ไปที่ MY MODEL บนเว็บไซต์/);
});

test("confirmation handoff never forces a redirect or uses LIFF destinations", () => {
  assert.doesNotMatch(source, /miniapp\.line\.me/);
  assert.doesNotMatch(source, /href\s*=\s*["']\/member\/my-mmd/);
  assert.doesNotMatch(source, /location\.(?:assign|replace)\(/);
  assert.match(source, /Never auto-redirect/);
});

test("customer payment link is only on success and carries the existing signed token", () => {
  assert.match(source, /PAYMENT_WEB_PATH = "\/sigil\/pay"/);
  assert.match(source, /function wireCustomerPayment\(\)/);
  assert.match(source, /if \(path !== CUSTOMER_CONFIRM_PATH\) return;/);
  assert.match(source, /root\.querySelector\("\[data-c-success\]"\)/);
  assert.match(source, /target\.searchParams\.set\("t", token\)/);
  assert.match(source, /link\.textContent = "ชำระเงิน \/ Payment"/);
  assert.match(source, /wireCustomerPayment\(\)/);
  assert.doesNotMatch(source, /window\.location\.href\s*=\s*PAYMENT_WEB_PATH/);
});

function mountedPage(path, token = "abc." + "a".repeat(64)) {
  let root = null;
  let observe;
  let onHide;
  let disconnected = false;
  let labelWrites = 0;
  const attrs = new Map();
  const modelLink = {
    href: "", label: "",
    get textContent() { return this.label; },
    set textContent(value) { this.label = value; labelWrites++; },
    getAttribute: key => attrs.get(key),
    setAttribute: (key, value) => attrs.set(key, value),
  };
  const children = [];
  const success = {
    querySelector: selector => children.find(link => link.attributes.has(selector.slice(1, -1))) || null,
    appendChild: link => children.push(link),
  };
  const fixture = {
    querySelector(selector) {
      if (selector === ".mm15__success a, [data-m-success] a") return modelLink;
      if (selector === "[data-c-success]") return success;
      if (selector === "[data-c-confirm]") return { className: "primary" };
      return success.querySelector(selector);
    },
  };
  const document = {
    readyState: "complete", body: {}, documentElement: { lang: "th" },
    getElementById: () => root,
    createElement: () => ({ attributes: new Map(), setAttribute(key, value) { this.attributes.set(key, value); } }),
  };
  vm.runInNewContext(source, {
    URL, document,
    window: { location: { pathname: path, href: "https://www.mmdbkk.com" + path + "?t=" + token },
      addEventListener: (_, callback) => { onHide = callback; } },
    MutationObserver: class {
      constructor(callback) { observe = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  });
  return {
    mount() { root = fixture; observe(); },
    rerender() { children.length = 0; observe(); },
    tick() { observe(); },
    hide() { onHide(); },
    children, modelLink,
    get labelWrites() { return labelWrites; },
    get disconnected() { return disconnected; },
  };
}

test("late customer skin mount and replacement retain one web Jobs link and signed web Payment link", () => {
  const token = "abc." + "a".repeat(64);
  const page = mountedPage("/sigil/confirm/job-confirmation", token);
  for (const action of ["mount", "tick", "rerender", "tick"]) {
    page[action]();
    assert.equal(page.children.length, 2);
    const payment = page.children.find(link => link.attributes.has("data-mmd-payment-liff"));
    assert.equal(new URL(payment.href, "https://www.mmdbkk.com").searchParams.get("t"), token);
    assert.equal(new URL(payment.href, "https://www.mmdbkk.com").pathname, "/sigil/pay");
    assert.equal(payment.referrerPolicy, "no-referrer");
    assert.equal(page.children[0].href, "/my-mmd/");
    assert.ok(!page.children[0].href.includes(token), "no signed token in MY MMD URL");
  }
  page.hide();
  assert.equal(page.disconnected, true);
});

test("late model success mount is idempotent across observer callbacks", () => {
  const page = mountedPage("/sigil/confirm/job-model");
  page.mount();
  page.tick();
  page.tick();
  assert.equal(page.modelLink.href, "/sigil/model/dashboard?handoff=job-confirmed&lang=th");
  assert.equal(page.labelWrites, 1);
  assert.equal(page.children.length, 0);
});

test("malformed customer token never gets a Payment handoff", () => {
  const page = mountedPage("/sigil/confirm/job-confirmation", "invalid");
  page.mount();
  assert.equal(page.children.length, 1);
  assert.equal(page.children[0].attributes.has("data-mmd-my-mmd"), true);
});


const paymentWebReturn = readFileSync(
  new URL("./payment-confirmation-web-return-v1.js", import.meta.url), "utf8"
);

function paymentFixture(path) {
  const attrs = new Map([["href", "/member/my-mmd"]]);
  let label = "กลับ MY MMD";
  let notify = () => {};
  let onHide = () => {};
  let disconnected = false;
  const link = {
    getAttribute: name => attrs.get(name) || null,
    setAttribute: (name, value) => attrs.set(name, value),
    get textContent() { return label; },
    set textContent(value) { label = value; },
  };
  const root = {
    querySelector: sel => sel === ".mpc-actions .mpc-btn-primary" ? link : null,
  };
  const document = {
    readyState: "complete", body: {},
    querySelector: sel => sel === "[data-mpc]" ? root : null,
  };
  const window = {
    location: { pathname: path },
    addEventListener: (_, fn) => { onHide = fn; },
  };
  vm.runInNewContext(paymentWebReturn, {
    document, window,
    MutationObserver: class {
      constructor(fn) { notify = fn; }
      observe() {}
      disconnect() { disconnected = true; }
    },
  });
  return { link, tick: () => notify(), hide: () => onHide(), isDisconnected: () => disconnected };
}

test("payment confirmation returns to website payment center without asserting verification", () => {
  const p = paymentFixture("/sigil/confirm/payment-confirmation");
  assert.equal(p.link.getAttribute("href"), "/my-mmd/payments");
  assert.equal(p.link.textContent, "ดูสถานะชำระเงินใน MY MMD");
  assert.equal(p.link.getAttribute("data-mmd-canonical-target"), "my-mmd-payment-center");
  p.tick();
  assert.equal(p.link.getAttribute("href"), "/my-mmd/payments");
  p.hide();
  assert.equal(p.isDisconnected(), true);
  assert.doesNotMatch(paymentWebReturn, /location\\.(?:assign|replace)\\(/);
  assert.doesNotMatch(paymentWebReturn, /fetch\\(|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(paymentWebReturn, /status.*(?:verified|paid)/i);
});

test("payment website patch does not run on unrelated paths", () => {
  const p = paymentFixture("/sigil/confirm/job-model");
  assert.equal(p.link.getAttribute("href"), "/member/my-mmd");
  assert.equal(p.link.textContent, "กลับ MY MMD");
});
