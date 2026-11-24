import test from "node:test";
import assert from "node:assert/strict";
import { handlePublicMembershipPayment } from "../member-pages-worker/src/public-membership-payment.js";
import { handlePaymentReviewRequest, PAYMENT_REVIEW_ROUTES } from "../admin-worker/src/payment-review-runtime.js";
import { RED_CARD_INTENT_PATH, RED_CARD_CHECKOUT_MARKER } from "../shared/red-card-purchase-contract.mjs";
import { REVIEWED_PROOF_PATH } from "./reviewed-proof.js";
import payments from "./index.review-wrapper.js";

const line = "U1234567890abcdef1234567890abcdef";
const memberId = "fixture_member";
const memberRecordId = "recMember00000001";
const email = "fixture@example.test";
const issuedAt = "2026-11-24T05:30:00.000Z";
const publicUrl = "https://mmdbkk.com/member/api/liff/public-membership/purchase";
const actor = { id: "fixture-owner", role: "owner" };

function jsonRequest(url, body, headers = {}) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function kv() {
  const contents = new Map();
  return { async get(k, type) { const v = contents.get(k); return type === "json" && v ? JSON.parse(v) : v || null; }, async put(k, v) { contents.set(k, v); } };
}

async function fixture() {
  const tables = {
    members: [{ id: memberRecordId, fields: { line_id: line, member_id: memberId, "Contact Email": email } }],
    payments: [], proofs: [], entitlements: [], sessions: [], access: [],
  };
  const writes = [], paymentsCalls = [], r2 = new Map();
  const env = {
    AUTH_SERVICE_MEMBER_TO_PAYMENTS: "synthetic-member-to-payments-secret-v1",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "synthetic-admin-to-payments-secret-v1",
    INTERNAL_TOKEN: "synthetic-internal-payment-token",
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "synthetic-receipt-signing-secret",
    LIFF_IDENTITY_KV: kv(), LIFF_SESSION_SECRET: "synthetic-line-session-signing-secret",
    PAY_SESSIONS_KV: kv(),
    AIRTABLE_BASE_ID: "synthetic-base",
    AIRTABLE_API_KEY: "read-write-isolated-fixture",
    AIRTABLE_TABLE_MEMBERS: "members",
    AIRTABLE_TABLE_PAYMENTS: "payments",
    AIRTABLE_TABLE_PAYMENT_PROOFS: "proofs",
    AIRTABLE_TABLE_SESSIONS: "sessions",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "entitlements",
    AIRTABLE_TABLE_ACCESS_LOG: "access",
    PAYMENT_SLIP_EVIDENCE: {
      async put(key, data) { r2.set(key, data); return { etag: "fixture", size: data.byteLength }; },
      async get(key) { return r2.has(key) ? { body: r2.get(key), httpMetadata: { contentType: "image/png" } } : null; },
      async delete(key) { r2.delete(key); },
    },
  };
  function create(table, fields) {
    const row = { id: "rec" + table.padEnd(10, "0") + String(tables[table].length).padStart(4, "0"), fields: { ...fields } };
    tables[table].push(row);
    return row;
  }
  async function airtable(input, init) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "api.airtable.com", "no external calls in this suite");
    const [, , base, table, id] = url.pathname.split("/");
    assert.equal(base, env.AIRTABLE_BASE_ID);
    const list = tables[table];
    if (!list) return Response.json({ error: "fixture_unknown_table" }, { status: 404 });
    const existing = list.find(row => row.id === id);
    if (request.method === "GET") {
      if (id) return Response.json(existing || {}, { status: existing ? 200 : 404 });
      const formula = url.searchParams.get("filterByFormula") || "";
      let rows = list;
      if (formula.startsWith('OR(LOWER({Contact Email}')) rows = list.filter(row => [row.fields["Contact Email"], row.fields.email].includes(email));
      else {
        const match = formula.match(/^(LOWER\()?\{([^}]+)\}\)?=['"]([^'"]+)['"]$/);
        if (match) rows = list.filter(row => {
          const key = match[2] === "payment_ref" && table === "payments" ? "Payment Reference" : match[2];
          const value = String(row.fields[key] ?? "");
          return (match[1] ? value.toLowerCase() : value) === match[3];
        });
      }
      return Response.json({ records: rows });
    }
    const body = await request.json();
    writes.push({ table, method: request.method, body });
    if (request.method === "PATCH" && id) {
      assert.ok(existing);
      Object.assign(existing.fields, body.fields);
      return Response.json(existing);
    }
    if (request.method === "PATCH") {
      assert.equal(table, "payments");
      assert.deepEqual(body.performUpsert.fieldsToMergeOn, ["Payment Reference"]);
      const fields = body.records[0].fields;
      const row = list.find(it => it.fields["Payment Reference"] === fields["Payment Reference"]);
      if (row) Object.assign(row.fields, fields);
      return Response.json({ records: [row || create(table, fields)] });
    }
    assert.equal(request.method, "POST");
    return body.records ? Response.json({ records: body.records.map(row => create(table, row.fields)) }) : Response.json(create(table, body.fields));
  }
  env.AIRTABLE_HTTP = { fetch: airtable };
  env.PAYMENTS_WORKER = { async fetch(req) { paymentsCalls.push(await req.clone().json()); return payments.fetch(req, env, {}); } };
  const token = "verified-liff-test-cookie";
  const liffKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LIFF_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hex = Buffer.from(await crypto.subtle.sign("HMAC", liffKey, new TextEncoder().encode("session:" + token))).toString("hex");
  async function session(overrides = {}) {
    await env.LIFF_IDENTITY_KV.put("liff:session:" + hex, JSON.stringify({
      line_user_id: line, member_exists: true, member_id: memberId, expires_at: Date.now() + 300000, ...overrides,
    }));
  }
  await session();
  const checkout = (body = { package_code: "red_card" }) => handlePublicMembershipPayment(jsonRequest(publicUrl, body, {
    origin: "https://mmdbkk.com", cookie: "__Host-mmd_liff_session=" + token,
  }), env);
  return { env, tables, checkout, writes, paymentsCalls, session, airtable, r2 };
}

