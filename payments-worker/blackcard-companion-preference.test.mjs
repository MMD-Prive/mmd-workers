import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createConfirmTokenRecord, signConfirmToken } from "./index.js";
import { handleBlackCardCompanionPreference } from "./blackcard-companion-preference.js";

const SECRET = "blackcard-test-signing-secret";
const SESSION_ID = "sess_blackcard_test_001";
const PAYMENT_REF = "pay_blackcard_test_001";
const MEMBER_ID = "MMD-TEST-001";

// Execute the actual migration and production SQL. This adapter only translates
// the D1 method surface; it does not reimplement SELECT/INSERT/constraint behavior.
class SqliteD1 {
  sqlite = new DatabaseSync(":memory:");
  constructor() { this.sqlite.exec(readFileSync(new URL("./migrations/0001_blackcard_companion_preference.sql", import.meta.url), "utf8")); }
  get preferences() { return new Map(this.sqlite.prepare("SELECT * FROM mmd_blackcard_companion_preferences").all().map(row => [row.request_id, row])); }
  get outbox() { return new Map(this.sqlite.prepare("SELECT * FROM mmd_blackcard_companion_audit_outbox").all().map(row => [row.event_id, row])); }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql); let values = [];
    const bound = {
      bind(...args) { values = args; return bound; },
      async first() { return statement.get(...values) || null; },
      async run() { return bound.execute(); },
      execute() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
    return bound;
  }
  async batch(statements) {
    this.sqlite.exec("BEGIN");
    try { const result = statements.map(s => s.execute()); this.sqlite.exec("COMMIT"); return result; }
    catch (error) { this.sqlite.exec("ROLLBACK"); throw error; }
  }
}

function makeHarness({ memberId = MEMBER_ID, packageCode = "blackcard", paymentType = "blackcard", paymentStatus = "evidence_submitted", retention = "365", mirrorFails = false } = {}) {
  const db = new SqliteD1();
  const tokenRecords = new Map();
  const sessions = new Map([[SESSION_ID, { memberId, packageCode, paymentRef: PAYMENT_REF, paymentStatus }]]);
  const members = new Set([MEMBER_ID, "MMD-TEST-OTHER"]);
  const mirror = { records: [], writes: 0, fail: mirrorFails, failAfterUpsert: false, duplicateMember: false, duplicateSession: false, members, sessions, paymentUnavailable: false, paymentRecords: true, proofReceived: null, verification: "pending_review", ledgerStatus: "pending", proofs: [], paymentFetches: 0, setSession(id, value) { sessions.set(id, value); }, async fetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const match = url.searchParams.get("filterByFormula")?.match(/'([^']+)'/)?.[1];
    if (url.pathname.endsWith("/tblC98mKWbzmPuNzX")) {
      const value = sessions.get(match);
      const rows = value ? [{ id: "recSession0000001", fields: sessionFields(value.memberId, value.packageCode, match, value.paymentRef, value.paymentStatus, value.sessionStatus) }] : [];
      if (this.duplicateSession && rows.length) rows.push(rows[0]);
      return Response.json({ records: rows });
    }
    if (url.pathname.endsWith("/tblWGGJJOx5eBvBZJ")) {
      this.paymentFetches++;
      if (this.paymentUnavailable) return Response.json({}, { status: 503 });
      const sid = url.searchParams.get("filterByFormula")?.matchAll(/'([^']+)'/g);
      const [, sessionId] = [...sid].map(m => m[1]);
      const value = sessions.get(sessionId);
      const received = this.proofReceived ?? ((value?.paymentStatus || "evidence_submitted") === "evidence_submitted");
      return Response.json({ records: this.paymentRecords && value && value.paymentRef === match ? [{ id: "recPayment0000001", fields: { fldOO6SY49iDw8VBZ: match, fld2wdhBvc8xrV6y5: sessionId, fld04fr3bRJTohO6y: received ? "evidence_received" : "pending", fldJ7a0Ube9F0bmRy: this.verification, fldEJ1hmm7KwWuI6q: this.ledgerStatus } }] : [] });
    }
    if (url.pathname.endsWith("/tblfJfM4Sqag9zrLi")) return Response.json({ records: this.proofs });
    if (url.pathname.endsWith("/tblmU2D3u0fjlBpeo")) {
      if (request.method === "PATCH") {
        if (this.fail) return Response.json({ error: "fixture" }, { status: 503 });
        const body = await request.json();
        assert.deepEqual(body.performUpsert.fieldsToMergeOn, ["fldPYEff5pSnpjk0p"]);
        const fields = body.records[0].fields;
        let record = this.records.find(r => r.fields.fldPYEff5pSnpjk0p === fields.fldPYEff5pSnpjk0p);
        if (!record) { this.writes++; record = { id: "rec" + String(this.writes).padStart(14, "0"), fields }; this.records.push(record); }
        if (this.failAfterUpsert) { this.failAfterUpsert = false; throw new Error("response lost after commit"); }
        return Response.json({ records: [record], createdRecords: [record.id], updatedRecords: [] });
      }
      assert.equal(url.searchParams.get("returnFieldsByFieldId"), "true");
      return Response.json({ records: this.records.filter(record => record.fields.fldPYEff5pSnpjk0p === match) });
    }
    if (url.pathname.endsWith("/tblgWc5VRon5o8Mhk")) {
      assert.equal(url.searchParams.get("returnFieldsByFieldId"), "true");
      const records = this.members.has(match) ? [{ id: "recMember00000001", fields: { fld3hISS6bp1fjOQT: match } }] : [];
      if (this.duplicateMember && records.length) records.push(records[0]);
      return Response.json({ records });
    }
    if (/\/rec[0-9]{14}$/.test(url.pathname) && request.method === "PATCH") {
      const record = this.records.find(r => url.pathname.endsWith('/' + r.id));
      const patch = await request.json(); record.fields = { ...record.fields, ...patch.fields }; return Response.json({ id: record.id });
    }
    throw new Error("unexpected fixture route: " + url.pathname);
  } };
  const env = { PAYMENT_CONFIRMATION_SIGNING_SECRET: SECRET, PAY_SESSIONS_KV: { async get(key) { return tokenRecords.get(key) || null; }, async put(key, value) { tokenRecords.set(key, value); } }, AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_API_KEY: "fixture-only", AIRTABLE_HTTP: mirror, ALLOWED_ORIGINS: "https://mmdbkk.com", BLACKCARD_DB: db, BLACKCARD_PREFERENCE_RETENTION_DAYS: retention };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mirror.fetch.bind(mirror);
  return { db, env, mirror, restore() { globalThis.fetch = originalFetch; db.sqlite.close(); }, paymentType };
}

