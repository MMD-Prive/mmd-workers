import assert from "node:assert/strict";
import test from "node:test";

import { createConfirmTokenRecord, signConfirmToken } from "./index.js";
import {
  discountedPricing,
  handleConfirmApplyPromo,
  jobFormatFrom,
  withReplacedMarkedJson,
} from "./confirmation-promo.js";

const F = { sessionId: "fldLTq2kZbyRv22IA", amountThb: "fldhwC79ndbnEXSZz", customerAmountDueThb: "fldvJowquu8RrsOMc", paymentRef: "fldojgjSQLaO0uQLX", paymentStatus: "fldTY5lE6m0kQf72n", modelName: "flddVz6eoWRHrzIQr", jobType: "fldjK3U9bghnj7xUe", jobDate: "fldpnqoIsUMfN7y3c", note: "fldEcDkF7CH9VixWM" };
const SECRET = "payments-to-member-pages-test-secret-1234567";
const NOW = new Date("2026-10-11T03:00:00.000Z");
const PRICING = { full_price_thb: 25000, discount_mode: "none", discount_percent: 0, discount_thb: 0, net_price_thb: 25000, deposit_basis_thb: 25000, deposit_percent: 30, deposit_due_thb: 7500, deposit_received_thb: 0, balance_thb: 17500, deposit_round_step_thb: 500, deposit_rounding: "ceil" };

function session(overrides = {}) {
  return {
    id: "recSESSIONTEST0001",
    fields: {
      [F.sessionId]: "sess_promo_test",
      [F.amountThb]: 25000,
      [F.customerAmountDueThb]: 7500,
      [F.paymentRef]: "pay_promo_test",
      [F.paymentStatus]: "pending",
      [F.modelName]: "EI",
      [F.jobType]: "PN",
      [F.jobDate]: "2026-10-18",
      [F.note]: `create_job_v5 | work pn\n[SIGIL Pricing v1] ${JSON.stringify(PRICING)}\n[PENDING] x`,
      ...overrides,
    },
  };
}

async function setup({ sess = session(), redeem, paymentType = "deposit" } = {}) {
  const store = new Map();
  const calls = { patches: [], redeems: [] };
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "promo-test-signing-secret",
    PAY_SESSIONS_KV: { async put(k, v) { store.set(k, v); }, async get(k) { return store.get(k) ?? null; } },
    PAY_TOKEN_TTL_SECONDS: "3600",
    ALLOWED_ORIGINS: "https://mmdbkk.com",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_API_KEY: "pat_test",
    AUTH_SERVICE_PAYMENTS_TO_MEMBER_PAGES: SECRET,
    AIRTABLE_HTTP: {
      async fetch(request) {
        if (request.method === "PATCH") {
          const body = await request.json();
          calls.patches.push(body.fields);
          sess.fields = { ...sess.fields, ...body.fields };
          return Response.json({ id: sess.id, fields: sess.fields });
        }
        return Response.json({ records: [sess] });
      },
    },
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        assert.equal(request.headers.get("x-mmd-payments-secret"), SECRET);
        const body = await request.json();
        calls.redeems.push(body);
        if (redeem) return redeem(body);
        return Response.json({ ok: true, approved_discount_percent: 5 });
      },
    },
  };
  const iat = Math.floor(Date.now() / 1000);
  const claims = { session_id: "sess_promo_test", payment_ref: "pay_promo_test", payment_type: paymentType, iat, exp: iat + 3600, kind: "customer_confirm", role: "customer" };
  const token = await signConfirmToken(claims, env.PAYMENT_CONFIRMATION_SIGNING_SECRET);
  await createConfirmTokenRecord(env, token, claims);
  return { env, token, calls, sess };
}

const post = (token, code, extra = {}) => new Request("https://sigil.mmdbkk.com/v1/confirm/apply-promo", {
  method: "POST",
  headers: { origin: "https://mmdbkk.com", "content-type": "application/json" },
  body: JSON.stringify({ t: token, code, ...extra }),
});

test("applies CARE BACK 5 percent: price, net amount and note are rewritten server-side", async () => {
  const { env, token, calls, sess } = await setup();
  const res = await handleConfirmApplyPromo(post(token, "ggqyhk"), env, NOW);
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.applied, true);
  assert.equal(data.pricing.discount_percent, 5);
  assert.equal(data.pricing.discount_thb, 1250);
  assert.equal(data.pricing.net_price_thb, 23750);
  assert.equal(data.pricing.deposit_due_thb, 7500);
  assert.equal(data.pricing.balance_thb, 16250); // net 23,750 - deposit 7,500, same convention as Create Job
  assert.deepEqual(calls.redeems[0], { code: "GGQYHK", session_id: "sess_promo_test", selected_model_name: "EI", job_format: "PN" });
  assert.equal(calls.patches[0][F.amountThb], 23750);
  assert.equal(calls.patches[0][F.customerAmountDueThb], undefined); // deposit stage keeps deposit amount
  const note = sess.fields[F.note];
  assert.equal((note.match(/\[SIGIL Pricing v1\]/g) || []).length, 1);
  assert.match(note, /"discount_percent":5/);
  assert.match(note, /deposit_rounding/);
  assert.match(note, /\[SIGIL Promo v1\] \{"source":"care_back","code":"GGQYHK"/);
});

test("the browser can never supply a percent or amount", async () => {
  const { env, token, calls } = await setup();
  for (const extra of [{ percent: 50 }, { discount_percent: 50 }, { net_price_thb: 1 }, { amount_thb: 1 }]) {
    const res = await handleConfirmApplyPromo(post(token, "GGQYHK", extra), env, NOW);
    assert.equal(res.status, 400);
  }
  assert.equal(calls.redeems.length, 0);
});

