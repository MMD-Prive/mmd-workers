import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { checkAdminAllJobsGate, waitForAdminAllJobsGate } from "./check-admin-all-jobs-gate.mjs";

function gatedResponse(url, method) {
  const incoming = new URL(url);
  const origin = incoming.origin;
  const target = new URL("/internal/admin/login", origin);
  target.searchParams.set("next", `/internal/admin/jobs/all${incoming.search}`);
  return new Response(null, {
    status: method === "GET" ? 303 : 401,
    headers: {
      "x-mmd-admin-gate-version": "credential-bound-v1",
      "x-mmd-admin-gate": "credential-required",
      location: target.toString(),
    },
  });
}

test("live gate check covers both hosts and exact/slash GET/HEAD without credentials or following redirects", async () => {
  const calls = [];
  const results = await checkAdminAllJobsGate(async (url, options) => {
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers, undefined);
    calls.push(`${options.method} ${url}`);
    return gatedResponse(url, options.method);
  });
  assert.equal(results.length, 16);
  assert.equal(new Set(calls).size, 16);
  for (const host of ["mmdbkk.com", "www.mmdbkk.com"]) {
    for (const suffix of ["", "/"]) {
      for (const search of ["", "?page=2"]) {
        for (const method of ["GET", "HEAD"]) {
          assert.ok(calls.includes(`${method} https://${host}/internal/admin/jobs/all${suffix}${search}`));
        }
      }
    }
  }
});

for (const status of [200, 301, 403]) {
  test(`live gate check rejects upstream/infra response ${status}`, async () => {
    await assert.rejects(checkAdminAllJobsGate(async () => new Response(null, { status })), /All Jobs gate failed/);
  });
}

test("live gate check rejects matching status without canonical gate headers", async () => {
  await assert.rejects(checkAdminAllJobsGate(async () => new Response(null, { status: 303 })), /gate=null/);
});

test("live gate check rejects HEAD 200 after successful GET", async () => {
  await assert.rejects(checkAdminAllJobsGate(async (url, { method }) => method === "HEAD"
    ? new Response(null, { status: 200 }) : gatedResponse(url, method)), /HEAD .*status=200/);
});

test("live gate check rejects wrong login destinations", async () => {
  for (const location of ["https://example.com/internal/admin/login", "/internal/admin/dashboard"]) {
    await assert.rejects(checkAdminAllJobsGate(async (url, { method }) => {
      const response = gatedResponse(url, method);
      response.headers.set("location", location);
      return response;
    }), /All Jobs login redirect failed/);
  }
});

test("deployment actually applies All Jobs and public asset routes and runs live gate verification", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-admin-worker.yml", import.meta.url), "utf8");
  const sync = workflow.split("- name: Sync exact admin-worker routes")[1].split("- name: Verify production dashboard route")[0];
  for (const path of ["/internal/admin/jobs/all", "/internal/admin/jobs/all*", "/internal/admin/work/assets/*"]) {
    assert.ok(sync.includes(`"${path}"`), path);
  }
  const smoke = workflow.split("- name: Verify production dashboard route")[1].split("- name: Report deploy stage diagnosis")[0];
  assert.match(smoke, /node \.\.\/scripts\/check-admin-all-jobs-gate\.mjs/);
  const wrangler = await readFile(new URL("../admin-worker/wrangler.toml", import.meta.url), "utf8");
  for (const host of ["mmdbkk.com", "www.mmdbkk.com"]) {
    for (const suffix of ["", "*"]) assert.ok(wrangler.includes(`pattern = "${host}/internal/admin/jobs/all${suffix}"`));
    assert.ok(wrangler.includes(`pattern = "${host}/internal/admin/work*"`));
  }
});

test("retry reruns all 16 probes after a transient HEAD route miss", async () => {
  const waits = [];
  const failures = [];
  let calls = 0;
  const result = await waitForAdminAllJobsGate({
    fetchImpl: async (url, { method }) => {
      calls += 1;
      if (calls === 2) return new Response(null, { status: 301 });
      return gatedResponse(url, method);
    },
    pause: async (ms) => waits.push(ms),
    onRetry: (failure) => failures.push(failure),
  });
  assert.equal(result.attempt, 2);
  assert.equal(result.probes.length, 16);
  assert.equal(calls, 18);
  assert.deepEqual(waits, [10000]);
  assert.match(failures[0].message, /HEAD .*status=301 gate=null/);
});

test("persistent route failure remains fatal after six attempts with no final wait", async () => {
  let calls = 0;
  const waits = [];
  await assert.rejects(waitForAdminAllJobsGate({
    fetchImpl: async () => { calls += 1; return new Response(null, { status: 200 }); },
    pause: async (ms) => waits.push(ms),
  }), /All Jobs gate failed.*status=200/);
  assert.equal(calls, 6);
  assert.deepEqual(waits, Array(5).fill(10000));
});

test("successful complete gate check returns immediately without delay", async () => {
  let waits = 0;
  const result = await waitForAdminAllJobsGate({
    fetchImpl: async (url, { method }) => gatedResponse(url, method),
    pause: async () => { waits += 1; },
  });
  assert.equal(result.attempt, 1);
  assert.equal(result.probes.length, 16);
  assert.equal(waits, 0);
});
