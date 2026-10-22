import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLineBriefDiagnosticRuntimeFactory, LINE_BRIEF_INVENTORY_RUNTIME_ENABLED,
  lineBriefDiagnosticRuntimeDependencies } from "./src/model-line-brief-diagnostic-runtime.js";
import { handleLineJobBriefRequest, handleLineJobBriefDurableRequest } from "./src/model-line-job-briefs.js";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";

const BASE = Object.freeze({ account_id: "a".repeat(32), namespace_id: "b".repeat(32), worker_name: "admin-worker",
  binding_name: "MODEL_ACTIVATION_COORDINATOR", class_name: "ModelActivationCoordinator", store_name: "line-job-briefs-v1" });
const ID = "c".repeat(64), ORIGIN = "https://mmdbkk.com";
const pending = { action: "diagnostic_pending", existing_object_id: ID };
const unknown = { ok: false, error: "inventory_verification_unavailable", pending_status: "unknown" };

function fixture({ missingObject = false, enabled = true, baseline = BASE, readCredential, credentialTimeoutMs } = {}) {
  const calls = { factory: 0, credential: 0, network: 0, stub: 0, list: 0, writes: 0 };
  const state = { id: { toString: () => ID }, storage: {
    async list() { calls.list++; return new Map(); },
    async put() { calls.writes++; throw new Error("Mock write prohibited"); },
  } };
  const env = { ADMIN_SESSION_SECRET: "mock-session-only", ADMIN_LOGIN_CREDENTIAL: "mock-login-only",
    MODEL_ACTIVATION_COORDINATOR: {
      idFromName: () => ({ toString: () => ID }), idFromString: () => ({ toString: () => ID }),
      get() { calls.stub++; return { fetch: (url, init) => handleLineJobBriefDurableRequest(state, env, new Request(url, init)) }; },
    } };
  const request = async (input, options) => {
    calls.network++;
    const url = new URL(input);
    assert.equal(url.origin, "https://api.cloudflare.com");
    assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    assert.equal(options.headers.authorization, "Bearer mock-inventory-only");
    assert.equal("body" in options, false);
    let result, result_info;
    if (url.pathname.endsWith("/settings")) result = { bindings: [{ name: BASE.binding_name,
      type: "durable_object_namespace", namespace_id: BASE.namespace_id, class_name: BASE.class_name }] };
    else if (url.pathname.endsWith("/namespaces")) {
      result = [{ id: BASE.namespace_id, class: BASE.class_name, script: BASE.worker_name, use_sqlite: true }];
      result_info = { count: 1, page: 1, per_page: 100, total_count: 1, total_pages: 1 };
    } else {
      assert.ok(url.pathname.endsWith(`/${BASE.namespace_id}/objects`));
      result = missingObject ? [] : [{ id: ID, hasStoredData: true }];
      result_info = { count: result.length, cursor: null };
    }
    return Response.json({ success: true, result, result_info }, { headers: { "cf-ray": `mock_${calls.network}` } });
  };
  const factory = createLineBriefDiagnosticRuntimeFactory({ enabled, baseline, request, credentialTimeoutMs,
    readCredential: async (context) => { calls.credential++; return readCredential ? readCredential(context) : "mock-inventory-only"; } });
  const lazy = () => { calls.factory++; return factory(); };
  return { calls, env, lazy, factory };
}

async function run(f, input = pending, { auth = true, role = "owner", origin = ORIGIN,
  path = "/v1/admin/model/line-briefs", method = "POST", expired = false, dependencies = f.lazy } = {}) {
  let token = "";
  const clock = Date.now;
  try {
    if (expired) Date.now = () => clock() - 86400000;
    if (auth) token = await createCredentialBoundAdminSession(new Request(`${ORIGIN}/internal/admin/login`), { id: "mock-owner", role }, f.env);
  } finally { Date.now = clock; }
  const response = await handleLineJobBriefRequest(new Request(`${ORIGIN}${path}`, {
    method, headers: { origin, "content-type": "application/json", cookie: `mmd_admin_gate_v1=${token}` },
    ...(method === "POST" ? { body: JSON.stringify(input) } : {}),
  }), f.env, dependencies);
  return { status: response.status, ...(await response.json()) };
}

test("shipped gate is false and cannot be enabled by arguments or env", async () => {
  assert.equal(LINE_BRIEF_INVENTORY_RUNTIME_ENABLED, false);
  assert.deepEqual(lineBriefDiagnosticRuntimeDependencies({ enabled: true, token: "mock" }), {});
  const f = fixture();
  f.env.LINE_BRIEF_INVENTORY_RUNTIME_ENABLED = true;
  f.env.CLOUDFLARE_API_TOKEN = "mock-must-not-be-read";
  const result = await run(f, pending, { dependencies: lineBriefDiagnosticRuntimeDependencies });
  assert.equal(result.error, "existing_inventory_verifier_unavailable");
  assert.equal(result.pending_status, "unknown");
  assert.equal(f.calls.credential + f.calls.network + f.calls.stub + f.calls.writes, 0);
});

