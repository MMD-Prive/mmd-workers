import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "control-room-dashboard-ingress-"));
const outfile = join(tmp, "worker.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(workerRoot, "src/control-room-dashboard-ingress-wrapper.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  target: "es2022",
});

const { default: worker } = await import(pathToFileURL(outfile).href);

test.after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test("dashboard ingress forwards only through ADMIN_WORKER using the original public host", async () => {
  const calls = [];
  const env = {
    ADMIN_WORKER: {
      fetch: async (request) => {
        calls.push(request);
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
      },
    },
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/dashboard?from=control-room", {
    headers: {
      Cookie: "mmd_admin_gate_v1=test-cookie",
      Authorization: "Bearer browser-must-not-forward",
      "X-Confirm-Key": "browser-must-not-forward",
      "X-Forwarded-Host": "evil.example",
    },
  }), env);

  assert.equal(response.status, 401);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mmdbkk.com/v1/admin/dashboard?from=control-room");
  assert.equal(calls[0].headers.get("cookie"), "mmd_admin_gate_v1=test-cookie");
  assert.equal(calls[0].headers.get("authorization"), null);
  assert.equal(calls[0].headers.get("x-confirm-key"), null);
  assert.equal(calls[0].headers.get("x-forwarded-host"), null);
  assert.equal(calls[0].headers.get("x-mmd-auth-bridge"), "immigrate-control-room-dashboard");
  assert.equal(calls[0].headers.get("x-mmd-public-host"), "mmdbkk.com");
  assert.equal(response.headers.get("x-mmd-control-room-dashboard-ingress"), "immigrate-to-admin-v1");
});

test("dashboard ingress supports www with the same credential-bound cookie handoff", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/v1/admin/dashboard", {
    headers: { Cookie: "mmd_admin_gate_v1=test-cookie" },
  }), {
    ADMIN_WORKER: {
      fetch: async (request) => {
        calls.push(request);
        return Response.json({ ok: true, source: "admin-worker" });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://www.mmdbkk.com/v1/admin/dashboard");
  assert.equal(calls[0].headers.get("x-mmd-public-host"), "www.mmdbkk.com");
});

test("dashboard ingress fails closed without the admin service binding", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/dashboard"), {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "admin_worker_binding_unavailable");
});

test("dashboard ingress refuses non-production hosts", async () => {
  let calls = 0;
  const response = await worker.fetch(new Request("https://immigrate-worker.malemodel-bkk.workers.dev/v1/admin/dashboard"), {
    ADMIN_WORKER: { fetch: async () => { calls += 1; return Response.json({ ok: true }); } },
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "dashboard_bridge_host_not_allowed");
  assert.equal(calls, 0);
});
