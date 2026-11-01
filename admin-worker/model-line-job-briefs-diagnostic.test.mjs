import test from "node:test";
import assert from "node:assert/strict";
import { handleLineJobBriefRequest, handleLineJobBriefDurableRequest } from "./src/model-line-job-briefs.js";
import { handleLineBriefDiagnostic, readLineBriefPendingDiagnostic } from "./src/model-line-job-briefs-diagnostic.js";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";
import { ModelActivationCoordinator } from "./src/model-first-time-activation.js";

const ID = "a".repeat(64);
const NOW = "2026-10-22T00:00:00.000Z";
const ORIGIN = "https://mmdbkk.com";
const PREFIX = "line_brief_response:";
const BASELINE = Object.freeze({ account_id: "e".repeat(32), namespace_id: "b".repeat(32),
  worker_name: "admin-worker", binding_name: "MODEL_ACTIVATION_COORDINATOR",
  class_name: "ModelActivationCoordinator", store_name: "line-job-briefs-v1" });
const dependencies = (f, overrides = {}) => ({ inventoryBaseline: BASELINE, verifyExistingObject: async () => f.proof(), ...overrides });
function fixture(count = 5) {
  const data = new Map();
  for (let i = 0; i < count; i++) {
    const hash = i.toString(16).padStart(64, "0");
    const brief = `brf_${String(i).padStart(10, "0")}`;
    data.set(`${PREFIX}${brief}:${hash}`, { brief_id: brief, response_id: `rsp_${String(i).padStart(10, "0")}`,
      subject: "PRIVATE_LINE_SUBJECT", subject_hash: hash, internal_note: "PRIVATE_NOTE",
      decision: i === 1 ? "selected" : "pending", version: 1, created_at: NOW, updated_at: NOW });
  }
  data.set("line_brief_audit:private", { secret: "PRIVATE_AUDIT" });
  const calls = { get: 0, list: 0, writes: 0, fetch: 0, idFromString: 0 };
  const storage = new Proxy({ async list({ prefix, limit, startAfter = "" }) {
    calls.list++;
    assert.equal(prefix, PREFIX);
    assert.ok(limit <= 101);
    return new Map([...data].sort(([a], [b]) => a.localeCompare(b)).filter(([key]) => key.startsWith(prefix) && key > startAfter).slice(0, limit));
  }, async get(key) { return structuredClone(data.get(key)); } }, { get(target, key) {
    if (key in target) return target[key];
    return () => { calls.writes++; throw new Error("Non-list storage operation prohibited"); };
  } });
  const namespace = {
    idFromName(name) { assert.equal(name, "line-job-briefs-v1"); return { toString: () => ID }; },
    idFromString(value) { calls.idFromString++; assert.equal(value, ID); return { toString: () => ID }; },
    get(id) { calls.get++; assert.equal(id.toString(), ID); return { async fetch(url, init) {
      calls.fetch++;
      return handleLineJobBriefDurableRequest(state, env, new Request(url, init));
    } }; },
  };
  const state = { id: { toString: () => ID }, storage };
  const env = { ADMIN_SESSION_SECRET: "local-test-secret", ADMIN_LOGIN_CREDENTIAL: "local-test-credential", MODEL_ACTIVATION_COORDINATOR: namespace };
  const proof = () => ({ ...BASELINE, ok: true, source: "cloudflare_existing_objects", object_id: ID,
    evidence_id: "local_mock_inventory", observed_at: new Date().toISOString() });
  return { data, calls, state, env, namespace, proof };
}
const pending = (extra = {}) => ({ action: "diagnostic_pending", existing_object_id: ID, ...extra });
const command = (extra = {}) => ({ audience: "owner", action: "diagnostic_pending", expected_object_id: ID, ...extra });
async function body(response) { return { status: response.status, ...(await response.json()) }; }
async function request(f, input, { role = "owner", auth = true, origin = ORIGIN, expired = false, method = "POST", path = "/v1/admin/model/line-briefs" } = {}, dependencies) {
  let token = "";
  const clock = Date.now;
  try {
    if (expired) Date.now = () => clock() - 24 * 60 * 60 * 1000;
    if (auth) token = await createCredentialBoundAdminSession(new Request(`${ORIGIN}/internal/admin/login`), { id: "local-owner", role }, f.env);
  } finally { Date.now = clock; }
  return body(await handleLineJobBriefRequest(new Request(`${ORIGIN}${path}`, {
    method, headers: { origin, "content-type": "application/json", cookie: `mmd_admin_gate_v1=${token}` },
    ...(method === "POST" ? { body: JSON.stringify(input) } : {}),
  }), f.env, dependencies));
}