test("Red Card users lacking a fresh unique canonical account cannot get a link or Payment record", async () => {
  for (const scenario of ["unlinked", "grace", "moved", "no email", "two emails", "duplicate email"]) {
    const fx = await fixture();
    if (scenario === "unlinked") await fx.session({ member_exists: false, member_id: null });
    if (scenario === "grace") await fx.session({ read_grace_only: true });
    if (scenario === "moved") fx.tables.members[0].fields.member_id = "different_member";
    if (scenario === "no email") delete fx.tables.members[0].fields["Contact Email"];
    if (scenario === "two emails") fx.tables.members[0].fields.email = "different@example.test";
    if (scenario === "duplicate email") fx.tables.members.push({ id: "recAnother0000001", fields: { email } });
    const response = await fx.checkout();
    assert.equal(response.status, 409, scenario);
    assert.deepEqual(await response.json(), { ok: false, error: { code: "RED_CARD_ACCOUNT_VERIFICATION_REQUIRED" }, account_verification_required: true });
    assert.deepEqual(fx.writes, []);
    assert.deepEqual(fx.paymentsCalls, []);
  }
});

test("Red Card rejects browser identity authority and direct or generic issuer bypass", async () => {
  const fx = await fixture();
  assert.equal((await fx.checkout({ package_code: "red_card", member_record_id: memberRecordId })).status, 400);
  const body = { package_code: "red_card", member_record_id: memberRecordId, payment_stage: "membership", amount: 11499, session_id: "publicmem_red_card_" + "a".repeat(24) };
  for (const [path, status] of [[RED_CARD_INTENT_PATH, 401], ["/v1/pay/verify", 409]]) {
    const response = await payments.fetch(jsonRequest("https://unit.test" + path, body), fx.env, {});
    assert.equal(response.status, status);
  }
  assert.deepEqual(fx.writes, []);
});

