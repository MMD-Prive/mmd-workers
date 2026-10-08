import test from "node:test";
import assert from "node:assert/strict";
import { buildPaymentLink, extractCustomerToken, handleAdminDashboardPaymentLinkRequest, PAYMENT_LINK_FIELD_IDS as F } from "./src/admin-dashboard-payment-link.js";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tok = (exp) => `${b64({ exp })}.sigsigsigsigsigsig`;
const row = (over = {}) => ({ [F.sessionId]: "sess_abc123", [F.paymentRef]: "pay_abc", [F.customerUrl]: `https://mmdbkk.com/confirm/customer?t=${tok(4102444800)}`, [F.paymentStatus]: { name: "pending" }, ...over });

test("extracts token", () => {
  assert.equal(extractCustomerToken("https://x.com/c?t=abcdefghijklmnop1234"), "abcdefghijklmnop1234");
  assert.equal(extractCustomerToken("junk"), "");
});
test("builds sigil pay link for unpaid job", () => {
  const r = buildPaymentLink(row());
  assert.equal(r.ok, true);
  assert.match(r.payment_link.url, /^https:\/\/mmdbkk\.com\/sigil\/pay\?t=/);
  assert.equal(r.payment_link.payment_status, "pending");
  assert.ok(r.payment_link.expires_at);
});
test("refuses paid, cancelled, expired, missing", () => {
  assert.equal(buildPaymentLink(row({ [F.paymentStatus]: { name: "paid" } })).error, "already_paid");
  assert.equal(buildPaymentLink(row({ [F.sessionStatus]: { name: "Cancelled" } })).error, "job_cancelled");
  assert.equal(buildPaymentLink(row({ [F.customerUrl]: `https://mmdbkk.com/c?t=${tok(1000)}` })).error, "payment_link_expired");
  assert.equal(buildPaymentLink(row({ [F.customerUrl]: "" })).error, "payment_link_unavailable");
});
test("handler validates input and auth", async () => {
  const req = (q) => new Request(`https://www.mmdbkk.com/v1/admin/dashboard?view=payment_link${q}`);
  assert.equal((await handleAdminDashboardPaymentLinkRequest(req("&session_id=sess_1"), {}, null)).status, 401);
  assert.equal((await handleAdminDashboardPaymentLinkRequest(req(""), {}, {})).status, 400);
  assert.equal((await handleAdminDashboardPaymentLinkRequest(req('&session_id=a"b'), {}, {})).status, 400);
});
test("handler returns link, no-store", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ records: [{ id: "rec1", fields: row() }] }));
  try {
    const res = await handleAdminDashboardPaymentLinkRequest(new Request("https://www.mmdbkk.com/v1/admin/dashboard?view=payment_link&session_id=sess_abc123"), { AIRTABLE_API_KEY: "k", AIRTABLE_BASE_ID: "b" }, {});
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store, private");
    assert.equal((await res.json()).ok, true);
  } finally { globalThis.fetch = orig; }
});
