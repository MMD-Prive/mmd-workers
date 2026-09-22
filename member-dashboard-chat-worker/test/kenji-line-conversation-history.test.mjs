import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildKenjiLineConversationHistory,
  buildKenjiLineConversationMemory,
  recordDeliveredKenjiLineReply,
} from "../src/kenji-line-conversation-history.mjs";

const LINE_USER_ID = "U0123456789abcdef0123456789abcdef";
const ENV = {
  AIRTABLE_API_KEY: "test-key",
  AIRTABLE_BASE_ID: "app-test",
  AIRTABLE_TABLE_CONSOLE_INBOX_ID: "tblInbox",
  KENJI_LINE_CONVERSATION_SHADOW_ENABLED: "true",
};

function event(text = "เปลี่ยนเป็นสามทุ่มนะ") {
  return {
    type: "message",
    source: { type: "user", userId: LINE_USER_ID },
    message: { id: "msg-current", type: "text", text },
  };
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

test("conversation history retains same-customer turns and only actual sent assistant answers", async () => {
  const history = await buildKenjiLineConversationHistory({
    env: ENV,
    event: event(),
    fetchImpl: async () => response({
      records: [
        {
          id: "recCustomer",
          fields: {
            source: "line",
            created_at: "2026-09-22T10:00:00.000Z",
            admin_note: "เสาร์นี้ สองทุ่ม สุขุมวิท",
            payload_json: JSON.stringify({ raw_text: "เสาร์นี้ สองทุ่ม สุขุมวิท" }),
          },
        },
        {
          id: "recDraft",
          fields: {
            source: "line_ofc_outbound",
            status: "draft",
            created_at: "2026-09-22T10:01:00.000Z",
            admin_note: "ข้อความร่างที่ห้ามถือว่าส่งแล้ว",
            payload_json: JSON.stringify({ direction: "outbound", sent_text: "ข้อความร่างที่ห้ามถือว่าส่งแล้ว" }),
          },
        },
        {
          id: "recSent",
          fields: {
            source: "line_ofc_outbound",
            status: "sent",
            created_at: "2026-09-22T10:02:00.000Z",
            admin_note: "รับทราบครับ สรุปเป็นเสาร์ สองทุ่ม สุขุมวิท",
            payload_json: JSON.stringify({ direction: "outbound", actual_sent: true, sent_text: "รับทราบครับ สรุปเป็นเสาร์ สองทุ่ม สุขุมวิท" }),
          },
        },
      ],
    }),
  });

  assert.equal(history.available, true);
  assert.equal(history.turns.length, 3);
  assert.deepEqual(history.turns.map((turn) => turn.role), ["customer", "assistant", "customer"]);
  assert.equal(history.turns.some((turn) => turn.content.includes("ข้อความร่าง")), false);
  assert.equal(history.coverage.confirmed_assistant_messages, 1);
  assert.equal(history.coverage.reply_history_complete, true);
});

test("missing outbound evidence remains explicit instead of inventing an earlier reply", async () => {
  const history = await buildKenjiLineConversationHistory({
    env: ENV,
    event: event("แต่แพงไปหน่อย"),
    fetchImpl: async () => response({
      records: [{
        id: "recCustomer",
        fields: {
          source: "line",
          created_at: "2026-09-22T10:00:00.000Z",
          payload_json: JSON.stringify({ raw_text: "ชอบคนนี้ครับ" }),
        },
      }],
    }),
  });

  assert.equal(history.coverage.customer_messages, 2);
  assert.equal(history.coverage.confirmed_assistant_messages, 0);
  assert.equal(history.coverage.reply_history_complete, false);
});

test("customer correction patches only the stated appointment field", () => {
  const memory = buildKenjiLineConversationMemory([
    { role: "customer", content: "เสาร์นี้ สองทุ่ม สุขุมวิท", occurred_at: "2026-09-22T10:00:00.000Z", evidence: "customer_received" },
    { role: "assistant", content: "รับทราบครับ สรุปเป็นเสาร์ สองทุ่ม สุขุมวิท", occurred_at: "2026-09-22T10:01:00.000Z", evidence: "actual_sent" },
    { role: "customer", content: "เปลี่ยนเป็นสามทุ่มนะ", occurred_at: "2026-09-22T10:02:00.000Z", evidence: "customer_received" },
  ]);

  assert.equal(memory.summary, "ข้อมูลนัดหมายที่ลูกค้าระบุ: วัน เสาร์นี้ · เวลา 21:00 · พื้นที่ สุขุมวิท");
  assert.deepEqual(memory.known_facts.map((item) => [item.field, item.value]), [
    ["day", "เสาร์นี้"], ["time", "21:00"], ["area", "สุขุมวิท"],
  ]);
  assert.deepEqual(memory.corrections, [{
    field: "time", previous_value: "20:00", next_value: "21:00",
    occurred_at: "2026-09-22T10:02:00.000Z", evidence: "customer_correction",
  }]);
});

test("a pending question exists only until the customer replies", () => {
  const pending = buildKenjiLineConversationMemory([
    { role: "customer", content: "สนใจ Sansui", occurred_at: "2026-09-22T10:00:00.000Z", evidence: "customer_received" },
    { role: "assistant", content: "สะดวกวันไหนครับ?", occurred_at: "2026-09-22T10:01:00.000Z", evidence: "actual_sent" },
  ]);
  assert.equal(pending.pending_questions.length, 1);
  // A customer turn after the question clears it instead of carrying a stale
  // request into the next reply.
  const cleared = buildKenjiLineConversationMemory([
    { role: "customer", content: "สนใจ Sansui", occurred_at: "2026-09-22T10:00:00.000Z", evidence: "customer_received" },
    { role: "assistant", content: "สะดวกวันไหนครับ?", occurred_at: "2026-09-22T10:01:00.000Z", evidence: "actual_sent" },
    { role: "customer", content: "เสาร์นี้", occurred_at: "2026-09-22T10:02:00.000Z", evidence: "customer_received" },
  ]);
  assert.equal(cleared.pending_questions.length, 0);
});

test("history lookup is scoped to the LINE user and cannot mix customer memory", async () => {
  let requestedUrl = "";
  await buildKenjiLineConversationHistory({
    env: ENV,
    event: event("นัดวันเสาร์"),
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return response({ records: [] });
    },
  });
  assert.match(requestedUrl, /line_user_id/);
  assert.match(decodeURIComponent(requestedUrl), new RegExp(LINE_USER_ID));
});

