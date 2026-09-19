import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import {
  detectHypeTransactionStart,
  extractHypeTransactionFields,
} from "../src/hype-transaction-assistant.js";

const WEBHOOK = "https://telegram-worker.mmd.test/telegram/webhook";

function env(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_STANDARD_GROUP_ID: "-1002073919780",
    ...overrides,
  };
}

function request({ text = "", caption = "", chat = { id: 111111, type: "private" }, photo, document } = {}) {
  return new Request(WEBHOOK, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
    },
    body: JSON.stringify({
      update_id: 9900,
      message: {
        message_id: 200,
        ...(text ? { text } : {}),
        ...(caption ? { caption } : {}),
        ...(photo ? { photo } : {}),
        ...(document ? { document } : {}),
        chat,
        from: { id: 111111, username: "member" },
      },
    }),
  });
}

test("P5 detects explicit and natural transaction starts", () => {
  assert.equal(detectHypeTransactionStart({ text: "/book" })?.mode, "booking");
  assert.equal(detectHypeTransactionStart({ text: "/proof" })?.mode, "payment_proof");
  assert.equal(detectHypeTransactionStart({ text: "/renew" })?.mode, "renewal");
  assert.equal(detectHypeTransactionStart({ text: "/mms" })?.mode, "mms");

  assert.equal(detectHypeTransactionStart({ text: "อยากจอง dinner พรุ่งนี้ 19:00 สาทร" })?.mode, "booking");
  assert.equal(detectHypeTransactionStart({ text: "ขอต่ออายุสมาชิก" })?.mode, "renewal");
  assert.equal(detectHypeTransactionStart({ text: "อยากจองนวด Aroma พรุ่งนี้ 20:00 สุขุมวิท" })?.mode, "mms");
});

test("P5 extracts bounded booking fields from Thai natural language", () => {
  const fields = extractHypeTransactionFields(
    "booking",
    { text: "อยากจอง dinner พรุ่งนี้ 19:00 สาทร 3 ชั่วโมง Model Book" },
    new Date("2026-09-19T09:10:00.000Z"),
  );

  assert.equal(fields.service_intent, "dining");
  assert.equal(fields.preferred_date, "2026-09-20");
  assert.equal(fields.preferred_time, "19:00");
  assert.equal(fields.area, "Sathorn");
  assert.equal(fields.duration, "3 ชั่วโมง");
  assert.equal(fields.model_preference, "Book");
});

