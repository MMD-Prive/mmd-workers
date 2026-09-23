import test from "node:test";
import assert from "node:assert/strict";
import worker, { appendEtaEvent, normalizeEtaMinutes } from "./src/model-eta-wrapper.js";

test("events ETA accepts 1-240 whole minutes", () => {
  assert.equal(normalizeEtaMinutes(1), 1);
  assert.equal(normalizeEtaMinutes(15), 15);
  assert.equal(normalizeEtaMinutes(240), 240);
  assert.equal(normalizeEtaMinutes(-1), 0);
  assert.equal(normalizeEtaMinutes(241), 0);
  assert.equal(normalizeEtaMinutes(15.2), 0);
});

test("ETA timeline append preserves order and caps history", () => {
  const prior = Array.from({ length: 205 }, (_, i) => ({ event: `old_${i}` }));
  const event = { event: "eta_update", eta_minutes: 20 };
  const next = appendEtaEvent(prior, event);
  assert.equal(next.length, 200);
  assert.deepEqual(next.at(-1), event);
  assert.equal(next.at(0).event, "old_6");
});


test("model availability reminder uses the Model LINE token on the events owner lane", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url: url.toString(), init });
    if (url.hostname === "api.line.me") return Response.json({}, { status: 200 });
    return new Response("not found", { status: 404 });
  };
  try {
    const response = await worker.fetch(new Request(
      "https://events-worker.internal/__internal/model/availability-reminder",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": "admin-events-secret",
        },
        body: JSON.stringify({
          line_user_id: "U0123456789abcdef0123456789abcdef",
          display_name: "EMs16",
        }),
      },
    ), {
      AUTH_SERVICE_ADMIN_TO_EVENTS: "admin-events-secret",
      MODEL_LINE_CHANNEL_ACCESS_TOKEN: "model-line-secret",
    }, {});

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.transport, "events-worker-model-line");
    assert.equal(calls.length, 1);
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.to, "U0123456789abcdef0123456789abcdef");
    assert.match(sent.messages[0].text, /อัปเดตสถานะวันนี้/);
    assert.match(String(calls[0].init.headers.authorization), /^Bearer model-line-secret$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("model availability preflight proves Model LINE recipient reachability without sending", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url: url.toString(), init });
    if (url.hostname === "api.line.me" && url.pathname.startsWith("/v2/bot/profile/")) {
      return Response.json({ displayName: "redacted-by-contract" }, { status: 200 });
    }
    throw new Error("unexpected request");
  };
  try {
    const response = await worker.fetch(new Request(
      "https://events-worker.internal/__internal/model/availability-reminder/preflight",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": "admin-events-secret",
        },
        body: JSON.stringify({
          line_user_id: "U0123456789abcdef0123456789abcdef",
        }),
      },
    ), {
      AUTH_SERVICE_ADMIN_TO_EVENTS: "admin-events-secret",
      MODEL_LINE_CHANNEL_ACCESS_TOKEN: "model-line-secret",
    }, {});

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload, {
      ok: true,
      ready: true,
      state: "ready",
      token_mode: "model",
      transport: "events-worker-model-line",
      recipient_reachable: true,
      provider_status: 200,
      message_sent: false,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.method, "GET");
    assert.match(calls[0].url, /\/v2\/bot\/profile\/U0123456789abcdef0123456789abcdef$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model availability preflight reports missing transport without any LINE call", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("LINE must not be called"); };
  try {
    const response = await worker.fetch(new Request(
      "https://events-worker.internal/__internal/model/availability-reminder/preflight",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": "admin-events-secret",
        },
        body: JSON.stringify({
          line_user_id: "U0123456789abcdef0123456789abcdef",
        }),
      },
    ), {
      AUTH_SERVICE_ADMIN_TO_EVENTS: "admin-events-secret",
    }, {});

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.ready, false);
    assert.equal(payload.state, "model_line_transport_not_ready");
    assert.equal(payload.message_sent, false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
