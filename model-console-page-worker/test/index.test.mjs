import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

test("serves canonical Model Console from Webflow without auth gate", async () => {
  const restore = mockFetch(async (request) => {
    const url = new URL(request.url);
    assert.equal(url.hostname, "mmdprive.webflow.io");
    assert.equal(url.pathname, "/sigil/model/console");
    return new Response("<!doctype html><title>Model Console</title>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });

  try {
    const response = await worker.fetch(
      new Request("https://mmdbkk.com/sigil/model/console?token=abc")
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.equal(response.headers.get("x-mmd-route-owner"), "model-console-page-worker");
    assert.equal(response.headers.get("x-mmd-page"), "sigil-model-console");
  } finally {
    restore();
  }
});

test("redirects legacy Model Console route to canonical path", async () => {
  const response = await worker.fetch(
    new Request("https://www.mmdbkk.com/model/console?t=xyz")
  );
  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get("location"),
    "https://mmdbkk.com/sigil/model/console?t=xyz"
  );
});

test("rejects non-page methods before Webflow", async () => {
  const response = await worker.fetch(
    new Request("https://mmdbkk.com/sigil/model/console", { method: "POST" })
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});