test("P5 resumes an existing booking draft without asking the customer to restart", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  const writerBodies = [];
  let writerCalls = 0;

  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 1100 + sends.length, chat: { id: Number(payload.chat_id) } } });
  };

  try {
    const response = await worker.fetch(request({ text: "2026-09-20 19:00 สาทร" }), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          writerCalls += 1;
          const body = JSON.parse(await req.clone().text());
          writerBodies.push(body);

          if (body.operation === "read") {
            return Response.json({
              ok: true,
              state: "collecting",
              active: true,
              mode: "booking",
              draft_id: "HYPE-DRAFT-BOOKING-ABC123",
              persisted: true,
              fields: { service_intent: "dining" },
              missing_fields: ["preferred_date", "preferred_time", "area"],
              complete: false,
              canonical_submit: { ready: false, href: "/booking", route_kind: "booking_entry" },
            });
          }

          assert.equal(body.operation, "update");
          assert.equal(body.mode, "booking");
          return Response.json({
            ok: true,
            state: "ready_for_customer_submit",
            mode: "booking",
            draft_id: "HYPE-DRAFT-BOOKING-ABC123",
            persisted: true,
            display_name: "ลูกค้า A",
            fields: {
              service_intent: "dining",
              preferred_date: "2026-09-20",
              preferred_time: "19:00",
              area: "Sathorn",
            },
            missing_fields: [],
            complete: true,
            canonical_submit: {
              ready: true,
              href: "/booking",
              route_kind: "booking_entry",
              requires_customer_action: true,
              submitted_by_hype: false,
            },
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_transaction_booking");
    assert.equal(body.ok, true);
    assert.equal(writerCalls, 2);
    assert.equal(writerBodies[0].operation, "read");
    assert.equal(writerBodies[1].operation, "update");
    assert.equal(writerBodies[1].fields.preferred_date, "2026-09-20");
    assert.equal(writerBodies[1].fields.preferred_time, "19:00");
    assert.equal(writerBodies[1].fields.area, "Sathorn");
    assert.match(sends[0].text, /Draft พร้อมแล้ว/);
    assert.match(sends[0].text, /prepare only/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P5 payment proof never sends Telegram file identifiers to the context writer", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let writerBody = null;
  let telegramBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegramBody = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 1201, chat: { id: 111111 } } });
  };

  try {
    const response = await worker.fetch(request({
      caption: "ส่งสลิปครับ",
      photo: [
        { file_id: "photo-secret-1", file_unique_id: "unique-secret-1", width: 640, height: 640 },
      ],
    }), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          writerBody = JSON.parse(await req.clone().text());
          return Response.json({
            ok: true,
            state: "ready_for_customer_submit",
            mode: "payment_proof",
            draft_id: "HYPE-DRAFT-PAYMENT_PROOF-ABC123",
            persisted: true,
            display_name: "ลูกค้า A",
            fields: { evidence_present: true, evidence_type: "photo" },
            missing_fields: [],
            complete: true,
            canonical_submit: {
              ready: true,
              href: "/sigil/pay?t=signed_123",
              route_kind: "signed_payment_proof",
              requires_customer_action: true,
              submitted_by_hype: false,
            },
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_transaction_payment_proof");
    assert.equal(writerBody.mode, "payment_proof");
    assert.deepEqual(writerBody.fields, { evidence_present: true, evidence_type: "photo", customer_note: "ส่งสลิปครับ" });

    const serializedWriter = JSON.stringify(writerBody);
    assert.doesNotMatch(serializedWriter, /photo-secret|unique-secret|file_id|file_unique_id/);
    assert.match(telegramBody.text, /Telegram ยังไม่ถือเป็น Payment Evidence/);
    assert.match(telegramBody.text, /file_id\/raw media/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P5 renewal keeps current-package authority and does not ask customer to choose tier", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let telegramBody = null;
  let writerBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegramBody = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 1301, chat: { id: 111111 } } });
  };

  try {
    const response = await worker.fetch(request({ text: "ขอต่ออายุสมาชิก" }), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          writerBody = JSON.parse(await req.clone().text());
          return Response.json({
            ok: true,
            state: "ready_for_customer_submit",
            mode: "renewal",
            draft_id: "HYPE-DRAFT-RENEWAL-ABC123",
            persisted: true,
            display_name: "ลูกค้า A",
            fields: { intent: "renew" },
            missing_fields: [],
            complete: true,
            canonical_submit: {
              ready: true,
              href: "/sigil/member/membership?intent=renew",
              route_kind: "private_renewal_entry",
              requires_customer_action: true,
              submitted_by_hype: false,
            },
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_transaction_renewal");
    assert.equal(writerBody.mode, "renewal");
    assert.deepEqual(writerBody.fields.intent, "renew");
    assert.match(telegramBody.text, /Draft พร้อมแล้ว/);
    assert.doesNotMatch(telegramBody.text, /เลือก.*Standard|เลือก.*Premium|อัปเกรดเป็น/i);

    const urls = telegramBody.reply_markup.inline_keyboard.flat().map((item) => item.url);
    assert.equal(urls.some((url) => new URL(url).pathname === "/sigil/member/membership"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P5 MMS requires explicit recipient gender and never infers it from customer profile", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let writerBody = null;
  let telegramBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegramBody = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 1401, chat: { id: 111111 } } });
  };

  try {
    const response = await worker.fetch(request({
      text: "อยากจองนวด Aroma พรุ่งนี้ 20:00 สุขุมวิท",
    }), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(req) {
          writerBody = JSON.parse(await req.clone().text());
          assert.equal(Object.hasOwn(writerBody.fields, "recipient_gender"), false);
          return Response.json({
            ok: true,
            state: "collecting",
            mode: "mms",
            draft_id: "HYPE-DRAFT-MMS-ABC123",
            persisted: true,
            display_name: "ลูกค้า A",
            fields: {
              zone: "sukhumvit",
              service_date: "2026-09-20",
              service_time: "20:00",
              skills: ["aroma_therapy_oil"],
            },
            missing_fields: ["recipient_gender"],
            complete: false,
            canonical_submit: {
              ready: false,
              href: "/male-massage/member/mms-booking",
              route_kind: "mms_prebooking_entry",
              requires_customer_action: true,
              submitted_by_hype: false,
            },
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_transaction_mms");
    assert.equal(writerBody.mode, "mms");
    assert.match(telegramBody.text, /ผู้รับบริการเป็นผู้ชาย \/ ผู้หญิง \/ อื่น ๆ \/ ไม่ประสงค์ระบุ/);
    assert.doesNotMatch(JSON.stringify(writerBody.fields), /customer_gender|hall_audience|gender_source/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P5 transaction intake in a group never reads or writes customer transaction context", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let writerCalled = false;
  let telegramBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    telegramBody = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 1501, chat: { id: -1002073919780 } } });
  };

  try {
    const response = await worker.fetch(request({
      text: "อยากจอง dinner พรุ่งนี้ 19:00 สาทร",
      chat: { id: -1002073919780, type: "supergroup" },
    }), env({
      HYPE_CONTEXT_WRITER: {
        async fetch() {
          writerCalled = true;
          throw new Error("must not access transaction context from group");
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_transaction_private_required");
    assert.equal(writerCalled, false);
    assert.match(telegramBody.text, /แชตส่วนตัว/);
    assert.doesNotMatch(telegramBody.text, /Sathorn|dining|2026-/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