test("disabled glue does not inspect baseline or credential dependencies", () => {
  const options = { enabled: false };
  for (const key of ["baseline", "readCredential", "request"]) Object.defineProperty(options, key, { get() { throw new Error("Must not inspect"); } });
  assert.deepEqual(createLineBriefDiagnosticRuntimeFactory(options)(), {});
  assert.deepEqual(createLineBriefDiagnosticRuntimeFactory()(), {});
});

test("constructing enabled mock glue and resolving dependencies perform no I/O", () => {
  const f = fixture();
  assert.equal(typeof f.factory().verifyExistingObject, "function");
  assert.deepEqual(f.calls, { factory: 0, credential: 0, network: 0, stub: 0, list: 0, writes: 0 });
});

for (const [label, options, status] of [
  ["missing session", { auth: false }, 401], ["expired session", { expired: true }, 401],
  ["wrong role", { role: "model" }, 403], ["cross origin", { origin: "https://example.com" }, 403],
  ["wrong method", { method: "GET" }, 405], ["model route", { path: "/v1/model/line-briefs" }, 400],
]) test(`${label} cannot initialize runtime dependencies or perform inventory reads`, async () => {
  const f = fixture();
  assert.equal((await run(f, pending, options)).status, status);
  assert.deepEqual(f.calls, { factory: 0, credential: 0, network: 0, stub: 0, list: 0, writes: 0 });
});

test("resolve does not initialize inventory and ordinary detail keeps its original path", async () => {
  const f = fixture();
  const resolved = await run(f, { action: "diagnostic_resolve" });
  assert.equal(resolved.status, 200); assert.equal(resolved.existence_verified, false);
  assert.equal(f.calls.factory, 0); assert.equal(f.calls.stub, 0);
  await run(f, { action: "detail", brief_id: "brf_0000000000" });
  assert.equal(f.calls.factory + f.calls.credential + f.calls.network, 0);
  assert.equal(f.calls.stub, 1);
});

test("authenticated mock glue verifies inventory then uses the existing read-only reader", async () => {
  const f = fixture();
  const result = await run(f);
  assert.equal(result.status, 200); assert.equal(result.read_only, true);
  assert.deepEqual(result.items, []); assert.equal(result.count_scope, "page");
  assert.deepEqual(f.calls, { factory: 1, credential: 1, network: 4, stub: 1, list: 1, writes: 0 });
  assert.equal(JSON.stringify(result).includes("mock-inventory-only"), false);
});

test("missing object fails closed without stub access", async () => {
  const f = fixture({ missingObject: true });
  const result = await run(f);
  assert.equal(result.status, 503); assert.equal(result.pending_status, "unknown");
  assert.equal(f.calls.stub + f.calls.list + f.calls.writes, 0);
});

test("invalid baseline fails before reading credential or network", async () => {
  const f = fixture({ baseline: { ...BASE, namespace_id: "invalid" } });
  const result = await run(f);
  assert.equal(result.status, 503); assert.equal(result.pending_status, "unknown");
  assert.equal(f.calls.credential + f.calls.network + f.calls.stub, 0);
});

for (const [label, readCredential] of [["missing", () => ""], ["throws", () => { throw new Error("MOCK_PRIVATE_DETAIL"); }]]) {
  test(`${label} credential stays sanitized and cannot fall back to global fetch`, async () => {
    const f = fixture({ readCredential });
    const result = await run(f);
    assert.equal(result.status, 503); assert.equal(result.pending_status, "unknown");
    assert.equal(f.calls.network + f.calls.stub + f.calls.writes, 0);
    assert.equal(JSON.stringify(result).includes("MOCK_PRIVATE_DETAIL"), false);
  });
}

test("enabled glue without explicit credential/request adapters is inert", () => {
  assert.deepEqual(createLineBriefDiagnosticRuntimeFactory({ enabled: true, baseline: BASE })(), {});
});

test("unresolved credential times out, aborts and returns unknown without network or stub access", async () => {
  let signal;
  const f = fixture({ credentialTimeoutMs: 5, readCredential: (context) => {
    signal = context.signal;
    return new Promise(() => {}); // Deliberately ignores cancellation.
  } });
  const result = await run(f);
  assert.equal(result.status, 503); assert.equal(result.pending_status, "unknown");
  assert.equal(signal.aborted, true);
  assert.equal(f.calls.credential, 1);
  assert.equal(f.calls.network + f.calls.stub + f.calls.writes, 0);
});

