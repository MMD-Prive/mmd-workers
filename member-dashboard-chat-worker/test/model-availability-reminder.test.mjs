import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

const PATH = "https://member-dashboard-chat-worker.local/__internal/line/model-availability-reminder";
const SMOKE = PATH + "/smoke";
const LINE_ID = "U" + "b".repeat(32);

function req(path, body = {}, caller = "admin-worker") {
  return new Request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": caller,
    },
    body: JSON.stringify(body),
  });
}

test("admin service binding sends one bounded MMD MODEL Availability reminder", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await worker.fetch(req(PATH, {
      line_user_id: LINE_ID,
      display_name: "EMs16",
    }), {
      LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    }, { waitUntil() {} });

    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, "sent");
    assert.equal(payload.transport, "member-dashboard-chat-worker");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/message/push");
    const lineBody = JSON.parse(calls[0].init.body);
    assert.equal(lineBody.to, LINE_ID);
    assert.equal(lineBody.messages.length, 1);
    assert.match(lineBody.messages[0].text, /MMD MODEL/);
    assert.match(lineBody.messages[0].text, /EMs16/);
    assert.match(lineBody.messages[0].text, /\/sigil\/model\/dashboard\/availability/);
    assert.equal(JSON.stringify(payload).includes("line-token"), false);
    assert.equal(JSON.stringify(payload).includes(LINE_ID), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Availability reminder service route rejects non admin-worker callers", async () => {
  const response = await worker.fetch(req(PATH, {
    line_user_id: LINE_ID,
    display_name: "EMs16",
  }, "unexpected-worker"), {
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  }, { waitUntil() {} });

  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error, "internal_auth_required");
});

test("Availability reminder smoke proves canonical LINE token presence without sending", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("smoke must not call LINE");
  };
  try {
    const response = await worker.fetch(req(SMOKE, { display_name: "EMs16" }), {
      LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    }, { waitUntil() {} });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, "ready");
    assert.equal(payload.line_push_sent, false);
    assert.equal(payload.checks.access_token_present, true);
    assert.equal(payload.checks.contains_mmd_model, true);
    assert.equal(payload.checks.contains_availability_path, true);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Availability reminder smoke fails closed when canonical LINE token is missing", async () => {
  const response = await worker.fetch(req(SMOKE, { display_name: "EMs16" }), {}, { waitUntil() {} });
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.ok, false);
  assert.equal(payload.status, "line_token_missing");
  assert.equal(payload.line_push_sent, false);
});