test("resolve passes existing owner authentication and never obtains a stub or touches storage", async () => {
  const f = fixture();
  const result = await request(f, { action: "diagnostic_resolve" });
  assert.equal(result.ok, true);
  assert.equal(result.object_id, ID);
  assert.equal(result.existence_verified, false);
  assert.deepEqual(f.calls, { get: 0, list: 0, writes: 0, fetch: 0, idFromString: 0 });
});

for (const [name, opts, status] of [
  ["missing session", { auth: false }, 401], ["expired session", { expired: true }, 401],
  ["non-owner role", { role: "model" }, 403], ["wrong origin", { origin: "https://example.com" }, 403],
  ["GET request", { method: "GET" }, 405], ["model facade", { path: "/v1/model/line-briefs" }, 400],
]) test(`${name} fails before namespace access`, async () => {
  const f = fixture();
  f.env.MODEL_ACTIVATION_COORDINATOR = new Proxy({}, { get() { throw new Error("Must not access namespace"); } });
  const result = await request(f, { action: "diagnostic_resolve" }, opts);
  assert.equal(result.status, status);
});

test("Production-default pending path remains gated; request-supplied evidence cannot enable it", async () => {
  const f = fixture();
  const gated = await request(f, pending());
  assert.equal(gated.error, "existing_inventory_verifier_unavailable");
  assert.equal(gated.pending_status, "unknown");
  for (const extra of [{ proof: f.proof() }, { verifyExistingObject: true }, { store_name: "another" }, { namespace_id: "b".repeat(32) }]) {
    assert.equal((await request(f, pending(extra))).error, "unsupported_field");
  }
  assert.equal(f.calls.get, 0);
});

test("wrong object ID does not invoke inventory or obtain a stub", async () => {
  const f = fixture();
  const result = await body(await handleLineBriefDiagnostic(pending({ existing_object_id: "c".repeat(64) }), f.env, {
    verifyExistingObject() { throw new Error("Must not verify wrong ID"); },
  }));
  assert.equal(result.status, 409);
  assert.equal(f.calls.get, 0);
});

test("inventory exception and idFromString mismatch fail before stub access", async () => {
  const f = fixture();
  const failed = await body(await handleLineBriefDiagnostic(pending(), f.env, {
    inventoryBaseline: BASELINE,
    verifyExistingObject: async () => { throw new Error("PRIVATE_PROVIDER_DETAIL"); },
  }));
  assert.equal(failed.error, "diagnostic_read_unavailable");
  assert.equal(JSON.stringify(failed).includes("PRIVATE_PROVIDER_DETAIL"), false);
  f.namespace.idFromString = () => ({ toString: () => "d".repeat(64) });
  const mismatch = await body(await handleLineBriefDiagnostic(pending(), f.env, dependencies(f)));
  assert.equal(mismatch.error, "diagnostic_object_mismatch");
  assert.equal(f.calls.get, 0);
});

test("existing coordinator dispatch and constructor perform no extra storage/network operations", async () => {
  const f = fixture();
  const before = structuredClone(f.data);
  const coordinator = new ModelActivationCoordinator(f.state, f.env);
  const result = await body(await coordinator.fetch(new Request("https://model-activation.internal/line-job-briefs", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command({ limit: 2 })),
  })));
  assert.equal(result.ok, true);
  assert.equal(result.has_more, true);
  assert.equal(f.calls.writes, 0);
  assert.deepEqual(f.data, before);
});

for (const [name, change] of [
  ["missing", () => null], ["wrong ID", (p) => ({ ...p, object_id: "c".repeat(64) })],
  ["wrong source", (p) => ({ ...p, source: "request_json" })],
  ["wrong namespace class", (p) => ({ ...p, class_name: "Other" })],
  ["foreign account", (p) => ({ ...p, account_id: "f".repeat(32) })],
  ["foreign namespace", (p) => ({ ...p, namespace_id: "f".repeat(32) })],
  ["wrong worker", (p) => ({ ...p, worker_name: "other-worker" })],
  ["wrong store", (p) => ({ ...p, store_name: "other-store" })],
  ["missing account", (p) => ({ ...p, account_id: undefined })],
  ["missing evidence", (p) => ({ ...p, evidence_id: "" })],
  ["stale", (p) => ({ ...p, observed_at: new Date(Date.now() - 61000).toISOString() })],
  ["future", (p) => ({ ...p, observed_at: new Date(Date.now() + 61000).toISOString() })],
]) test(`inventory ${name} fails closed before get/fetch`, async () => {
  const f = fixture();
  const result = await body(await handleLineBriefDiagnostic(pending(), f.env, dependencies(f, { verifyExistingObject: async () => change(f.proof()) })));
  assert.equal(result.error, "existing_inventory_unverified");
  assert.equal(result.pending_status, "unknown");
  assert.equal(f.calls.get, 0);
});

