import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  buildKenjiLineReply,
  createLineSignature,
  inferLineIntent,
  isKenjiLineCandidate,
} from "../src/index.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const BASE_ENV = {
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
};

async function signedLineRequest(body, env = BASE_ENV) {
  const raw = JSON.stringify(body);
  const signature = await createLineSignature(raw, env.LINE_CHANNEL_SECRET);
  return new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": signature,
    },
    body: raw,
  });
}

function lineTextEvent(text, overrides = {}) {
  return {
    type: "message",
    replyToken: "reply-token",
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: "msg-1", type: "text", text },
    ...overrides,
  };
}

function lineTextEventWithoutReply(text, overrides = {}) {
  const event = lineTextEvent(text, overrides);
  delete event.replyToken;
  return event;
}

function lineImageEvent(overrides = {}) {
  return {
    type: "message",
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: "msg-image", type: "image" },
    ...overrides,
  };
}

async function captureWebhook(body, env = BASE_ENV, fetchImpl = null) {
  const logs = [];
  const calls = [];
  const originalLog = console.log;
  const originalFetch = globalThis.fetch;
  console.log = (...args) => logs.push(args.map(String));
  globalThis.fetch = fetchImpl || (async (url, init) => {
    calls.push({ url: String(url), init });
    const href = String(url);
    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  try {
    const response = await worker.fetch(await signedLineRequest(body, env), env);
    return { response, payload: await response.json(), logs, calls };
  } finally {
    console.log = originalLog;
    globalThis.fetch = originalFetch;
  }
}

function hasLog(logs, name, reason = "") {
  return logs.some((entry) => {
    if (entry[0] !== name) return false;
    if (!reason) return true;
    return entry.some((part) => part.includes(`"reason":"${reason}"`));
  });
}

function assertNoSensitiveLogData(logs) {
  const combined = JSON.stringify(logs);
  assert.doesNotMatch(combined, /Hi Per|Hi MMD|hi per|hi mmd|unknown private text|reply-token|line-token|line-secret|Authorization|Bearer/i);
  assert.doesNotMatch(combined, new RegExp(LINE_USER_ID));
  assert.doesNotMatch(combined, /raw_text|rawBody|api\.line\.me|admin-worker|internal/i);
}

test("health route works", async () => {
  const response = await worker.fetch(new Request("https://worker/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, worker: "member-dashboard-chat-worker" });
});

test("LINE webhook fails closed when signature is missing or invalid", async () => {
  const missing = await worker.fetch(new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ events: [] }),
  }), BASE_ENV);
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { ok: false, error: "invalid_signature" });

  const invalid = await worker.fetch(new Request("https://worker/webhooks/line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": "wrong" },
    body: JSON.stringify({ events: [] }),
  }), BASE_ENV);
  assert.equal(invalid.status, 401);
});

test("LINE webhook fails closed if channel secret is absent", async () => {
  const request = await signedLineRequest({ events: [] }, BASE_ENV);
  const response = await worker.fetch(request, { ...BASE_ENV, LINE_CHANNEL_SECRET: "" });
  assert.equal(response.status, 401);
});

test("valid LINE signature can process empty events safely", async () => {
  const { response, payload, logs } = await captureWebhook({ events: [] });
  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    worker: "member-dashboard-chat-worker",
    route: "line_webhook",
    events: 0,
    saved: [],
  });
  assert.equal(hasLog(logs, "line_public_trigger_skip", "no_events"), true);
  assertNoSensitiveLogData(logs);
});

test("Kenji trigger phrases route to talk_to_per_ai intent", async () => {
  const phrases = ["Hi Per", "Per AI", "Kenji AI", "เปอร์ ai", "เปอร์เอไอ"];

  for (const phrase of phrases) {
    assert.equal(isKenjiLineCandidate(phrase), true, phrase);
    assert.equal(inferLineIntent(phrase, lineTextEvent(phrase)), "talk_to_per_ai", phrase);

    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent(phrase)] }), {
      ...BASE_ENV,
      LINE_AUTO_REPLY_ENABLED: "false",
    });
    assert.equal(response.status, 200, phrase);
    const payload = await response.json();
    assert.equal(payload.saved[0].intent, "talk_to_per_ai", phrase);
    assert.equal(payload.saved[0].replied, false, phrase);
  }
});

test("Kenji replies do not expose internal markers", () => {
  const reply = buildKenjiLineReply(lineTextEvent("Hi Per"), { displayName: "Test User" });
  assert.match(reply, /Kenji AI|MMD Privé/);
  assert.doesNotMatch(reply, /airtable|record_id|secret|token|authorization|bearer|telegram|gmail|r2|kv/i);
});

