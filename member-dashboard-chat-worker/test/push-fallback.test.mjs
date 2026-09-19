import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  deliverLinePublicMenu,
  deliverLineText,
  getLineUserId,
  pushLinePublicMenu,
} from "../src/index.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const AUTH_ENV = {
  INTERNAL_TOKEN: "internal-token",
  CONFIRM_KEY: "confirm-key",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
};

function fallbackRequest({ headers = {}, body = { line_user_id: LINE_USER_ID } } = {}) {
  return new Request("https://worker/v1/internal/line/public-menu-fallback", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("getLineUserId accepts only LINE user ids", () => {
  assert.equal(getLineUserId({ line_user_id: LINE_USER_ID }), LINE_USER_ID);
  assert.equal(getLineUserId({ event: { source: { userId: LINE_USER_ID } } }), LINE_USER_ID);
  assert.equal(getLineUserId({ line_user_id: "recXXXXXXXXXXXX" }), "");
  assert.equal(getLineUserId({ line_user_id: "" }), "");
});

test("deliverLineText fails closed without trusted event, token, user id, or text", async () => {
  assert.deepEqual(await deliverLineText({ LINE_CHANNEL_ACCESS_TOKEN: "x" }, LINE_USER_ID, "hi"), {
    ok: false,
    error: "trusted_event_required",
  });
  assert.deepEqual(await deliverLineText({}, LINE_USER_ID, "hi", { trusted_event: true }), {
    ok: false,
    error: "line_token_missing",
  });
  assert.deepEqual(await deliverLineText({ LINE_CHANNEL_ACCESS_TOKEN: "x" }, "", "hi", { trusted_event: true }), {
    ok: false,
    error: "line_user_id_missing",
  });
  assert.deepEqual(await deliverLineText({ LINE_CHANNEL_ACCESS_TOKEN: "x" }, LINE_USER_ID, "", { trusted_event: true }), {
    ok: false,
    error: "line_text_missing",
  });
});

test("deliverLineText redacts internal markers before LINE push", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  };

  try {
    const result = await deliverLineText(
      { LINE_CHANNEL_ACCESS_TOKEN: "line-token" },
      LINE_USER_ID,
      "Airtable recXXXXXXXXXXXX secret token VIP Black Card risk_flag",
      { trusted_event: true },
    );

    assert.equal(result.ok, true);
    const payload = JSON.parse(calls[0].init.body);
    assert.equal(payload.to, LINE_USER_ID);
    assert.doesNotMatch(payload.messages[0].text, /Airtable|recXXXXXXXXXXXX|secret|token|VIP|Black Card|risk_flag/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deliverLinePublicMenu sends public-only help copy", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  };

  try {
    const result = await deliverLinePublicMenu(
      { LINE_CHANNEL_ACCESS_TOKEN: "line-token" },
      LINE_USER_ID,
      { trusted_event: true },
    );

    assert.equal(result.ok, true);
    const text = JSON.parse(calls[0].init.body).messages[0].text;
    assert.match(text, /official verification|trusted worker state/i);
    assert.doesNotMatch(text, /activate|points|package unlocked|dashboard access granted/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pushLinePublicMenu requires trusted server-side input", async () => {
  assert.deepEqual(await pushLinePublicMenu({ line_user_id: LINE_USER_ID }, { LINE_CHANNEL_ACCESS_TOKEN: "x" }), {
    ok: false,
    error: "trusted_event_required",
  });
});

test("worker route rejects trusted_event without internal auth and does not call LINE", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await worker.fetch(fallbackRequest({
      headers: { "X-MMD-Trusted-Event": "true" },
    }), AUTH_ENV);

    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
    assert.deepEqual(await response.json(), { ok: false, error: "internal_auth_required" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker route rejects invalid internal auth and does not call LINE", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await worker.fetch(fallbackRequest({
      headers: {
        authorization: "Bearer wrong-token",
        "X-MMD-Trusted-Event": "true",
      },
    }), AUTH_ENV);

    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker route accepts bearer internal auth plus trusted event", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await worker.fetch(fallbackRequest({
      headers: {
        authorization: "Bearer internal-token",
        "X-MMD-Trusted-Event": "true",
      },
    }), AUTH_ENV);

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker route rejects retired X-Confirm-Key internal auth", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await worker.fetch(fallbackRequest({
      headers: { "X-Confirm-Key": "confirm-key" },
      body: { line_user_id: LINE_USER_ID, trusted_event: true },
    }), AUTH_ENV);

    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
    assert.deepEqual(await response.json(), { ok: false, error: "internal_auth_required" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker route still requires trusted event after valid internal auth", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await worker.fetch(fallbackRequest({
      headers: { authorization: "Bearer internal-token" },
    }), AUTH_ENV);

    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
    assert.deepEqual(await response.json(), { ok: false, error: "trusted_event_required" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
