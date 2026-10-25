import assert from "node:assert/strict";
import test from "node:test";
import { createConfirmTokenRecord, signConfirmToken } from "./index.js";
import { handleBlackCardCompanionPreference } from "./blackcard-companion-preference.js";

const SECRET = "blackcard-test-signing-secret";
const SESSION_ID = "sess_blackcard_test_001";
const PAYMENT_REF = "pay_blackcard_test_001";
const MEMBER_ID = "MMD-TEST-001";

class FakeD1 {
  preferences = new Map();
  outbox = new Map();
  prepare(sql) {
    const db = this; let values = [];
    const statement = {
      sql,
      bind(...args) { values = args; return statement; },
      values() { return values; },
      async first() {
        if (sql.includes("WHERE idempotency_key = ?")) return [...db.preferences.values()].find(row => row.idempotency_key === values[0]) || null;
        if (sql.includes("WHERE member_id = ?")) return [...db.preferences.values()].filter(row => row.member_id === values[0]).at(-1) || null;
        return null;
      },
      async run() {
        if (sql.startsWith("UPDATE mmd_blackcard_companion_audit_outbox")) {
          const row = [...db.outbox.values()].find(item => item.idempotency_key === values.at(-1));
          if (row) row.delivery_status = sql.includes("delivery_status = 'delivered'") ? "delivered" : "retry_required";
        }
        return { success: true };
      },
    };
    return statement;
  }
  async batch(statements) {
    for (const statement of statements) {
      const v = statement.values();
      if (statement.sql.startsWith("INSERT OR IGNORE INTO mmd_blackcard_companion_preferences")) {
        const [request_id, member_id, line_user_id_hash, correlation_hash, idempotency_key, payload_hash, request_type, companion_preference, experience_preferences_json, note, change_reason, current_companion_snapshot, audit_event_id, retention_expires_at, created_at, updated_at] = v;
        if (![...this.preferences.values()].some(row => row.idempotency_key === idempotency_key)) this.preferences.set(request_id, { request_id, member_id, line_user_id_hash, correlation_hash, idempotency_key, payload_hash, request_type, companion_preference, experience_preferences_json, note, change_reason, current_companion_snapshot, audit_event_id, retention_expires_at, created_at, updated_at, status: "pending_review" });
      } else if (statement.sql.startsWith("INSERT OR IGNORE INTO mmd_blackcard_companion_audit_outbox")) {
        const [event_id, idempotency_key, member_id_hash, created_at, preference_key] = v;
        const row = [...this.preferences.values()].find(item => item.idempotency_key === preference_key);
        if (row && ![...this.outbox.values()].some(item => item.idempotency_key === idempotency_key)) this.outbox.set(event_id, { event_id, idempotency_key, member_id_hash, request_id: row.request_id, created_at, delivery_status: "pending" });
      } else if (statement.sql.startsWith("UPDATE mmd_blackcard_companion_audit_outbox")) {
        const [delivered_at, key] = v;
        const row = [...this.outbox.values()].find(item => item.idempotency_key === key);
        if (row) { row.delivery_status = "delivered"; row.delivered_at = delivered_at; }
      }
    }
    return statements.map(() => ({ success: true }));
  }
}

function makeHarness({ memberId = MEMBER_ID, packageCode = "blackcard", paymentType = "blackcard", paymentStatus = "evidence_submitted", retention = "365", mirrorFails = false } = {}) {
  const db = new FakeD1();
  const tokenRecords = new Map();
  const sessions = new Map([[SESSION_ID, { memberId, packageCode, paymentRef: PAYMENT_REF, paymentStatus }]]);
  const mirror = { records: [], writes: 0, fail: mirrorFails, sessions, setSession(id, value) { sessions.set(id, value); }, async fetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/tblC98mKWbzmPuNzX")) {
      const requestedSession = url.searchParams.get("filterByFormula")?.match(/'([^']+)'/)?.[1];
      const value = sessions.get(requestedSession);
      return Response.json({ records: value ? [{ id: "recSession0000001", fields: sessionFields(value.memberId, value.packageCode, requestedSession, value.paymentRef, value.paymentStatus) }] : [] });
    }
    if (url.pathname.endsWith("/tblmU2D3u0fjlBpeo")) {
      if (request.method === "POST") { if (this.fail) return Response.json({ error: "fixture" }, { status: 503 }); this.writes++; const body = await request.json(); const record = { id: "recMirror00000001", fields: body.fields }; this.records.push(record); return Response.json(record); }
      const key = new URL(url).searchParams.get("filterByFormula")?.match(/'([^']+)'/)?.[1];
      return Response.json({ records: this.records.filter(record => record.fields.fldPYEff5pSnpjk0p === key) });
    }
    if (url.pathname.endsWith("/tblgWc5VRon5o8Mhk")) return Response.json({ records: memberId ? [{ id: "recMember00000001", fields: { fld3hISS6bp1fjOQT: memberId } }] : [] });
    if (url.pathname.endsWith("/recMirror00000001") && request.method === "PATCH") { const patch = await request.json(); this.records[0].fields = { ...this.records[0].fields, ...patch.fields }; return Response.json({ id: "recMirror00000001" }); }
    return Response.json({ records: [] });
  } };
  const env = { PAYMENT_CONFIRMATION_SIGNING_SECRET: SECRET, PAY_SESSIONS_KV: { async get(key) { return tokenRecords.get(key) || null; }, async put(key, value) { tokenRecords.set(key, value); } }, AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_API_KEY: "fixture-only", AIRTABLE_HTTP: mirror, ALLOWED_ORIGINS: "https://mmdbkk.com", BLACKCARD_DB: db, BLACKCARD_PREFERENCE_RETENTION_DAYS: retention };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mirror.fetch.bind(mirror);
  return { db, env, mirror, restore() { globalThis.fetch = originalFetch; }, paymentType };
}

