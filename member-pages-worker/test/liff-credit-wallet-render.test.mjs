import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/liff-member-shell.js", import.meta.url), "utf8");
const start = source.indexOf("  function renderCreditWalletChecking() {");
const end = source.indexOf("  function benefitLabel(", start);
assert.ok(start >= 0 && end > start, "Credit Wallet render functions must remain extractable for behavior tests");

class Element {
  constructor(tag = "div") { this.tagName = tag; this.className = ""; this.textContent = ""; this.children = []; }
  replaceChildren(...children) { this.children = [...children]; }
  append(...children) { this.children.push(...children); }
}

function render(data) {
  const elements = new Map([
    ["credit-wallet-message", new Element("p")], ["credit-available", new Element("strong")],
    ["credit-reserved", new Element("strong")], ["credit-used", new Element("strong")], ["credit-wallet", new Element("div")],
  ]);
  const document = { getElementById(id) { return elements.get(id); }, createElement(tag) { return new Element(tag); } };
  const copy = { creditChecking: "checking", checking: "checking", creditEmpty: "empty", empty: "empty", creditVerified: "verified", creditExpiry: "valid until" };
  const appendEmpty = (container, text) => { const item = document.createElement("p"); item.className = "empty"; item.textContent = text; container.append(item); };
  const renderer = new Function("document", "copy", "locale", "formatThb", "shortDate", "appendEmpty", `${source.slice(start, end)}\nreturn renderCreditWallet;`);
  renderer(document, copy, "th", (value) => `THB ${value}`, (value) => value || "—", appendEmpty)(data);
  return elements;
}

function item(overrides = {}) {
  return { creditId: "CRD-001", verified: true, verificationState: "verified", status: "available", originalAmountThb: 100, availableAmountThb: 80, reservedAmountThb: 10, appliedAmountThb: 10, ...overrides };
}

function data(items, balance = {}) {
  return { state: "resolved", verificationState: "verified_only", balance: { currency: "THB", available: 80, paidAvailableThb: 0, bonusAvailableThb: 0, carriedForwardAvailableThb: 80, ...balance }, items };
}

function assertChecking(elements) {
  assert.equal(elements.get("credit-wallet-message").textContent, "checking");
  for (const id of ["credit-available", "credit-reserved", "credit-used"]) assert.equal(elements.get(id).textContent, "—");
  assert.equal(elements.get("credit-wallet").children[0]?.textContent, "checking");
}

test("mixed valid and malformed rows fail closed instead of showing a partial balance", () => {
  assertChecking(render(data([item(), item({ creditId: "CRD-002", verificationState: "pending" })])));
});

test("all malformed rows fail closed", () => {
  assertChecking(render(data([item({ status: "unknown" })])));
});

test("unknown lifecycle rows fail closed when a valid row also matches the balance", () => {
  assertChecking(render(data([item(), item({ creditId: "CRD-002", status: "unknown", availableAmountThb: 0 })])));
});

test("duplicate credit IDs fail closed", () => {
  assertChecking(render(data([item(), item({ availableAmountThb: 0, reservedAmountThb: 10, appliedAmountThb: 90 })])));
});

test("row conservation and summary buckets must match the server balance", () => {
  assertChecking(render(data([item({ availableAmountThb: 95 })])));
  assertChecking(render(data([item()], { paidAvailableThb: 80, bonusAvailableThb: 10, carriedForwardAvailableThb: 0 })));
});

test("a resolved empty ledger is an empty wallet rather than a checking or fake ledger row", () => {
  const elements = render(data([], { available: 0, paidAvailableThb: 0, bonusAvailableThb: 0, carriedForwardAvailableThb: 0 }));
  assert.equal(elements.get("credit-wallet-message").textContent, "empty");
  assert.equal(elements.get("credit-available").textContent, "THB 0");
  assert.equal(elements.get("credit-wallet").children[0]?.textContent, "empty");
});

test("malformed item list and missing credit identifier fail closed", () => {
  assertChecking(render(data(null)));
  assertChecking(render(data([item({ creditId: "" })])));
});
