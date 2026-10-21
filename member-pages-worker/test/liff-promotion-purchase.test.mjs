import test from "node:test";
import assert from "node:assert/strict";
import { handleLiffPromotionPurchase as handle } from "../src/liff-promotion-purchase.js";
import { handleDoubleMomentRequest, reconcileDoubleMomentReviewedProof } from "../../payments-worker/double-moment-purchase-v1.js";

const UID = "U1234567890abcdef1234567890abcdef";
const CLIENT = "rec12345678901234";
const ROOT = "https://mmdbkk.com/member/api/liff/promotions/double-moment";
async function fixture({ clients = 1, activated = false, checkout = "https://mmdbkk.com/pay/checkout?t=mock", failKv = false } = {}) {
  const secret = "mock-secret-with-more-than-thirty-two-chars";
  const session = { line_user_id: UID, expires_at: Date.now() + 600000, member_exists: true, member_id: "mem_mock", member_profile: {} };
  const calls = [], writes = [], intents = [], claims = new Map(), credits = new Map();
  const payment = { id: "recPaymentMock001", fields: { amount_thb: 20000, "Payment Status": "pending", "Verification Status": "pending", package_code: "double_moment_20000" } };
  const paymentEnv = { AUTH_SERVICE_MEMBER_TO_PAYMENTS: "mock-internal", AIRTABLE_BASE_ID: "mock", AIRTABLE_API_KEY: "mock", AIRTABLE_HTTP: { async fetch(request) {
    const url = new URL(request.url); const table = url.pathname.split("/")[3];
    calls.push({ method: request.method, table, formula: url.searchParams.get("filterByFormula") });
    if (request.method === "GET") {
      if (table === "tblVv58TCbwh5j1fS") return Response.json({ records: Array.from({ length: clients }, (_, i) => ({ id: i ? "rec22222222222222" : CLIENT, fields: { line_user_id: UID } })) });
      if (table === "tblKvhl2zZm9yYBmT") return Response.json({ records: activated ? [{ id: "recCreditMock0001" }] : [...credits.values()].filter(row => (url.searchParams.get("filterByFormula") || "").includes(row.fields.credit_id)) });
      if (table === "tblWGGJJOx5eBvBZJ") return Response.json({ records: [payment] });
      return Response.json({ records: [...claims.values()] });
    }
    const body = await request.json(); writes.push({ table, body });
    if (request.method === "POST" && table === "tblKvhl2zZm9yYBmT") { const row = { id: "recCreditMock000" + credits.size, fields: body.records[0].fields }; credits.set(row.fields.credit_id, row); return Response.json({ records: [row] }); }
    if (request.method === "POST") { const row = { id: "recClaimMock00001", fields: body.records[0].fields }; claims.set(row.id, row); return Response.json({ records: [row] }); }
    if (table === "tblWGGJJOx5eBvBZJ") Object.assign(payment.fields, body.fields);
    return Response.json({ id: "recMockUpdated01" });
  } } };
  const env = { LIFF_PROMOTION_PURCHASE_ENABLED: "true", AUTH_SERVICE_MEMBER_TO_PAYMENTS: "mock-internal", LIFF_SESSION_SECRET: secret,
    LIFF_IDENTITY_KV: { async get() { return session; }, async put(key, value) { if (failKv) throw new Error("mock_failure"); Object.assign(session, JSON.parse(value)); } },
    PAYMENTS_WORKER: { async fetch(request) {
      assert.equal(request.headers.get("cookie"), null);
      assert.equal(request.headers.get("x-internal-token"), "mock-internal");
      return handleDoubleMomentRequest(request, paymentEnv, async next => { const body = await next.json(); intents.push(body); return Response.json({ ok: true, payment_ref: "pay_mock", session_id: body.session_id, unified_payment_flow: "v1", customer_payment_url: checkout }); });
    } },
  };
  const request = (purchase = false, body = { package_code: "double_moment_20000" }, headers = {}) => new Request(ROOT + (purchase ? "/purchase" : "/offer"), { method: purchase ? "POST" : "GET", headers: { cookie: "__Host-mmd_liff_session=mock", origin: "https://mmdbkk.com", "content-type": "application/json", ...headers }, ...(purchase ? { body: JSON.stringify(body) } : {}) });
  return { env, paymentEnv, request, writes, intents, calls, session, payment, claims };
}

test("offer reads only; returns canonical numbers, no internal identities or service token", async () => {
  const fx = await fixture(); const response = await handle(fx.request(), fx.env); const text = await response.text(); const p = JSON.parse(text);
  assert.equal(p.amount_thb, 20000); assert.equal(p.paid_credit_thb, 20000); assert.equal(p.bonus_1_thb, 3500); assert.equal(p.bonus_2_thb, 3500); assert.equal(p.total_credit_thb, 27000); assert.equal(p.validity_days, 180); assert.equal(p.minimum_service_thb, 20000);
  assert.equal(p.refundable, false); assert.equal(p.entitlement_granted, false);
  assert.doesNotMatch(text, /mock-internal|rec123|mem_mock|U123/); assert.equal(fx.writes.length, 0); assert.equal(fx.intents.length, 0);
});

