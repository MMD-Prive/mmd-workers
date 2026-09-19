import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const WEBHOOK_URL = "https://telegram-worker.mmd.test/telegram/webhook";
const INTERNAL_SEND_URL = "https://telegram-worker.mmd.test/telegram/internal/send";
const COMPLAINT_URL = "https://telegram-worker.mmd.test/telegram/internal/complaint";
const PREVIEW_POST_URL = "https://telegram-worker.mmd.test/telegram/preview/post";
const TOPIC_SMOKE_URL = "https://telegram-worker.mmd.test/telegram/internal/topics/smoke";

function env(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    INTERNAL_API_TOKEN: "internal-secret",
    AUTH_SERVICE_BOOKING_TO_TELEGRAM: "booking-service-secret",
    AUTH_SERVICE_EVENTS_TO_TELEGRAM: "events-service-secret",
    AUTH_SERVICE_STUDIO_TO_TELEGRAM: "studio-service-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_PREVIEW_CHANNEL_ID: "-100123",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    ...overrides,
  };
}

function webhookRequest(headers = {}) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 10,
        text: "hello",
        chat: { id: 999 },
        from: { id: 111 },
      },
    }),
  });
}

function internalSendRequest(body, headers = {}) {
  return new Request(INTERNAL_SEND_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer internal-secret",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function bookingPayload() {
  return {
    chat_id: "-1003546439681",
    message_thread_id: "1399",
    thread_id: "1399",
    text: "🕯️ <b>MMD Booking Draft</b>",
    parse_mode: "HTML",
    disable_web_page_preview: true,
    source: "sigil_booking_worker",
    intent: "booking_draft_notify",
  };
}

function expectedCareBackKeyboard(baseUrl = "https://www.mmdbkk.com", previewChannelUrl = "https://t.me/MMDPriveTH") {
  return [
    [{
      text: "🎁 CARE BACK Phase 2 · เช็กสิทธิ์",
      url: `${baseUrl}/promotion/6-years-care-back`,
    }],
    [{
      text: "MY MMD / Status",
      url: `${baseUrl}/member/dashboard`,
    }],
    [{
      text: "Preview Models",
      url: `${baseUrl}/profiles`,
    }, {
      text: "Apply / Renew Membership",
      url: `${baseUrl}/sigil/member/membership`,
    }],
    [{
      text: "Help / How It Works",
      url: `${baseUrl}/promotion/6-years-care-back#how-it-works`,
    }],
    [{
      text: "Back to Preview Channel",
      url: previewChannelUrl,
    }],
  ];
}

function flattenKeyboardUrls(replyMarkup) {
  return replyMarkup.inline_keyboard.flat().map((button) => button.url);
}

test("/telegram/webhook rejects missing secret token when configured", async () => {
  const response = await worker.fetch(webhookRequest(), env());
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, { ok: false, error: "unauthorized" });
  assert.doesNotMatch(JSON.stringify(body), /expected-secret|X-Telegram-Bot-Api-Secret-Token/i);
});

test("/telegram/webhook rejects wrong secret token when configured", async () => {
  const response = await worker.fetch(
    webhookRequest({ "X-Telegram-Bot-Api-Secret-Token": "wrong-secret" }),
    env(),
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, { ok: false, error: "unauthorized" });
  assert.doesNotMatch(JSON.stringify(body), /expected-secret|wrong-secret|X-Telegram-Bot-Api-Secret-Token/i);
});

test("/telegram/webhook with correct secret token reaches update handler", async () => {
  const response = await worker.fetch(
    webhookRequest({ "X-Telegram-Bot-Api-Secret-Token": "expected-secret" }),
    env(),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.received, true);
  assert.equal(body.handled, false);
  assert.equal(body.reason, "no_matching_command");
});