test("trusted mock inventory reads all pages, sanitizes data and performs zero writes/network calls", async () => {
  const f = fixture();
  const before = structuredClone(f.data);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("External fetch forbidden"); };
  try {
    let cursor = "", seen = [], pages = 0, examined = 0;
    do {
      const result = await request(f, pending({ cursor, limit: 2 }), {}, dependencies(f));
      assert.equal(result.ok, true);
      assert.equal(result.count_scope, "page");
      assert.equal(result.pending_count, result.items.length);
      const encoded = JSON.stringify(result);
      for (const forbidden of ["subject", "PRIVATE_", PREFIX, "internal_note", "model_record_id"]) assert.equal(encoded.includes(forbidden), false);
      seen.push(...result.items.map((x) => x.response_id));
      examined += result.examined;
      cursor = result.next_cursor;
      if (result.has_more) assert.match(cursor, /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
      pages++;
    } while (cursor && pages < 10);
    assert.equal(pages, 3);
    assert.equal(examined, 5);
    assert.equal(seen.length, 4);
    assert.equal(new Set(seen).size, 4);
    assert.equal(f.calls.writes, 0);
    assert.deepEqual(f.data, before);
  } finally { globalThis.fetch = originalFetch; }
});

test("empty store returns only an explicitly scoped zero and no writes", async () => {
  const f = fixture(0);
  const result = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command()));
  assert.equal(result.pending_count, 0);
  assert.equal(result.has_more, false);
  assert.equal(result.count_scope, "page");
  assert.equal(result.consistency, "live_page_not_snapshot");
  assert.equal(f.calls.writes, 0);
});

test("identity mismatch inside object fails before storage", async () => {
  const f = fixture();
  f.state.id = { toString: () => "c".repeat(64) };
  const result = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command()));
  assert.equal(result.error, "diagnostic_object_mismatch");
  assert.equal(f.calls.list, 0);
});

test("model audience cannot use internal diagnostic reader", async () => {
  const f = fixture();
  const result = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ audience: "model" })));
  assert.equal(result.status, 403);
  assert.equal(f.calls.list, 0);
});

test("malformed cursor/limit and arbitrary fields are rejected without storage", async () => {
  const f = fixture();
  for (const extra of [{ cursor: "raw_key" }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: "1" }, { fields: "subject" }]) {
    const result = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command(extra)));
    assert.equal(result.ok, false);
  }
  assert.equal(f.calls.list, 0);
});

test("storage failure, invalid record and malformed cursor never report pending zero", async () => {
  const broken = fixture();
  broken.state.storage = { list: async () => { throw new Error("sensitive backend detail"); } };
  const invalid = fixture();
  invalid.data.get([...invalid.data.keys()][0]).decision = "unknown_state";
  const stale = fixture();
  for (const [f, input, error] of [
    [broken, command(), "diagnostic_read_unavailable"],
    [invalid, command(), "diagnostic_record_invalid"],
    [stale, command({ cursor: "f".repeat(64) }), "diagnostic_input_invalid"],
  ]) {
    const result = await body(await readLineBriefPendingDiagnostic(f.state, f.env, input));
    assert.equal(result.error, error);
    assert.equal(result.pending_status, "unknown");
    assert.equal("pending_count" in result, false);
    assert.equal(JSON.stringify(result).includes("sensitive"), false);
    assert.equal(f.calls.writes, 0);
  }
});

test("verifier cannot supply its own baseline or enable reads without a trusted baseline", async () => {
  const f = fixture();
  let verified = 0;
  const result = await body(await handleLineBriefDiagnostic(pending(), f.env, {
    verifyExistingObject: async () => { verified++; return f.proof(); },
  }));
  assert.equal(result.error, "existing_inventory_baseline_unavailable");
  assert.equal(verified, 0);
  assert.equal(f.calls.get, 0);
  assert.equal((await request(f, pending({ inventoryBaseline: BASELINE }))).error, "unsupported_field");
});

test("malformed baseline stops before verifier; verifier cannot rewrite the baseline during await", async () => {
  const f = fixture();
  for (const invalid of [null, { ...BASELINE, account_id: "invalid" }, { ...BASELINE, namespace_id: undefined },
    { ...BASELINE, worker_name: "other" }, { ...BASELINE, binding_name: "OTHER" }]) {
    const result = await body(await handleLineBriefDiagnostic(pending(), f.env, dependencies(f, {
      inventoryBaseline: invalid, verifyExistingObject: () => { throw new Error("Must not verify invalid baseline"); },
    })));
    assert.equal(result.error, "existing_inventory_baseline_unavailable");
  }
  const mutable = { ...BASELINE };
  const result = await body(await handleLineBriefDiagnostic(pending(), f.env, dependencies(f, {
    inventoryBaseline: mutable, verifyExistingObject: async (expected) => {
      mutable.namespace_id = "f".repeat(32);
      expected.namespace_id = mutable.namespace_id;
      return { ...f.proof(), namespace_id: mutable.namespace_id };
    },
  })));
  assert.equal(result.error, "existing_inventory_unverified");
  assert.equal(f.calls.get, 0);
});

