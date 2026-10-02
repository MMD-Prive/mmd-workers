import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../../global/mmd-canonical-cta-v4.js", import.meta.url), "utf8");
const functionSource = source.slice(source.indexOf("  async function startRenewalPayment("), source.indexOf("  async function setupRenewalFlow("));
function harness(memberApi) {
  const status = { textContent: "" };
  const assigned = [];
  const context = vm.createContext({
    memberApi, renewalStatusNode: () => status,
    canonicalPaymentUrl: value => value === "https://mmdbkk.com/sigil/pay?t=fixture" ? value : "",
    location: { assign: value => assigned.push(value) },
  });
  vm.runInContext(functionSource, context);
  const root = { dataset: {} };
  const trigger = { textContent: "Renew", style: {}, setAttribute() {}, removeAttribute() {} };
  return { status, assigned, root, run: () => context.startRenewalPayment(root, "standard", trigger) };
}

test("double click submits one sequence while requests are in flight", async () => {
  const calls = [];
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const h = harness(async path => {
    calls.push(path);
    if (path === "/v1/member/payments") { await waiting; return { records: [] }; }
    return { redirect_to: "https://mmdbkk.com/sigil/pay?t=fixture" };
  });
  const first = h.run();
  await h.run();
  assert.deepEqual(calls, ["/v1/member/payments"]);
  release(); await first;
  assert.deepEqual(calls, ["/v1/member/payments", "/member/api/liff/intent", "/member/api/liff/package", "/member/api/liff/payment-intent"]);
  assert.equal(h.assigned.length, 1);
  assert.equal(h.root.dataset.renewalPaymentBusy, undefined);
});

for (const state of ["pending_review", "awaiting_payment"]) {
  test(`reload/back resumes ${state} without new intent`, async () => {
    const calls = [];
    const h = harness(async path => {
      calls.push(path);
      return { records: [{ payment_ref: "fixture-ref", official_status: state, customer_payment_url: "https://mmdbkk.com/sigil/pay?t=fixture" }] };
    });
    await h.run();
    assert.deepEqual(calls, ["/v1/member/payments"]);
    assert.deepEqual(h.assigned, [state === "pending_review" ? "/my-mmd/payments" : "https://mmdbkk.com/sigil/pay?t=fixture"]);
  });
}

test("payment status failure stops new charges and provides manual evidence instructions", async () => {
  const calls = [];
  const h = harness(async path => { calls.push(path); throw new Error("unavailable"); });
  await h.run();
  assert.deepEqual(calls, ["/v1/member/payments"]);
  assert.deepEqual(h.assigned, []);
  assert.match(h.status.textContent, /เลขอ้างอิงพร้อมสลิปในแชท LINE เดิม/);
  assert.equal(h.root.dataset.renewalPaymentBusy, undefined);
});

test("expired session keeps the customer on Private login recovery", async () => {
  const h = harness(async () => { const error = new Error("expired"); error.status = 401; throw error; });
  await h.run();
  assert.match(h.status.textContent, /member\/liff\?world=private/);
  assert.deepEqual(h.assigned, []);
});