test("deduped LINE events do not reply twice", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("api.airtable.com") && init?.method === "GET") {
      return new Response(JSON.stringify({ records: [{ id: "recExisting123" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("/message/reply")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent("Hi Per")] }), {
      ...BASE_ENV,
      AIRTABLE_API_KEY: "airtable-key",
      AIRTABLE_BASE_ID: "base-id",
      AIRTABLE_SYNC_TABLE: "Console Inbox",
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].deduped, true);
    assert.equal(payload.saved[0].replied, false);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid LINE event can auto reply through reply API when not deduped", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("/message/reply")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent("Hi Per")] }), BASE_ENV);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].replied, true);
    assert.equal(calls.filter((call) => call.url.includes("/message/reply")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Hi Per without replyToken pushes fallback and logs success", async () => {
  const { payload, logs, calls } = await captureWebhook({ events: [lineTextEventWithoutReply("Hi Per")] });

  assert.equal(payload.saved[0].pushed, true);
  assert.equal(payload.saved[0].replied, false);
  assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 1);
  assert.equal(hasLog(logs, "line_push_fallback_success"), true);
  assertNoSensitiveLogData(logs);
});

test("Hi Per trigger variants without replyToken push fallback", async () => {
  const phrases = [
    " hi per ",
    "Hi   Per",
    "Hi\u200B Per",
    "PER",
    "คุยกับเปอร์",
    "คุยกับเปอร์ครับ",
    "คุยกับ Per",
    "คุยกับ per",
  ];

  for (const phrase of phrases) {
    const { payload, logs, calls } = await captureWebhook({ events: [lineTextEventWithoutReply(phrase)] });
    assert.equal(payload.saved[0].pushed, true, phrase);
    assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 1, phrase);
    assert.equal(hasLog(logs, "line_push_fallback_success"), true, phrase);
    assertNoSensitiveLogData(logs);
  }
});

test("Hi MMD without replyToken pushes fallback and logs success", async () => {
  const { payload, logs, calls } = await captureWebhook({ events: [lineTextEventWithoutReply("Hi MMD")] });

  assert.equal(payload.saved[0].pushed, true);
  assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 1);
  assert.equal(hasLog(logs, "line_push_fallback_success"), true);
  assertNoSensitiveLogData(logs);
});

test("Hi MMD trigger variants without replyToken push fallback", async () => {
  const phrases = [
    " hi mmd ",
    "Hi\u200B MMD",
    "Hi MMD for English",
    "English",
  ];

  for (const phrase of phrases) {
    const { payload, logs, calls } = await captureWebhook({ events: [lineTextEventWithoutReply(phrase)] });
    assert.equal(payload.saved[0].pushed, true, phrase);
    assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 1, phrase);
    assert.equal(hasLog(logs, "line_push_fallback_success"), true, phrase);
    assertNoSensitiveLogData(logs);
  }
});

test("push failure logs push_not_allowed safely", async () => {
  const fetchImpl = async (url, init) => {
    const href = String(url);
    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href.includes("/message/push")) return new Response(JSON.stringify({ ok: false }), { status: 403 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const { payload, logs } = await captureWebhook({ events: [lineTextEventWithoutReply("Hi Per")] }, BASE_ENV, fetchImpl);

  assert.equal(payload.saved[0].pushed, false);
  assert.equal(hasLog(logs, "line_push_fallback_failed"), true);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "push_not_allowed"), true);
  assertNoSensitiveLogData(logs);
});

test("reply failure logs reply_not_allowed safely", async () => {
  const fetchImpl = async (url, init) => {
    const href = String(url);
    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href.includes("/message/reply")) return new Response(JSON.stringify({ ok: false }), { status: 400 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const { payload, logs } = await captureWebhook({ events: [lineTextEvent("Hi Per")] }, BASE_ENV, fetchImpl);

  assert.equal(payload.saved[0].replied, false);
  assert.equal(hasLog(logs, "line_reply_failed"), true);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "reply_not_allowed"), true);
  assertNoSensitiveLogData(logs);
});

test("unknown text without replyToken logs no public trigger match and does not push", async () => {
  const { payload, logs, calls } = await captureWebhook({ events: [lineTextEventWithoutReply("  unknown\u200B  private text  ")] });

  assert.equal(payload.saved[0].pushed, false);
  assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 0);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "no_public_trigger_match"), true);
  assert.equal(logs.some((entry) => entry.some((part) => part.includes('"has_zero_width":true'))), true);
  assert.equal(logs.some((entry) => entry.some((part) => part.includes('"has_leading_or_trailing_space":true'))), true);
  assert.equal(logs.some((entry) => entry.some((part) => part.includes('"has_repeated_space":true'))), true);
  assert.equal(logs.some((entry) => entry.some((part) => part.includes('"normalized_length":'))), true);
  assert.equal(logs.some((entry) => entry.some((part) => part.includes('"raw_length":'))), true);
  assertNoSensitiveLogData(logs);
});