test("cursor hides the storage key, is randomized, and detects tampering before storage", async () => {
  const f = fixture();
  const first = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ limit: 1 })));
  const again = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ limit: 1 })));
  assert.notEqual(first.next_cursor, again.next_cursor);
  const serialized = JSON.stringify(first);
  for (const rawKey of f.data.keys()) assert.equal(serialized.includes(rawKey), false);
  const [v, iv, cipher] = first.next_cursor.split(".");
  const tampered = `${v}.${iv}.${cipher[0] === "A" ? "B" : "A"}${cipher.slice(1)}`;
  const reads = f.calls.list;
  const rejected = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ cursor: tampered })));
  assert.equal(rejected.error, "diagnostic_cursor_invalid");
  assert.equal(rejected.pending_status, "unknown");
  assert.equal("pending_count" in rejected, false);
  assert.equal(f.calls.list, reads);
  assert.equal(f.calls.writes, 0);
});

test("expired/future cursor and key rotation fail closed before storage", async () => {
  const f = fixture();
  const first = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ limit: 1 })));
  const reads = f.calls.list;
  const clock = Date.now;
  for (const delta of [301000, -60000]) {
    let result;
    try {
      Date.now = () => clock() + delta;
      result = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ cursor: first.next_cursor })));
    } finally { Date.now = clock; }
    assert.equal(result.error, "diagnostic_cursor_invalid");
    assert.equal(result.pending_status, "unknown");
  }
  f.env.ADMIN_SESSION_SECRET = "different-local-test-key";
  const rotated = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ cursor: first.next_cursor })));
  assert.equal(rotated.error, "diagnostic_cursor_invalid");
  assert.equal(f.calls.list, reads);
});

test("cursor is bound to the object and detects a missing boundary without rescanning", async () => {
  const f = fixture();
  const first = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ limit: 1 })));
  const reads = f.calls.list;
  const foreignId = "d".repeat(64);
  f.state.id = { toString: () => foreignId };
  f.namespace.idFromName = () => ({ toString: () => foreignId });
  const foreign = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ expected_object_id: foreignId, cursor: first.next_cursor })));
  assert.equal(foreign.error, "diagnostic_cursor_invalid");
  f.state.id = { toString: () => ID };
  f.namespace.idFromName = () => ({ toString: () => ID });
  f.data.delete([...f.data.keys()][0]); // Synthetic deletion only, simulating an expired cursor boundary.
  const stale = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ cursor: first.next_cursor })));
  assert.equal(stale.error, "diagnostic_cursor_stale");
  assert.equal(f.calls.list, reads);
  assert.equal(f.calls.writes, 0);
});

test("absent existing cursor secret stops before storage; existing fallback is supported", async () => {
  const f = fixture();
  delete f.env.ADMIN_SESSION_SECRET;
  const missing = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command()));
  assert.equal(missing.error, "diagnostic_cursor_key_unavailable");
  assert.equal(f.calls.list, 0);
  f.env.SESSION_SECRET = "local-test-existing-fallback";
  const fallback = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ limit: 1 })));
  assert.equal(fallback.ok, true);
  const continued = await body(await readLineBriefPendingDiagnostic(f.state, f.env, command({ cursor: fallback.next_cursor })));
  assert.equal(continued.ok, true);
  assert.equal(f.calls.writes, 0);
});

for (const count of [999, 1000, 1001, 2101]) test(`pagination delivers all ${count} records with bounded reads and no writes`, async () => {
  const f = fixture(count);
  const before = structuredClone(f.data);
  const seen = new Set();
  let cursor = "", examined = 0, pages = 0;
  do {
    const lists = f.calls.list;
    const result = await request(f, pending({ cursor, limit: 100 }), {}, dependencies(f));
    assert.equal(result.ok, true);
    assert.equal(f.calls.list - lists, 1, "each page must seek instead of rescanning");
    examined += result.examined;
    for (const item of result.items) { assert.equal(seen.has(item.response_id), false); seen.add(item.response_id); }
    cursor = result.next_cursor;
    pages++;
  } while (cursor && pages < 30);
  assert.equal(cursor, null);
  assert.equal(examined, count);
  assert.equal(seen.size, count - 1);
  assert.equal(f.calls.writes, 0);
  assert.deepEqual(f.data, before);
});
