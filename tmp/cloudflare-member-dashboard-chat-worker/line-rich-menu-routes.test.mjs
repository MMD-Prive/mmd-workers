import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

// Tests for /internal/line/rich-menu/create and /internal/line/rich-menu/maintain
// These routes must be:
//   - guarded by x-admin-key (CONFIRM_KEY / ADMIN_TEST_KEY)
//   - safe when LINE_CHANNEL_ACCESS_TOKEN is absent (no LINE API call made)
//   - unreachable from GET / non-POST methods
// These tests do NOT call the real LINE API.

const ROUTES = [
  "/internal/line/rich-menu/create",
  "/internal/line/rich-menu/maintain",
];

for (const path of ROUTES) {
  test(`${path} — rejects when admin key is not configured`, async () => {
    const env = {};
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${path}`, { method: "POST" }),
      env,
      {}
    );
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "admin_key_not_configured");
  });

  test(`${path} — rejects with 401 when x-admin-key header is missing`, async () => {
    const env = { CONFIRM_KEY: "test-confirm-key" };
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${path}`, { method: "POST" }),
      env,
      {}
    );
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "missing_admin_key");
  });

  test(`${path} — rejects with 403 when x-admin-key is wrong`, async () => {
    const env = { CONFIRM_KEY: "test-confirm-key" };
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${path}`, {
        method: "POST",
        headers: { "x-admin-key": "wrong-key" },
      }),
      env,
      {}
    );
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_admin_key");
  });

  test(`${path} — rejects with 500 and does not call LINE API when token is absent`, async () => {
    const env = { CONFIRM_KEY: "test-confirm-key" };
    let lineApiCalled = false;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("api.line.me")) {
          lineApiCalled = true;
        }
        return new Response("{}", { status: 200 });
      };
      const response = await worker.fetch(
        new Request(`https://www.mmdbkk.com${path}`, {
          method: "POST",
          headers: { "x-admin-key": "test-confirm-key" },
        }),
        env,
        {}
      );
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.error, "line_token_not_configured");
      assert.equal(lineApiCalled, false, "LINE API must not be called when token is absent");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test(`${path} — GET is not routed (returns 404)`, async () => {
    const env = { CONFIRM_KEY: "test-confirm-key", LINE_CHANNEL_ACCESS_TOKEN: "tok" };
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${path}`, { method: "GET" }),
      env,
      {}
    );
    // GET should fall through to not_found
    assert.equal(response.status, 404);
  });
}
