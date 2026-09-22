const CONSOLE_INBOX_TABLE_FALLBACK = "tblFHmfpB2TTrzO2e";
const AI_MESSAGE_EVENTS_TABLE_FALLBACK = "tbljCYfYqfm8gBTPq";
const HISTORY_LIMIT = 50;
const TURN_TEXT_MAX = 900;
const CONTEXT_TURN_LIMIT = 24;
const HISTORY_READ_TIMEOUT_MS = 1_200;
const MEMORY_TEXT_MAX = 220;
const THAI_DIGITS = new Map([
  ["หนึ่ง", 1], ["สอง", 2], ["สาม", 3], ["สี่", 4], ["ห้า", 5],
  ["หก", 6], ["เจ็ด", 7], ["แปด", 8], ["เก้า", 9],
]);
const DAY_PATTERNS = [
  "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์", "วันอาทิตย์",
  "จันทร์นี้", "อังคารนี้", "พุธนี้", "พฤหัสนี้", "ศุกร์นี้", "เสาร์นี้", "อาทิตย์นี้",
  "วันนี้", "พรุ่งนี้", "มะรืนนี้",
];
const AREA_PATTERNS = [
  "สุขุมวิท", "ทองหล่อ", "เอกมัย", "สาทร", "สีลม", "อโศก", "พร้อมพงษ์", "เพลินจิต", "ชิดลม",
  "สุขุมวิท", "ลาดพร้าว", "รัชดา", "พระรามเก้า", "อารีย์", "พญาไท", "ปทุมวัน", "เยาวราช",
];

