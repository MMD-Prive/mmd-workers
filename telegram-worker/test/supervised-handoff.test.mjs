import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

const WEBHOOK_URL = "https://telegram-worker.mmd.test/telegram/webhook";

function baseEnv(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_CHAT_ID: "-1003546439681",
    ...overrides,
  };
}

function request(text, fromId = 111111) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
    },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 10,
        text,
        chat: { id: fromId, type: "private" },
        from: { id: fromId, username: "customer" },
      },
    }),
  });
}

function handoffResult(target = "kenji") {
  return {
    ok: true,
    state: "handoff_ready",
    handoff_id: `HYPE-${target.toUpperCase()}-20260919120000-abc12345`,
    target,
    display_name: "Client A",
    canonical_client_id: "recClientA1",
    line_continuity_ready: true,
    line_identity_present: true,
    context: {
      state: "ready",
      membership: { level: "private_premium", lifecycle: "active" },
      job: { active_count: 1, next_status: "confirmed", model_name: "Model A", start_at: "2026-09-20T19:00:00+07:00" },
      payment: { status: "pending_review", paid: false, review_required: true, outstanding_amount_thb: 5000 },
      next_action: { action: "review_payment", label: "รอ MMD ตรวจหลักฐาน" },
    },
    operator_summary: [
      `HYPE → ${target === "kenji" ? "Kenji" : "Per"} handoff`,
      "Client: Client A",
      "Latest request: ขอคุยต่อ",
      "Payment: review_required",
      "Context is continuity-only. Refresh canonical truth before any protected action.",
    ].join("\n"),
  };
}

test("/kenji creates supervised handoff, notifies Ops, and tells customer they do not need to restart", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  const serviceCalls = [];

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    if (method !== "sendMessage") throw new Error(`unexpected telegram call ${method}`);
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 900 + sends.length } });
  };

  try {
    const response = await worker.fetch(request("/kenji"), baseEnv({
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          const pathname = new URL(req.url).pathname;
          const body = JSON.parse(await req.clone().text());
          serviceCalls.push({
            pathname,
            caller: req?.headers?.get?.("x-mmd-service-binding") || "",
            body,
          });
          if (pathname === "/__internal/hype/handoff-status") {
            return Response.json({
              ok: true,
              state: "sent",
              handoff_id: "HYPE-KENJI-20260919120000-abc12345",
              target: "kenji",
            });
          }
          return Response.json(handoffResult("kenji"));
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_supervised_handoff");
    assert.equal(body.ok, true);
    assert.equal(body.code_status, "kenji_context_ready");
    assert.equal(body.line_continuity_ready, true);
    assert.equal(serviceCalls.length, 2);
    const handoffCall = serviceCalls.find((x) => x.pathname === "/__internal/hype/handoff");
    const sentCall = serviceCalls.find((x) => x.pathname === "/__internal/hype/handoff-status");
    assert.equal(handoffCall.caller, "telegram-worker");
    assert.equal(handoffCall.body.target, "kenji");
    assert.equal(handoffCall.body.telegram_user_id, "111111");
    assert.equal(sentCall.body.operation, "transition");
    assert.equal(sentCall.body.state, "sent");
    assert.equal(sentCall.body.actor_role, "hype");

    assert.equal(sends.length, 2);
    const ops = sends.find((x) => String(x.chat_id) === "-1003546439681");
    const customer = sends.find((x) => String(x.chat_id) === "111111");
    assert.ok(ops);
    assert.ok(customer);
    assert.match(ops.text, /HYPE → KENJI HANDOFF/);
    assert.match(ops.text, /refresh canonical truth/i);
    assert.match(customer.text, /ไม่ต้องเริ่มเล่าเรื่องใหม่/);
    assert.match(customer.text, /HYPE-KENJI-/);
    assert.equal(customer.reply_markup.inline_keyboard[0][0].url, "https://lin.ee/xRqsALs");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("/human targets Per and requires confirmed Ops notification for success", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    if (method !== "sendMessage") throw new Error("unexpected Telegram method");
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 920 + sends.length } });
  };

  try {
    const response = await worker.fetch(request("ขอคุยกับเปอร์"), baseEnv({
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          const pathname = new URL(req.url).pathname;
          if (pathname === "/__internal/hype/handoff-status") {
            return Response.json({
              ok: true,
              state: "sent",
              handoff_id: "HYPE-PER-20260919120000-abc12345",
              target: "per",
            });
          }
          return Response.json(handoffResult("per"));
        },
      },
    }));
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.target, "per");
    assert.equal(body.code_status, "per_notified_with_context");
    assert.equal(body.operator_notified, true);

    const customer = sends.find((x) => String(x.chat_id) === "111111");
    assert.match(customer.text, /HYPE Ops แจ้ง Per พร้อม context ล่าสุดแล้ว/);
    assert.match(customer.text, /HYPE-PER-/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("successful HYPE payment read records continuity best-effort without changing customer status", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  const serviceBodies = [];

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    if (method !== "sendMessage") throw new Error("unexpected Telegram method");
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 940 + sends.length } });
  };

  try {
    const response = await worker.fetch(request("/payment"), baseEnv({
      HYPE_OPERATIONS: {
        async fetch(req) {
          const payload = JSON.parse(await req.clone().text());
          serviceBodies.push({ kind: "read", payload });
          return Response.json({
            ok: true,
            state: "ready",
            readiness: "ready",
            display_name: "Client A",
            membership: { level: "private_premium", lifecycle: "active" },
            job: { active_count: 1, next: { status: "confirmed", model_name: "Model A", start_at: "2026-09-20T19:00:00+07:00", payment_state: "pending_review" } },
            payment: { status: "pending_review", paid: false, review_required: true, outstanding_amount_thb: 5000, credit_balance_thb: 0 },
            next_action: { action: "review_payment", label: "รอ MMD ตรวจหลักฐาน" },
          });
        },
      },
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          const payload = JSON.parse(await req.clone().text());
          serviceBodies.push({ kind: "write", payload });
          return Response.json({ ok: true, state: "recorded", persisted: true });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_operating_payment");
    assert.equal(body.ok, true);
    assert.equal(body.continuity_recorded, true);
    assert.equal(body.continuity_state, "recorded");
    assert.equal(serviceBodies.length, 2);
    assert.equal(serviceBodies[0].kind, "read");
    assert.equal(serviceBodies[1].kind, "write");
    assert.equal(serviceBodies[1].payload.command, "payment");
    assert.equal(serviceBodies[1].payload.customer_message, "/payment");
    assert.equal(serviceBodies[1].payload.projection.payment.review_required, true);

    const customer = sends.find((x) => String(x.chat_id) === "111111");
    assert.match(customer.text, /รอตรวจสอบหลักฐาน/);
    assert.doesNotMatch(customer.text, /handoff_id|canonical_client_id|matrix/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
