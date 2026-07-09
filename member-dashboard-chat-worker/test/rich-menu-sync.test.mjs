import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import worker from "../src/index.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const AUTH_ENV = {
  INTERNAL_TOKEN: "internal-token",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_RICH_MENU_PUBLIC_ID: "richmenu-public",
  LINE_RICH_MENU_PRIVATE_ID: "richmenu-private",
  LINE_RICH_MENU_RENEWAL_ID: "richmenu-renewal",
  LINE_RICH_MENU_BLACKCARD_ID: "richmenu-blackcard",
};

function syncRequest(body = {}, headers = {}) {
  return new Request("https://worker/v1/internal/line/rich-menu/sync", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function callSync(body = {}, env = AUTH_ENV, headers = { authorization: "Bearer internal-token" }) {
  return worker.fetch(syncRequest(body, headers), env);
}

test("internal sync rejects without auth", async () => {
  const response = await callSync({ line_user_id: LINE_USER_ID }, AUTH_ENV, {});
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "internal_auth_required" });
});

test("internal sync rejects missing line_user_id", async () => {
  const response = await callSync({ membership_state: "active", package_state: "current" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "line_user_id_missing" });
});

test("active/current premium maps to private_member", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await callSync({ line_user_id: LINE_USER_ID, membership_state: "active", package_state: "current", tier: "premium" });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.rich_menu_target, "private_member");
    assert.equal(body.linked, true);
    assert.match(calls[0].url, /\/richmenu\/richmenu-private$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expired maps to renewal", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await callSync({ line_user_id: LINE_USER_ID, membership_state: "expired", package_state: "expired" });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.rich_menu_target, "renewal");
    assert.match(calls[0].url, /\/richmenu\/richmenu-renewal$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unknown maps to public_member", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await callSync({ line_user_id: LINE_USER_ID, membership_state: "unknown", package_state: "unknown" });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.rich_menu_target, "public_member");
    assert.match(calls[0].url, /\/richmenu\/richmenu-public$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("blackcard active maps to blackcard", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await callSync({ line_user_id: LINE_USER_ID, membership_state: "active", package_state: "current", tier: "blackcard" });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.rich_menu_target, "blackcard");
    assert.match(calls[0].url, /\/richmenu\/richmenu-blackcard$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing rich menu id returns rich_menu_id_missing", async () => {
  const response = await callSync(
    { line_user_id: LINE_USER_ID, membership_state: "active", package_state: "current", tier: "premium" },
    { INTERNAL_TOKEN: "internal-token", LINE_CHANNEL_ACCESS_TOKEN: "line-token" },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "rich_menu_id_missing", rich_menu_target: "private_member" });
});

test("link call uses POST /v2/bot/user/{userId}/richmenu/{richMenuId}", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await callSync({ line_user_id: LINE_USER_ID, membership_state: "active", package_state: "current", tier: "standard" });
    assert.equal(response.status, 200);
    assert.equal(calls[0].url, `https://api.line.me/v2/bot/user/${LINE_USER_ID}/richmenu/richmenu-private`);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.authorization, "Bearer line-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no token returns line_token_missing", async () => {
  const response = await callSync(
    { line_user_id: LINE_USER_ID, membership_state: "unknown", package_state: "unknown" },
    { INTERNAL_TOKEN: "internal-token", LINE_RICH_MENU_PUBLIC_ID: "richmenu-public" },
  );
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "line_token_missing");
});

test("no frontend/browser token exposure", () => {
  const source = readFileSync(new URL("../../member-pages-worker/src/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /LINE_CHANNEL_ACCESS_TOKEN/);
  assert.doesNotMatch(source, /LINE_RICH_MENU_(PUBLIC|MEMBER|PRIVATE|RENEWAL|BLACKCARD)_ID/);
});