test("auto reply disabled logs skip and blocks reply and push", async () => {
  const { payload, logs, calls } = await captureWebhook(
    { events: [lineTextEventWithoutReply("Hi Per")] },
    { ...BASE_ENV, LINE_AUTO_REPLY_ENABLED: "false" },
  );

  assert.equal(payload.saved[0].pushed, false);
  assert.equal(payload.saved[0].replied, false);
  assert.equal(calls.filter((call) => call.url.includes("/message/")).length, 0);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "auto_reply_disabled"), true);
  assertNoSensitiveLogData(logs);
});

test("missing source user logs skip and does not push", async () => {
  const event = lineTextEventWithoutReply("Hi Per", { source: { type: "user" } });
  const { payload, logs, calls } = await captureWebhook({ events: [event] });

  assert.equal(payload.saved[0].line_user, false);
  assert.equal(payload.saved[0].pushed, false);
  assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 0);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "missing_source_user"), true);
  assertNoSensitiveLogData(logs);
});

test("missing channel token logs skip and does not push", async () => {
  const { payload, logs, calls } = await captureWebhook(
    { events: [lineTextEventWithoutReply("Hi Per")] },
    { ...BASE_ENV, LINE_CHANNEL_ACCESS_TOKEN: "" },
  );

  assert.equal(payload.saved[0].pushed, false);
  assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 0);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "missing_channel_token"), true);
  assertNoSensitiveLogData(logs);
});

test("missing reply text logs skip and does not push", async () => {
  const { payload, logs, calls } = await captureWebhook(
    { events: [lineTextEventWithoutReply("Hi Per")] },
    { ...BASE_ENV, LINE_KENJI_AI_ENABLED: "false" },
  );

  assert.equal(payload.saved[0].pushed, false);
  assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 0);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "missing_reply_text"), true);
  assertNoSensitiveLogData(logs);
});

test("deduped event logs skip and does not push", async () => {
  const fetchImpl = async (url, init) => {
    const href = String(url);
    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (href.includes("api.airtable.com") && init?.method === "GET") {
      return new Response(JSON.stringify({ records: [{ id: "recExisting123" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const { payload, logs, calls } = await captureWebhook(
    { events: [lineTextEventWithoutReply("Hi Per")] },
    { ...BASE_ENV, AIRTABLE_API_KEY: "airtable-key", AIRTABLE_BASE_ID: "base-id", AIRTABLE_SYNC_TABLE: "Console Inbox" },
    fetchImpl,
  );

  assert.equal(payload.saved[0].deduped, true);
  assert.equal(payload.saved[0].pushed, false);
  assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 0);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "deduped"), true);
  assertNoSensitiveLogData(logs);
});

test("unsupported message type logs skip", async () => {
  const { logs, calls } = await captureWebhook({ events: [lineImageEvent()] });

  assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 0);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "unsupported_message_type"), true);
  assertNoSensitiveLogData(logs);
});

test("unsupported event type logs skip", async () => {
  const { logs, calls } = await captureWebhook({ events: [{ type: "follow", source: { type: "user", userId: LINE_USER_ID } }] });

  assert.equal(calls.filter((call) => call.url.includes("/message/push")).length, 0);
  assert.equal(hasLog(logs, "line_public_trigger_skip", "unsupported_event_type"), true);
  assertNoSensitiveLogData(logs);
});

test("allowlisted Kenji knowledge reply uses published safe answer", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });

    if (href.includes("/profile/")) {
      return new Response(JSON.stringify({ displayName: "Client" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (href.includes("/v1/internal/kenji/knowledge/published")) {
      return new Response(JSON.stringify({
        ok: true,
        cards: [{
          id: "card-payment",
          title: "ส่งสลิปแล้วต้องรอไหม",
          lane: "Payment",
          audience: "public_member",
          language: "th",
          customer_question_examples: ["ส่งสลิปแล้วต้องรอไหม"],
          kenji_safe_answer: "ได้รับหลักฐานแล้วครับ MMD ต้องตรวจจากระบบทางการก่อนอัปเดตสถานะนะครับ",
          related_routes: ["/sigil/confirm/payment-confirmation"],
          status: "published",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (href.includes("/message/reply")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const response = await worker.fetch(await signedLineRequest({ events: [lineTextEvent("Hi MMD ส่งสลิปแล้วต้องรอไหม")] }), {
      ...BASE_ENV,
      LINE_KENJI_KNOWLEDGE_ENABLED: "true",
      LINE_KENJI_KNOWLEDGE_ALLOWLIST: LINE_USER_ID,
      KENJI_KNOWLEDGE_BASE_URL: "https://admin-worker.test",
      KENJI_KNOWLEDGE_INTERNAL_TOKEN: "internal-test-token",
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.saved[0].replied, true);

    const replyBodies = calls
      .filter((call) => call.url.includes("/message/reply"))
      .map((call) => JSON.parse(call.init.body));
    assert.equal(replyBodies.length, 1);
    assert.match(replyBodies[0].messages[0].text, /ได้รับหลักฐานแล้วครับ/);
    assert.doesNotMatch(replyBodies[0].messages[0].text, /admin-worker|KV|card-payment|internal/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
