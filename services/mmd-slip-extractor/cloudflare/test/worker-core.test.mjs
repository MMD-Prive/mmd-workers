import assert from "node:assert/strict";
import test from "node:test";

import { handleExtractorRequest, safeBearerMatch } from "../worker-core.mjs";

const baseEnv = {
  MMD_RUNTIME_SCOPE: "staging",
  MMD_SLIP_EXTRACTOR_TOKEN: "preview-secret",
  MMD_SLIP_EXTRACTOR_MAX_BYTES: "4194304",
  SLIP_EXTRACTOR: {}
};

function fakeContainer(onRequest = () => {}) {
  return {
    fetch: async (request) => {
      onRequest(request);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "container-id" }
      });
    }
  };
}

test("bearer matching fails closed", async () => {
  assert.equal(await safeBearerMatch("Bearer preview-secret", "preview-secret"), true);
  assert.equal(await safeBearerMatch("Bearer wrong", "preview-secret"), false);
  assert.equal(await safeBearerMatch("", "preview-secret"), false);
  assert.equal(await safeBearerMatch("Bearer preview-secret", ""), false);
});

test("health checks the staging container without requiring a bearer token", async () => {
  let called = false;
  const response = await handleExtractorRequest(
    new Request("https://extractor.test/health"),
    baseEnv,
    { getContainer: () => fakeContainer(() => { called = true; }) }
  );
  assert.equal(response.status, 200);
  assert.equal(called, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("extraction requires the preview secret before container startup", async () => {
  let called = false;
  const response = await handleExtractorRequest(
    new Request("https://extractor.test/v1/extract/qr", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: new Uint8Array([1, 2, 3])
    }),
    baseEnv,
    { getContainer: () => fakeContainer(() => { called = true; }) }
  );
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("authorized extraction strips the bearer token before forwarding", async () => {
  let forwarded;
  const response = await handleExtractorRequest(
    new Request("https://extractor.test/v1/extract/ocr", {
      method: "POST",
      headers: {
        authorization: "Bearer preview-secret",
        "content-type": "image/jpeg",
        cookie: "must-not-forward=true",
        "x-request-id": "synthetic-smoke"
      },
      body: new Uint8Array([1, 2, 3])
    }),
    baseEnv,
    { getContainer: () => fakeContainer((request) => { forwarded = request; }) }
  );
  assert.equal(response.status, 200);
  assert.equal(forwarded.headers.get("authorization"), null);
  assert.equal(forwarded.headers.get("cookie"), null);
  assert.equal(forwarded.headers.get("x-mmd-internal-edge"), "mmd-slip-extractor-staging-edge");
  assert.equal(forwarded.headers.get("x-request-id"), "synthetic-smoke");
});

test("non-staging scope fails before routing", async () => {
  const response = await handleExtractorRequest(
    new Request("https://extractor.test/health"),
    { ...baseEnv, MMD_RUNTIME_SCOPE: "production" },
    { getContainer: () => fakeContainer() }
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "staging_scope_required" });
});

test("declared oversized requests fail before container startup", async () => {
  let called = false;
  const response = await handleExtractorRequest(
    new Request("https://extractor.test/v1/extract/qr", {
      method: "POST",
      headers: {
        authorization: "Bearer preview-secret",
        "content-type": "image/png",
        "content-length": "4194305"
      },
      body: new Uint8Array([1])
    }),
    baseEnv,
    { getContainer: () => fakeContainer(() => { called = true; }) }
  );
  assert.equal(response.status, 413);
  assert.equal(called, false);
});

test("only the health and extraction paths are exposed", async () => {
  const response = await handleExtractorRequest(
    new Request("https://extractor.test/admin"),
    baseEnv,
    { getContainer: () => fakeContainer() }
  );
  assert.equal(response.status, 404);
});
