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
  const response = await worker.fetch(await signedLineRequest({ events: [] }), BASE_ENV);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    worker: "member-dashboard-chat-worker",
    route: "line_webhook",
    events: 0,
    saved: [],
  });
});

test("routed Worker delegates a verified webhook to the authoritative HTTPS upstream", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (url, init) => {
    forwarded = { url: String(url), init };
    return new Response(JSON.stringify({ ok: true, events: 1 }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const request = await signedLineRequest({ events: [lineTextEvent("ส่งสลิป")] });
    const signature = request.headers.get("x-line-signature");
    const response = await worker.fetch(request, { ...BASE_ENV, LINE_WEBHOOK_UPSTREAM_URL: "https://mmdhome.netlify.app/.netlify/functions/webhook" });
    assert.equal(response.status, 200);
    assert.equal(forwarded.url, "https://mmdhome.netlify.app/.netlify/functions/webhook");
    assert.equal(forwarded.init.headers["x-line-signature"], signature);
    assert.equal(forwarded.init.headers["x-mmd-forwarded-by"], "member-dashboard-chat-worker");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("routed Worker fails closed when the configured upstream is invalid or unavailable", async () => {
  const invalid = await worker.fetch(await signedLineRequest({ events: [] }), { ...BASE_ENV, LINE_WEBHOOK_UPSTREAM_URL: "http://not-secure.test/webhook" });
  assert.equal(invalid.status, 503);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network unavailable"); };
  try {
    const unavailable = await worker.fetch(await signedLineRequest({ events: [] }), { ...BASE_ENV, LINE_WEBHOOK_UPSTREAM_URL: "https://upstream.test/webhook" });
    assert.equal(unavailable.status, 502);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