test("/telegram/webhook remains open when secret token is not configured", async () => {
  const response = await worker.fetch(
    webhookRequest(),
    env({ TELEGRAM_WEBHOOK_SECRET_TOKEN: "" }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reason, "no_matching_command");
});

test("/telegram/internal/send rejects missing internal token", async () => {
  const response = await worker.fetch(new Request(INTERNAL_SEND_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: "-1003546439681",
      message_thread_id: "1399",
      text: "booking draft",
    }),
  }), env());
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "internal_token_required");
});

test("/telegram/internal/send fails closed when no internal credentials are configured", async () => {
  const response = await worker.fetch(new Request(INTERNAL_SEND_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "must not send" }),
  }), env({
    INTERNAL_API_TOKEN: "",
    AUTH_SERVICE_BOOKING_TO_TELEGRAM: "",
    AUTH_SERVICE_EVENTS_TO_TELEGRAM: "",
    AUTH_SERVICE_STUDIO_TO_TELEGRAM: "",
  }));

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "internal_token_required");
});

test("health publishes the canonical MMD topic registry", async () => {
  const response = await worker.fetch(new Request("https://telegram-worker.mmd.test/health"), env());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.telegram_topics.map(({ key, thread_id }) => [key, thread_id]), [
    ["booking", 1399],
    ["membership", 20],
    ["points", 17],
    ["payment", 22],
    ["alerts", 9],
    ["public_model", 155],
    ["himai_orders", 157],
    ["himai_payments", 158],
    ["himai_alerts", 159],
    ["mmd_shop_orders", 160],
    ["mmd_shop_payments", 161],
    ["mmd_shop_alerts", 162],
    ["legacy_archive", 134],
    ["rules_model", 39],
    ["rules_customer", 29],
  ]);
});

test("topic smoke is owner-internal only and requires explicit confirmation", async () => {
  const missingAuth = await worker.fetch(new Request(TOPIC_SMOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: "SEND_REDACTED_TOPIC_SMOKE" }),
  }), env());
  assert.equal(missingAuth.status, 403);

  const missingConfirmation = await worker.fetch(new Request(TOPIC_SMOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Internal-Token": "internal-secret" },
    body: "{}",
  }), env());
  assert.equal(missingConfirmation.status, 400);
  assert.equal((await missingConfirmation.json()).error, "topic_smoke_confirmation_required");
});