test("default-off, missing session/secret, cross-origin and browser identity/price tampering cannot create payments", async () => {
  const fx = await fixture();
  assert.equal((await handle(fx.request(true), { ...fx.env, LIFF_PROMOTION_PURCHASE_ENABLED: "false" })).status, 404);
  assert.equal((await handle(fx.request(), { ...fx.env, LIFF_IDENTITY_KV: null })).status, 401);
  assert.equal((await handle(fx.request(), { ...fx.env, AUTH_SERVICE_MEMBER_TO_PAYMENTS: "" })).status, 503);
  assert.equal((await handle(fx.request(true, undefined, { origin: "https://evil.example" }), fx.env)).status, 403);
  for (const extra of [{ amount: 1 }, { client_record_id: CLIENT }, { line_user_id: UID }, { redirect_to: "https://evil.example" }]) assert.equal((await handle(fx.request(true, { package_code: "double_moment_20000", ...extra }), fx.env)).status, 400);
  assert.equal(fx.intents.length, 0);
});

test("missing/ambiguous canonical Client or already activated account has no payment button and creates nothing", async () => {
  for (const clients of [0, 2]) { const fx = await fixture({ clients }); assert.equal((await handle(fx.request(true), fx.env)).status, 409); assert.equal(fx.intents.length, 0); }
  const fx = await fixture({ activated: true });
  for (const purchase of [false, true]) { const p = await (await handle(fx.request(purchase), fx.env)).json(); assert.equal(p.status, "already_activated"); assert.equal(p.payment_available, false); }
  assert.equal(fx.writes.length, 0);
});

test("purchase uses canonical identity, reuses deterministic session, saves signed checkout, never issues credit", async () => {
  const fx = await fixture();
  for (let i = 0; i < 2; i++) { const response = await handle(fx.request(true), fx.env); const p = await response.json(); assert.equal(response.status, 200); assert.equal(p.entitlement_granted, false); assert.equal(p.customer_payment_url, "https://mmdbkk.com/pay/checkout?t=mock"); }
  assert.equal(fx.intents[0].amount, 20000); assert.equal(fx.intents[0].session_id, fx.intents[1].session_id);
  assert.equal(fx.session.payment_amount_thb, 20000); assert.equal(fx.session.payment_package_code, "double_moment_20000");
  assert.equal(fx.writes.filter(w => w.table === "tblKvhl2zZm9yYBmT").length, 0);
  // A successful proof intake envelope alone cannot grant anything while money is pending.
  const response = await reconcileDoubleMomentReviewedProof(new Request("https://payments.internal/review", { method: "POST", body: JSON.stringify({ payment_ref: "pay_mock" }) }), Response.json({ ok: true }), fx.paymentEnv);
  assert.equal(response.status, 502); assert.equal(fx.writes.filter(w => w.table === "tblKvhl2zZm9yYBmT").length, 0);
});

test("unsafe checkout and failed local persistence fail closed without exposing upstream data", async () => {
  for (const checkout of ["https://evil.example/pay/checkout?t=x", "https://user@mmdbkk.com/pay/checkout?t=x", "https://mmdbkk.com:444/pay/checkout?t=x", "https://mmdbkk.com/pay/checkout?t=x&t=y", "https://mmdbkk.com/pay/checkout?t=x&amount=1"]) { const fx = await fixture({ checkout }); assert.equal((await handle(fx.request(true), fx.env)).status, 503); }
  const fx = await fixture({ failKv: true }); assert.equal((await handle(fx.request(true), fx.env)).status, 503);
});

 test("only verified payment issues the three constrained credits; reviewed replay does not duplicate them", async () => {
  const fx = await fixture();
  await handle(fx.request(true), fx.env);
  Object.assign(fx.payment.fields, { "Payment Status": "paid", "Verification Status": "verified" });
  const review = () => new Request("https://payments.internal/review", { method: "POST", body: JSON.stringify({ payment_ref: "pay_mock" }) });
  for (let i = 0; i < 2; i++) {
    const result = await reconcileDoubleMomentReviewedProof(review(), Response.json({ ok: true }), fx.paymentEnv);
    assert.equal(result.status, 200); assert.equal((await result.json()).double_moment.activated, true);
  }
  const writes = fx.writes.filter(w => w.table === "tblKvhl2zZm9yYBmT");
  assert.equal(writes.length, 3);
  assert.deepEqual(writes.map(w => w.body.records[0].fields["Original Amount THB"]), [20000, 3500, 3500]);
  for (const w of writes) { const f = w.body.records[0].fields; assert.equal(f.Refundable, false); assert.equal(f["Minimum Service Amount THB"], 20000); assert.equal(Math.round((Date.parse(f["Expires At"]) - Date.parse(f["Issued At"])) / 86400000), 180); }
});
