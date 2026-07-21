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
    headers: {
      authorization: "Bearer should-not-forward",
      cookie: "mmd_admin_gate_v1=safe-test-cookie",
      "user-agent": "bridge-test-agent",
      "x-forwarded-host": "evil.example",
      "x-mmd-public-host": "evil.example",
      ...(init.headers || {}),
    },
    ...init,
  });
}

function adminWorkerBinding(calls, status = 200) {
  return {
    fetch: async (input) => {
      calls.push(input);
      return Response.json({ ok: status >= 200 && status < 300, authenticated: status === 200 }, { status });
    },
  };
}

async function withPublicFetchTrap(run) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("public fetch must not be used");
  };
  try {
    const result = await run();
    return { result, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("protected apex admin page verifies auth/me through admin-worker binding with apex public host", async () => {
  const calls = [];
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/control-room"), {
    ADMIN_WORKER: adminWorkerBinding(calls),
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mmdbkk.com/v1/admin/auth/me");
  assert.equal(calls[0].headers.get("accept"), "application/json");
  assert.equal(calls[0].headers.get("cookie"), "mmd_admin_gate_v1=safe-test-cookie");
  assert.equal(calls[0].headers.get("user-agent"), "bridge-test-agent");
  assert.equal(calls[0].headers.get("x-mmd-auth-bridge"), "immigrate-internal-admin-gate");
  assert.equal(calls[0].headers.get("x-mmd-public-host"), "mmdbkk.com");
  assert.equal(calls[0].headers.get("authorization"), null);
  assert.equal(calls[0].headers.get("x-forwarded-host"), null);
});

test("protected www admin page verifies auth/me through admin-worker binding with www public host", async () => {
  const calls = [];
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/jobs/create-session", "www.mmdbkk.com"), {
    ADMIN_WORKER: adminWorkerBinding(calls),
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.mmdbkk.com/v1/admin/auth/me");
  assert.equal(calls[0].headers.get("x-mmd-public-host"), "www.mmdbkk.com");
});

test("create-session page loads an existing bundled create-session asset", async () => {
  const calls = [];
  const { result: response } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/jobs/create-session"), {
    ADMIN_WORKER: adminWorkerBinding(calls),
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<script src="\/a\/create-session\.js"><\/script>/);
  assert.doesNotMatch(html, /create-session-v4\.js/);
});

test("workers.dev and unknown hosts do not verify a public-host cookie", async () => {
  for (const host of ["immigrate-worker.malemodel-bkk.workers.dev", "evil.example"]) {
    const calls = [];
    const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/control-room", host), {
      ADMIN_WORKER: adminWorkerBinding(calls),
      ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
    }));

    assert.equal(calls.length, 0, host);
    assert.equal(publicCalls, 0, host);
    assert.equal(response.status, 302, host);
    assert.equal(response.headers.get("location"), "/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room", host);
  }
});

test("apex and www remain independently host-bound by the binding verification URL", async () => {
  const cases = [
    ["mmdbkk.com", "https://mmdbkk.com/v1/admin/auth/me"],
    ["www.mmdbkk.com", "https://www.mmdbkk.com/v1/admin/auth/me"],
  ];

  for (const [host, expectedUrl] of cases) {
    const calls = [];
    const { result: response } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/control-room", host), {
      ADMIN_WORKER: adminWorkerBinding(calls, 401),
      ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
    }));

    assert.equal(calls.length, 1, host);
    assert.equal(calls[0].url, expectedUrl, host);
    assert.equal(response.status, 302, host);
  }
});

test("missing admin-worker binding fails closed without direct public fetch fallback", async () => {
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/internal/admin/control-room"), {
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(publicCalls, 0);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room");
});

test("admin API proxy uses admin-worker binding with original public host", async () => {
  const calls = [];
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/v1/admin/models/search?query=test"), {
    ADMIN_WORKER: adminWorkerBinding(calls),
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mmdbkk.com/v1/admin/models/search?query=test");
  assert.equal(calls[0].headers.get("authorization"), null);
  assert.equal(calls[0].headers.get("x-mmd-auth-bridge"), "immigrate-internal-admin-api");
});

test("create-job API POST is proxied through admin-worker binding with body and content type preserved", async () => {
  const calls = [];
  const payload = JSON.stringify({ session_id: "sess_public_safe", note: "bridge only" });
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/v1/admin/create-job?source=worker-page", "mmdbkk.com", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "mmd_admin_gate_v1=safe-test-cookie",
      authorization: "Bearer should-not-forward",
    },
    body: payload,
  }), {
    ADMIN_WORKER: {
      fetch: async (input) => {
        calls.push(input);
        return Response.json({
          ok: true,
          echoed: await input.text(),
          content_type: input.headers.get("content-type"),
        });
      },
    },
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(publicCalls, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mmdbkk.com/v1/admin/create-job?source=worker-page");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.get("authorization"), null);
  assert.equal(calls[0].headers.get("content-type"), "application/json");
  assert.equal(calls[0].headers.get("cookie"), "mmd_admin_gate_v1=safe-test-cookie");
  assert.equal(calls[0].headers.get("x-mmd-auth-bridge"), "immigrate-internal-admin-api");
  assert.equal(body.echoed, payload);
  assert.equal(body.content_type, "application/json");
});

test("admin API proxy fails closed without admin-worker binding", async () => {
  const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request("/v1/admin/models/search?query=test"), {
    ADMIN_WORKER_BASE_URL: "https://admin-worker.malemodel-bkk.workers.dev",
  }));

  assert.equal(publicCalls, 0);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "admin_worker_binding_required");
});

test("protected-page login redirects preserve only same-origin internal next paths", async () => {
  const cases = [
    ["/internal/admin/control-room?tab=line-inbox", "/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room%3Ftab%3Dline-inbox"],
    ["/internal/admin/jobs/create-session?source=bridge", "/internal/admin/login?next=%2Finternal%2Fadmin%2Fjobs%2Fcreate-session%3Fsource%3Dbridge"],
    ["/internal/jobs/create-job?session=sess_public_safe", "/internal/admin/login?next=%2Finternal%2Fjobs%2Fcreate-job%3Fsession%3Dsess_public_safe"],
  ];

  for (const [path, location] of cases) {
    const calls = [];
    const { result: response, calls: publicCalls } = await withPublicFetchTrap(() => handleInternalRoutes(request(path), {
      ADMIN_WORKER: adminWorkerBinding(calls, 401),
    }));

    assert.equal(calls.length, 1, path);
    assert.equal(publicCalls, 0, path);
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get("location"), location, path);
    assert.equal(response.headers.get("location").includes("evil.example"), false, path);
  }
});