function sessionFields(memberId, packageCode, sessionId = SESSION_ID, paymentRef = PAYMENT_REF, paymentStatus = "evidence_submitted", sessionStatus = "pending") {
  return { fldLTq2kZbyRv22IA: sessionId, fldojgjSQLaO0uQLX: paymentRef, fldp6xNSvxDh5pjR9: packageCode, fldTY5lE6m0kQf72n: paymentStatus, fldmwuvOaiCFdzzRa: sessionStatus, fldHsczyzr8axfwUC: memberId, fldEcDkF7CH9VixWM: "" };
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

test("old links read the latest member preference after a change, with explicit request idempotency", async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env);
    const first = await (await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env)).json();
    const change = { companion_id: 'hima', change_reason: 'Prefer quieter care', request_key: crypto.randomUUID(), previous_request_id: first.request_id };
    const saved = await handleBlackCardCompanionPreference(request(token, change), h.env);
    assert.equal(saved.status, 202, await saved.clone().text());
    const replay = await handleBlackCardCompanionPreference(request(token, change), h.env);
    assert.equal(replay.status, 202); assert.equal((await replay.json()).idempotent, true);
    const read = await (await handleBlackCardCompanionPreference(request(token, { read: true, member_id: 'MMD-TEST-OTHER' }), h.env)).json();
    assert.equal(read.companion.id, 'hima'); assert.equal(h.db.preferences.size, 2); assert.equal(h.db.outbox.size, 2);
    const stale = await handleBlackCardCompanionPreference(request(token, { ...change, request_key: crypto.randomUUID(), companion_id: 'hiro' }), h.env);
    assert.equal(stale.status, 409); assert.equal(h.db.preferences.size, 2);
  } finally { h.restore(); }
});

test("simultaneous identical requests keep one canonical row, matching audit ID and one mirror", async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env);
    const responses = await Promise.all(Array.from({ length: 6 }, () => handleBlackCardCompanionPreference(request(token, { companion_id: 'hiro' }), h.env)));
    assert.ok(responses.every(r => [202, 503].includes(r.status)));
    assert.ok(responses.some(r => r.status === 202));
    const retry = await handleBlackCardCompanionPreference(request(token, { companion_id: 'hiro' }), h.env);
    assert.equal(retry.status, 202);
    assert.equal(h.db.preferences.size, 1); assert.equal(h.db.outbox.size, 1); assert.equal(h.mirror.records.length, 1);
    const row = [...h.db.preferences.values()][0], event = [...h.db.outbox.values()][0];
    assert.equal(event.event_id, row.audit_event_id); assert.equal(event.request_id, row.request_id);
    assert.equal(h.mirror.records[0].fields.fldhdZwWJBB7CTbA5, event.event_id);
  } finally { h.restore(); }
});