function sessionFields(memberId, packageCode, sessionId = SESSION_ID, paymentRef = PAYMENT_REF, paymentStatus = "evidence_submitted") {
  return { fldLTq2kZbyRv22IA: sessionId, fldojgjSQLaO0uQLX: paymentRef, fldp6xNSvxDh5pjR9: packageCode, fldTY5lE6m0kQf72n: paymentStatus, fldHsczyzr8axfwUC: memberId, fldEcDkF7CH9VixWM: "" };
}

async function makeToken(env, paymentType = "blackcard", role = "customer", sessionId = SESSION_ID, paymentRef = PAYMENT_REF, expiresIn = 600, issuedAgo = 0) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { kind: role === "customer" ? "customer_confirm" : "model_confirm", role, session_id: sessionId, payment_ref: paymentRef, payment_type: paymentType, iat: now - issuedAgo, exp: now + expiresIn };
  const token = await signConfirmToken(claims, SECRET);
  await createConfirmTokenRecord(env, token, claims);
  return token;
}

function request(token, body = {}) {
  return new Request("https://sigil.mmdbkk.com/v1/confirm/companion-preference", { method: "POST", headers: { origin: "https://mmdbkk.com", "content-type": "application/json" }, body: JSON.stringify({ t: token, expected_role: "customer", ...body }) });
}

test("verified signed Black Card session persists and reads the preference by canonical member account", async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env);
    const saved = await handleBlackCardCompanionPreference(request(token, { companion_id: "hiro", experience_preferences: ["privacy"] }), h.env);
    assert.equal(saved.status, 202, await saved.clone().text());
    assert.equal(saved.headers.get("access-control-allow-origin"), "https://mmdbkk.com");
    const body = await saved.json(); assert.equal(body.status, "pending_review"); assert.equal(body.entitlement_activated, false);
    assert.equal(h.db.preferences.size, 1); assert.equal(h.db.outbox.size, 1); assert.equal(h.mirror.writes, 1);
    const mirror = h.mirror.records[0].fields;
    assert.equal(mirror.fld6I0jkPbACVSVWV[0], "recMember00000001");
    assert.equal(mirror.fldmUukFu7vlCNVRS, "pending_review");
    assert.equal(mirror.flda7tIZNEOulLnqq, "delivered");
    assert.equal(JSON.stringify([...h.db.preferences.values()]).includes(token), false);

    const reread = await handleBlackCardCompanionPreference(request(token, { read: true }), h.env);
    const readBody = await reread.json(); assert.equal(readBody.companion.id, "hiro"); assert.equal(readBody.preference_status, "pending_review");
    const duplicate = await handleBlackCardCompanionPreference(request(token, { companion_id: "hiro", experience_preferences: ["privacy"] }), h.env);
    assert.equal(duplicate.status, 202); assert.equal((await duplicate.json()).idempotent, true);
    assert.equal(h.db.preferences.size, 1); assert.equal(h.db.outbox.size, 1);

    const secondSession = "sess_blackcard_same_member_002", secondPayment = "pay_blackcard_same_member_002";
    h.mirror.setSession(secondSession, { memberId: MEMBER_ID, packageCode: "blackcard", paymentRef: secondPayment });
    const secondToken = await makeToken(h.env, "blackcard", "customer", secondSession, secondPayment);
    const crossDeviceRead = await handleBlackCardCompanionPreference(request(secondToken, { read: true }), h.env);
    const crossDeviceBody = await crossDeviceRead.json();
    assert.equal(crossDeviceBody.companion.id, "hiro");
    assert.equal(crossDeviceBody.payment_status, "evidence_submitted");
    const samePreference = await handleBlackCardCompanionPreference(request(secondToken, { companion_id: "hiro", experience_preferences: ["privacy"] }), h.env);
    assert.equal(samePreference.status, 202);
    assert.equal((await samePreference.json()).idempotent, true);
    assert.equal(h.db.preferences.size, 1);

    const otherMember = "MMD-TEST-OTHER", otherSession = "sess_blackcard_other_member_003", otherPayment = "pay_blackcard_other_member_003";
    h.mirror.setSession(otherSession, { memberId: otherMember, packageCode: "blackcard", paymentRef: otherPayment });
    const otherToken = await makeToken(h.env, "blackcard", "customer", otherSession, otherPayment);
    const isolatedRead = await handleBlackCardCompanionPreference(request(otherToken, { read: true }), h.env);
    assert.equal((await isolatedRead.json()).companion, null);
  } finally { h.restore(); }
});

