// Backend regressions for the EMs16 /sigil/confirm/job-model silent-failure report.
import test from "node:test";
import assert from "node:assert/strict";
import { createConfirmTokenRecord, signConfirmToken } from "./index.js";
import { handleConfirmationDetails } from "./confirmation-details.js";
import { handleConfirmationAck } from "./confirmation-ack.js";
import { stablePaymentRef } from "./unified-payment-proof.js";

const SECRET = "model-confirm-no-silent-failure-secret";
const ORIGIN = "https://mmdbkk.com";

function sessionRecord(overrides = {}) {
  return {
    id: "recSessionEMs",
    fields: {
      fldLTq2kZbyRv22IA: "sess_model_nsf",
      fldmwuvOaiCFdzzRa: "Confirmed",
      fldhwC79ndbnEXSZz: 40500,
      fldvJowquu8RrsOMc: 13500,
      fldojgjSQLaO0uQLX: "pay_model_nsf",
      fldTY5lE6m0kQf72n: "partial",
      fldMvnQ0BzDfHUYjT: "คุณ Client",
      flddVz6eoWRHrzIQr: "EMs16",
      fldjK3U9bghnj7xUe: "private",
      fldpnqoIsUMfN7y3c: "2026-10-02",
      fldBeG0FkWwa8kgnp: "2026-10-02T12:00:00.000Z",
      fldiDSz0wW9Ct9I3P: "2026-10-02T14:00:00.000Z",
      fldIiRpaxoafjTkFt: "Hotel",
      fldlTO5aNfqUmlNWm: 5000,
      fldEcDkF7CH9VixWM: "[SIGIL Pricing v1] {\"full_price_thb\":45000,\"net_price_thb\":40500,\"deposit_due_thb\":13500,\"balance_thb\":27000}",
      ...overrides,
    },
  };
}

async function setup({ session = sessionRecord(), claimsOverride = {}, lifetime = 3600, iatOffset = 0 } = {}) {
  const store = new Map();
  const writes = [];
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: SECRET,
    PAY_SESSIONS_KV: { put: async (k, v) => store.set(k, v), get: async (k) => store.get(k) ?? null },
    PAY_TOKEN_TTL_SECONDS: "3600",
    ALLOWED_ORIGINS: `${ORIGIN},https://www.mmdbkk.com`,
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_API_KEY: "pat_test",
    AIRTABLE_HTTP: { fetch: async () => Response.json({ records: session ? [session] : [] }) },
  };
  const iat = Math.floor(Date.now() / 1000) + iatOffset;
  const claims = { kind: "model_confirm", role: "model", session_id: "sess_model_nsf", payment_ref: "pay_model_nsf", payment_type: "deposit", iat, exp: iat + lifetime, ...claimsOverride };
  const token = await signConfirmToken(claims, SECRET);
  await createConfirmTokenRecord(env, token, claims);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "PATCH") {
      const fields = JSON.parse(options.body).fields;
      writes.push(fields);
      Object.assign(session.fields, fields);
      return Response.json(session);
    }
    return Response.json({ records: session ? [session] : [] });
  };
  const restore = () => { globalThis.fetch = realFetch; };
  const req = (path, body) => new Request(`https://sigil.mmdbkk.com${path}`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });
  const details = async (t = token) => handleConfirmationDetails(req("/v1/confirm/details", { t, expected_role: "model" }), env);
  const ack = async (extra = {}, t = token) => handleConfirmationAck(req("/v1/confirm/ack", { t, expected_role: "model", ...extra }), env);
  return { env, token, session, writes, details, ack, restore };
}

test("valid model confirm: details then ack succeeds and writes only the model ack + lifecycle seed", async (t) => {
  const s = await setup({ session: sessionRecord({ fld57fhdWqIcOy4Jp: "" }) });
  t.after(s.restore);
  const d = await s.details();
  assert.equal(d.status, 200);
  const data = await d.json();
  assert.equal(data.already_confirmed, false);
  assert.equal(data.model_acknowledged_at, null);
  const a = await s.ack({ confirmation_revision: data.confirmation_revision });
  assert.equal(a.status, 200);
  const body = await a.json();
  assert.equal(body.ok, true);
  assert.equal(s.writes.length, 1);
  assert.deepEqual(Object.keys(s.writes[0]).sort(), ["fld57fhdWqIcOy4Jp", "fldFJI1Leni6wvzR4", "fldFgkHXivIAThfDz"].sort());
  assert.equal(JSON.stringify(s.writes).includes("fldTY5lE6m0kQf72n"), false, "never touches payment status");
});

