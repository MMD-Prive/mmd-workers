import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import {
  handlePayoutDestinationContext,
  handlePayoutDestinationSubmit,
  isValidThaiNationalId,
  maskReference,
  normalizeBankAccount,
  normalizeThaiPhone,
  validateDestination,
} from "./model-payout-destination.js";

const ORIGIN = "https://www.mmdbkk.com";
const MODEL_REC = "recMODEL000000001";
const F = {
  type: "fldType0000000001", bank: "fldBank0000000001", name: "fldName0000000001", ref: "fldRef00000000001",
  status: "fldStatus00000001", submittedAt: "fldSubmit0000001", verifiedBy: "fldVerBy00000001", verifiedAt: "fldVerAt00000001",
};
const BASE_ENV = {
  MODEL_PAYOUT_DESTINATION_ENABLED: "true",
  ALLOWED_ORIGINS: ORIGIN,
  AIRTABLE_BASE_ID: "appTEST00000000001",
  AIRTABLE_API_KEY: "test-key",
  AT_MODELS__PAYOUT_DEST_TYPE: F.type, AT_MODELS__PAYOUT_DEST_BANK: F.bank, AT_MODELS__PAYOUT_DEST_NAME: F.name,
  AT_MODELS__PAYOUT_DEST_REF: F.ref, AT_MODELS__PAYOUT_DEST_STATUS: F.status, AT_MODELS__PAYOUT_DEST_SUBMITTED_AT: F.submittedAt,
  AT_MODELS__PAYOUT_DEST_VERIFIED_BY: F.verifiedBy, AT_MODELS__PAYOUT_DEST_VERIFIED_AT: F.verifiedAt,
};
const GOOD_NATIONAL_ID = "1234567890121"; // passes the Thai checksum

function kv() {
  const store = new Map();
  return { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); }, store };
}

function authorizer({ ack = "2026-10-09T05:00:00.000Z", role = "model", link = [MODEL_REC] } = {}) {
  return async (request) => ({
    claims: { session_id: "S-1" },
    expectedRole: role,
    body: await request.clone().json().catch(() => ({})),
    session: { id: "recSESSION0000001", fields: { fldFgkHXivIAThfDz: ack, fldrXQAyOMPCvbOaY: link } },
  });
}

