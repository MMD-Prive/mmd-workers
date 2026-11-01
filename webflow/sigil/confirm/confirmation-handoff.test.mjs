import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./confirmation-handoff.js", import.meta.url), "utf8");

test("confirmation handoff uses canonical signed pages and LINE Mini App dashboards", () => {
  assert.match(source, /CUSTOMER_CONFIRM_PATH = "\/sigil\/confirm\/job-confirmation"/);
  assert.match(source, /MODEL_CONFIRM_PATH = "\/sigil\/confirm\/job-model"/);
  assert.match(source, /MEMBER_LIFF_URL = "https:\/\/miniapp\.line\.me\/2010862595-yT4DCEMc\/\?view=jobs"/);
  assert.match(source, /MODEL_LIFF_URL = "https:\/\/miniapp\.line\.me\/2010864854-N34SgCqq"/);
  assert.ok(source.includes('new URL(`${MODEL_LIFF_URL}/`)'));
  assert.match(source, /ดู Upcoming Job ใน My MMD/);
  assert.match(source, /ไปที่ MY MODEL ใน LINE/);
});

test("confirmation handoff does not route success back to legacy or web-only dashboards", () => {
  assert.doesNotMatch(source, /href\s*=\s*["']\/model\/dashboard/);
  assert.doesNotMatch(source, /href\s*=\s*["']\/member\/my-mmd/);
  assert.doesNotMatch(source, /MODEL_DASHBOARD_PATH/);
  assert.doesNotMatch(source, /MY_MMD_PATH/);
  assert.doesNotMatch(source, /location\.(?:assign|replace)\(/);
});

test("customer payment link is only on success and carries the existing signed token", () => {
  assert.match(source, /PAYMENT_LIFF_URL = "https:\/\/miniapp\.line\.me\/2010830159-0n1O3ANK"/);
  assert.match(source, /function wireCustomerPayment\(\)/);
  assert.match(source, /if \(path !== CUSTOMER_CONFIRM_PATH\) return;/);
  assert.match(source, /root\.querySelector\("\[data-c-success\]"\)/);
  assert.match(source, /target\.searchParams\.set\("t", token\)/);
  assert.match(source, /link\.textContent = "ชำระเงิน \/ Payment"/);
  assert.match(source, /wireCustomerPayment\(\)/);
  assert.doesNotMatch(source, /window\.location\.href\s*=\s*PAYMENT_LIFF_URL/);
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

test("late customer skin mount and replacement retain exactly one Jobs and Payment handoff", () => {
  const token = "abc." + "a".repeat(64);
  const page = mountedPage("/sigil/confirm/job-confirmation", token);
  for (const action of ["mount", "tick", "rerender", "tick"]) {
    page[action]();
    assert.equal(page.children.length, 2);
    const payment = page.children.find(link => link.attributes.has("data-mmd-payment-liff"));
    assert.equal(new URL(payment.href).searchParams.get("t"), token);
    assert.equal(payment.referrerPolicy, "no-referrer");
    assert.equal(new URL(page.children[0].href).searchParams.get("view"), "jobs");
  }
  page.hide();
  assert.equal(page.disconnected, true);
});

test("late model success mount is idempotent across observer callbacks", () => {
  const page = mountedPage("/sigil/confirm/job-model");
  page.mount();
  page.tick();
  page.tick();
  assert.equal(page.modelLink.href, "https://miniapp.line.me/2010864854-N34SgCqq/?lang=th");
  assert.equal(page.labelWrites, 1);
  assert.equal(page.children.length, 0);
});

test("malformed customer token never gets a Payment handoff", () => {
  const page = mountedPage("/sigil/confirm/job-confirmation", "invalid");
  page.mount();
  assert.equal(page.children.length, 1);
  assert.equal(page.children[0].attributes.has("data-mmd-my-mmd"), true);
});
