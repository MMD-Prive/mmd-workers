import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import {
  HYPE_CONVERSATIONAL_UNDERSTANDING_VERSION,
  routeHypeConversationalUnderstandingV2,
} from "../src/hype-conversational-understanding-v2.js";

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
      update_id: 10800,
      message: {
        message_id: 208,
        text,
        chat,
        from: { id: 111111, username: "member" },
      },
    }),
  });
}

test("V2 understands bounded Thai colloquialisms, spelling variants and typos", () => {
  const cases = [
    ["เมมผมหมดตอนไหนอะ", "membership"],
    ["สมาชิคหมดเมื่อไหร่", "membership"],
    ["คุปองยังใช้ได้ปะ", "coupons"],
    ["โค้ดส่วนลดยังใช้ได้ไหม", "coupons"],
    ["พ้อยท์เหลือเท่าไรครับ", "points"],
    ["สลิ๊ปที่ส่งไปถึงรึยัง", "payment"],
    ["ยอดที่เหลือเท่าไร", "payment"],
    ["คิวที่นัดไว้เป็นไงบ้าง", "booking"],
  ];

  for (const [input, command] of cases) {
    const result = routeHypeConversationalUnderstandingV2(input);
    assert.equal(result.schema, HYPE_CONVERSATIONAL_UNDERSTANDING_VERSION);
    assert.equal(result.routed, true, input);
    assert.equal(result.command, command, input);
    assert.equal(result.requires_live_truth_refresh, true, input);
    assert.ok(result.confidence >= 0.87, input);
  }
});

test("V2 fuzzy English correction stays on whole domain tokens", () => {
  const typoCases = [
    ["bookng ของผม", "booking"],
    ["paymant ถึงหรือยัง", "payment"],
    ["membeship หมดเมื่อไหร่", "membership"],
  ];
  for (const [input, command] of typoCases) {
    const result = routeHypeConversationalUnderstandingV2(input);
    assert.equal(result.routed, true, input);
    assert.equal(result.command, command, input);
  }

  for (const input of ["looking good", "I am looking for help"]) {
    const result = routeHypeConversationalUnderstandingV2(input);
    assert.equal(result.routed, false, input);
    assert.equal(result.command, "", input);
    assert.equal(result.normalizations.includes("booking_typo_en"), false, input);
  }
});

test("V2 honors an explicit correction but keeps protected multi-domain ambiguity fail-closed", () => {
  const corrected = routeHypeConversationalUnderstandingV2("ไม่ใช่เรื่องสมาชิก หมายถึงสลิปที่ส่งไป");
  assert.equal(corrected.routed, true);
  assert.equal(corrected.command, "payment");
  assert.equal(corrected.correction_applied, true);

  const negatedOnly = routeHypeConversationalUnderstandingV2("ไม่ได้ถามเรื่องสมาชิกครับ");
  assert.equal(negatedOnly.routed, false);
  assert.equal(negatedOnly.clarification_required, true);
  assert.equal(negatedOnly.reason, "negated_domain_without_replacement");

  const ambiguous = routeHypeConversationalUnderstandingV2("ต่ออายุสมาชิกต้องจ่ายแล้วยังไง");
  assert.equal(ambiguous.routed, false);
  assert.equal(ambiguous.ambiguous, true);
  assert.deepEqual(
    new Set(ambiguous.candidates.slice(0, 2).map((item) => item.command)),
    new Set(["membership", "payment"]),
  );
});

test("V2 resolves deictic follow-ups only from bounded fresh continuity context", () => {
  const lookup = routeHypeConversationalUnderstandingV2("เรื่องเดิมถึงไหนแล้ว");
  assert.equal(lookup.routed, false);
  assert.equal(lookup.context_required, true);
  assert.equal(lookup.reason, "context_lookup_required");

  const resolved = routeHypeConversationalUnderstandingV2("เรื่องเดิมถึงไหนแล้ว", {
    context: {
      available: true,
      command: "booking",
      open_thread: true,
      matrix_version: 7,
    },
  });
  assert.equal(resolved.routed, true);
  assert.equal(resolved.command, "booking");
  assert.equal(resolved.context_applied, true);
  assert.equal(resolved.context_version, 7);
  assert.equal(resolved.requires_live_truth_refresh, true);

  const ellipsis = routeHypeConversationalUnderstandingV2("แล้ววันไหนนะ", {
    context: {
      available: true,
      command: "booking",
      open_thread: true,
      matrix_version: 7,
    },
  });
  assert.equal(ellipsis.routed, true);
  assert.equal(ellipsis.command, "booking");
  assert.equal(ellipsis.context_applied, true);

  const stale = routeHypeConversationalUnderstandingV2("อันเดิมโอเคยัง", {
    context: { available: false, stale: true, state: "stale" },
  });
  assert.equal(stale.routed, false);
  assert.equal(stale.clarification_required, true);
  assert.equal(stale.reason, "continuity_context_stale");

  const switched = routeHypeConversationalUnderstandingV2("เปลี่ยนเรื่อง วันนี้อากาศดี");
  assert.equal(switched.context_required, false);
  assert.equal(switched.routed, false);
});