test("topic smoke sends one silent redacted check to every canonical topic", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const telegramBodies = [];
  globalThis.fetch = async (_url, init = {}) => {
    const requestBody = JSON.parse(String(init.body || "{}"));
    telegramBodies.push(requestBody);
    return Response.json({
      ok: true,
      result: { message_id: 100 + telegramBodies.length, message_thread_id: requestBody.message_thread_id },
    });
  };

  try {
    const response = await worker.fetch(new Request(TOPIC_SMOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Internal-Token": "internal-secret" },
      body: JSON.stringify({ confirm: "SEND_REDACTED_TOPIC_SMOKE", disable_notification: true }),
    }), env({ TELEGRAM_CHAT_ID: "-1003546439681" }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.tested, 15);
    assert.equal(body.passed, 15);
    assert.equal(body.failed, 0);
    assert.deepEqual(
      telegramBodies.map((item) => item.message_thread_id),
      [1399, 20, 17, 22, 9, 155, 157, 158, 159, 160, 161, 162, 134, 39, 29],
    );
    assert.equal(telegramBodies.every((item) => item.disable_notification === true), true);
    assert.equal(telegramBodies.every((item) => item.text.includes("no customer data")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("/telegram/internal/send rejects an invalid internal token", async () => {
  const response = await worker.fetch(internalSendRequest(bookingPayload(), {
    authorization: "Bearer wrong-secret",
  }), env());
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "internal_token_required");
});

test("/telegram/internal/send accepts bearer auth and preserves explicit booking topic", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let telegramRequest = null;

  globalThis.fetch = async (url, init = {}) => {
    telegramRequest = {
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: JSON.parse(String(init.body || "{}")),
    };
    return new Response(JSON.stringify({
      ok: true,
      result: {
        message_id: 77,
        chat: { id: -1003546439681 },
        message_thread_id: 1399,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await worker.fetch(internalSendRequest(bookingPayload()), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.telegram.ok, true);
    assert.match(telegramRequest.url, /api\.telegram\.org\/bottelegram-token\/sendMessage$/);
    assert.equal(telegramRequest.method, "POST");
    assert.deepEqual(telegramRequest.body, {
      chat_id: "-1003546439681",
      text: "🕯️ <b>MMD Booking Draft</b>",
      parse_mode: "HTML",
      disable_web_page_preview: true,
      message_thread_id: 1399,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("/telegram/internal/send accepts dedicated Booking service auth", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let telegramRequest = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegramRequest = JSON.parse(String(init.body || "{}"));
    return new Response(JSON.stringify({
      ok: true,
      result: {
        message_id: 78,
        chat: { id: -1003546439681 },
        message_thread_id: 1399,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await worker.fetch(internalSendRequest(bookingPayload(), {
      authorization: "",
      "X-Internal-Token": "booking-service-secret",
    }), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.telegram.ok, true);
    assert.equal(telegramRequest.message_thread_id, 1399);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dedicated Booking auth does not unlock complaint route", async () => {
  const response = await worker.fetch(new Request(COMPLAINT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Token": "booking-service-secret",
    },
    body: JSON.stringify({ complaint_id: "test-complaint" }),
  }), env());
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "internal_token_required");
});

test("complaint alert is connected to the canonical Alerts topic", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let telegramBody = null;
  globalThis.fetch = async (_url, init = {}) => {
    telegramBody = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 91, message_thread_id: 9 } });
  };

  try {
    const response = await worker.fetch(new Request(COMPLAINT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Internal-Token": "internal-secret" },
      body: JSON.stringify({ complaint_id: "recovery_test", statement: "Synthetic only" }),
    }), env({ TELEGRAM_CHAT_ID: "-1003546439681" }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(telegramBody.message_thread_id, 9);
    assert.match(telegramBody.text, /SIGIL Recovery Report/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dedicated Booking auth does not unlock preview route", async () => {
  const response = await worker.fetch(new Request(PREVIEW_POST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Token": "booking-service-secret",
    },
    body: JSON.stringify({ dry_run: true }),
  }), env());
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error, "internal_token_required");
});

for (const [service, secret] of [
  ["Events", "events-service-secret"],
  ["Studio", "studio-service-secret"],
]) {
  test(`dedicated ${service} auth is scoped to the canonical internal send route`, { concurrency: false }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({
      ok: true,
      result: { message_id: 80, chat: { id: -1003546439681 } },
    });

    try {
      const send = await worker.fetch(internalSendRequest({ text: `${service} notification` }, {
        authorization: "",
        "X-Internal-Token": secret,
      }), env());
      assert.equal(send.status, 200);

      for (const url of [COMPLAINT_URL, PREVIEW_POST_URL]) {
        const denied = await worker.fetch(new Request(url, {
          method: "POST",
          headers: { "content-type": "application/json", "X-Internal-Token": secret },
          body: "{}",
        }), env());
        assert.equal(denied.status, 403);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test("/telegram/internal/send fails closed when Telegram rejects direct topic delivery", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    error_code: 400,
    description: "Bad Request: message thread not found",
  }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });

  try {
    const response = await worker.fetch(internalSendRequest(bookingPayload()), env());
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.error, "server_error");
    assert.match(body.detail, /^telegram_direct_send_failed:/);
    assert.match(body.detail, /message thread not found/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("/telegram/preview/post remains protected by INTERNAL_API_TOKEN", async () => {
  const missing = await worker.fetch(new Request(PREVIEW_POST_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dry_run: true }),
  }), env());
  const missingBody = await missing.json();

  assert.equal(missing.status, 403);
  assert.equal(missingBody.error, "internal_token_required");

  const allowed = await worker.fetch(new Request(PREVIEW_POST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Token": "internal-secret",
    },
    body: JSON.stringify({ dry_run: true }),
  }), env());
  const allowedBody = await allowed.json();

  assert.equal(allowed.status, 200);
  assert.equal(allowedBody.ok, true);
  assert.equal(allowedBody.dry_run, true);
  assert.match(allowedBody.text, /CARE BACK CONTINUES/);
  assert.match(allowedBody.text, /30 กันยายน 2026/);
  assert.match(allowedBody.text, /Birthday Wish/);
  assert.match(allowedBody.text, /ส่วนลดสูงสุด 10%/);
  assert.match(allowedBody.text, /ไม่สร้าง claim \/ coupon \/ points bonus ซ้ำ/);
  assert.doesNotMatch(allowedBody.text, /โค้ดส่วนตัวจะแสดงหลังจากระบบตรวจสอบข้อมูลสำเร็จแล้วเท่านั้น/);
  assert.deepEqual(allowedBody.reply_markup.inline_keyboard, expectedCareBackKeyboard());
  const urls = flattenKeyboardUrls(allowedBody.reply_markup);
  assert.deepEqual(urls.filter((url) => url.includes("/sigil/")), ["https://www.mmdbkk.com/sigil/member/membership"]);
  assert.equal(urls.some((url) => url.includes("/pay/membership")), false);
});

test("/telegram/preview/post uses configured public and preview channel URLs", async () => {
  const response = await worker.fetch(new Request(PREVIEW_POST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Token": "internal-secret",
    },
    body: JSON.stringify({ dry_run: true }),
  }), env({
    MMD_PUBLIC_BASE_URL: "https://mmd.example",
    TELEGRAM_PREVIEW_CHANNEL_URL: "https://t.me/examplePreview",
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.reply_markup.inline_keyboard, expectedCareBackKeyboard("https://mmd.example", "https://t.me/examplePreview"));
  const urls = flattenKeyboardUrls(body.reply_markup);
  assert.deepEqual(urls.filter((url) => url.includes("/sigil/")), ["https://mmd.example/sigil/member/membership"]);
  assert.equal(urls.some((url) => url.includes("/pay/membership")), false);
});


test("/start preview requires verification and never issues a code or writes preview KV", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const kvCalls = [];
  let telegramBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegramBody = JSON.parse(String(init.body || "{}"));
    return new Response(JSON.stringify({
      ok: true,
      result: { message_id: 88, chat: { id: 999 } },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const previewKv = {
    async get(...args) {
      kvCalls.push(["get", ...args]);
      return null;
    },
    async put(...args) {
      kvCalls.push(["put", ...args]);
    },
  };

  try {
    const response = await worker.fetch(new Request(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
      },
      body: JSON.stringify({
        update_id: 2,
        message: {
          message_id: 11,
          text: "/start preview",
          chat: { id: 999 },
          from: { id: 111, username: "member" },
        },
      }),
    }), env({ PREVIEW_PROMO_CODES_KV: previewKv }));

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.handled, true);
    assert.equal(body.flow, "preview_start");
    assert.equal(body.code_status, "verification_required");
    assert.deepEqual(kvCalls, []);
    assert.match(telegramBody.text, /PHASE 2/);
    assert.match(telegramBody.text, /1–30 กันยายน 2026/);
    assert.match(telegramBody.text, /Birthday Wish/);
    assert.match(telegramBody.text, /ส่วนลดสูงสุด 10%/);
    assert.match(telegramBody.text, /ไม่ได้สร้างสิทธิ์ซ้ำ/);
    assert.doesNotMatch(telegramBody.text, /โค้ดส่วนตัวจะแสดงหลังจากระบบตรวจสอบข้อมูลสำเร็จแล้วเท่านั้น/);
    assert.doesNotMatch(telegramBody.text, /เข้าสู่ระบบเรียบร้อย|\\b[A-HJ-NP-Z2-9]{6}\\b/);
    assert.deepEqual(telegramBody.reply_markup.inline_keyboard, expectedCareBackKeyboard());
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("HYPE /status reads customer-safe live context only in private chat", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let telegramBody = null;
  let operationsBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegramBody = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 501, chat: { id: 999 } } });
  };

  const hypeOperations = {
    async fetch(request) {
      operationsBody = await request.json();
      return Response.json({
        ok: true,
        state: "ready",
        readiness: "blocked",
        display_name: "คุณเอ็ม",
        membership: {
          status: "active",
          lifecycle: "active",
          level: "private_premium",
          expire_at: "2028-09-19T00:00:00.000Z",
          blocked: false,
        },
        job: {
          status: "active_or_pending",
          active_count: 1,
          next: {
            status: "awaiting_payment",
            model_name: "Book EI",
            start_at: "2026-09-24T19:00:00+07:00",
            payment_state: "pending_review",
          },
        },
        payment: {
          status: "pending_review",
          paid: false,
          review_required: true,
          outstanding_amount_thb: 5000,
          credit_balance_thb: 1500,
        },
        next_action: {
          action: "review_payment",
          label: "ตรวจหลักฐานการชำระเงิน",
          href: "",
        },
      });
    },
  };

  try {
    const response = await worker.fetch(new Request(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
      },
      body: JSON.stringify({
        update_id: 9001,
        message: {
          message_id: 120,
          text: "/status",
          chat: { id: 999, type: "private" },
          from: { id: 111111, username: "member" },
        },
      }),
    }), env({ HYPE_OPERATIONS: hypeOperations }));

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.handled, true);
    assert.equal(body.flow, "hype_operating_status");
    assert.equal(body.ok, true);
    assert.equal(operationsBody.telegram_user_id, "111111");
    assert.equal(operationsBody.intent.trigger, "telegram_status");
    assert.match(telegramBody.text, /HYPE · MMD STATUS/);
    assert.match(telegramBody.text, /Premium/);
    assert.match(telegramBody.text, /1 งานกำลังดำเนินการ/);
    assert.match(telegramBody.text, /รอตรวจสอบหลักฐาน/);
    assert.match(telegramBody.text, /ตรวจหลักฐานการชำระเงิน/);
    assert.doesNotMatch(telegramBody.text, /canonical_client_id|payment_ref|airtable|internal\/admin/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE never exposes customer status in a Telegram group", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let operationsCalled = false;
  let telegramBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegramBody = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 502, chat: { id: -1001 } } });
  };

  try {
    const response = await worker.fetch(new Request(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
      },
      body: JSON.stringify({
        update_id: 9002,
        message: {
          message_id: 121,
          text: "สถานะ",
          chat: { id: -1001, type: "supergroup" },
          from: { id: 111111, username: "member" },
        },
      }),
    }), env({
      HYPE_OPERATIONS: {
        async fetch() {
          operationsCalled = true;
          throw new Error("must not call");
        },
      },
    }));

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.handled, true);
    assert.equal(body.flow, "hype_operating_private_required");
    assert.equal(operationsCalled, false);
    assert.match(telegramBody.text, /ข้อมูลส่วนตัว/);
    assert.match(telegramBody.text, /\/status/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE /next fails closed to MY MMD when Telegram identity is not linked", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let telegramBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegramBody = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 503, chat: { id: 999 } } });
  };

  try {
    const response = await worker.fetch(new Request(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
      },
      body: JSON.stringify({
        update_id: 9003,
        message: {
          message_id: 122,
          text: "/next",
          chat: { id: 999, type: "private" },
          from: { id: 111111, username: "member" },
        },
      }),
    }), env({
      HYPE_OPERATIONS: {
        async fetch() {
          return Response.json({
            ok: false,
            state: "connect_required",
            code: "telegram_identity_not_linked",
          }, { status: 404 });
        },
      },
    }));

    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.handled, true);
    assert.equal(body.code_status, "connect_required");
    assert.match(telegramBody.text, /Connect Telegram/);
    const urls = telegramBody.reply_markup.inline_keyboard.flat().map((item) => item.url);
    assert.equal(urls.some((url) => /\/my-mmd\/$/.test(url)), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
