import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createConfirmTokenRecord, signConfirmToken } from "./index.js";

export const SECRET = "blackcard-test-signing-secret";
export const SESSION_ID = "sess_blackcard_test_001";
export const PAYMENT_REF = "pay_blackcard_test_001";
export const MEMBER_ID = "MMD-TEST-001";

// Execute the actual migration and production SQL. This adapter only translates
// the D1 method surface; it does not reimplement SELECT/INSERT/constraint behavior.
class SqliteD1 {
  sqlite = new DatabaseSync(":memory:");
  constructor() { for (const name of ["0001_blackcard_companion_preference.sql", "0002_blackcard_preference_lifecycle.sql"]) this.sqlite.exec(readFileSync(new URL("./migrations/" + name, import.meta.url), "utf8")); }
  get preferences() { return new Map(this.sqlite.prepare("SELECT * FROM mmd_blackcard_companion_preferences").all().map(row => [row.request_id, row])); }
  get outbox() { return new Map(this.sqlite.prepare("SELECT * FROM mmd_blackcard_companion_audit_outbox").all().map(row => [row.event_id, row])); }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql); let values = [];
    const bound = {
      bind(...args) { values = args; return bound; },
      async first() { return statement.get(...values) || null; },
      async all() { return { results:statement.all(...values), success:true }; },
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

export function makeHarness({ memberId = MEMBER_ID, packageCode = "blackcard", paymentType = "blackcard", paymentStatus = "evidence_submitted", retention = "365", mirrorFails = false } = {}) {
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
  const env = { PAYMENT_CONFIRMATION_SIGNING_SECRET: SECRET, PAY_SESSIONS_KV: { async get(key) { return tokenRecords.get(key) || null; }, async put(key, value) { tokenRecords.set(key, value); } }, AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_API_KEY: "fixture-only", AIRTABLE_HTTP: mirror, ALLOWED_ORIGINS: "https://mmdbkk.com", BLACKCARD_DB: db, BLACKCARD_PREFERENCE_RETENTION_DAYS: retention, AUTH_SERVICE_ADMIN_TO_PAYMENTS: "fixture-admin-service-secret" };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mirror.fetch.bind(mirror);
  return { db, env, mirror, restore() { globalThis.fetch = originalFetch; db.sqlite.close(); }, paymentType };
}

function sessionFields(memberId, packageCode, sessionId = SESSION_ID, paymentRef = PAYMENT_REF, paymentStatus = "evidence_submitted", sessionStatus = "pending") {
  return { fldLTq2kZbyRv22IA: sessionId, fldojgjSQLaO0uQLX: paymentRef, fldp6xNSvxDh5pjR9: packageCode, fldTY5lE6m0kQf72n: paymentStatus, fldmwuvOaiCFdzzRa: sessionStatus, fldHsczyzr8axfwUC: memberId, fldEcDkF7CH9VixWM: "" };
}

export async function makeToken(env, paymentType = "blackcard", role = "customer", sessionId = SESSION_ID, paymentRef = PAYMENT_REF, expiresIn = 600, issuedAgo = 0) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { kind: role === "customer" ? "customer_confirm" : "model_confirm", role, session_id: sessionId, payment_ref: paymentRef, payment_type: paymentType, iat: now - issuedAgo, exp: now + expiresIn };
  const token = await signConfirmToken(claims, SECRET);
  await createConfirmTokenRecord(env, token, claims);
  return token;
}

export function request(token, body = {}) {
  return new Request("https://sigil.mmdbkk.com/v1/confirm/companion-preference", { method: "POST", headers: { origin: "https://mmdbkk.com", "content-type": "application/json" }, body: JSON.stringify({ t: token, expected_role: "customer", ...body }) });
}
