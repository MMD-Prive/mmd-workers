import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { routeHypeNaturalLanguage } from "../src/hype-natural-language-router.js";

const WEBHOOK = "https://telegram-worker.mmd.test/telegram/webhook";

function env(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_CHAT_ID: "-1003546439681",
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
      update_id: 9800,
      message: {
        message_id: 190,
        text,
        chat,
        from: { id: 111111, username: "member" },
      },
    }),
  });
}

test("P4 natural-language router maps common Thai customer questions to canonical domains", () => {
  const cases = [
    ["งานวันศุกร์โอเคยัง", "booking"],
    ["สมาชิกหมดเมื่อไหร่", "membership"],
    ["คูปองใช้ได้ไหม", "coupons"],
    ["เหลือจ่ายเท่าไหร่", "payment"],
    ["สลิปที่ส่งไปถึงยัง", "payment"],
    ["แต้มผมเหลือเท่าไหร่", "points"],
    ["CARE BACK phase 2 ใช้ยังไง", "careback"],
    ["ต้องทำอะไรต่อจากนี้", "next"],
    ["เช็กสถานะบัญชีหน่อย", "status"],
  ];

  for (const [text, expected] of cases) {
    const result = routeHypeNaturalLanguage(text);
    assert.equal(result.routed, true, text);
    assert.equal(result.command, expected, text);
    assert.ok(result.confidence >= 0.84, text);
  }
});

test("P4 router refuses to guess when payment and membership are equally strong", () => {
  const result = routeHypeNaturalLanguage("ต่ออายุสมาชิกต้องจ่ายแล้วยังไง");
  assert.equal(result.routed, false);
  assert.equal(result.ambiguous, true);
  assert.equal(result.reason, "multiple_supported_domains");
  assert.deepEqual(
    new Set(result.candidates.slice(0, 2).map((item) => item.command)),
    new Set(["membership", "payment"]),
  );
});

test("P4 router ignores generic conversation without a domain signal", () => {
  for (const text of ["ขอบคุณครับ", "โอเค", "วันนี้เป็นยังไงบ้าง", "ได้เลย"]) {
    const result = routeHypeNaturalLanguage(text);
    assert.equal(result.routed, false, text);
    assert.equal(result.ambiguous, false, text);
  }
});

test("natural-language membership question reads canonical entitlement projection in private", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let telegram = null;
  let operationsPayload = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegram = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 1001, chat: { id: 111111 } } });
  };

  try {
    const response = await worker.fetch(request("สมาชิก Premium ของผมหมดเมื่อไหร่"), env({
      HYPE_OPERATIONS: {
        async fetch(req) {
          operationsPayload = JSON.parse(await req.clone().text());
          return Response.json({
            ok: true,
            state: "ready",
            readiness: "ready",
            display_name: "ลูกค้า A",
            membership: {
              status: "active",
              lifecycle: "active",
              level: "private_premium",
              expire_at: "2027-09-30T16:59:59.000Z",
              blocked: false,
            },
            job: { active_count: 0, next: null },
            payment: { status: "unknown", paid: false, review_required: false, outstanding_amount_thb: 0, credit_balance_thb: 0 },
            next_action: null,
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_operating_membership");
    assert.equal(body.ok, true);
    assert.equal(operationsPayload.intent.type, "membership_status");
    assert.equal(operationsPayload.intent.trigger, "telegram_membership");
    assert.equal(operationsPayload.intent.routing_source, "natural_language");
    assert.match(operationsPayload.intent.raw, /Premium/);

    assert.match(telegram.text, /HYPE · MEMBERSHIP STATUS/);
    assert.match(telegram.text, /Premium/);
    assert.match(telegram.text, /Active through/);
    assert.match(telegram.text, /Entitlement Resolver/);
    assert.doesNotMatch(telegram.text, /payment_ref|canonical_client_id|AIRTABLE/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("natural-language private domain in a group routes to private without resolving Client 360", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let operationsCalled = false;
  let telegram = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegram = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 1002, chat: { id: -1002073919780 } } });
  };

  try {
    const response = await worker.fetch(request(
      "สมาชิกหมดเมื่อไหร่",
      { id: -1002073919780, type: "supergroup" },
    ), env({
      HYPE_OPERATIONS: {
        async fetch() {
          operationsCalled = true;
          throw new Error("must not resolve private state in group");
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_operating_private_required");
    assert.equal(operationsCalled, false);
    assert.match(telegram.text, /\/membership/);
    assert.doesNotMatch(telegram.text, /Premium|Active through|ลูกค้า A/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ambiguous natural-language question asks for clarification without reading canonical systems", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let operationsCalled = false;
  let telegram = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegram = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 1003, chat: { id: 111111 } } });
  };

  try {
    const response = await worker.fetch(request("ต่ออายุสมาชิกต้องจ่ายแล้วยังไง"), env({
      HYPE_OPERATIONS: {
        async fetch() {
          operationsCalled = true;
          throw new Error("ambiguous intent must not read authority");
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_intent_clarification");
    assert.equal(body.code_status, "ambiguous_intent");
    assert.equal(operationsCalled, false);
    assert.match(telegram.text, /ไม่อยากเดา/);
    assert.match(telegram.text, /\/membership/);
    assert.match(telegram.text, /\/payment/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("natural-language points and coupons remain canonical routes, not inline wallet truth", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  let operationsCalled = false;

  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 1004 + sends.length, chat: { id: 111111 } } });
  };

  try {
    for (const text of ["แต้มผมมีเท่าไหร่", "คูปองใช้ได้ไหม"]) {
      const response = await worker.fetch(request(text), env({
        HYPE_OPERATIONS: {
          async fetch() {
            operationsCalled = true;
            throw new Error("route-only intents must not read status projection");
          },
        },
      }));
      const body = await response.json();
      assert.match(body.flow, /hype_operating_(points|coupons)_route/);
    }

    assert.equal(operationsCalled, false);
    assert.equal(sends.length, 2);
    assert.match(sends[0].text, /MY MMD/);
    assert.match(sends[1].text, /Coupon Wallet|คูปอง/i);
    assert.doesNotMatch(sends.map((x) => x.text).join("\n"), /points balance|coupon code|เหลือ 500/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