export const KENJI_LINE_CONVERSATION_SHADOW_ENABLED_ENV = "KENJI_LINE_CONVERSATION_SHADOW_ENABLED";
export const KENJI_LINE_CONVERSATION_HISTORY_SCHEMA = "mmd.kenji_line_conversation_history.v1";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function object(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function boundedText(value, max = TURN_TEXT_MAX) {
  return text(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function consoleInboxTable(env = {}) {
  return text(env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || env.AIRTABLE_SYNC_TABLE || CONSOLE_INBOX_TABLE_FALLBACK);
}

function aiMessageEventsTable(env = {}) {
  return text(env.AIRTABLE_TABLE_AI_MESSAGE_EVENTS_ID || AI_MESSAGE_EVENTS_TABLE_FALLBACK);
}

function canonicalLineUserId(event = {}) {
  const value = text(event?.source?.userId);
  return /^U[0-9a-f]{32}$/i.test(value) ? value : "";
}

function eventId(event = {}) {
  return text(event?.message?.id || event?.webhookEventId);
}

function eventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return boundedText(event.message.text);
  if (event?.type === "postback") return boundedText(event?.postback?.displayText || event?.postback?.data);
  return "";
}

function escapeFormula(value) {
  return text(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function listAirtableHistory(env = {}, lineUserId = "", fetchImpl = fetch) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = consoleInboxTable(env);
  if (!apiKey || !baseId || !table || !lineUserId) {
    return { ok: false, records: [], reason: "history_storage_unavailable" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_conversation_history_timeout"), HISTORY_READ_TIMEOUT_MS);
  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", String(HISTORY_LIMIT));
    url.searchParams.set("filterByFormula", `{line_user_id}=\"${escapeFormula(lineUserId)}\"`);
    ["inbox_id", "line_id", "created_at", "source", "admin_note", "payload_json", "status"].forEach((field) => {
      url.searchParams.append("fields[]", field);
    });
    const response = await fetchImpl(url.toString(), {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, records: [], reason: `history_storage_http_${response.status}` };
    const payload = await response.json().catch(() => ({}));
    return { ok: true, records: Array.isArray(payload?.records) ? payload.records : [], reason: "" };
  } catch (_) {
    return { ok: false, records: [], reason: "history_storage_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

async function listAirtableDeliveredReplies(env = {}, lineUserId = "", fetchImpl = fetch) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = aiMessageEventsTable(env);
  if (!apiKey || !baseId || !table || !lineUserId) {
    return { ok: false, records: [], reason: "outbound_history_storage_unavailable" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_outbound_history_timeout"), HISTORY_READ_TIMEOUT_MS);
  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", String(HISTORY_LIMIT));
    url.searchParams.set(
      "filterByFormula",
      `AND({line_user_id}="${escapeFormula(lineUserId)}",{channel}="LINE_OFC",{final_status}="sent")`,
    );
    [
      "event_id",
      "created_at",
      "channel",
      "line_user_id",
      "generated_reply",
      "response_mode",
      "final_status",
      "payload_json",
    ].forEach((field) => url.searchParams.append("fields[]", field));
    const response = await fetchImpl(url.toString(), {
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, records: [], reason: `outbound_history_http_${response.status}` };
    const payload = await response.json().catch(() => ({}));
    return { ok: true, records: Array.isArray(payload?.records) ? payload.records : [], reason: "" };
  } catch (_) {
    return { ok: false, records: [], reason: "outbound_history_storage_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

function outboundWasActuallySent(fields = {}, payload = {}) {
  const status = text(payload.delivery_status || payload.line_delivery_status || fields.status).toLowerCase();
  return payload.actual_sent === true
    || payload.line_delivery_succeeded === true
    || ["sent", "delivered", "confirmed_sent"].includes(status);
}

function turnFromRecord(record = {}) {
  const fields = object(record.fields);
  const payload = object(fields.payload_json);
  const source = text(fields.source).toLowerCase();
  const outbound = source === "line_ofc_outbound" || text(payload.direction).toLowerCase() === "outbound";
  const role = outbound ? "assistant" : "customer";
  if (outbound && !outboundWasActuallySent(fields, payload)) return null;

  const content = role === "assistant"
    ? boundedText(payload.sent_text || payload.reply_text || payload.actual_text || fields.admin_note)
    : boundedText(payload.raw_text || fields.admin_note);
  if (!content) return null;

  return {
    role,
    content,
    occurred_at: text(payload.sent_at || payload.received_at || fields.created_at || record.createdTime),
    evidence: role === "assistant" ? "actual_sent" : "customer_received",
  };
}

function turnFromAiMessageEvent(record = {}) {
  const fields = object(record.fields);
  const payload = object(fields.payload_json);
  const finalStatus = text(fields.final_status).toLowerCase();
  const channel = text(fields.channel).toUpperCase();
  const deliverySucceeded = payload.line_delivery_succeeded === true
    || (payload.line_delivery_attempted === true && Number(payload.line_delivery_status) >= 200 && Number(payload.line_delivery_status) < 300);
  if (channel !== "LINE_OFC" || finalStatus !== "sent" || !deliverySucceeded) return null;

  const content = boundedText(fields.generated_reply || payload.sent_text || payload.reply_text);
  if (!content) return null;

  return {
    role: "assistant",
    content,
    occurred_at: text(fields.created_at || record.createdTime),
    evidence: "line_delivery_succeeded",
    source_event_id: text(fields.event_id),
  };
}

function currentInboundTurn(event = {}) {
  const content = eventText(event);
  if (!content) return null;
  return {
    role: "customer",
    content,
    occurred_at: new Date().toISOString(),
    evidence: "current_webhook",
    source_event_id: eventId(event),
  };
}

function dedupeTurns(turns = []) {
  const seen = new Set();
  return turns.filter((turn) => {
    const key = `${turn.role}|${turn.occurred_at}|${turn.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function thaiNumber(value = "") {
  const cleanValue = text(value).toLowerCase();
  if (/^\d+$/.test(cleanValue)) return Number(cleanValue);
  return THAI_DIGITS.get(cleanValue) || 0;
}

function extractTime(value = "") {
  const message = boundedText(value, MEMORY_TEXT_MAX).toLowerCase();
  const colon = message.match(/(?:เวลา\s*)?(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (colon) {
    const hour = Number(colon[1]), minute = Number(colon[2]);
    if (hour < 24 && minute < 60) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const evening = message.match(/(?:เวลา\s*)?(หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|\d{1,2})\s*ทุ่ม/);
  if (evening) {
    const hour = thaiNumber(evening[1]);
    if (hour >= 1 && hour <= 5) return `${String(hour + 18).padStart(2, "0")}:00`;
    if (hour >= 6 && hour <= 9) return `${String(hour + 12).padStart(2, "0")}:00`;
  }
  const oClock = message.match(/(?:เวลา\s*)?(\d{1,2})\s*โมง(?:\s*(\d{1,2}))?/);
  if (oClock) {
    const hour = Number(oClock[1]), minute = Number(oClock[2] || 0);
    if (hour < 24 && minute < 60) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return "";
}

function extractFirstPattern(message = "", patterns = []) {
  const lower = boundedText(message, MEMORY_TEXT_MAX).toLowerCase();
  return patterns.find((item) => lower.includes(item.toLowerCase())) || "";
}

function extractCustomerFacts(content = "") {
  return {
    day: extractFirstPattern(content, DAY_PATTERNS),
    time: extractTime(content),
    area: extractFirstPattern(content, AREA_PATTERNS),
  };
}

function isCorrection(content = "") {
  return /(เปลี่ยน|เลื่อน|แก้|แทน|ปรับเป็น|ย้ายเป็น|ไม่ใช่)/.test(boundedText(content, MEMORY_TEXT_MAX));
}

function questionFromAssistant(content = "") {
  const cleanContent = boundedText(content, MEMORY_TEXT_MAX);
  if (!/[?？]|(ไหม|มั้ย|หรือครับ|หรือคะ)\s*$/u.test(cleanContent)) return "";
  return cleanContent;
}

// This deterministic projection is deliberately evidence-preserving: it does
// not infer facts a customer did not state. A correction only replaces the
// field present in that message, so "เปลี่ยนเป็นสามทุ่ม" keeps a previously
// stated day and area intact.
export function buildKenjiLineConversationMemory(turns = []) {
  const facts = {};
  const corrections = [];
  let pendingQuestion = null;
  let latestCustomer = "";

  for (const turn of turns) {
    if (turn.role === "assistant") {
      const question = questionFromAssistant(turn.content);
      if (question) pendingQuestion = { question, occurred_at: turn.occurred_at, evidence: turn.evidence };
      continue;
    }
    if (turn.role !== "customer") continue;
    latestCustomer = boundedText(turn.content, MEMORY_TEXT_MAX);
    // Any customer reply arrives after the earlier question, so it cannot stay
    // marked as pending without stronger structured evidence.
    pendingQuestion = null;
    const stated = extractCustomerFacts(turn.content);
    const correction = isCorrection(turn.content);
    for (const [field, value] of Object.entries(stated)) {
      if (!value) continue;
      const previous = facts[field];
      if (previous?.value && previous.value !== value && correction) {
        corrections.push({
          field,
          previous_value: previous.value,
          next_value: value,
          occurred_at: turn.occurred_at,
          evidence: "customer_correction",
        });
      }
      facts[field] = {
        value,
        occurred_at: turn.occurred_at,
        evidence: "customer_stated",
      };
    }
  }

  const knownFacts = Object.entries(facts).map(([field, detail]) => ({ field, ...detail }));
  const appointment = [
    facts.day ? `วัน ${facts.day.value}` : "",
    facts.time ? `เวลา ${facts.time.value}` : "",
    facts.area ? `พื้นที่ ${facts.area.value}` : "",
  ].filter(Boolean).join(" · ");
  return {
    schema: "mmd.kenji_line_conversation_memory.v1",
    // Short operational summary only. Full evidence remains in turns.
    summary: appointment ? `ข้อมูลนัดหมายที่ลูกค้าระบุ: ${appointment}` : (latestCustomer ? `ข้อความล่าสุดจากลูกค้า: ${latestCustomer}` : "ยังไม่มีข้อมูลสรุป"),
    known_facts: knownFacts,
    pending_questions: pendingQuestion ? [pendingQuestion] : [],
    corrections: corrections.slice(-8),
    latest_customer_message: latestCustomer,
  };
}

export async function buildKenjiLineConversationHistory({ env = {}, event = {}, fetchImpl = fetch } = {}) {
  if (!enabled(env[KENJI_LINE_CONVERSATION_SHADOW_ENABLED_ENV])) {
    return {
      enabled: false,
      available: false,
      schema: KENJI_LINE_CONVERSATION_HISTORY_SCHEMA,
      turns: [],
      coverage: { customer_messages: 0, confirmed_assistant_messages: 0, reply_history_complete: false },
      reason: "conversation_shadow_disabled",
    };
  }

  const lineUserId = canonicalLineUserId(event);
  if (!lineUserId) {
    return {
      enabled: true,
      available: false,
      schema: KENJI_LINE_CONVERSATION_HISTORY_SCHEMA,
      turns: [],
      coverage: { customer_messages: 0, confirmed_assistant_messages: 0, reply_history_complete: false },
      reason: "line_identity_unavailable",
    };
  }

  const [stored, delivered] = await Promise.all([
    listAirtableHistory(env, lineUserId, fetchImpl),
    listAirtableDeliveredReplies(env, lineUserId, fetchImpl),
  ]);
  const turns = dedupeTurns([
    ...stored.records.map(turnFromRecord).filter(Boolean),
    ...delivered.records.map(turnFromAiMessageEvent).filter(Boolean),
    currentInboundTurn(event),
  ].filter(Boolean))
    .sort((left, right) => String(left.occurred_at).localeCompare(String(right.occurred_at)))
    .slice(-CONTEXT_TURN_LIMIT);
  const customerMessages = turns.filter((turn) => turn.role === "customer").length;
  const confirmedAssistantMessages = turns.filter((turn) => (
    turn.role === "assistant"
    && ["actual_sent", "line_delivery_succeeded"].includes(turn.evidence)
  )).length;
  const memory = buildKenjiLineConversationMemory(turns);

  return {
    enabled: true,
    available: stored.ok || delivered.ok,
    schema: KENJI_LINE_CONVERSATION_HISTORY_SCHEMA,
    turns,
    memory,
    coverage: {
      customer_messages: customerMessages,
      confirmed_assistant_messages: confirmedAssistantMessages,
      // Kenji must never invent an earlier promise when no actual outbound
      // message has been captured. This stays false until the operator/LINE
      // delivery record exists, even if customer history is present.
      reply_history_complete: confirmedAssistantMessages > 0,
    },
    reason: stored.ok || delivered.ok ? "ready" : (stored.reason || delivered.reason || "history_storage_unavailable"),
  };
}

async function findExistingOutboundTurn(env = {}, outboundId = "", fetchImpl = fetch) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = consoleInboxTable(env);
  if (!apiKey || !baseId || !table || !outboundId) return null;
  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "1");
    url.searchParams.set("filterByFormula", `{inbox_id}=\"${escapeFormula(outboundId)}\"`);
    const response = await fetchImpl(url.toString(), { headers: { authorization: `Bearer ${apiKey}` } });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload?.records) ? payload.records[0] || null : null;
  } catch (_) {
    return null;
  }
}

export async function recordDeliveredKenjiLineReply({ env = {}, event = {}, replyText = "", sentAt = new Date().toISOString(), fetchImpl = fetch } = {}) {
  if (!enabled(env[KENJI_LINE_CONVERSATION_SHADOW_ENABLED_ENV])) return { skipped: true, reason: "conversation_shadow_disabled" };
  const lineUserId = canonicalLineUserId(event);
  const sourceEventId = eventId(event);
  const answer = boundedText(replyText, 1600);
  if (!lineUserId || !sourceEventId || !answer) return { skipped: true, reason: "outbound_turn_incomplete" };

  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = consoleInboxTable(env);
  if (!apiKey || !baseId || !table) return { skipped: true, reason: "history_storage_unavailable" };

  const inboxId = `line_outbound_${sourceEventId}`.slice(0, 160);
  const existing = await findExistingOutboundTurn(env, inboxId, fetchImpl);
  if (existing?.id) return { id: text(existing.id), deduped: true };

  try {
    const response = await fetchImpl(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        fields: {
          inbox_id: inboxId,
          source: "line_oa",
          line_user_id: lineUserId,
          line_id: `outbound_${sourceEventId}`.slice(0, 160),
          admin_note: answer,
          status: "done",
          payload_json: JSON.stringify({
            schema: KENJI_LINE_CONVERSATION_HISTORY_SCHEMA,
            direction: "outbound",
            actual_sent: true,
            delivery_status: "sent",
            source_event_id: sourceEventId,
            sent_at: sentAt,
            sent_text: answer,
          }),
        },
      }),
    });
    if (!response.ok) return { skipped: true, reason: "outbound_turn_write_failed", status: response.status };
    const payload = await response.json().catch(() => ({}));
    return { id: text(payload?.id), deduped: false };
  } catch (_) {
    return { skipped: true, reason: "outbound_turn_write_failed" };
  }
}
