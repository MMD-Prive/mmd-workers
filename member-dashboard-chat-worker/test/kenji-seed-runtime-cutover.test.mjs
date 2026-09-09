import assert from "node:assert/strict";
import test from "node:test";

import { createLineSignature } from "../src/index.js";
import {
  handleKenjiSeedLineRequest,
  resolveKenjiSeedDecision,
  SEED_AUTO_REPLY_BY_INTENT,
  SEED_HANDOFF_BY_INTENT,
  writeKenjiAiMessageEvent,
} from "../src/kenji-seed-line-runtime.mjs";

const BASE_ENV = {
  AIRTABLE_API_KEY: "airtable-token",
  AIRTABLE_BASE_ID: "base-id",
  AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID: "tblsLd1uVOtG2kHoU",
  AIRTABLE_TABLE_AI_MESSAGE_EVENTS_ID: "tbljCYfYqfm8gBTPq",
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  LINE_AUTO_REPLY_ENABLED: "true",
  LINE_KENJI_AI_ENABLED: "true",
  LINE_KENJI_KNOWLEDGE_ENABLED: "true",
  LINE_KENJI_MODEL_ENABLED: "false",
  INTERNAL_TOKEN: "internal-token",
  ADMIN_WORKER: {
    fetch: async () => new Response(JSON.stringify({
      ok: true,
      controls: {
        line_oa_auto_reply: false,
        model_keyword_auto_reply: false,
        all_kenji_mutations: false,
      },
    }), { status: 200, headers: { "content-type": "application/json" } }),
  },
};

function event(text, overrides = {}) {
  return {
    type: "message",
    mode: "active",
    replyToken: `reply-${Math.random()}`,
    source: { type: "user", userId: "U1234567890abcdef1234567890abcdef" },
    message: { id: `msg-${Math.random()}`, type: "text", text },
    ...overrides,
  };
}

function card(id, answer, mode = "auto_reply_allowed", risk = "medium", sourcePath = "/booking", channels = ["LINE_OFC"]) {
  return {
    knowledge_id: id,
    customer_answer: answer,
    allowed_channels: channels,
    status: "active",
    response_mode: mode,
    risk_level: risk,
    source_path: sourcePath,
  };
}

