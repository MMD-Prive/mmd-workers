import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "./src/admin-login-hero-worker.js";

const entry = await readFile(new URL("./src/admin-login-hero-worker.js", import.meta.url), "utf8");
const wrangler = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");

const PATHS = [
  "/v1/admin/kenji/models",
  "/v1/admin/kenji/models/draft",
];

test("active admin entrypoint mounts the Kenji model adapter after the credential gate", () => {
  assert.match(entry, /handleKenjiModelAdminRequest/);
  assert.match(entry, /isKenjiModelAdminRequest/);
  assert.match(entry, /isCoreAdminAuthed/);
  const gateIndex = entry.indexOf("applyCredentialBoundAdminGate");
  const modelIndex = entry.indexOf("if (isKenjiModelAdminRequest(path, method))");
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

test("a valid internal bearer passes auth and reaches the adapter", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/v1/admin/kenji/models", {
    headers: { Authorization: "Bearer real-service-token" },
  }), { INTERNAL_TOKEN: "real-service-token" }, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "model_source_unavailable");
});

test("wrangler owns only exact apex and www routes for the Kenji Models adapter", () => {
  for (const path of PATHS) {
    for (const host of ["mmdbkk.com", "www.mmdbkk.com"]) {
      assert.match(wrangler, new RegExp(`pattern = "${host.replace(/\./g, "\\.")}${path}"`));
    }
  }
  assert.doesNotMatch(wrangler, /v1\/admin\/kenji\/models\*/);
  assert.doesNotMatch(wrangler, /v1\/admin\/kenji\/models\/\*/);
});
