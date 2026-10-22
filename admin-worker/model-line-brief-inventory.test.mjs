import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLineBriefInventoryTransport, createLineBriefInventoryProvider } from "./src/model-line-brief-inventory.js";
import { handleLineBriefDiagnostic } from "./src/model-line-job-briefs-diagnostic.js";

const BASE = Object.freeze({ account_id: "a".repeat(32), namespace_id: "b".repeat(32), worker_name: "admin-worker",
  binding_name: "MODEL_ACTIVATION_COORDINATOR", class_name: "ModelActivationCoordinator", store_name: "line-job-briefs-v1" });
const ID = "c".repeat(64);
const expected = () => ({ ...BASE, object_id: ID });
const bindings = () => [
  { name: BASE.binding_name, type: "durable_object_namespace", namespace_id: BASE.namespace_id, class_name: BASE.class_name },
  { name: "PRIVATE_BINDING", type: "plain_text", text: "PRIVATE_VALUE" },
];
const namespaces = () => [{ id: BASE.namespace_id, class: BASE.class_name, script: BASE.worker_name, use_sqlite: true }];
function fixture(alter = (data) => data) {
  const calls = [];
  let settingsReads = 0;
  const request = async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://api.cloudflare.com");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.authorization, "Bearer mock-credential-only");
    assert.equal("body" in options, false);
    assert.ok(options.signal instanceof AbortSignal);
    const resource = url.pathname.endsWith("/settings") ? "settings" : url.pathname.endsWith("/objects") ? "objects" : "namespaces";
    calls.push({ resource, path: url.pathname, page: url.searchParams.get("page"), cursor: url.searchParams.get("cursor"), method: options.method });
    let result, result_info;
    if (resource === "settings") { settingsReads++; result = { bindings: bindings() }; }
    if (resource === "namespaces") {
      result = namespaces();
      result_info = { count: 1, page: 1, per_page: 100, total_count: 1, total_pages: 1 };
    }
    if (resource === "objects") { result = [{ id: ID, hasStoredData: true }]; result_info = { count: 1, cursor: null }; }
    const data = alter({ success: true, result, ...(result_info ? { result_info } : {}) }, { resource, url, settingsReads, options });
    return Response.json(data, { headers: { "cf-ray": `mock_ray_${calls.length}` } });
  };
  const get = createLineBriefInventoryTransport({ baseline: BASE, token: "mock-credential-only", request });
  const verify = createLineBriefInventoryProvider({ baseline: BASE, get });
  return { calls, request, get, verify };
}

test("positive proof connects settings, namespace and existing ID, rechecks binding, and exposes sanitized metadata only", async () => {
  const f = fixture();
  const result = await f.verify(expected());
  assert.equal(result.ok, true);
  assert.equal(result.object_id, ID);
  assert.equal(result.inventory_complete, true);
  assert.deepEqual(f.calls.map((x) => x.resource), ["settings", "namespaces", "objects", "settings"]);
  assert.equal(result.receipts.length, 4);
  assert.equal(result.evidence_id, result.receipts.at(-1).correlation_id);
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  const projected = await f.get("settings");
  assert.equal(projected.result.bindings.length, 1);
  assert.equal(JSON.stringify(projected).includes("PRIVATE"), false);
});

test("factories require explicit dependencies and do not default to global fetch or env credentials", () => {
  assert.throws(() => createLineBriefInventoryTransport({ baseline: BASE, token: "mock" }));
  assert.throws(() => createLineBriefInventoryTransport({ baseline: BASE, request() {} }));
  assert.throws(() => createLineBriefInventoryTransport({ baseline: BASE, token: "line\nbreak", request() {} }));
  assert.throws(() => createLineBriefInventoryProvider({ baseline: BASE }));
  assert.throws(() => createLineBriefInventoryProvider({ baseline: { ...BASE, worker_name: "other" }, get() {} }));
});

test("GET-only transport rejects arbitrary resource, method, body, host, path, cursor and page before network", async () => {
  const f = fixture();
  for (const [resource, options] of [
    ["https://example.com", {}], ["/scripts/admin-worker/content", {}], ["settings", { method: "POST" }],
    ["objects", { body: {} }], ["objects", { namespace_id: "f".repeat(32) }],
    ["objects", { cursor: "../other?token=PRIVATE" }], ["namespaces", { page: 0 }],
    ["namespaces", { page: 21 }], ["namespaces", { page: "1" }],
  ]) await assert.rejects(f.get(resource, options));
  assert.equal(f.calls.length, 0);
});

for (const status of [301, 302, 401, 403, 429, 500]) test(`HTTP ${status} fails once, no retry or raw error exposure`, async () => {
  let calls = 0;
  const get = createLineBriefInventoryTransport({ baseline: BASE, token: "mock-only", request: async () => {
    calls++; return new Response("PRIVATE_REMOTE_ERROR", { status, headers: { location: "https://example.com" } });
  } });
  await assert.rejects(get("settings"), (error) => error.message === "inventory_transport_failed");
  assert.equal(calls, 1);
});

