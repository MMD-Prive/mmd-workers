import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

const WEBHOOK = "https://telegram-worker.mmd.test/telegram/webhook";

function env(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_CHAT_ID: "-1003546439681",
    TG_THREAD_BOOKING_DRAFT: "1399",
    TELEGRAM_STANDARD_GROUP_ID: "-1002073919780",
    ...overrides,
  };
}

function request(text, chat = { id: 111111, type: "private" }) {
  return new Request(WEBHOOK, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
    },
    body: JSON.stringify({
      update_id: 9950,
      message: {
        message_id: 250,
        text,
        chat,
        from: { id: 111111, username: "member" },
      },
    }),
  });
}

test("P6 /submit executes through admin binding, alerts Ops once, and returns bounded receipt", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  let rpcBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 2000 + sends.length, chat: { id: Number(payload.chat_id) } } });
  };

  try {
    const response = await worker.fetch(request("/submit"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          rpcBody = JSON.parse(await req.clone().text());
          return Response.json({
            ok: true,
            state: "materialized",
            replayed: false,
            mode: "booking",
            execution: {
              schema: "mmd.hype_supervised_execution.v1",
              execution_id: "HYPE-EXEC-BOOKING-abcdef1234567890",
              draft_id: "HYPE-DRAFT-BOOKING-ABC123",
              mode: "booking",
              status: "materialized",
              authority: "sigil-booking-worker",
              canonical_ref: "kenji_ref_123",
              canonical_href: "/booking",
              replay_safe: true,
            },
            ops_alert: {
              flow: "booking",
              title: "HYPE P6 · BOOKING REQUEST MATERIALIZED",
              ref: "kenji_ref_123",
            },
            customer_message: "สร้าง canonical Booking Request draft แล้วครับ ยังไม่ใช่การ confirm งาน/Model/Payment",
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_supervised_execution");
    assert.equal(body.ok, true);
    assert.equal(body.code_status, "materialized");
    assert.equal(body.operator_notified, true);
    assert.equal(rpcBody.operation, "execute");
    assert.equal(rpcBody.telegram_user_id, "111111");

    assert.equal(sends.length, 2);
    const ops = sends.find((item) => String(item.chat_id) === "-1003546439681");
    const customer = sends.find((item) => String(item.chat_id) === "111111");
    assert.ok(ops);
    assert.ok(customer);
    assert.equal(Number(ops.message_thread_id), 1399);
    assert.match(ops.text, /BOOKING REQUEST MATERIALIZED/);
    assert.match(customer.text, /P6 Booking/);
    assert.match(customer.text, /canonical Booking Request draft/);
    assert.match(customer.text, /final confirmation\/payment\/membership\/assignment/);
    assert.doesNotMatch(customer.text, /confirm งานแล้ว|payment confirmed|model assigned/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P6 idempotent replay does not send a duplicate Ops alert", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];

  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 2100 + sends.length } });
  };

  try {
    const response = await worker.fetch(request("/submit"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch() {
          return Response.json({
            ok: true,
            state: "idempotent_replay",
            replayed: true,
            mode: "mms",
            execution: {
              execution_id: "HYPE-EXEC-MMS-abcdef1234567890",
              mode: "mms",
              status: "materialized",
              authority: "mms-worker",
              canonical_ref: "mmspre_1234567890abcdef12345678",
              canonical_href: "/male-massage/member/mms-booking",
              replay_safe: true,
            },
            ops_alert: {
              flow: "alerts",
              title: "HYPE P6 · MMS PREBOOKING MATERIALIZED",
            },
            customer_message: "สร้าง MMS canonical pre-booking แล้วครับ",
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.replayed, true);
    assert.equal(body.operator_notified, false);
    assert.equal(sends.length, 1);
    assert.equal(String(sends[0].chat_id), "111111");
    assert.match(sends[0].text, /ไม่สร้างรายการซ้ำ/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P6 /progress reads execution receipt without creating a new execution", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let rpcBody = null;
  let sent = null;

  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 2201 } });
  };

  try {
    const response = await worker.fetch(request("/progress"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          rpcBody = JSON.parse(await req.clone().text());
          return Response.json({
            ok: true,
            state: "execution_recorded",
            mode: "renewal",
            execution: {
              execution_id: "HYPE-EXEC-RENEWAL-abcdef1234567890",
              mode: "renewal",
              status: "queued",
              authority: "membership_authority",
              canonical_href: "/sigil/member/membership?intent=renew",
              replay_safe: true,
            },
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_supervised_execution_status");
    assert.equal(rpcBody.operation, "status");
    assert.match(sent.text, /Status:<\/b> queued/);
    assert.match(sent.text, /HYPE-EXEC-RENEWAL/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P6 /submit in a member group never reads or executes transaction context", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  let sent = null;

  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 2301 } });
  };

  try {
    const response = await worker.fetch(request(
      "/submit",
      { id: -1002073919780, type: "supergroup" },
    ), env({
      HYPE_CONTEXT_WRITER: {
        async fetch() {
          called = true;
          throw new Error("must not execute from group");
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_operating_private_required");
    assert.equal(called, false);
    assert.match(sent.text, /private chat/);
    assert.match(sent.text, /\/submit/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