test("expired model token is rejected with 410 confirmation_token_expired on details and ack", async (t) => {
  const s = await setup({ iatOffset: -7200, lifetime: 3600 });
  t.after(s.restore);
  const d = await s.details();
  assert.equal(d.status, 410);
  assert.equal((await d.json()).error, "confirmation_token_expired");
  const a = await s.ack();
  assert.equal(a.status, 410);
  assert.equal(s.writes.length, 0);
});

test("missing session returns 404 session_not_found on details and ack", async (t) => {
  const s = await setup({ session: null });
  t.after(s.restore);
  const d = await s.details();
  assert.equal(d.status, 404);
  assert.equal((await d.json()).error, "session_not_found");
  const a = await s.ack();
  assert.equal(a.status, 404);
  assert.equal((await a.json()).error, "session_not_found");
});

test("token missing payment_ref is rejected as invalid subject (never silently accepted)", async (t) => {
  const s = await setup({ claimsOverride: { payment_ref: "" } });
  t.after(s.restore);
  const d = await s.details();
  assert.equal(d.status, 401);
  assert.equal((await d.json()).error, "invalid_confirmation_token_subject");
  const a = await s.ack();
  assert.equal(a.status, 401);
  assert.equal(s.writes.length, 0);
});

test("already confirmed: details reports already_confirmed and ack is idempotent with no write", async (t) => {
  const s = await setup({ session: sessionRecord({ fldFgkHXivIAThfDz: "2026-09-24T11:31:39.146Z", fld57fhdWqIcOy4Jp: "confirmed" }) });
  t.after(s.restore);
  const data = await (await s.details()).json();
  assert.equal(data.already_confirmed, true);
  assert.equal(data.model_acknowledged_at, "2026-09-24T11:31:39.146Z");
  const a = await s.ack({ confirmation_revision: data.confirmation_revision });
  assert.equal(a.status, 200);
  assert.equal((await a.json()).idempotent, true);
  assert.equal(s.writes.length, 0);
});

test("deposit model link stays confirmable after the session moves to the stable final payment ref (details and ack agree)", async (t) => {
  const finalRef = await stablePaymentRef("sess_model_nsf", "final");
  const s = await setup({ session: sessionRecord({ fldojgjSQLaO0uQLX: finalRef, fld57fhdWqIcOy4Jp: "" }) });
  t.after(s.restore);
  const d = await s.details();
  assert.equal(d.status, 200);
  const a = await s.ack({ confirmation_revision: (await d.json()).confirmation_revision });
  assert.equal(a.status, 200);
});

test("unrelated payment ref on the session is still rejected by both details and ack", async (t) => {
  const s = await setup({ session: sessionRecord({ fldojgjSQLaO0uQLX: "pay_someone_else" }) });
  t.after(s.restore);
  assert.equal((await s.details()).status, 409);
  const a = await s.ack();
  assert.equal(a.status, 409);
  assert.equal((await a.json()).error, "confirmation_session_mismatch");
  assert.equal(s.writes.length, 0);
});

test("model details carry no customer identity, payment refs/state, rate or amount", async (t) => {
  const s = await setup();
  t.after(s.restore);
  const data = await (await s.details()).json();
  for (const key of ["client_name", "payment_ref", "payment_type", "payment_status", "pricing", "payment", "model_payout_thb", "amount_thb", "amount_scope"]) {
    assert.equal(key in data, false, `${key} must not be in the model response`);
  }
  const raw = JSON.stringify(data);
  for (const leak of ["คุณ Client", "pay_model_nsf", "40500", "13500", "45000", "27000", "5000", "partial", "deposit"]) {
    assert.equal(raw.includes(leak), false, `model response leaked ${leak}`);
  }
  for (const key of ["job_date", "start_time", "end_time", "location_name", "already_confirmed"]) {
    assert.ok(key in data, `${key} is still available to acknowledge the job`);
  }
});

test("model confirmation context never carries the customer name", async (t) => {
  const s = await setup();
  t.after(s.restore);
  const { handleConfirmationContext } = await import("./confirmation-ack.js");
  const r = await handleConfirmationContext(new Request("https://sigil.mmdbkk.com/v1/confirm/context", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ t: s.token, expected_role: "model" }) }), s.env);
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.confirmation.counterpart_name, null);
  assert.equal(JSON.stringify(data).includes("คุณ Client"), false);
});