test("timeout aborts the injected request without retry", async () => {
  let calls = 0, aborted = false;
  const get = createLineBriefInventoryTransport({ baseline: BASE, token: "mock-only", timeoutMs: 5,
    request: async (_, { signal }) => { calls++; return new Promise((_, reject) => signal.addEventListener("abort", () => {
      aborted = true; reject(new Error("PRIVATE_ABORT_DETAIL"));
    }, { once: true })); } });
  await assert.rejects(get("settings"), { message: "inventory_transport_failed" });
  assert.equal(calls, 1); assert.equal(aborted, true);
});

test("invalid JSON, missing correlation, API failure and oversized response fail closed", async () => {
  for (const response of [
    new Response("PRIVATE_MALFORMED", { headers: { "cf-ray": "mock_ray" } }),
    Response.json({ success: true, result: { bindings: bindings() } }),
    Response.json({ success: false, errors: [{ message: "PRIVATE" }] }, { headers: { "cf-ray": "mock_ray" } }),
    new Response("x".repeat(1024 * 1024 + 1), { headers: { "cf-ray": "mock_ray" } }),
  ]) {
    const get = createLineBriefInventoryTransport({ baseline: BASE, token: "mock-only", request: async () => response });
    await assert.rejects(get("settings"), { message: "inventory_transport_failed" });
  }
});

test("transport rejects an already-followed redirect or unexpected final URL", async () => {
  for (const property of ["redirected", "url"]) {
    const response = Response.json({ success: true, result: { bindings: bindings() } }, { headers: { "cf-ray": "mock_ray" } });
    Object.defineProperty(response, property, { value: property === "redirected" ? true : "https://example.com/other" });
    const get = createLineBriefInventoryTransport({ baseline: BASE, token: "mock-only", request: async () => response });
    await assert.rejects(get("settings"), { message: "inventory_transport_failed" });
  }
});

for (const field of ["account_id", "namespace_id", "worker_name", "binding_name", "class_name", "store_name"]) test(`wrong ${field} is rejected before reads`, async () => {
  const f = fixture();
  const result = await f.verify({ ...expected(), [field]: "wrong" });
  assert.equal(result.ok, false); assert.equal(result.pending_status, "unknown");
  assert.equal(f.calls.length, 0);
});

for (const scenario of ["missing_binding", "duplicate_binding", "foreign_namespace", "wrong_class", "wrong_script", "drift_after_scan"]) {
  test(`${scenario} never returns verified proof`, async () => {
    const f = fixture((data, { resource, settingsReads }) => {
      if (resource !== "settings") return data;
      if (scenario === "missing_binding") data.result.bindings = [];
      if (scenario === "duplicate_binding") data.result.bindings.push({ ...data.result.bindings[0] });
      if (scenario === "foreign_namespace" || (scenario === "drift_after_scan" && settingsReads === 2)) data.result.bindings[0].namespace_id = "f".repeat(32);
      if (scenario === "wrong_class") data.result.bindings[0].class_name = "Other";
      if (scenario === "wrong_script") data.result.bindings[0].script_name = "other-worker";
      return data;
    });
    assert.equal((await f.verify(expected())).ok, false);
  });
}

test("namespace/class/script/storage backend mismatch, missing and duplicate namespace fail", async () => {
  for (const alter of [
    (d) => { d.result[0].class = "Other"; }, (d) => { d.result[0].script = "other"; },
    (d) => { d.result[0].use_sqlite = false; }, (d) => { d.result[0].id = "f".repeat(32); },
    (d) => { d.result.push({ ...d.result[0] }); d.result_info.count = 2; d.result_info.total_count = 2; },
  ]) {
    const f = fixture((d, { resource }) => { if (resource === "namespaces") alter(d); return d; });
    assert.equal((await f.verify(expected())).ok, false);
    assert.equal(f.calls.some((x) => x.resource === "objects"), false);
  }
});

test("both namespace and object pagination complete before success", async () => {
  const f = fixture((d, { resource, url }) => {
    if (resource === "namespaces") {
      const page = Number(url.searchParams.get("page"));
      d.result = page === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: i.toString(16).padStart(32, "0") })) : namespaces();
      d.result_info = { page, per_page: 100, total_count: 101, total_pages: 2, count: d.result.length };
    }
    if (resource === "objects" && !url.searchParams.has("cursor")) {
      d.result = Array.from({ length: 100 }, (_, i) => ({ id: i.toString(16).padStart(64, "0"), hasStoredData: false }));
      d.result_info = { count: 100, cursor: "mock_next_page" };
    }
    return d;
  });
  assert.equal((await f.verify(expected())).ok, true);
  assert.equal(f.calls.filter((x) => x.resource === "objects").length, 2);
  assert.equal(f.calls.filter((x) => x.resource === "namespaces").length, 2);
});

