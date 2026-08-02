#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";
import {
  buildModelSessionTelegramPayload,
  isModelSessionTelegramEventAllowed,
} from "./src/modelSessionTelegram.js";

const CONFIRM_KEY = "telegram_session_confirm_key";
const BASE_ENV = {
  CONFIRM_KEY,
  INTERNAL_TOKEN: "telegram_internal_token",
  AIRTABLE_API_KEY: "airtable_key",
  AIRTABLE_BASE_ID: "appTelegramSession",
  AIRTABLE_TABLE_SESSIONS: "sessions",
  AT_SESSIONS__STATE: "state",
  AT_SESSIONS__MODEL_RECORD_ID: "model_record_id",
  AT_SESSIONS__MODEL_TELEGRAM_CHAT_ID: "model_telegram_chat_id",
  TELEGRAM_INTERNAL_SEND_URL: "https://telegram.test/telegram/internal/send",
  MODEL_SESSION_PUBLIC_BASE_URL: "https://console.test",
  MODEL_SESSION_EMERGENCY_CHAT_ID: "ops_chat",
  MODEL_SESSION_EMERGENCY_THREAD_ID: "911",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function sessionRecord(state = "offered") {
  return {
    id: "recSessionTelegram",
    fields: {
      session_id: "session_telegram",
      payment_ref: "payment_telegram",
      model_record_id: "model_telegram",
      model_telegram_chat_id: "model_chat",
      state,
    },
  };
}

function installFetchMock(state = "offered") {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.clone().json().catch(() => null) : null;
    calls.push({ url: request.url, method: request.method, body });
    if (url.hostname === "api.airtable.com") return jsonResponse({ records: [sessionRecord(state)] });
    if (url.hostname === "telegram.test") return jsonResponse({ ok: true, result: { message_id: 1 } });
    throw new Error(`unexpected_fetch:${request.url}`);
  };
  return { calls, restore: () => { globalThis.fetch = previous; } };
}

function base64UrlEncode(input) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signedSessionToken(state = "work_started") {
  const encoded = base64UrlEncode(JSON.stringify({
    kind: "model_session",
    role: "model",
    session_id: "session_telegram",
    payment_ref: "payment_telegram",
    model_record_id: "model_telegram",
    state,
    exp: Math.floor(Date.now() / 1000) + 600,
  }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(CONFIRM_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${encoded}.${hex}`;
}

test("notification templates enforce their authoritative session states", () => {
  assert.equal(isModelSessionTelegramEventAllowed("job_offer", "offered"), true);
  assert.equal(isModelSessionTelegramEventAllowed("job_offer", "confirmed"), false);
  assert.equal(isModelSessionTelegramEventAllowed("travel_reminder", "en_route"), true);
  assert.equal(isModelSessionTelegramEventAllowed("final_payment_confirmed", "final_payment_pending"), false);
  assert.equal(isModelSessionTelegramEventAllowed("emergency_alert", "work_started"), true);
});

test("model notification payload contains only template copy and a console link", () => {
  const built = buildModelSessionTelegramPayload({
    event: "job_offer",
    state: "offered",
    chatId: "model_chat",
    modelSessionUrl: "https://console.test/v1/model/session/current?t=signed",
  });
  assert.equal(built.ok, true);
  assert.equal(built.payload.chat_id, "model_chat");
  assert.match(built.payload.text, /New Job Offer/);
  assert.doesNotMatch(built.payload.text, /session_telegram|payment_telegram|customer/i);
  assert.equal(built.payload.reply_markup.inline_keyboard[0][0].url, "https://console.test/v1/model/session/current?t=signed");

  for (const [event, state, title] of [
    ["travel_reminder", "confirmed", "Travel Reminder"],
    ["final_payment_confirmed", "final_payment_confirmed", "Final Payment Confirmed"],
  ]) {
    const payload = buildModelSessionTelegramPayload({
      event,
      state,
      chatId: "model_chat",
      modelSessionUrl: "https://console.test/v1/model/session/current?t=signed",
    });
    assert.equal(payload.ok, true);
    assert.match(payload.payload.text, new RegExp(title));
    assert.doesNotMatch(payload.payload.text, /session_telegram|payment_telegram|customer/i);
  }
});

test("authenticated job offer event sends a short-lived signed model link", async () => {
  const mock = installFetchMock("offered");
  try {
    const response = await worker.fetch(new Request("https://admin.test/v1/admin/model/session/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Confirm-Key": CONFIRM_KEY },
      body: JSON.stringify({ event: "job_offer", session_id: "session_telegram" }),
    }), BASE_ENV);
    assert.equal(response.status, 200);
    const telegram = mock.calls.find((call) => call.url.startsWith(BASE_ENV.TELEGRAM_INTERNAL_SEND_URL));
    assert.ok(telegram);
    const link = new URL(telegram.body.reply_markup.inline_keyboard[0][0].url);
    const [encoded] = link.searchParams.get("t").split(".");
    const payload = JSON.parse(Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    assert.ok(ttl > 0 && ttl <= 600, `ttl=${ttl}`);
    assert.equal(payload.model_record_id, "model_telegram");
  } finally {
    mock.restore();
  }
});

test("payment notification fails closed until authoritative state is confirmed", async () => {
  const mock = installFetchMock("final_payment_pending");
  try {
    const response = await worker.fetch(new Request("https://admin.test/v1/admin/model/session/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Confirm-Key": CONFIRM_KEY },
      body: JSON.stringify({ event: "final_payment_confirmed", session_id: "session_telegram" }),
    }), BASE_ENV);
    assert.equal(response.status, 409);
    assert.equal(mock.calls.some((call) => call.url.startsWith(BASE_ENV.TELEGRAM_INTERNAL_SEND_URL)), false);
  } finally {
    mock.restore();
  }
});

test("emergency action routes to the MMD emergency chat without mutating session state", async () => {
  const mock = installFetchMock("work_started");
  try {
    const t = await signedSessionToken();
    const response = await worker.fetch(new Request("https://admin.test/v1/model/session/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t, action: "emergency" }),
    }), BASE_ENV);
    assert.equal(response.status, 200);
    const telegram = mock.calls.find((call) => call.url.startsWith(BASE_ENV.TELEGRAM_INTERNAL_SEND_URL));
    assert.equal(telegram.body.chat_id, "ops_chat");
    assert.equal(telegram.body.message_thread_id, "911");
    assert.match(telegram.body.text, /Emergency Alert/);
    assert.equal(mock.calls.some((call) => call.method === "PATCH"), false);
  } finally {
    mock.restore();
  }
});
