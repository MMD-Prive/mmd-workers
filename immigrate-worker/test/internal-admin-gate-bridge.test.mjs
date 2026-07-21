import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "internal-admin-gate-bridge-"));
const outfile = join(tmp, "internal-routes.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(workerRoot, "src/internal-routes.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  target: "es2022",
});

const { handleInternalRoutes } = await import(pathToFileURL(outfile).href);

test.after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function request(path, host = "mmdbkk.com", init = {}) {
  return new Request(`https://${host}${path}`, {
    headers: { cookie: "mmd_admin_gate_v1=safe-test-cookie", ...(init.headers || {}) },
    ...init,
  });
}

async function withFetchMock(mock, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("protected apex admin page verifies auth/me through apex public host", async () => {
  const calls = [];
  const response = await withFetchMock(async (input, init = {}) => {
    calls.push({ url: String(input), headers: new Headers(init.headers) });
    return Response.json({ ok: true, authenticated: true });
  }, () => handleInternalRoutes(request("/internal/admin/control-room"), {
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mmdbkk.com/v1/admin/auth/me");
  assert.equal(calls[0].headers.get("cookie"), "mmd_admin_gate_v1=safe-test-cookie");
});

test("protected www admin page verifies auth/me through www public host", async () => {
  const calls = [];
  const response = await withFetchMock(async (input, init = {}) => {
    calls.push({ url: String(input), headers: new Headers(init.headers) });
    return Response.json({ ok: true, authenticated: true });
  }, () => handleInternalRoutes(request("/internal/admin/jobs/create-session", "www.mmdbkk.com"), {
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.mmdbkk.com/v1/admin/auth/me");
});

test("workers.dev protected request does not verify a public-host cookie as workers.dev", async () => {
  let calls = 0;
  const response = await withFetchMock(async () => {
    calls += 1;
    return Response.json({ ok: true, authenticated: true });
  }, () => handleInternalRoutes(request("/internal/admin/control-room", "immigrate-worker.malemodel-bkk.workers.dev"), {
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(calls, 0);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room");
});

test("admin API proxy still uses configured admin-worker base", async () => {
  const calls = [];
  const response = await withFetchMock(async (input) => {
    calls.push(String(input.url || input));
    return Response.json({ ok: true, authenticated: true });
  }, () => handleInternalRoutes(request("/v1/admin/auth/me"), {
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["https://admin-worker.malemodel-bkk.workers.dev/v1/admin/auth/me"]);
});