test("V2 classifies only bounded safe conversation and does not turn it into business routing", () => {
  const cases = [
    ["สวัสดีครับ", "greeting"],
    ["ขอบคุณครับ", "thanks"],
    ["โอเค", "acknowledgement"],
    ["HYPE คือใคร", "identity"],
  ];
  for (const [input, intent] of cases) {
    const result = routeHypeConversationalUnderstandingV2(input);
    assert.equal(result.routed, false, input);
    assert.equal(result.social_intent, intent, input);
    assert.equal(result.requires_live_truth_refresh, false, input);
  }
});

test("private V2 follow-up reads bounded Matrix context then refreshes the canonical domain", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const contextPaths = [];
  let operationsPayload = null;
  let telegram = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegram = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 2201, chat: { id: 111111 } } });
  };

  try {
    const response = await worker.fetch(request("เรื่องเดิมถึงไหนแล้ว"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          const path = new URL(req.url).pathname;
          contextPaths.push(path);
          if (path.endsWith("/transaction-intake")) {
            return Response.json({ ok: true, state: "none", active: false, persisted: false });
          }
          if (path.endsWith("/conversation-context")) {
            return Response.json({
              ok: true,
              state: "ready",
              context: {
                schema: "mmd.hype_conversation_context.v2",
                available: true,
                stale: false,
                command: "booking",
                topic: "booking",
                open_thread: true,
                matrix_version: 4,
                requires_live_truth_refresh: true,
              },
              guardrails: {
                raw_matrix_fields_exposed: false,
                business_truth_included: false,
              },
            });
          }
          if (path.endsWith("/continuity")) {
            return Response.json({ ok: true, state: "recorded", persisted: true });
          }
          throw new Error(`unexpected context path ${path}`);
        },
      },
      HYPE_OPERATIONS: {
        async fetch(req) {
          operationsPayload = JSON.parse(await req.clone().text());
          return Response.json({
            ok: true,
            state: "ready",
            readiness: "ready",
            display_name: "Customer A",
            membership: { status: "active", lifecycle: "active", level: "private_premium", expire_at: "2027-09-30T16:59:59.000Z", blocked: false },
            job: { status: "confirmed", active_count: 1, next: { status: "confirmed", model_name: "Model A", start_at: "2026-09-25T12:00:00.000Z", payment_state: "verified" } },
            payment: { status: "verified", paid: true, review_required: false, outstanding_amount_thb: 0, credit_balance_thb: 0 },
            next_action: null,
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_operating_booking");
    assert.equal(body.ok, true);
    assert.equal(operationsPayload.intent.type, "booking");
    assert.equal(operationsPayload.intent.routing_source, "conversational_v2_context");
    assert.ok(contextPaths.some((path) => path.endsWith("/conversation-context")));
    assert.match(telegram.text, /HYPE · BOOKING STATUS/);
    assert.doesNotMatch(JSON.stringify(telegram), /matrix_version|conversation_id_hash|canonical_client_id/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("group follow-up never reads private continuity context", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let contextCalled = false;
  let telegram = null;
  globalThis.fetch = async (_url, init = {}) => {
    telegram = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 2202, chat: { id: -1002073919780 } } });
  };

  try {
    const response = await worker.fetch(request(
      "เรื่องเดิมถึงไหนแล้ว",
      { id: -1002073919780, type: "supergroup" },
    ), env({
      HYPE_CONTEXT_WRITER: {
        async fetch() {
          contextCalled = true;
          throw new Error("group must not read continuity context");
        },
      },
    }));
    const body = await response.json();
    assert.equal(body.flow, "hype_conversational_v2_private_required");
    assert.equal(contextCalled, false);
    assert.match(telegram.text, /private chat/);
    assert.doesNotMatch(telegram.text, /booking|payment|membership/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("private small talk receives a bounded reply while arbitrary text asks for clarification", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 2300 + sends.length, chat: { id: 111111 } } });
  };
  try {
    const greetingResponse = await worker.fetch(request("สวัสดีครับ"), env());
    const greeting = await greetingResponse.json();
    assert.equal(greeting.flow, "hype_conversational_v2_safe_conversation");
    assert.match(sends[0].text, /ผม HYPE/);

    const unknownResponse = await worker.fetch(request("ช่วยดูอันนี้ให้ที"), env());
    const unknown = await unknownResponse.json();
    assert.equal(unknown.flow, "hype_conversational_v2_unclassified");
    assert.equal(unknown.code_status, "clarification_required");
    assert.match(sends[1].text, /ไม่อยากเดา/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