test("delivered Kenji reply is written as an actual outbound turn and deduped", async () => {
  const calls = [];
  const result = await recordDeliveredKenjiLineReply({
    env: ENV,
    event: event(),
    replyText: "รับทราบครับ ผมปรับเวลาเป็นสามทุ่ม โดยคงวันและสุขุมวิทไว้",
    sentAt: "2026-09-22T11:00:00.000Z",
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (init.method === "POST") return response({ id: "recOutbound" });
      return response({ records: [] });
    },
  });

  assert.equal(result.id, "recOutbound");
  const write = calls.find((call) => call.init.method === "POST");
  const fields = JSON.parse(write.init.body).fields;
  assert.equal(fields.source, "line_ofc_outbound");
  assert.equal(fields.status, "sent");
  const payload = JSON.parse(fields.payload_json);
  assert.equal(payload.actual_sent, true);
  assert.equal(payload.sent_text, "รับทราบครับ ผมปรับเวลาเป็นสามทุ่ม โดยคงวันและสุขุมวิทไว้");
});

test("feature flag keeps conversation transcript capture off by default", async () => {
  const result = await buildKenjiLineConversationHistory({ env: {}, event: event() });
  assert.equal(result.enabled, false);
  assert.equal(result.turns.length, 0);
  assert.equal(result.reason, "conversation_shadow_disabled");
});

test("Phase 1 production config observes conversation history while LINE delivery stays muted", () => {
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /^KENJI_LINE_CONVERSATION_SHADOW_ENABLED\s*=\s*"true"$/m);
  assert.match(wrangler, /^KENJI_AI_WORKER_BRIDGE_ENABLED\s*=\s*"true"$/m);
  assert.match(wrangler, /^LINE_AUTO_REPLY_ENABLED\s*=\s*"false"$/m);
});