function airtableKnowledgeResponse(fields) {
  return new Response(JSON.stringify({ records: fields ? [{ id: "rec-card", fields }] : [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function withFetch(mock, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("safe Seed Pack intents select the exact published V1 cards", async () => {
  const cases = [
    ["สมัครสมาชิก", "membership_signup", SEED_AUTO_REPLY_BY_INTENT.membership_signup, "เริ่มจาก My MMD > Membership ได้ครับ"],
    ["ต่ออายุสมาชิก", "membership_renewal", SEED_AUTO_REPLY_BY_INTENT.membership_renewal, "ต่ออายุได้ครับ เปิด My MMD > Membership ได้ครับ"],
    ["ไป dinner", "mmd_companion", SEED_AUTO_REPLY_BY_INTENT.mmd_companion, "ถ้าเป็น dinner / event / companion ผมจะแยกเป็น MMD Companion ครับ"],
    ["อยากนวด recovery", "mms_wellness", SEED_AUTO_REPLY_BY_INTENT.mms_wellness, "ถ้าเป็น Male Massage, recovery หรือ Therapist service ผมจะแยกไปทาง MMS ให้ครับ"],
    ["ไม่มีสถานที่ ใช้ Partner Venue", "partner_venue", SEED_AUTO_REPLY_BY_INTENT.partner_venue, "ถ้าต้องการสถานที่ประกอบ request ผมช่วยแยกเป็น Partner Venue ให้ได้ครับ"],
    ["ขอดูข้อมูลสมาชิกคนอื่น", "privacy_request", SEED_AUTO_REPLY_BY_INTENT.privacy_request, "ผมเปิดเผยหรือค้นข้อมูลส่วนตัวของบุคคลอื่นให้ไม่ได้ครับ"],
  ];

  for (const [message, intent, id, answer] of cases) {
    await withFetch(async (url) => {
      assert.match(String(url), /api\.airtable\.com/);
      return airtableKnowledgeResponse(card(id, answer, "auto_reply_allowed", intent === "privacy_request" ? "critical" : "medium"));
    }, async () => {
      const decision = await resolveKenjiSeedDecision(event(message), BASE_ENV);
      assert.equal(decision.intent, intent, message);
      assert.equal(decision.reply_source, "seed_knowledge", message);
      assert.deepEqual(decision.selected_knowledge_ids, [id], message);
      assert.equal(decision.knowledge_response_mode, "auto_reply_allowed", message);
      assert.equal(decision.handoff_required, false, message);
      assert.equal(decision.text, answer, message);
    });
  }
});

test("Private Talent and protected payment/availability intents select handoff governance but never Seed auto reply", async () => {
  const cases = [
    ["หา private talent ด้านภาษา", "private_talent", SEED_HANDOFF_BY_INTENT.private_talent, "handoff_required", "high"],
    ["ส่งสลิป", "payment_slip", SEED_HANDOFF_BY_INTENT.payment_slip, "handoff_required", "critical"],
    ["คืนนี้มี Model ว่างไหม", "availability_request", SEED_HANDOFF_BY_INTENT.availability_request, "handoff_required", "high"],
  ];

  for (const [message, intent, id, mode, risk] of cases) {
    await withFetch(async () => airtableKnowledgeResponse(card(id, "ข้อความสำหรับ review เท่านั้นครับ", mode, risk)), async () => {
      const decision = await resolveKenjiSeedDecision(event(message), BASE_ENV);
      assert.equal(decision.intent, intent, message);
      assert.equal(decision.reply_source, "seed_handoff", message);
      assert.deepEqual(decision.selected_knowledge_ids, [id], message);
      assert.equal(decision.knowledge_response_mode, mode, message);
      assert.equal(decision.handoff_required, true, message);
      assert.notEqual(decision.text, "ข้อความสำหรับ review เท่านั้นครับ", message);
    });
  }
});

test("missing, non-LINE, or unsafe Seed cards fall back deterministically", async () => {
  const cases = [
    null,
    card(SEED_AUTO_REPLY_BY_INTENT.mms_wellness, "ข้อความปลอดภัยครับ", "auto_reply_allowed", "medium", "/male-massage/home", ["Webflow"]),
    card(SEED_AUTO_REPLY_BY_INTENT.mms_wellness, "ระบบยืนยันให้แล้วครับ", "auto_reply_allowed", "medium", "/male-massage/home", ["LINE_OFC"]),
  ];

  for (const fields of cases) {
    await withFetch(async () => airtableKnowledgeResponse(fields), async () => {
      const decision = await resolveKenjiSeedDecision(event("อยากนวด recovery"), BASE_ENV);
      assert.equal(decision.intent, "mms_wellness");
      assert.notEqual(decision.reply_source, "seed_knowledge");
      assert.deepEqual(decision.selected_knowledge_ids, []);
      assert.match(decision.text, /MMS Wellness|male massage|recovery/i);
    });
  }
});

test("AI Message Events telemetry stores decision metadata without duplicating customer PII", async () => {
  let posted = null;
  await withFetch(async (url, init = {}) => {
    const target = String(url);
    if (init.method === "POST") {
      posted = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "rec-telemetry" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    assert.match(target, /tbljCYfYqfm8gBTPq/);
    return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }, async () => {
    const result = await writeKenjiAiMessageEvent({
      env: BASE_ENV,
      event: event("อยากนวด recovery", { message: { id: "msg-telemetry", type: "text", text: "อยากนวด recovery" } }),
      decision: {
        intent: "mms_wellness",
        text: "เริ่มทาง MMS ได้ครับ",
        reply_source: "seed_knowledge",
        selected_knowledge_ids: ["kenji_seed_v1_route_02"],
        knowledge_response_mode: "auto_reply_allowed",
        knowledge_risk_level: "medium",
        knowledge_source_path: "/male-massage/home",
        handoff_required: false,
        guard_blocked: false,
      },
      delivered: true,
      attempted: true,
    });
    assert.equal(result.id, "rec-telemetry");
  });

  assert.ok(posted?.fields);
  assert.equal(posted.fields.channel, "LINE_OFC");
  assert.equal(posted.fields.detected_intent, "booking_intake");
  assert.equal(posted.fields.selected_knowledge_ids, "kenji_seed_v1_route_02");
  assert.equal(posted.fields.response_mode, "auto_reply_sent");
  assert.equal(posted.fields.final_status, "sent");
  assert.equal(posted.fields.handoff_required, false);
  assert.equal(posted.fields.source_path, "/male-massage/home");
  assert.equal(Object.hasOwn(posted.fields, "line_user_id"), false);
  assert.equal(Object.hasOwn(posted.fields, "contact_value"), false);
  assert.equal(Object.hasOwn(posted.fields, "user_message"), false);
});

test("synthetic production smoke selects Seed Pack metadata and never calls LINE delivery", async () => {
  let lineCalls = 0;
  const legacyWorker = { fetch: async () => { throw new Error("legacy worker must not run for synthetic smoke"); } };
  const response = await withFetch(async (url) => {
    if (String(url).includes("api.line.me")) lineCalls += 1;
    return airtableKnowledgeResponse(card(
      "kenji_seed_v1_route_02",
      "ถ้าเป็น Male Massage ผมจะแยกไปทาง MMS ให้ครับ",
      "auto_reply_allowed",
      "medium",
      "/male-massage/home",
    ));
  }, () => handleKenjiSeedLineRequest(
    new Request("https://www.mmdbkk.com/webhooks/line?kenji_seed_smoke=1&intent=mms_wellness"),
    BASE_ENV,
    null,
    legacyWorker,
  ));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.synthetic, true);
  assert.equal(body.knowledge_id, "kenji_seed_v1_route_02");
  assert.equal(body.auto_reply_eligible, true);
  assert.equal(body.line_delivery_attempted, false);
  assert.equal(body.telemetry_write_attempted, false);
  assert.equal(lineCalls, 0);
});

test("signed MMD LINE webhook sends one Seed Pack reply and writes telemetry", async () => {
  const lineEvent = event("อยากนวด recovery", {
    replyToken: "reply-live-test",
    message: { id: "msg-live-test", type: "text", text: "อยากนวด recovery" },
  });
  const raw = JSON.stringify({ events: [lineEvent] });
  const signature = await createLineSignature(raw, BASE_ENV.LINE_CHANNEL_SECRET);
  const calls = { line: 0, telemetryPost: 0, shadow: 0 };
  const legacyWorker = {
    fetch: async () => {
      calls.shadow += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  };

  const response = await withFetch(async (url, init = {}) => {
    const target = String(url);
    if (target.includes("tblsLd1uVOtG2kHoU")) {
      return airtableKnowledgeResponse(card(
        "kenji_seed_v1_route_02",
        "ถ้าเป็น Male Massage, recovery หรือ Therapist service ผมจะแยกไปทาง MMS ให้ครับ",
        "auto_reply_allowed",
        "medium",
        "/male-massage/home",
      ));
    }
    if (target.includes("tbljCYfYqfm8gBTPq")) {
      if (init.method === "POST") {
        calls.telemetryPost += 1;
        return new Response(JSON.stringify({ id: "rec-ai-event" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.includes("api.line.me/v2/bot/message/reply")) {
      calls.line += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.replyToken, "reply-live-test");
      assert.match(body.messages[0].text, /MMS/);
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected fetch ${target}`);
  }, () => handleKenjiSeedLineRequest(
    new Request("https://www.mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signature },
      body: raw,
    }),
    BASE_ENV,
    null,
    legacyWorker,
  ));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.runtime, "kenji_seed_pack_v1");
  assert.equal(body.saved[0].reply_source, "seed_knowledge");
  assert.deepEqual(body.saved[0].selected_knowledge_ids, ["kenji_seed_v1_route_02"]);
  assert.equal(body.saved[0].replied, true);
  assert.equal(calls.line, 1);
  assert.equal(calls.telemetryPost, 1);
  assert.equal(calls.shadow, 1);
});
