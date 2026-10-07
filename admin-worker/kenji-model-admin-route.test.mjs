import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./src/admin-login-hero-worker.js";

const core = await readFile(new URL("./src/admin-login-hero-worker-core.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");

const PATHS = [
  "/v1/admin/kenji/models",
  "/v1/admin/kenji/models/draft",
];

test("active admin entrypoint mounts the Kenji model adapter after the credential gate", () => {
  assert.match(core, /handleKenjiModelAdminRequest/);
  assert.match(core, /isKenjiModelAdminRequest/);
  const gateIndex = core.indexOf("const strictGate = await applyCredentialBoundAdminGate(");
  const modelIndex = core.indexOf("if (isKenjiModelAdminRequest(path, method))");
  assert.ok(gateIndex >= 0);
  assert.ok(modelIndex > gateIndex);
});

test("unauthenticated browser requests cannot read or write the Models adapter", async () => {
  for (const path of PATHS) {
    const response = await worker.fetch(new Request(`https://mmdbkk.com${path}`, {
      method: path.endsWith("/draft") ? "POST" : "GET",
      headers: path.endsWith("/draft") ? { "Content-Type": "application/json" } : {},
      body: path.endsWith("/draft") ? "{}" : undefined,
    }), {}, {});
    assert.equal(response.status, 401, path);
    const body = await response.json();
    assert.equal(body.error, "unauthorized", path);
  }
});

test("a forged service-shaped Authorization header is still rejected", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/kenji/models", {
    headers: { Authorization: "Bearer definitely-wrong" },
  }), { INTERNAL_TOKEN: "real-service-token" }, {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("a service INTERNAL_TOKEN bearer is not a browser admin session", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/kenji/models", {
    headers: { Authorization: "Bearer real-service-token" },
  }), { INTERNAL_TOKEN: "real-service-token" }, {});
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("a valid owner admin session passes the gate and reaches the adapter", async () => {
  const env = { ADMIN_BEARER: "owner_admin_bearer", ALLOWED_ORIGINS: "https://mmdbkk.com" };
  const login = await worker.fetch(new Request("https://mmdbkk.com/internal/admin/login/session", {
    method: "POST",
    headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ credential: "owner_admin_bearer", next: "/internal/admin/control-room" }).toString(),
  }), env, {});
  const Cookie = (login.headers.get("set-cookie") || "").split(";", 1)[0];
  assert.match(Cookie, /^mmd_admin_gate_v1=/);
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/kenji/models", {
    headers: { Origin: "https://mmdbkk.com", Cookie },
  }), env, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "model_source_unavailable");
});

test("wrangler owns only exact apex and www routes for the Kenji Models adapter", () => {
  for (const path of PATHS) {
    for (const host of ["mmdbkk.com", "www.mmdbkk.com"]) {
      assert.match(wrangler, new RegExp(`pattern = "${host.replace(/\./g, "\\.")}${path}"`));
    }
  }
  // Exact routes plus query-safe companions; the runtime still matches exact pathnames.
  for (const host of ["mmdbkk.com", "www.mmdbkk.com"]) {
    assert.match(wrangler, new RegExp(`pattern = "${host.replace(/\./g, "\\.")}/v1/admin/kenji/models\\*"`));
  }
  assert.doesNotMatch(wrangler, /v1\/admin\/kenji\/models\/\*/);
});