test("simultaneous first choices from different signed sessions cannot create two initial preferences", async () => {
  const h = makeHarness();
  try {
    h.mirror.setSession('sess_second', { memberId: MEMBER_ID, packageCode: 'blackcard', paymentRef: 'pay_second' });
    const one = await makeToken(h.env), two = await makeToken(h.env, 'blackcard', 'customer', 'sess_second', 'pay_second');
    const responses = await Promise.all([handleBlackCardCompanionPreference(request(one, { companion_id: 'hito' }), h.env), handleBlackCardCompanionPreference(request(two, { companion_id: 'hima' }), h.env)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [202, 409]);
    assert.equal(h.db.preferences.size, 1); assert.equal(h.db.outbox.size, 1); assert.equal(h.mirror.records.length, 1);
  } finally { h.restore(); }
});

test("unknown/ambiguous member or duplicate session fails before any D1 write", async () => {
  for (const mode of ['missing', 'duplicateMember', 'duplicateSession']) {
    const h = makeHarness();
    try {
      if (mode === 'missing') h.mirror.members.clear(); else h.mirror[mode] = true;
      const token = await makeToken(h.env);
      const r = await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito', member_id: MEMBER_ID }), h.env);
      assert.equal(r.status, mode === 'duplicateSession' ? 503 : 403);
      assert.equal(h.db.preferences.size, 0); assert.equal(h.db.outbox.size, 0);
    } finally { h.restore(); }
  }
});

test("payment evidence is exact-ref backend truth; Session completion/paid alone is insufficient", async () => {
  for (const status of ['pending', 'paid', 'completed', '']) {
    const h = makeHarness({ paymentStatus: status });
    try {
      h.mirror.proofReceived = false;
      h.mirror.setSession(SESSION_ID, { memberId: MEMBER_ID, packageCode: 'blackcard', paymentRef: PAYMENT_REF, paymentStatus: status, sessionStatus: 'completed' });
      const token = await makeToken(h.env);
      assert.equal((await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env)).status, 409);
      h.mirror.proofReceived = true;
      const evidence = await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env);
      assert.equal(evidence.status, 202, await evidence.clone().text());
      assert.equal((await evidence.json()).entitlement_activated, false);
    } finally { h.restore(); }
  }
});

test("provider/Official Verify allows preference but never grants entitlement; unavailable lookup fails closed", async () => {
  const h = makeHarness({ paymentStatus: 'pending' });
  try {
    h.mirror.proofReceived = false; h.mirror.verification = 'verified';
    const token = await makeToken(h.env);
    const verified = await handleBlackCardCompanionPreference(request(token, { companion_id: 'hiro' }), h.env);
    assert.equal(verified.status, 202); const d = await verified.json(); assert.equal(d.payment_status, 'verified'); assert.equal(d.entitlement_activated, false);
    h.mirror.paymentUnavailable = true;
    assert.equal((await handleBlackCardCompanionPreference(request(token, { read: true }), h.env)).status, 503);
  } finally { h.restore(); }
});

test("missing or mismatched payment reference and refunded payment are rejected", async () => {
  for (const ref of ['', 'pay_other']) {
    const h = makeHarness();
    try {
      h.mirror.setSession(SESSION_ID, { memberId: MEMBER_ID, packageCode: 'blackcard', paymentRef: ref });
      const token = await makeToken(h.env);
      assert.equal((await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env)).status, 409);
      assert.equal(h.db.preferences.size, 0);
    } finally { h.restore(); }
  }
  const h = makeHarness();
  try {
    h.mirror.verification = 'refunded';
    const token = await makeToken(h.env);
    assert.equal((await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env)).status, 409);
  } finally { h.restore(); }
});

test("lost mirror response retries without duplication; delivered readback does not require mirror availability", async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env); h.mirror.failAfterUpsert = true;
    assert.equal((await handleBlackCardCompanionPreference(request(token, { companion_id: 'hima' }), h.env)).status, 503);
    assert.equal(h.mirror.records.length, 1);
    const retry = await handleBlackCardCompanionPreference(request(token, { companion_id: 'hima' }), h.env);
    assert.equal(retry.status, 202); assert.equal(h.mirror.records.length, 1); assert.equal(h.db.outbox.size, 1);
    h.mirror.fail = true;
    const read = await handleBlackCardCompanionPreference(request(token, { read: true }), h.env);
    assert.equal(read.status, 200); assert.equal((await read.json()).companion.id, 'hima');
  } finally { h.restore(); }
});

