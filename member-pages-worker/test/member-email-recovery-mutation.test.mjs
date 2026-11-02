import test from "node:test";
import assert from "node:assert/strict";
import { CustomerRequestMutationCoordinator } from "../src/customer-request-mutation-durable-object.js";
import { persistMergeRequest } from "../src/member-email-recovery.js";

function harness() {
  const values = new Map();
  const state = { storage: { async get(key) { return values.get(key) || null; }, async put(key, value) { values.set(key, value); }, async delete(key) { values.delete(key); } }, async blockConcurrencyWhile(fn) { return fn(); } };
  const worker = new CustomerRequestMutationCoordinator(state);
  return async (body) => worker.fetch(new Request("https://mutation/" + body.action, { method: "POST", body: JSON.stringify(body) }));
}

test("recovery mutation lease quarantines a lost write and permits only verified readback reconciliation", async () => {
  const call = harness();
  const base = { operation_id: "op-recovery-123", mutation_fingerprint: "identity-recovery:key-123" };
  assert.equal((await (await call({ action: "begin", ...base })).json()).ok, true);
  assert.equal((await (await call({ action: "prepare", ...base })).json()).prepared, true);
  assert.equal((await (await call({ action: "write_started", ...base })).json()).write_started, true);
  assert.equal((await (await call({ action: "finish", ...base, status: "uncertain" })).json()).completed, "uncertain");
  const inspected = await (await call({ action: "inspect" })).json();
  assert.equal(inspected.lease.status, "uncertain");
  assert.equal((await (await call({ action: "reconcile", ...base, readback_verified: true })).json()).reconciled, true);
  assert.equal((await (await call({ action: "inspect" })).json()).lease, null);
});

test("pre-write abort releases a prepared lease without permitting an unverified retry", async () => {
  const call = harness();
  const base = { operation_id: "op-recovery-456", mutation_fingerprint: "identity-recovery:key-456" };
  await call({ action: "begin", ...base });
  await call({ action: "prepare", ...base });
  assert.equal((await (await call({ action: "finish", ...base, status: "aborted" })).json()).completed, "aborted");
  assert.equal((await (await call({ action: "inspect" })).json()).lease, null);
});

test("persist retry after lost finish response returns the one existing IMR by verified idempotency readback", async () => {
  const objects = new Map();
  let loseCreate = true;
  const binding = { idFromName: (name) => name, get: (id) => ({ fetch: async (url, init) => { const worker = objects.get(id) || new CustomerRequestMutationCoordinator({ storage: { async get(key) { return objects.get(id + ":" + key) || null; }, async put(key, value) { objects.set(id + ":" + key, value); }, async delete(key) { objects.delete(id + ":" + key); } }, async blockConcurrencyWhile(fn) { return fn(); } }); objects.set(id, worker); const response = await worker.fetch(new Request(url, init)); if (String(url).endsWith("/finish") && loseFinish) { loseFinish = false; return null; } return response; } }) };
  let record = null;
  const env = { AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "appTestRecovery123", LIFF_SESSION_SECRET: "s".repeat(64), CUSTOMER_REQUEST_MUTATION: binding, AIRTABLE_HTTP: { async fetch(request) { if (request.method === "POST") { const body = await request.json(); record = { id: "recPersistedIMR123", fields: body.records[0].fields }; if (loseCreate) { loseCreate = false; return null; } return Response.json({ records: [record] }); } return Response.json({ records: record ? [record] : [] }); } } };
  const input = { lineUserId: `U${"a".repeat(32)}`, email: "retry@example.com", phone: "0812345678", result: { state: "review_required", match_type: "not_found", confidence: 0, evidenceSources: [], preSessionIds: [], candidateClientIds: [], candidateMemberIds: [] } };
  await assert.rejects(() => persistMergeRequest(env, input));
  assert.ok(record, "lost create fixture must persist destination row");
  const retried = await persistMergeRequest(env, input);
  assert.equal(retried.resumed, true);
  assert.equal(retried.record_id, "recPersistedIMR123");
});