for (const completion of ["resolve", "reject"]) test(`late credential ${completion} after timeout cannot initiate GET or escape as an unhandled rejection`, async () => {
  let complete, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const f = fixture({ credentialTimeoutMs: 5, readCredential: () => new Promise((resolve, reject) => {
    complete = completion === "resolve" ? () => resolve("mock-inventory-only") : () => reject(new Error("MOCK_PRIVATE_LATE_ERROR"));
    started();
  }) });
  const response = run(f);
  await ready;
  const result = await response;
  assert.equal(result.status, 503); assert.equal(result.pending_status, "unknown");
  complete();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls.credential, 1);
  assert.equal(f.calls.network + f.calls.stub + f.calls.writes, 0);
  assert.equal(JSON.stringify(result).includes("MOCK_PRIVATE"), false);
});

for (const elapsed of [61001, -1000]) test(`credential completion after clock change ${elapsed}ms cannot create a transport or GET`, async () => {
  const clock = Date.now;
  const f = fixture({ readCredential: () => {
    Date.now = () => clock() + elapsed;
    return "mock-inventory-only";
  } });
  try {
    const result = await run(f);
    assert.equal(result.status, 503); assert.equal(result.pending_status, "unknown");
    assert.equal(f.calls.credential, 1);
    assert.equal(f.calls.network + f.calls.stub + f.calls.writes, 0);
  } finally { Date.now = clock; }
});

test("successful credential clears its timer without later aborting the callback signal", async () => {
  let signal;
  const f = fixture({ credentialTimeoutMs: 5, readCredential: (context) => {
    signal = context.signal;
    return "mock-inventory-only";
  } });
  assert.equal((await run(f)).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(signal.aborted, false);
  assert.equal(f.calls.credential, 1); assert.equal(f.calls.network, 4); assert.equal(f.calls.writes, 0);
});

test("invalid credential timeout configuration fails closed without reading dependencies", () => {
  for (const credentialTimeoutMs of [0, -1, 10001, 1.5, "5", NaN, Infinity]) {
    const f = fixture({ credentialTimeoutMs });
    assert.deepEqual(f.factory(), {});
    assert.equal(f.calls.credential + f.calls.network + f.calls.stub, 0);
  }
});

test("dependency factory failures are sanitized", async () => {
  const f = fixture();
  const result = await run(f, pending, { dependencies: () => { throw new Error("MOCK_PRIVATE_DETAIL"); } });
  assert.equal(result.error, "diagnostic_read_unavailable"); assert.equal(result.status, 503);
  assert.equal(f.calls.credential + f.calls.network + f.calls.stub, 0);
});

test("request-supplied proof, enablement and baseline cannot bypass the gate", async () => {
  for (const field of ["enabled", "token", "inventoryBaseline", "verifyExistingObject"]) {
    const f = fixture();
    const result = await run(f, { ...pending, [field]: true });
    assert.equal(result.error, "unsupported_field");
    assert.equal(f.calls.credential + f.calls.network + f.calls.stub, 0);
  }
});

test("glue snapshots baseline and never shares credential/transport state across verifications", async () => {
  const baseline = { ...BASE }, f = fixture({ baseline });
  baseline.namespace_id = "f".repeat(32);
  for (let i = 0; i < 2; i++) assert.equal((await run(f)).status, 200);
  assert.equal(f.calls.credential, 2); assert.equal(f.calls.network, 8); assert.equal(f.calls.writes, 0);
});

test("invalid expected context cannot initialize transport", async () => {
  const f = fixture();
  const result = await f.factory().verifyExistingObject({ ...BASE, object_id: ID, worker_name: "other" });
  assert.deepEqual(result, unknown); assert.equal(f.calls.credential + f.calls.network, 0);
});

test("entrypoint passes the factory without invoking it or adding env credential plumbing", () => {
  const source = readFileSync(new URL("./src/admin-login-hero-worker.js", import.meta.url), "utf8");
  assert.ok(source.includes("handleLineJobBriefRequest(request, runtimeEnv, lineBriefDiagnosticRuntimeDependencies);"));
  assert.doesNotMatch(source, /lineBriefDiagnosticRuntimeDependencies\(.*env|createLineBriefInventoryTransport|createLineBriefInventoryProvider/);
  const glue = readFileSync(new URL("./src/model-line-brief-diagnostic-runtime.js", import.meta.url), "utf8");
  assert.doesNotMatch(glue, /process\.env|globalThis\.fetch|env\.|\bfetch\(/);
});