test("retention-expired preference is neither returned nor recreated on a retry", async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env);
    await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env);
    h.db.sqlite.exec("UPDATE mmd_blackcard_companion_preferences SET retention_expires_at = '2000-01-01T00:00:00.000Z'");
    const read = await (await handleBlackCardCompanionPreference(request(token, { read: true }), h.env)).json();
    assert.equal(read.companion, null); assert.equal(read.preference_status, 'expired');
    assert.equal((await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env)).status, 410);
    assert.equal(h.db.preferences.size, 1); assert.equal(h.mirror.writes, 1);
  } finally { h.restore(); }
});

test('configured release entrypoint routes preference and instructions through signed backend gates', async () => {
  const { registerHooks } = await import('node:module');
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true };
    return next(specifier, context);
  } });
  const h = makeHarness();
  try {
    const worker = (await import('./index.session-paid-projection-wrapper.js')).default;
    const token = await makeToken(h.env);
    const saved = await worker.fetch(request(token, { companion_id: 'hiro' }), h.env, {});
    assert.equal(saved.status, 202, await saved.clone().text());
    const read = await worker.fetch(request(token, { read: true }), h.env, {});
    assert.equal((await read.json()).companion.id, 'hiro');
    const instructions = new Request('https://sigil.mmdbkk.com/v1/confirm/payment-instructions', { method: 'POST', headers: { origin: 'https://mmdbkk.com', 'content-type': 'application/json' }, body: JSON.stringify({ t: token }) });
    const response = await worker.fetch(instructions, h.env, {});
    assert.equal(response.status, 200, await response.clone().text());
    const d = await response.json();
    assert.equal(d.available, false); assert.equal(d.reason, 'blackcard_not_activated_for_sale');
    assert.equal(d.instructions, undefined);
  } finally { hooks.deregister(); h.restore(); }
});

test('manual paid ledger summary is not verification, and proof records must match the exact ref', async () => {
  const h = makeHarness({ paymentStatus: 'pending' });
  try {
    const token = await makeToken(h.env); h.mirror.ledgerStatus = 'paid'; h.mirror.proofReceived = false;
    assert.equal((await handleBlackCardCompanionPreference(request(token, { companion_id: 'hiro' }), h.env)).status, 409);
    h.mirror.proofs = [{ id: 'recProof000000001', fields: { payment_ref: 'wrong_ref', status: 'submitted' } }];
    assert.equal((await handleBlackCardCompanionPreference(request(token, { companion_id: 'hiro' }), h.env)).status, 409);
    h.mirror.proofs[0].fields.payment_ref = PAYMENT_REF;
    h.mirror.proofs[0].fields.status = '';
    assert.equal((await handleBlackCardCompanionPreference(request(token, { companion_id: 'hiro' }), h.env)).status, 409);
    h.mirror.proofs[0].fields.status = 'submitted';
    const r = await handleBlackCardCompanionPreference(request(token, { companion_id: 'hiro' }), h.env);
    assert.equal(r.status, 202); const d = await r.json(); assert.equal(d.payment_status, 'evidence_submitted'); assert.equal(d.entitlement_activated, false);
  } finally { h.restore(); }
});

test('simultaneous changes use compare-and-set and keep existing note/preferences when omitted', async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env);
    const first = await (await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito', note: 'Keep this note', experience_preferences: ['privacy'] }), h.env)).json();
    const responses = await Promise.all(['hima', 'hiro'].map(id => handleBlackCardCompanionPreference(request(token, { companion_id: id, request_key: crypto.randomUUID(), previous_request_id: first.request_id, change_reason: 'New preference' }), h.env)));
    assert.deepEqual(responses.map(r => r.status).sort(), [202, 409]);
    assert.equal(h.db.preferences.size, 2); assert.equal(h.db.outbox.size, 2);
    const latest = [...h.db.preferences.values()].at(-1);
    assert.equal(latest.note, 'Keep this note'); assert.equal(latest.experience_preferences_json, '["privacy"]');
  } finally { h.restore(); }
});

test('a mirror record attached to another member cannot be treated as a successful retry', async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env); h.mirror.failAfterUpsert = true;
    await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env);
    h.mirror.records[0].fields.fldMiUCgSuP229TcZ = 'MMD-OTHER';
    const retry = await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env);
    assert.equal(retry.status, 503); assert.equal(h.mirror.writes, 1);
    assert.equal([...h.db.outbox.values()][0].delivery_status, 'retry_required');
  } finally { h.restore(); }
});
