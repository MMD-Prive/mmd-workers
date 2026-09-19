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

  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 3100 + sends.length } });
  };

  try {
    const response = await worker.fetch(req("งานมีปัญหา น้องยังไม่มา"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          handoffBody = JSON.parse(await request.clone().text());
          return Response.json({
            ok: true,
            state: "handoff_ready",
            target: "per",
            handoff_id: "HYPE-HANDOFF-RECOVERY-123",
            display_name: "ลูกค้า A",
            line_continuity_ready: true,
            operator_summary: "Recovery case · active job · customer reports model has not arrived.",
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_supervised_handoff");
    assert.equal(body.target, "per");
    assert.equal(handoffBody.reason, "customer_service_recovery");
    assert.match(handoffBody.customer_message, /น้องยังไม่มา/);
    assert.equal(body.operator_notified, true);

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

test("HYPE closed-loop awareness never invents operator acknowledgement", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3005 } });
  };

  try {
    const response = await worker.fetch(req("เรื่องที่ส่งให้เปอร์ถึงไหนแล้ว"), env());
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_handoff_status_awareness");
    assert.match(sent.text, /จะไม่อ้างว่า Per\/Kenji รับเรื่องหรือเคสจบแล้ว/);
    assert.match(sent.text, /acknowledgement\/review state/);
    assert.doesNotMatch(sent.text, /รับเรื่องแล้ว|แก้เสร็จแล้ว|resolved ✅/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