test("booking/job confirmation token cannot use a Black Card package session", async () => {
  const h = makeHarness({ paymentType: "full" });
  try {
    const token = await makeToken(h.env, "full");
    const response = await handleBlackCardCompanionPreference(request(token, { companion_id: "hito" }), h.env);
    assert.equal(response.status, 409); assert.equal((await response.json()).error, "blackcard_confirmation_required");
    assert.equal(h.db.preferences.size, 0);
  } finally { h.restore(); }
});

test("package classification uses the canonical package field, not a note substring", async () => {
  const h = makeHarness({ packageCode: "standard" });
  try {
    const token = await makeToken(h.env);
    const response = await handleBlackCardCompanionPreference(request(token, { companion_id: "hito" }), h.env);
    assert.equal(response.status, 409); assert.equal((await response.json()).error, "blackcard_product_required");
    assert.equal(h.db.preferences.size, 0);
  } finally { h.restore(); }
});

test("unpaid Black Card intent cannot submit a Companion preference before evidence or verification", async () => {
  const h = makeHarness({ paymentStatus: "pending" });
  try {
    const token = await makeToken(h.env);
    const response = await handleBlackCardCompanionPreference(request(token, { companion_id: "hito" }), h.env);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "blackcard_payment_state_unavailable");
    assert.equal(h.db.preferences.size, 0);
    assert.equal(h.db.outbox.size, 0);
  } finally { h.restore(); }
});

test("invalid token, wrong role, and missing canonical member ID fail closed", async () => {
  const h = makeHarness();
  try {
    const invalid = await handleBlackCardCompanionPreference(request("invalid.token", { companion_id: "hito" }), h.env);
    assert.equal(invalid.status, 401);
    const model = await makeToken(h.env, "blackcard", "model");
    const wrongRole = await handleBlackCardCompanionPreference(request(model, { companion_id: "hito" }), h.env);
    assert.equal(wrongRole.status, 401);
    assert.equal(h.db.preferences.size, 0);
    const expired = await makeToken(h.env, "blackcard", "customer", SESSION_ID, PAYMENT_REF, -60, 600);
    const expiredResponse = await handleBlackCardCompanionPreference(request(expired), h.env);
    assert.equal(expiredResponse.status, 410);
  } finally { h.restore(); }
  const noMember = makeHarness({ memberId: "" });
  try {
    const token = await makeToken(noMember.env);
    const response = await handleBlackCardCompanionPreference(request(token, { companion_id: "hito" }), noMember.env);
    assert.equal(response.status, 403); assert.equal((await response.json()).error, "verified_member_account_required");
    assert.equal(noMember.db.preferences.size, 0);
  } finally { noMember.restore(); }
});

test("invalid choice, unapproved origin, and missing retention policy never write", async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env);
    assert.equal((await handleBlackCardCompanionPreference(request(token, { companion_id: "travel-model" }), h.env)).status, 400);
    const foreign = request(token, { companion_id: "hito" });
    const foreignRequest = new Request(foreign, { headers: { origin: "https://evil.example", "content-type": "application/json" } });
    assert.equal((await handleBlackCardCompanionPreference(foreignRequest, h.env)).status, 403);
    delete h.env.BLACKCARD_PREFERENCE_RETENTION_DAYS;
    const response = await handleBlackCardCompanionPreference(request(token, { companion_id: "hito" }), h.env);
    assert.equal(response.status, 503); assert.equal((await response.json()).error, "preference_retention_policy_unavailable");
    assert.equal(h.db.preferences.size, 0); assert.equal(h.db.outbox.size, 0);
  } finally { h.restore(); }
});

test("failed Airtable mirror remains retryable and never returns success early", async () => {
  const h = makeHarness({ mirrorFails: true });
  try {
    const token = await makeToken(h.env);
    const first = await handleBlackCardCompanionPreference(request(token, { companion_id: "hiei" }), h.env);
    assert.equal(first.status, 503); assert.equal(h.db.preferences.size, 1); assert.equal(h.db.outbox.size, 1);
    assert.equal([...h.db.outbox.values()][0].delivery_status, "retry_required");
    h.mirror.fail = false;
    const retry = await handleBlackCardCompanionPreference(request(token, { companion_id: "hiei" }), h.env);
    assert.equal(retry.status, 202); assert.equal((await retry.json()).idempotent, true);
    assert.equal(h.db.preferences.size, 1); assert.equal(h.db.outbox.size, 1); assert.equal(h.mirror.writes, 1);
    assert.equal([...h.db.outbox.values()][0].delivery_status, "delivered");
  } finally { h.restore(); }
});

test("changing a preference with the same signed correlation is an explicit conflict", async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env);
    await handleBlackCardCompanionPreference(request(token, { companion_id: "hima" }), h.env);
    const response = await handleBlackCardCompanionPreference(request(token, { companion_id: "hito" }), h.env);
    assert.equal(response.status, 409); assert.equal((await response.json()).error, "idempotency_conflict");
    assert.equal(h.db.preferences.size, 1);
  } finally { h.restore(); }
});
