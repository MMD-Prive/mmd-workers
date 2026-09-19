import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import worker from "../src/index.js";
import { runMemberResolverDiagnostic } from "../src/member-resolver-diagnostic.js";

const SECRET = "test-only-member-status-resolver-secret-1234567890";

function runtime(fetch) {
  return {
    MEMBER_STATUS_RESOLVER: { fetch },
    MEMBER_STATUS_RESOLVER_SECRET: SECRET,
  };
}

test("named diagnostic RPC makes one bounded authenticated POST with no caller identity or body", async () => {
  const calls = [];
  const result = await runMemberResolverDiagnostic(runtime(async (request) => {
    calls.push(request);
    return Response.json({ ok: true, result: "healthy_zero_match" });
  }));

  assert.equal(result, "healthy_zero_match");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(new URL(calls[0].url).pathname, "/__internal/member-status/diagnostic");
  assert.equal(calls[0].headers.get("x-mmd-member-resolver-secret"), SECRET);
  assert.equal(await calls[0].text(), "");
  assert.doesNotMatch(result, /test-only|line|airtable|sentinel|secret/i);
});

test("named diagnostic RPC rejects every caller argument before any downstream call", async () => {
  let calls = 0;
  const environment = runtime(async () => {
    calls += 1;
    return Response.json({ ok: true, result: "healthy_zero_match" });
  });

  for (const argumentCount of [1, 2, 10]) {
    assert.equal(await runMemberResolverDiagnostic(environment, argumentCount), "generic_failure");
  }
  assert.equal(calls, 0);
});

test("named diagnostic RPC bounds downstream failures and malformed output", async () => {
  const cases = [
    async () => Response.json({ ok: false, result: "generic_failure" }, { status: 503 }),
    async () => Response.json({ ok: true, result: "unexpected" }),
    async () => Response.json({ secret: SECRET, result: "healthy_zero_match" }, { status: 503 }),
    async () => new Response("not-json", { status: 200 }),
    async () => { throw new Error(`private ${SECRET}`); },
  ];

  for (const downstream of cases) {
    const result = await runMemberResolverDiagnostic(runtime(downstream));
    assert.equal(result, "generic_failure");
    assert.doesNotMatch(result, /test-only|line|airtable|sentinel|secret/i);
  }

  assert.equal(await runMemberResolverDiagnostic({}, 0), "generic_failure");
});

test("diagnostic RPC performs no write request", async () => {
  let writes = 0;
  const result = await runMemberResolverDiagnostic(runtime(async (request) => {
    if (request.method !== "GET" && request.method !== "POST") writes += 1;
    if (request.body !== null) writes += 1;
    return Response.json({ ok: true, result: "healthy_zero_match" });
  }));

  assert.equal(result, "healthy_zero_match");
  assert.equal(writes, 0);
});

test("default fetch exposes no public resolver diagnostic route", async () => {
  for (const path of [
    "/member/api/liff/diagnostic",
    "/member/api/liff/member-status/diagnostic",
    "/__internal/member-status/diagnostic",
  ]) {
    const response = await worker.fetch(new Request(`https://member-pages-worker.internal${path}`, { method: "POST" }), {});
    assert.ok([404, 405].includes(response.status), `${path}: ${response.status}`);
    assert.doesNotMatch(await response.text(), /healthy_zero_match/);
  }
});

test("runtime exports one named WorkerEntrypoint and leaves default worker unchanged", async () => {
  const [runtimeSource, entrypointSource] = await Promise.all([
    readFile(new URL("../src/runtime-index.js", import.meta.url), "utf8"),
    readFile(new URL("../src/resolver-diagnostic-entrypoint.js", import.meta.url), "utf8"),
  ]);

  assert.match(runtimeSource, /export \{ MemberResolverDiagnosticEntrypoint \}/);
  assert.match(runtimeSource, /export default worker/);
  assert.match(entrypointSource, /extends WorkerEntrypoint/);
  assert.match(entrypointSource, /async runMemberResolverDiagnostic\(\)/);
  assert.doesNotMatch(entrypointSource, /\bfetch\s*\(/);
});
