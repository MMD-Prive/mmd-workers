import assert from "node:assert/strict";
import test from "node:test";

import {
  FINAL_PAYMENT_ACTIVATE_PATH,
  FINAL_PAYMENT_STATUS_PATH,
  handleFinalPaymentFlow,
  reconcileReviewedFinalPayment,
} from "./final-payment-flow.js";

const SESSION_IDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  amount: "fldhwC79ndbnEXSZz",
  note: "fldEcDkF7CH9VixWM",
  received: "fldAdtXEaedGdfOKc",
  due: "fldvJowquu8RrsOMc",
});
const PAYMENT_IDS = Object.freeze({
  ref: "fldOO6SY49iDw8VBZ",
  sessionId: "fld2wdhBvc8xrV6y5",
  amount: "fldvCSwrUW8OMAooS",
  status: "fldEJ1hmm7KwWuI6q",
  verification: "fldJ7a0Ube9F0bmRy",
  stage: "fldrr9g8ZZjqAbdKQ",
});

function harness() {
  const sessionById = {
    id: "recSession",
    fields: {
      [SESSION_IDS.sessionId]: "sess_final_flow",
      [SESSION_IDS.amount]: 10000,
      [SESSION_IDS.note]: "[SIGIL Pricing v1] {\"net_price_thb\":10000,\"deposit_due_thb\":3000,\"deposit_received_thb\":3000,\"balance_thb\":7000}",
    },
  };
  const sessionByName = {
    id: "recSession",
    fields: { session_id: "sess_final_flow", payment_ref: "pay_deposit_original", status: "arrived" },
  };
  const job = { id: "recJob", fields: { session_id: "sess_final_flow", status: "arrived" } };
  const deposit = {
    id: "recVerifiedDeposit",
    fields: {
      [PAYMENT_IDS.ref]: "pay_deposit_original",
      [PAYMENT_IDS.sessionId]: "sess_final_flow",
      [PAYMENT_IDS.amount]: 3000,
      [PAYMENT_IDS.stage]: "deposit",
      [PAYMENT_IDS.status]: "Paid",
      [PAYMENT_IDS.verification]: "verified",
    },
  };
  let payment = null;
  let paymentCreates = 0;
  const sessionPatches = [];
  const env = {
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "admin-payments-secret",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_API_KEY: "pat_test",
    AIRTABLE_TABLE_SESSIONS: "sessions",
    AIRTABLE_TABLE_PAYMENTS: "payments",
    AIRTABLE_TABLE_JOBS: "jobs",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").filter(Boolean)[2] || "");
        const method = request.method.toUpperCase();
        if (method === "GET" && table === "sessions") {
          const byId = url.searchParams.get("returnFieldsByFieldId") === "true";
          return Response.json({ records: [byId ? sessionById : sessionByName] });
        }
        if (method === "GET" && table === "payments") {
          if (url.searchParams.has("pageSize")) return Response.json({ records: [deposit, ...(payment ? [payment] : [])] });
          return Response.json({ records: payment ? [payment] : [] });
        }
        if (method === "GET" && table === "jobs") return Response.json({ records: [job] });
        if (method === "POST" && table === "payments") {
          const body = await request.json();
          assert.equal(body.typecast, false);
          paymentCreates += 1;
          payment = { id: "recFinalPayment", fields: body.records[0].fields };
          return Response.json({ records: [payment] });
        }
        if (method === "PATCH" && table === "sessions") {
          const body = await request.json();
          sessionPatches.push(body.fields);
          Object.assign(sessionByName.fields, body.fields);
          Object.assign(sessionById.fields, body.fields);
          return Response.json(sessionByName);
        }
        if (method === "PATCH" && table === "jobs") {
          const body = await request.json();
          Object.assign(job.fields, body.fields);
          return Response.json(job);
        }
        return Response.json({ error: "not_found" }, { status: 404 });
      },
    },
  };
  return { env, sessionById, sessionByName, job, deposit, sessionPatches,
    get payment() { return payment; },
    get paymentCreates() { return paymentCreates; },
  };
}
function request(path, token = "admin-payments-secret") {
  return new Request(`https://sigil.mmdbkk.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": token },
    body: JSON.stringify({ session_id: "sess_final_flow" }),
  });
}

test("arrival activation creates one separate final intent and reuses it", async () => {
  const h = harness();
  const before = JSON.stringify(h.deposit);
  const first = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  const firstBody = await first.json();
  assert.equal(first.status, 200, JSON.stringify(firstBody));
  assert.equal(firstBody.activated, true);
  assert.equal(firstBody.idempotent, false);
  assert.equal(firstBody.payment_stage, "final");
  assert.equal(firstBody.amount_due_thb, 7000);
  assert.match(firstBody.payment_ref, /^pay_[a-f0-9]{24}$/);
  assert.notEqual(firstBody.payment_ref, "pay_deposit_original");
  assert.equal(h.paymentCreates, 1);
  assert.equal(h.sessionByName.fields.payment_ref, "pay_deposit_original");
  const second = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  const secondBody = await second.json();
  assert.equal(secondBody.idempotent, true);
  assert.equal(secondBody.payment_ref, firstBody.payment_ref);
  assert.equal(h.paymentCreates, 1);
  assert.equal(JSON.stringify(h.deposit), before);
  assert.equal(h.payment.fields[PAYMENT_IDS.verification], "pending_review");
  assert.equal(h.sessionById.fields[SESSION_IDS.received], 3000);
  assert.equal(h.sessionById.fields[SESSION_IDS.due], 7000);
  for (const fields of h.sessionPatches) assert.deepEqual(Object.keys(fields).sort(), [SESSION_IDS.received, SESSION_IDS.due].sort());
  assert.equal(h.sessionByName.fields.status, "arrived");
});

test("officially verified final payment promotes Session and Job lifecycle", async () => {
  const h = harness();
  await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  h.payment.fields[PAYMENT_IDS.status] = "Paid";
  h.payment.fields[PAYMENT_IDS.verification] = "verified";
  h.payment.fields[PAYMENT_IDS.stage] = "final";
  h.payment.fields[PAYMENT_IDS.sessionId] = "sess_final_flow";
  h.payment.fields[PAYMENT_IDS.amount] = 7000;
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_STATUS_PATH), h.env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.final_payment_confirmed, true);
  assert.equal(body.final_payment_status, "final_payment_confirmed");
  assert.equal(h.sessionByName.fields.status, "final_payment_confirmed");
  assert.equal(h.job.fields.status, "final_payment_confirmed");
});

test("approved review response promotes final lifecycle before admin sees success", async () => {
  const h = harness();
  const reviewRequest = new Request("https://sigil.mmdbkk.com/v1/internal/payments/reviewed-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision: "approved", payment_stage: "final", session_id: "sess_final_flow" }),
  });
  const reviewResponse = Response.json({ ok: true, payment_ref: "pay_final", payment_stage: "final" });
  const response = await reconcileReviewedFinalPayment(reviewRequest, reviewResponse, h.env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.final_payment_lifecycle.state, "final_payment_confirmed");
  assert.equal(h.sessionByName.fields.status, "final_payment_confirmed");
  assert.equal(h.job.fields.status, "final_payment_confirmed");
});

test("private final-payment routes reject missing service auth", async () => {
  const h = harness();
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH, "wrong"), h.env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "service_auth_required");
  assert.equal(h.paymentCreates, 0);
  assert.equal(h.sessionPatches.length, 0);
});

test("arrival activation fails closed when canonical service amount is missing", async () => {
  const h = harness();
  delete h.sessionById.fields[SESSION_IDS.amount];
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "balance_amount_missing");
  assert.equal(h.paymentCreates, 0);
});

test("stale planned balance and missing notes cannot override an actual verified deposit", async () => {
  const h = harness();
  h.sessionById.fields[SESSION_IDS.amount] = 20000;
  h.deposit.fields[PAYMENT_IDS.amount] = 6000;
  delete h.sessionById.fields[SESSION_IDS.note];
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.amount_due_thb, 14000);
  assert.equal(h.sessionById.fields[SESSION_IDS.received], 6000);
  assert.equal(h.sessionById.fields[SESSION_IDS.due], 14000);
});

test("planned or pending-review deposit does not authorize a deducted final amount", async () => {
  const h = harness();
  h.deposit.fields[PAYMENT_IDS.verification] = "pending_review";
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "verified_deposit_required");
  assert.equal(h.paymentCreates, 0);
  assert.equal(h.sessionPatches.length, 0);
});

test("settled final replay stays settled and syncs a zero remainder", async () => {
  const h = harness();
  await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  h.payment.fields[PAYMENT_IDS.verification] = "verified";
  h.payment.fields[PAYMENT_IDS.status] = "Paid";
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.amount_due_thb, 0);
  assert.equal(body.final_payment_confirmed, true);
  assert.equal(h.paymentCreates, 1);
  assert.equal(h.sessionById.fields[SESSION_IDS.received], 10000);
  assert.equal(h.sessionById.fields[SESSION_IDS.due], 0);
  assert.equal(h.payment.fields[PAYMENT_IDS.verification], "verified");
});

test("Paid label alone cannot promote unverified final lifecycle", async () => {
  const h = harness();
  await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  h.payment.fields[PAYMENT_IDS.status] = "Paid";
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_STATUS_PATH), h.env);
  assert.equal((await response.json()).final_payment_confirmed, false);
  assert.equal(h.sessionByName.fields.status, "arrived");
});

test('configured MMD projection uses the single per-session cache writer instead of a second legacy PATCH', async () => {
  const h = harness(); const tasks = [];
  h.env.SESSION_PAID_PROJECTION_COORDINATOR = {
    idFromName(name) { assert.equal(name, 'session:sess_final_flow'); return name; },
    get() { return { async fetch(url, init) { tasks.push(JSON.parse(init.body)); return Response.json({ status: 'updated', paid_received_sum: 3000, remaining_amount_thb: 7000 }); } }; },
  };
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  assert.equal(response.status, 200); assert.equal(tasks.length, 1);
  assert.equal(h.sessionPatches.length, 0, 'do not overwrite a serialized result with an earlier summary');
});

test('configured projector excludes MMS and retains the existing final-flow behavior for that lane', async () => {
  const h = harness(); h.env.SESSION_PAID_PROJECTION_COORDINATOR = {
    idFromName(name) { return name; }, get() { return { async fetch() { return Response.json({ status: 'skipped', reason: 'excluded_lane' }); } }; },
  };
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  assert.equal(response.status, 200); assert.equal(h.sessionPatches.length, 1);
  assert.deepEqual(h.sessionPatches[0], { [SESSION_IDS.received]: 3000, [SESSION_IDS.due]: 7000 });
});

test('unknown job lane cannot bypass the new coordinator through the legacy cache writer', async () => {
  const h = harness(); h.env.SESSION_PAID_PROJECTION_COORDINATOR = {
    idFromName(x) { return x; }, get() { return { async fetch() { return Response.json({ status: 'skipped', reason: 'unknown_job_lane' }); } }; },
  };
  const response = await handleFinalPaymentFlow(request(FINAL_PAYMENT_ACTIVATE_PATH), h.env);
  assert.equal(response.status, 503); assert.equal(h.sessionPatches.length, 0);
});