function req(body, { method = "POST" } = {}) {
  return new Request("https://sigil.mmdbkk.com/v1/confirm/payout-destination", {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function mockAirtable(existing = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    if ((init.method || "GET") === "GET") return new Response(JSON.stringify({ id: MODEL_REC, fields: existing }), { status: 200 });
    return new Response(JSON.stringify({ id: MODEL_REC, fields: {} }), { status: 200 });
  };
  return calls;
}

test("validators: phone, national id, bank account, mask", () => {
  assert.equal(normalizeThaiPhone("081-234 5678"), "0812345678");
  assert.equal(normalizeThaiPhone("+66812345678"), "0812345678");
  assert.equal(normalizeThaiPhone("12345"), null);
  assert.equal(isValidThaiNationalId(GOOD_NATIONAL_ID), true);
  assert.equal(isValidThaiNationalId("1234567890124"), false);
  assert.equal(isValidThaiNationalId("123"), false);
  assert.equal(normalizeBankAccount("123-4-56789-0"), "1234567890");
  assert.equal(normalizeBankAccount("12345"), null);
  assert.equal(maskReference("0812345678"), "••••5678");
  assert.equal(maskReference(""), "");
});

test("validateDestination: rejects bad input with value-free error codes", () => {
  assert.deepEqual(validateDestination({ type: "cash", account_name: "A B", account_ref: "x" }), { ok: false, error: "invalid_destination_type" });
  assert.equal(validateDestination({ type: "promptpay_phone", account_name: "12345", account_ref: "0812345678" }).error, "invalid_account_name");
  assert.equal(validateDestination({ type: "promptpay_phone", account_name: "Somchai J", account_ref: "999" }).error, "invalid_promptpay_phone");
  assert.equal(validateDestination({ type: "bank_account", account_name: "Somchai J", account_ref: "1234567890", bank_name: "" }).error, "invalid_bank_name");
  const ok = validateDestination({ type: "bank_account", account_name: "  Somchai   J ", account_ref: "123-4-56789-0", bank_name: "KBank" });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.accountName, "Somchai J");
  assert.equal(ok.value.ref, "1234567890");
});

test("flag off: submit is 404 and context reports disabled, no Airtable call", async () => {
  const calls = mockAirtable();
  const env = { ...BASE_ENV, MODEL_PAYOUT_DESTINATION_ENABLED: "false" };
  const submit = await handlePayoutDestinationSubmit(req({}), env, { authorize: authorizer() });
  assert.equal(submit.status, 404);
  const ctx = await handlePayoutDestinationContext(req({}), env, { authorize: authorizer() });
  assert.deepEqual(await ctx.json(), { ok: true, enabled: false });
  assert.equal(calls.length, 0);
});

test("requires the model role and a prior model acknowledgement", async () => {
  mockAirtable();
  const body = { type: "promptpay_phone", account_name: "Somchai J", account_ref: "0812345678" };
  const customer = await handlePayoutDestinationSubmit(req(body), BASE_ENV, { authorize: authorizer({ role: "customer" }) });
  assert.equal(customer.status, 403);
  const noAck = await handlePayoutDestinationSubmit(req(body), BASE_ENV, { authorize: authorizer({ ack: "" }) });
  assert.equal(noAck.status, 409);
  assert.equal((await noAck.json()).error, "model_ack_required");
  const ctx = await handlePayoutDestinationContext(req({}), BASE_ENV, { authorize: authorizer({ ack: "" }) });
  assert.deepEqual(await ctx.json(), { ok: true, enabled: true, can_submit: false, status: "none" });
});

test("fields not configured -> 503, ambiguous model link -> 409", async () => {
  mockAirtable();
  const body = { type: "promptpay_phone", account_name: "Somchai J", account_ref: "0812345678" };
  const noCfg = await handlePayoutDestinationSubmit(req(body), { ...BASE_ENV, AT_MODELS__PAYOUT_DEST_REF: "" }, { authorize: authorizer() });
  assert.equal(noCfg.status, 503);
  const two = await handlePayoutDestinationSubmit(req(body), BASE_ENV, { authorize: authorizer({ link: [MODEL_REC, "recMODEL000000002"] }) });
  assert.equal(two.status, 409);
  const none = await handlePayoutDestinationSubmit(req(body), BASE_ENV, { authorize: authorizer({ link: [] }) });
  assert.equal(none.status, 409);
});

test("submit stores pending on the session's own model record and never echoes the full number", async () => {
  const calls = mockAirtable({});
  const body = { destination: { type: "promptpay_phone", account_name: "Somchai J", account_ref: "081-234-5678", model_record_id: "recATTACKER000001" } };
  const res = await handlePayoutDestinationSubmit(req(body), BASE_ENV, { authorize: authorizer() });
  assert.equal(res.status, 200);
  const raw = await res.text();
  assert.doesNotMatch(raw, /0812345678/);
  const out = JSON.parse(raw);
  assert.equal(out.destination.status, "pending");
  assert.equal(out.destination.masked_ref, "••••5678");
  const patch = calls.find((c) => c.method === "PATCH");
  assert.ok(patch.url.includes(MODEL_REC));
  assert.ok(!patch.url.includes("ATTACKER"));
  assert.equal(patch.body.fields[F.status], "pending");
  assert.equal(patch.body.fields[F.ref], "0812345678");
  assert.equal(patch.body.fields[F.verifiedBy], null);
  assert.equal(patch.body.fields[F.verifiedAt], null);
});

test("resubmitting the identical verified destination does not reset verification", async () => {
  const calls = mockAirtable({ [F.type]: "promptpay_phone", [F.bank]: "", [F.name]: "Somchai J", [F.ref]: "0812345678", [F.status]: "verified" });
  const res = await handlePayoutDestinationSubmit(
    req({ type: "promptpay_phone", account_name: "somchai j", account_ref: "0812345678" }), BASE_ENV, { authorize: authorizer() },
  );
  const out = await res.json();
  assert.equal(out.unchanged, true);
  assert.equal(out.destination.status, "verified");
  assert.equal(calls.filter((c) => c.method === "PATCH").length, 0);
});

test("changing a verified destination resets it to pending and clears the verifier", async () => {
  const calls = mockAirtable({ [F.type]: "promptpay_phone", [F.name]: "Somchai J", [F.ref]: "0812345678", [F.status]: "verified" });
  const res = await handlePayoutDestinationSubmit(
    req({ type: "promptpay_phone", account_name: "Somchai J", account_ref: "0899999999" }), BASE_ENV, { authorize: authorizer() },
  );
  assert.equal((await res.json()).destination.status, "pending");
  const patch = calls.find((c) => c.method === "PATCH");
  assert.equal(patch.body.fields[F.status], "pending");
  assert.equal(patch.body.fields[F.verifiedAt], null);
});

test("validation failure is 422 with a value-free code and no write", async () => {
  const calls = mockAirtable();
  const res = await handlePayoutDestinationSubmit(
    req({ type: "promptpay_phone", account_name: "Somchai J", account_ref: "0811111" }), BASE_ENV, { authorize: authorizer() },
  );
  assert.equal(res.status, 422);
  const raw = await res.text();
  assert.doesNotMatch(raw, /0811111/);
  assert.equal(calls.length, 0);
});

test("rate limit: 6th attempt in the window is 429", async () => {
  mockAirtable();
  const env = { ...BASE_ENV, PAY_SESSIONS_KV: kv() };
  const bad = { type: "promptpay_phone", account_name: "Somchai J", account_ref: "1" };
  let last;
  for (let i = 0; i < 6; i += 1) last = await handlePayoutDestinationSubmit(req(bad), env, { authorize: authorizer() });
  assert.equal(last.status, 429);
});

test("Airtable failure never leaks submitted values", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "0812345678 bad" } }), { status: 500 });
  const res = await handlePayoutDestinationSubmit(
    req({ type: "promptpay_phone", account_name: "Somchai J", account_ref: "0812345678" }), BASE_ENV, { authorize: authorizer() },
  );
  assert.equal(res.status, 503);
  assert.doesNotMatch(await res.text(), /0812345678/);
});

test("module source: no logging, wired in phase1 entry, no hardcoded chat ids", () => {
  const src = readFileSync(new URL("./model-payout-destination.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /console\./);
  assert.doesNotMatch(src, /-100\d{8,}/);
  const entry = readFileSync(new URL("./index.phase1.js", import.meta.url), "utf8");
  assert.match(entry, /handlePayoutDestinationContext\(request, env\)/);
  assert.match(entry, /handlePayoutDestinationSubmit\(request, env\)/);
});
