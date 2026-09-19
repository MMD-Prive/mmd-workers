import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

const WEBHOOK_URL = "https://telegram-worker.mmd.test/telegram/webhook";

function env(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_CHAT_ID: "-1003546439681",
    TELEGRAM_STANDARD_GROUP_ID: "-1002073919780",
    MMD_PUBLIC_BASE_URL: "https://www.mmdbkk.com",
    ...overrides,
  };
}

function req(text, {
  chatId = 111111,
  chatType = "private",
  fromId = 111111,
} = {}) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
    },
    body: JSON.stringify({
      update_id: 12000,
      message: {
        message_id: 300,
        text,
        chat: { id: chatId, type: chatType },
        from: { id: fromId, username: "member" },
      },
    }),
  });
}

test("HYPE capability pack routes Shop Orders without inventing inline order truth", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3001 } });
  };

  try {
    const response = await worker.fetch(req("GG Water ของผมถึงไหนแล้ว"), env());
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_orders_route");
    assert.match(sent.text, /MMD SHOP ORDERS/);
    assert.match(sent.text, /ไม่เดาสถานะจาก Telegram/);
    const urls = sent.reply_markup.inline_keyboard.flat().map((item) => item.url);
    assert.equal(urls.some((url) => new URL(url).pathname === "/my-mmd/orders"), true);
    assert.doesNotMatch(sent.text, /delivered|paid|จัดส่งแล้ว|ชำระแล้ว/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE Hall awareness is group-safe and never resolves private Client context", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  let operationsCalled = false;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3002 } });
  };

  try {
    const response = await worker.fetch(req("/hall", {
      chatId: -1002073919780,
      chatType: "supergroup",
    }), env({
      HYPE_OPERATIONS: {
        async fetch() {
          operationsCalled = true;
          throw new Error("Hall route must not read Client 360 in group");
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_hall_route");
    assert.equal(operationsCalled, false);
    assert.match(sent.text, /ไม่เดาเพศ\/ความสนใจ/);
    assert.match(sent.text, /Hall audience/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE bridges MMS Therapist options to HENNA/MMS authority instead of claiming confirmation", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3003 } });
  };

  try {
    const response = await worker.fetch(req("ช่วยหา therapist ที่เหมาะหน่อย"), env());
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_mms_options_bridge");
    assert.match(sent.text, /HENNA \/ MMS เป็น specialist owner/);
    assert.match(sent.text, /ยังไม่ถือว่า Confirm Therapist/);
    assert.doesNotMatch(sent.text, /ว่างแน่นอน|ยืนยัน Therapist แล้ว/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE service recovery creates a Per handoff with recovery reason and existing context", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  let handoffBody = null;
  let transitionBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 3100 + sends.length } });
  };

  try {
    const response = await worker.fetch(req("งานมีปัญหา น้องยังไม่มา"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          const payload = JSON.parse(await request.clone().text());
          if (pathname === "/__internal/hype/handoff") {
            handoffBody = payload;
            return Response.json({
              ok: true,
              state: "handoff_ready",
              target: "per",
              handoff_id: "HYPE-PER-20260919120000-deadbeef",
              display_name: "ลูกค้า A",
              line_continuity_ready: true,
              operator_summary: "Recovery case · active job · customer reports model has not arrived.",
            });
          }
          if (pathname === "/__internal/hype/handoff-status") {
            transitionBody = payload;
            return Response.json({
              ok: true,
              state: "sent",
              handoff_id: "HYPE-PER-20260919120000-deadbeef",
              target: "per",
            });
          }
          return Response.json({ ok: false, error: "unexpected_path" }, { status: 404 });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_supervised_handoff");
    assert.equal(body.target, "per");
    assert.equal(handoffBody.reason, "customer_service_recovery");
    assert.match(handoffBody.customer_message, /น้องยังไม่มา/);
    assert.equal(body.operator_notified, true);
    assert.equal(transitionBody.state, "sent");
    assert.equal(transitionBody.actor_role, "hype");

    const customer = sends.find((item) => String(item.chat_id) === "111111");
    const ops = sends.find((item) => String(item.chat_id) === "-1003546439681");
    assert.ok(customer);
    assert.ok(ops);
    assert.match(customer.text, /ส่งต่อให้ Per แล้ว/);
    assert.match(ops.text, /HYPE → PER HANDOFF/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("HYPE owner-only case command writes acknowledgement through the guarded handoff contract", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  let transition = null;

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/getChatMember")) {
      return Response.json({ ok: true, result: { status: "creator" } });
    }
    if (target.includes("/sendMessage")) {
      const payload = JSON.parse(String(init.body || "{}"));
      sends.push(payload);
      return Response.json({ ok: true, result: { message_id: 3301 } });
    }
    throw new Error(`unexpected fetch ${target}`);
  };

  try {
    const response = await worker.fetch(req("/case-ack HYPE-PER-20260919120000-deadbeef"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          transition = JSON.parse(await request.clone().text());
          return Response.json({
            ok: true,
            state: "acknowledged",
            handoff_id: "HYPE-PER-20260919120000-deadbeef",
            target: "per",
          });
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_owner_handoff_transition");
    assert.equal(body.ok, true);
    assert.equal(body.code_status, "acknowledged");
    assert.equal(transition.operation, "transition");
    assert.equal(transition.handoff_id, "HYPE-PER-20260919120000-deadbeef");
    assert.equal(transition.state, "acknowledged");
    assert.equal(transition.actor_role, "owner");
    assert.match(sends.at(-1).text, /รับทราบเคสแล้ว/);
    assert.match(sends.at(-1).text, /ไม่เปลี่ยน Payment \/ Job \/ Membership truth/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE rejects owner case state commands from non-owner Telegram users", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let contextCalled = false;
  let sent = null;

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/getChatMember")) {
      return Response.json({ ok: true, result: { status: "member" } });
    }
    if (target.includes("/sendMessage")) {
      sent = JSON.parse(String(init.body || "{}"));
      return Response.json({ ok: true, result: { message_id: 3302 } });
    }
    throw new Error(`unexpected fetch ${target}`);
  };

  try {
    const response = await worker.fetch(req("/case-resolve HYPE-PER-20260919120000-deadbeef"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch() {
          contextCalled = true;
          throw new Error("non-owner must not reach state writer");
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_owner_handoff_transition");
    assert.equal(body.ok, false);
    assert.equal(body.code_status, "owner_required");
    assert.equal(contextCalled, false);
    assert.match(sent.text, /เฉพาะ Per/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE /case reads the explicitly written closed-loop state without inventing resolution", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  let statusRead = null;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3005 } });
  };

  try {
    const response = await worker.fetch(req("เรื่องที่ส่งให้เปอร์ถึงไหนแล้ว"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          statusRead = JSON.parse(await request.clone().text());
          return Response.json({
            ok: true,
            state: "reviewing",
            tracking: true,
            handoff_id: "HYPE-PER-20260919120000-deadbeef",
            target: "per",
            updated_at: "2026-09-19T12:01:00.000Z",
          });
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_handoff_status");
    assert.equal(body.code_status, "reviewing");
    assert.equal(statusRead.operation, "read");
    assert.equal(statusRead.telegram_user_id, "111111");
    assert.match(sent.text, /ทีมกำลังตรวจสอบ/);
    assert.match(sent.text, /HYPE-PER-20260919120000-deadbeef/);
    assert.doesNotMatch(sent.text, /แจ้งลูกค้าแล้ว|แก้ไขแล้วและยืนยัน/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