for (const scenario of ["missing_cursor", "repeated_cursor", "missing_id", "duplicate_id", "count_mismatch", "second_page_error", "page_cap"]) {
  test(`object pagination ${scenario} returns unknown even after target is seen`, async () => {
    const f = fixture((d, { resource, url }) => {
      if (resource !== "objects") return d;
      if (scenario === "missing_cursor") delete d.result_info.cursor;
      if (scenario === "missing_id") d.result[0].id = "f".repeat(64);
      if (scenario === "duplicate_id") { d.result.push({ ...d.result[0] }); d.result_info.count = 2; }
      if (scenario === "count_mismatch") d.result_info.count = 100;
      if (scenario === "repeated_cursor") {
        d.result = url.searchParams.has("cursor") ? [] : d.result;
        d.result_info = { count: d.result.length, cursor: "repeat" };
      }
      if (scenario === "second_page_error") {
        if (url.searchParams.has("cursor")) throw new Error("PRIVATE_PAGE_ERROR");
        d.result_info.cursor = "second";
      }
      if (scenario === "page_cap") {
        const index = Number(url.searchParams.get("cursor") || "0");
        d.result = [{ id: index === 0 ? ID : index.toString(16).padStart(64, "0"), hasStoredData: true }];
        d.result_info = { count: 1, cursor: String(index + 1) };
      }
      return d;
    });
    const proof = await f.verify(expected());
    assert.deepEqual(proof, { ok: false, error: "inventory_verification_unavailable", pending_status: "unknown" });
    assert.ok(f.calls.filter((x) => x.resource === "objects").length <= 20);
  });
}

test("namespace pagination metadata missing or inconsistent fails closed", async () => {
  for (const change of [(d) => { delete d.result_info; }, (d) => { d.result_info.total_count = 2; },
    (d) => { d.result_info.total_pages = 21; }, (d) => { d.result_info.page = 2; },
    (d) => { d.result_info.total_pages = 2; }]) {
    const f = fixture((d, { resource }) => { if (resource === "namespaces") change(d); return d; });
    assert.equal((await f.verify(expected())).ok, false);
  }
});

test("provider captures its target before I/O and cannot be redirected by later mutation", async () => {
  const input = expected();
  const f = fixture((data, { resource }) => {
    if (resource === "settings") { input.object_id = "f".repeat(64); input.account_id = "f".repeat(32); }
    return data;
  });
  const proof = await f.verify(input);
  assert.equal(proof.ok, true);
  assert.equal(proof.object_id, ID);
  assert.equal(proof.account_id, BASE.account_id);
});

test("cached, future, uncorrelated receipts and expired verification return unknown", async () => {
  const f = fixture();
  for (const change of [
    (r) => ({ ...r, observed_at: new Date(Date.now() - 1000).toISOString() }),
    (r) => ({ ...r, observed_at: new Date(Date.now() + 1000).toISOString() }),
    (r) => ({ ...r, correlation_id: "" }),
  ]) {
    const verify = createLineBriefInventoryProvider({ baseline: BASE, get: async (...args) => change(await f.get(...args)) });
    assert.equal((await verify(expected())).pending_status, "unknown");
  }
  const clock = Date.now;
  const verify = createLineBriefInventoryProvider({ baseline: BASE, get: async (...args) => {
    const value = await f.get(...args);
    Date.now = () => clock() + 61000;
    return value;
  } });
  try { assert.equal((await verify(expected())).ok, false); }
  finally { Date.now = clock; }
});

test("provider proofs can drive the adapter only in mock; failed inventory never obtains a stub", async () => {
  const success = fixture(), missing = fixture((d, { resource }) => { if (resource === "objects") { d.result = []; d.result_info.count = 0; } return d; });
  let gets = 0;
  const env = { MODEL_ACTIVATION_COORDINATOR: {
    idFromName: () => ({ toString: () => ID }), idFromString: () => ({ toString: () => ID }),
    get: () => { gets++; return { fetch: async () => Response.json({ ok: true, read_only: true }) }; },
  } };
  const input = { action: "diagnostic_pending", existing_object_id: ID };
  const denied = await handleLineBriefDiagnostic(input, env, { inventoryBaseline: BASE, verifyExistingObject: missing.verify });
  assert.equal(denied.status, 503); assert.equal(gets, 0);
  const accepted = await handleLineBriefDiagnostic(input, env, { inventoryBaseline: BASE, verifyExistingObject: success.verify });
  assert.equal(accepted.status, 200); assert.equal(gets, 1);
});

test("runtime entrypoint remains disconnected from provider and credential plumbing", () => {
  const source = readFileSync(new URL("./src/admin-login-hero-worker.js", import.meta.url), "utf8");
  assert.ok(source.includes("handleLineJobBriefRequest(request, runtimeEnv);"));
  assert.doesNotMatch(source, /model-line-brief-inventory|createLineBriefInventoryProvider|createLineBriefInventoryTransport/);
});
