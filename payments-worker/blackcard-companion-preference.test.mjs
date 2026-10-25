import assert from "node:assert/strict";
import test from "node:test";
import { handleBlackCardCompanionPreference } from "./blackcard-companion-preference.js";
import { textRetentionDue } from './blackcard-preference-retention-policy.js';
import { makeHarness, makeToken, request, MEMBER_ID, SESSION_ID, PAYMENT_REF } from "./blackcard-preference.test-fixtures.mjs";

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
    delete h.env.BLACKCARD_PREFERENCE_TEXT_RETENTION_DAYS;
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

test("free-text expiry preserves structured readback while retiring the old operation key", async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env);
    await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito' }), h.env);
    h.db.sqlite.exec("UPDATE mmd_blackcard_companion_preferences SET retention_expires_at = '2000-01-01T00:00:00.000Z'");
    const read = await (await handleBlackCardCompanionPreference(request(token, { read: true }), h.env)).json();
    assert.equal(read.companion.id, 'hito'); assert.equal(read.preference_status, 'pending_review');
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

test('simultaneous changes preserve structured context without copying prior free text', async () => {
  const h = makeHarness();
  try {
    const token = await makeToken(h.env);
    const first = await (await handleBlackCardCompanionPreference(request(token, { companion_id: 'hito', note: 'Keep this note', experience_preferences: ['privacy'] }), h.env)).json();
    const responses = await Promise.all(['hima', 'hiro'].map(id => handleBlackCardCompanionPreference(request(token, { companion_id: id, request_key: crypto.randomUUID(), previous_request_id: first.request_id, change_reason: 'New preference' }), h.env)));
    assert.deepEqual(responses.map(r => r.status).sort(), [202, 409]);
    assert.equal(h.db.preferences.size, 2); assert.equal(h.db.outbox.size, 2);
    const latest = [...h.db.preferences.values()].at(-1);
    assert.equal(latest.note, ''); assert.equal(latest.experience_preferences_json, '["privacy"]');
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

test('only the approved 90-day free-text window is accepted, independently of legacy retention config', async () => {
  const cutoff='2026-10-25T12:00:00.000Z', row={retention_expires_at:cutoff};
  assert.equal(textRetentionDue(row,Date.parse(cutoff)-1),false);
  assert.equal(textRetentionDue(row,cutoff),true);
  assert.equal(textRetentionDue({...row,retention_redacted_at:'2026-10-24T00:00:00Z'},Date.parse(cutoff)-1),true);
  assert.equal(textRetentionDue({retention_expires_at:'invalid'}),true);
  for (const days of ['365', '0', 'invalid', undefined]) {
    const h = makeHarness();
    try {
      h.env.BLACKCARD_PREFERENCE_TEXT_RETENTION_DAYS = days;
      h.env.BLACKCARD_PREFERENCE_RETENTION_DAYS = '90';
      const r = await handleBlackCardCompanionPreference(request(await makeToken(h.env), { companion_id:'hiro' }),h.env);
      assert.equal(r.status,503); assert.equal(h.db.preferences.size,0);
    } finally { h.restore(); }
  }
  const h = makeHarness();
  try {
    await handleBlackCardCompanionPreference(request(await makeToken(h.env),{companion_id:'hiro'}),h.env);
    const row=[...h.db.preferences.values()][0];
    assert.equal(Date.parse(row.retention_expires_at)-Date.parse(row.created_at),90*86400000);
  } finally { h.restore(); }
});

test('post-expiry intent requires a fresh key, exact latest version and reason; concurrent changes keep one winner', async () => {
  const h=makeHarness();
  try {
    const token=await makeToken(h.env);
    const original={companion_id:'hito',note:'old private note',experience_preferences:['privacy'],request_key:crypto.randomUUID()};
    await handleBlackCardCompanionPreference(request(token,original),h.env);
    const old=[...h.db.preferences.values()][0];
    h.db.sqlite.exec("UPDATE mmd_blackcard_companion_preferences SET status='recorded', retention_expires_at='2000-01-01T00:00:00.000Z', retention_redacted_at='2000-01-01T00:00:01.000Z', note='', change_reason=''");
    for(const body of [original,{...original,note:'reintroduced text'}]) {
      const r=await handleBlackCardCompanionPreference(request(token,body),h.env);
      assert.equal(r.status,410); assert.equal((await r.json()).error,'preference_request_retired');
    }
    const fresh={companion_id:'hito',request_key:crypto.randomUUID(),change_reason:'New request after text expiry'};
    for(const previous_request_id of [undefined,'stale']) {
      const r=await handleBlackCardCompanionPreference(request(token,{...fresh,previous_request_id}),h.env);
      assert.equal(r.status,409); assert.equal((await r.json()).error,'preference_new_request_required');
    }
    assert.equal((await handleBlackCardCompanionPreference(request(token,{...fresh,previous_request_id:old.request_id,change_reason:''}),h.env)).status,400);
    const responses=await Promise.all(['hito','hiro'].map(companion_id=>handleBlackCardCompanionPreference(request(token,{...fresh,companion_id,request_key:crypto.randomUUID(),previous_request_id:old.request_id}),h.env)));
    assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);
    assert.equal(h.db.preferences.size,2); assert.equal(h.db.outbox.size,2);
    const [ledger,latest]=[...h.db.preferences.values()];
    assert.equal(ledger.payload_hash,old.payload_hash); assert.equal(ledger.audit_event_id,old.audit_event_id); assert.equal(ledger.note,'');
    assert.equal(latest.note,''); assert.equal(latest.experience_preferences_json,'["privacy"]');
    assert.equal(latest.current_companion_snapshot,'hito');
    assert.equal(Date.parse(latest.retention_expires_at)-Date.parse(latest.created_at),90*86400000);
    // Even an old request key reads the latest member state; it cannot replay a write.
    const read=await (await handleBlackCardCompanionPreference(request(token,{read:true,request_key:original.request_key}),h.env)).json();
    assert.equal(read.request_id,latest.request_id); assert.equal(read.companion.id,latest.companion_preference);
  } finally {h.restore();}
});

test('expired pending mirror stays absent while fresh signed member sessions can read and submit, behind unchanged gates', async()=>{
  const h=makeHarness({mirrorFails:true});
  try {
    const token=await makeToken(h.env);
    await handleBlackCardCompanionPreference(request(token,{companion_id:'hiro'}),h.env);
    h.db.sqlite.exec("UPDATE mmd_blackcard_companion_preferences SET retention_expires_at='2000-01-01T00:00:00.000Z'");
    const old=[...h.db.preferences.values()][0];
    h.mirror.setSession('fresh_session',{memberId:MEMBER_ID,packageCode:'blackcard',paymentRef:'fresh_payment'});
    const freshToken=await makeToken(h.env,'blackcard','customer','fresh_session','fresh_payment');
    const read=await (await handleBlackCardCompanionPreference(request(freshToken,{read:true}),h.env)).json();
    assert.equal(read.companion.id,'hiro'); assert.equal(read.request_id,old.request_id); assert.equal(h.mirror.writes,0);
    assert.equal((await handleBlackCardCompanionPreference(request('invalid.token',{read:true}),h.env)).status,401);
    h.mirror.verification='refunded';
    assert.equal((await handleBlackCardCompanionPreference(request(freshToken,{read:true}),h.env)).status,409);
    h.mirror.verification=''; h.mirror.fail=false;
    const r=await handleBlackCardCompanionPreference(request(freshToken,{companion_id:'hiro',change_reason:'Fresh same-choice request',request_key:crypto.randomUUID(),previous_request_id:old.request_id}),h.env);
    assert.equal(r.status,202,await r.clone().text()); assert.equal((await r.json()).idempotent,false);
    assert.equal(h.db.preferences.size,2); assert.equal(h.mirror.records.length,1);
    assert.notEqual(h.mirror.records[0].fields.fldOlcIzDs5QbDN2c,old.request_id);
  } finally {h.restore();}
});
