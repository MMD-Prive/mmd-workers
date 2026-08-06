import assert from "node:assert/strict";
import { describe, it } from "node:test";

import worker from "../src/index.js";

class MemoryKv {
  async get() { return null; }
  async put() {}
  async delete() {}
}

function env() {
  return {
    LINE_LOGIN_CHANNEL_ID: "2000000000",
    LIFF_SESSION_SECRET: "test-only-session-secret-not-production",
    MEMBER_STATUS_RESOLVER_SECRET: "test-only-member-status-resolver-secret-1234567890",
    LIFF_IDENTITY_KV: new MemoryKv(),
    MEMBER_STATUS_RESOLVER: { fetch: async () => new Response(JSON.stringify({ ok: true, data: { member_exists: false } })) },
  };
}

describe("member-pages LIFF status route", () => {
  it("delegates an unauthenticated status request to the LIFF foundation", async () => {
    const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/status", {
      headers: { accept: "application/json" },
    }), env());

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("x-mmd-worker"), "member-pages-worker");
    assert.equal((await response.json()).error.code, "LIFF_SESSION_REQUIRED");
  });
});