test("rejects bad origin, bad token, malformed code and already-discounted or paid sessions without touching the coupon", async () => {
  const { env, token, calls } = await setup();
  const badOrigin = new Request("https://sigil.mmdbkk.com/v1/confirm/apply-promo", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ t: token, code: "GGQYHK" }) });
  assert.equal((await handleConfirmApplyPromo(badOrigin, env, NOW)).status, 403);
  assert.equal((await handleConfirmApplyPromo(post("bad.token", "GGQYHK"), env, NOW)).status, 401);
  assert.equal((await handleConfirmApplyPromo(post(token, "SHORT"), env, NOW)).status, 400);

  const manual = await setup({ sess: session({ [F.note]: `[SIGIL Pricing v1] ${JSON.stringify({ ...PRICING, discount_mode: "percent", discount_percent: 10, discount_thb: 2500, net_price_thb: 22500, balance_thb: 15000 })}` }) });
  const r1 = await handleConfirmApplyPromo(post(manual.token, "GGQYHK"), manual.env, NOW);
  assert.equal(r1.status, 409);
  assert.equal((await r1.json()).error, "discount_already_applied");

  const paid = await setup({ sess: session({ [F.paymentStatus]: "verified" }) });
  assert.equal((await (await handleConfirmApplyPromo(post(paid.token, "GGQYHK"), paid.env, NOW)).json()).error, "payment_already_verified");

  const far = await setup({ sess: session({ [F.jobDate]: "2027-03-01" }) });
  assert.equal((await (await handleConfirmApplyPromo(post(far.token, "GGQYHK"), far.env, NOW)).json()).error, "service_date_outside_window");
  assert.equal(calls.redeems.length + manual.calls.redeems.length + paid.calls.redeems.length + far.calls.redeems.length, 0);
});

test("coupon rejections from member-pages-worker leave the session untouched", async () => {
  const { env, token, calls } = await setup({
    redeem: () => Response.json({ ok: false, status: "rejected", error: "CARE_BACK_COUPON_USED" }, { status: 409 }),
  });
  const res = await handleConfirmApplyPromo(post(token, "GGQYHK"), env, NOW);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "CARE_BACK_COUPON_USED");
  assert.equal(calls.patches.length, 0);
});

test("a second call with the same code is idempotent, a different code is refused", async () => {
  const { env, token, calls } = await setup();
  await handleConfirmApplyPromo(post(token, "GGQYHK"), env, NOW);
  const again = await (await handleConfirmApplyPromo(post(token, "ggqyhk"), env, NOW)).json();
  assert.equal(again.already_applied, true);
  assert.equal(again.pricing.net_price_thb, 23750);
  const other = await handleConfirmApplyPromo(post(token, "ABCDEF"), env, NOW);
  assert.equal(other.status, 409);
  assert.equal(calls.redeems.length, 1);
});

test("refuses on full/balance stages where the issued QR amount would go stale", async () => {
  for (const paymentType of ["full", "final", "balance"]) {
    const { env, token, calls } = await setup({ paymentType });
    const res = await handleConfirmApplyPromo(post(token, "GGQYHK"), env, NOW);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "promo_only_on_deposit_stage");
    assert.equal(calls.redeems.length, 0);
  }
});

test("unconfigured service binding fails closed", async () => {
  const { env, token } = await setup();
  delete env.MEMBER_PAGES_WORKER;
  const res = await handleConfirmApplyPromo(post(token, "GGQYHK"), env, NOW);
  assert.equal(res.status, 503);
});

test("after the deposit is received the discount reduces the balance and the due amount follows it", async () => {
  const paidDeposit = { ...PRICING, deposit_received_thb: 7500, balance_thb: 17500 };
  const { env, token, calls } = await setup({ sess: session({ [F.customerAmountDueThb]: 17500, [F.note]: `[SIGIL Pricing v1] ${JSON.stringify(paidDeposit)}` }) });
  const data = await (await handleConfirmApplyPromo(post(token, "GGQYHK"), env, NOW)).json();
  assert.equal(data.pricing.balance_thb, 16250);
  assert.equal(calls.patches[0][F.customerAmountDueThb], 16250);
});

test("helpers: job format, price math and marker replacement", () => {
  assert.equal(jobFormatFrom("PN", ""), "PN");
  assert.equal(jobFormatFrom("private:exclusive:straight:vip", ""), "VIP");
  assert.equal(jobFormatFrom("", "x | work pn\n"), "PN");
  assert.equal(jobFormatFrom("pn vip", ""), "");
  assert.equal(jobFormatFrom("private", ""), "");
  const full = discountedPricing({ ...PRICING, payment_type: "full", deposit_received_thb: 25000, deposit_due_thb: 0, balance_thb: 0 }, 25000, 10);
  assert.equal(full.net_price_thb, 22500);
  assert.equal(full.deposit_received_thb, 22500);
  assert.equal(full.balance_thb, 0);
  const note = 'a [SIGIL Pricing v1] {"x":"}{\\"","n":1} tail';
  assert.equal(withReplacedMarkedJson(note, "SIGIL Pricing v1", { n: 2 }), 'a [SIGIL Pricing v1] {"n":2} tail');
  assert.equal(withReplacedMarkedJson("none", "L", { a: 1 }), "none");
  assert.equal(withReplacedMarkedJson("none", "L", { a: 1 }, true), "none\n[L] {\"a\":1}");
});