test("linked signup uses signed checkout, captures evidence, and materializes one two-year entitlement through Admin", async () => {
  const fx = await fixture();
  const orig = globalThis.fetch;
  globalThis.fetch = fx.airtable;
  try {
    const first = await fx.checkout();
    const order = await first.json();
    assert.equal(first.status, 200, JSON.stringify(order));
    assert.deepEqual([order.package.amount_thb, order.package.duration_days], [11499, 730]);
    assert.equal(order.entitlement_granted, false);
    assert.deepEqual(fx.tables.payments[0].fields.Member, [memberRecordId]);
    assert.equal(fx.tables.entitlements.length, 0);
    assert.doesNotMatch(JSON.stringify(order), /fixture_member|recMember00000001|U123456|fixture@example/);
    const duplicate = await (await fx.checkout()).json();
    assert.equal(duplicate.payment_ref, order.payment_ref);
    assert.equal(fx.tables.payments.length, 1);
    const checkoutUrl = new URL(order.customer_payment_url);
    assert.equal(checkoutUrl.pathname, "/pay/checkout");

    const form = new FormData();
    for (const [key, value] of Object.entries({
      source_page: "public_pay", payment_ref: order.payment_ref, session_id: order.session_id, payment_stage: "membership",
      t: checkoutUrl.searchParams.get("t"), amount_thb: "11499",
    })) form.set(key, value);
    form.set("file", new Blob(["synthetic slip bytes"], { type: "image/png" }), "fixture.png");
    const upload = await payments.fetch(new Request("https://unit.test/v1/pay/slip/evidence", { method: "POST", body: form }), fx.env, {});
    const proofResponse = await upload.json();
    assert.equal(upload.status, 200, JSON.stringify(proofResponse));
    assert.equal(proofResponse.evidence_only, true);
    assert.equal(fx.tables.proofs.length, 1);
    assert.equal([...fx.r2.keys()].filter(key => key.endsWith("/original.png")).length, 1);
    assert.equal(fx.tables.entitlements.length, 0);

    const [proof] = fx.tables.proofs;
    proof.fields.paid_at = issuedAt; // Mock trusted bank/owner-confirmed transfer timestamp at the evidence boundary.
    const approve = (key) => handlePaymentReviewRequest(jsonRequest("https://unit.test" + PAYMENT_REVIEW_ROUTES.review, {
      decision: "approve", proof_id: proof.fields.proof_id, reason: "Verified synthetic transfer fixture",
    }, { "idempotency-key": key }), fx.env, actor);
    // Even a trusted review entry has to present the exact original account.
    const beforeBadReview = fx.writes.length;
    const mismatched = await payments.fetch(jsonRequest("https://unit.test" + REVIEWED_PROOF_PATH, {
      source: "payment_review_console", decision: "approved", proof_id: proof.fields.proof_id,
      review_reason: "Synthetic mismatched account", payment_ref: order.payment_ref, session_id: order.session_id,
      payment_stage: "membership", amount_thb: 11499, package_code: "red_card",
      member_email: email, member_record_id: "recAnother0000001", member_id: "different_member",
    }, { authorization: "Bearer " + fx.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS }), fx.env, {});
    assert.equal(mismatched.status, 409);
    assert.equal((await mismatched.json()).error, "red_card_order_member_binding_mismatch");
    assert.equal(fx.writes.length, beforeBadReview);
    assert.notEqual(fx.tables.payments[0].fields["Payment Status"], "Paid");

    const approved = await approve("fixture-admin-1");
    const reviewed = await approved.json();
    assert.equal(approved.status, 200, JSON.stringify(reviewed));
    assert.equal(reviewed.entitlement_materialized, true, JSON.stringify(reviewed));
    assert.equal(fx.tables.payments[0].fields["Payment Status"], "Paid");
    assert.match(fx.tables.payments[0].fields.Notes, new RegExp(RED_CARD_CHECKOUT_MARKER));
    assert.equal(fx.tables.entitlements.length, 1);
    assert.deepEqual(fx.tables.entitlements[0].fields.member, [memberRecordId]);
    assert.equal(fx.tables.entitlements[0].fields.membership_term, "2_years");
    assert.equal(new Date(fx.tables.entitlements[0].fields.expire_at).toISOString(), "2028-11-24T05:30:00.000Z");
    const replay = await approve("fixture-admin-1");
    assert.equal(replay.status, 200);
    assert.equal(fx.tables.entitlements.length, 1);
    const afterPaid = await (await fx.checkout()).json();
    assert.equal(afterPaid.payment_ref, order.payment_ref);
    assert.equal(fx.tables.payments[0].fields["Payment Status"], "Paid");
  } finally {
    globalThis.fetch = orig;
  }
});

test("a prior unlinked Red Card intent never gets attached, reissued, or replaced", async () => {
  const { PUBLIC_MEMBERSHIP_PAYMENT_INTERNALS } = await import("../member-pages-worker/src/public-membership-payment.js");
  const { stablePaymentRef } = await import("./unified-payment-proof.js");
  for (const status of ["Pending", "Paid"]) {
    const fx = await fixture();
    const oldSession = await PUBLIC_MEMBERSHIP_PAYMENT_INTERNALS.purchaseSessionId(fx.env, line, "red_card");
    const oldRef = await stablePaymentRef(oldSession, "membership");
    const prior = { id: "recLegacy00000001", fields: {
      "Payment Reference": oldRef, "Package Code": "red_card", Amount: 11499, "Payment Status": status,
      session_id: oldSession, payment_stage: "membership",
    } };
    fx.tables.payments.push(structuredClone(prior));
    for (let count = 0; count < 2; count++) {
      const r = await fx.checkout();
      assert.equal(r.status, 409);
      assert.deepEqual(await r.json(), { ok: false, error: { code: "red_card_prior_order_review_required" } });
    }
    assert.deepEqual(fx.tables.payments, [prior]);
    assert.deepEqual(fx.writes, []);
    assert.deepEqual(fx.tables.entitlements, []);
  }
});

test("missing Airtable package option fails closed instead of typecasting production schema", async () => {
  const fx = await fixture();
  fx.env.AIRTABLE_HTTP.fetch = async req => {
    if (req.method === "PATCH") {
      assert.equal((await req.json()).typecast, false);
      return Response.json({ error: "INVALID_MULTIPLE_CHOICE_OPTIONS" }, { status: 422 });
    }
    return fx.airtable(req);
  };
  const r = await fx.checkout();
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { ok: false, error: { code: "red_card_order_unavailable" } });
  assert.deepEqual(fx.tables.payments, []);
});
