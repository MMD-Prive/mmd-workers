import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../src/my-mmd-liff-session-race-guard.js";

const CLEAR = "__Host-mmd_liff_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0";

function json401() {
  return new Response(JSON.stringify({ ok: false, error: { code: "LIFF_SESSION_REQUIRED" } }), {
    status: 401,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": CLEAR,
    },
  });
}

test("anonymous stale LIFF probe cannot clear a concurrently-created host session", async () => {
  const env = { MEMBER_PAGES_WORKER: { fetch: async () => json401() } };
  const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/status", {
    headers: { accept: "application/json" },
  }), env);

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-mmd-liff-cookie-race-guard"), "ignored-anonymous-stale-clear-v1");
});

test("invalid session that was actually presented still keeps normal fail-closed cookie clearing", async () => {
  const env = { MEMBER_PAGES_WORKER: { fetch: async () => json401() } };
  const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/status", {
    headers: {
      accept: "application/json",
      cookie: "__Host-mmd_liff_session=old-session-token",
    },
  }), env);

  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie") || "", /__Host-mmd_liff_session=/);
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
  assert.equal(response.headers.get("x-mmd-liff-cookie-race-guard"), null);
});

test("status recovery allows resolver/fallback headroom beyond the 12 second resolver timeout", async () => {
  const env = {
    MEMBER_PAGES_WORKER: {
      fetch: async () => new Response(
        '<!doctype html><html><body><div id="message"></div><div id="actions"></div><script nonce="abc123"></script></body></html>',
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      ),
    },
  };
  const response = await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=status"), env);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-liff-hard-timeout-ms"), "18000");
  assert.equal(response.headers.get("x-mmd-liff-session-race-hotfix"), "v1");
  assert.match(html, /const HARD_TIMEOUT_MS = 18000;/);
});
