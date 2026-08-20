import crypto from "node:crypto";

import {
  buildAutoReplyMessage,
  getLineEventTextForIntent,
  inferIntent,
} from "../netlify/functions/webhook.js";
import {
  RETRY_SLIP_ACK,
  isImageMessage,
  loadRecentPaymentContext,
  looksLikePaymentSlipContext,
  processPaymentSlipImage,
} from "../netlify/functions/line-payment-slip-intake.mjs";

const DEFAULT_SYNC_TABLE = "MMD — Console Inbox";
const LINE_API_BASE = "https://api.line.me/v2/bot";
const PRICING_REVIEW_INTENTS = new Set(["pricing_review", "ask_where_to_get_rate", "image_rate_inquiry"]);
const FAQ_REPLY_INTENTS = new Set([
  "pricing_review",
  "ask_where_to_get_rate",
  "image_rate_inquiry",
  "image_only_model_inquiry",
  "package_difference",
  "upgrade_question",
  "membership_fee_reason",
  "model_photo_review_question",
  "talk_to_per_ai",
  "contact_admin",
]);
const KENJI_MEMBER_INTENTS = new Set([
  "talk_to_per_ai",
  "payment_slip",
  "points",
  "vip",
  "svip",
  "black_card",
  "membership",
  "create_session",
  "greeting",
]);

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  };
}

function encodeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function verifyLineSignature(rawBody, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const provided = Buffer.from(String(signature || ""), "utf8");
  const actual = Buffer.from(expected, "utf8");

  if (provided.length !== actual.length) return false;
  return crypto.timingSafeEqual(provided, actual);
}

function hasClientTag(text) {
  return /(^|\s)#client(\s|$)/i.test(String(text || ""));
}

function getMessageType(event) {
  return String(event?.message?.type || "").trim();
}

function getLineUserId(event) {
  return String(event?.source?.userId || event?.source?.groupId || event?.source?.roomId || "").trim();
}

function getReplyToken(event) {
  return String(event?.replyToken || "").trim();
}

function isKenjiMemberLineCandidate(text = "") {
  const normalized = String(text || "").toLowerCase();
  return /(kenji|เคนจิ|hi\s*per|สวัสดี\s*เปอร์|member|สมาชิก|renew|ต่ออายุ|point|แต้ม|vip|svip|black card|ส่งสลิป)/i.test(normalized);
}

function buildAirtableRecordWithProfile(event, profile) {
  const receivedAt = new Date().toISOString();
  const messageText = getLineEventTextForIntent(event);
  const lineUserId = getLineUserId(event);
  const eventId = String(event?.message?.id || event?.webhookEventId || `evt_${Date.now()}`);
  const migrationId = `line_${eventId}`;
  const intent = inferIntent(messageText, event);
  const airtableIntent = PRICING_REVIEW_INTENTS.has(intent) || intent === "payment_slip" || intent === "image_only_model_inquiry" ? "note_only" : intent;
  const messageType = getMessageType(event);
  const flags = [
    "line_webhook",
    event?.type ? `event:${event.type}` : "",
    messageType ? `message:${messageType}` : "",
    messageText ? "has_text" : "no_text",
    hasClientTag(messageText) ? "tag:client" : "",
    intent ? `intent:${intent}` : "",
  ].filter(Boolean);

  return {
    fields: {
      inbox_id: migrationId,
      created_by: "line-slip-intake-orchestration",
      source: "line",
      intent: airtableIntent,
      member_name: String(profile?.displayName || "").trim(),
      member_phone: "",
      line_user_id: lineUserId,
      line_id: eventId,
      legacy_tags: Array.from(new Set(flags)).join(", "),
      admin_note: messageText || `[${event?.type || "unknown"}] LINE event`,
      payload_json: JSON.stringify({
        migration_id: migrationId,
        source_channel: "line",
        source_user_id: lineUserId,
        source_message_id: eventId,
        received_at: receivedAt,
        raw_text: messageText,
        parsed_intent: intent,
        image_message_id: isImageMessage(event) ? String(event?.message?.id || "") : "",
        dedupe_status: "unresolved",
        event_type: String(event?.type || ""),
        message_type: messageType,
        client_tagged: hasClientTag(messageText),
        profile: profile || null,
      }),
      status: "new",
    },
  };
}

async function findExistingEvent({ baseId, apiKey, tableName, eventId, migrationId, fetchImpl }) {
  const table = encodeURIComponent(tableName || DEFAULT_SYNC_TABLE);
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${table}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set(
    "filterByFormula",
    `OR({line_id}="${encodeFormulaValue(eventId)}",{inbox_id}="${encodeFormulaValue(migrationId)}")`,
  );

  const response = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable dedupe lookup failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.records) ? payload.records[0] || null : null;
}

async function fetchLineProfile(accessToken, userId, fetchImpl) {
  if (!accessToken || !userId) return null;

  const response = await fetchImpl(`${LINE_API_BASE}/profile/${encodeURIComponent(userId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

async function sendLineReply(accessToken, replyToken, text, fetchImpl) {
  if (!accessToken || !replyToken || !text) return false;

  const response = await fetchImpl(`${LINE_API_BASE}/message/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
  });

  return response.ok;
}

async function writeEventToAirtable({ baseId, apiKey, tableName, event, profile, fetchImpl }) {
  const eventId = String(event?.message?.id || event?.webhookEventId || `evt_${Date.now()}`);
  const migrationId = `line_${eventId}`;
  const existing = await findExistingEvent({
    baseId,
    apiKey,
    tableName,
    eventId,
    migrationId,
    fetchImpl,
  });

  if (existing?.id) {
    return {
      id: existing.id,
      deduped: true,
    };
  }

  const table = encodeURIComponent(tableName || DEFAULT_SYNC_TABLE);
  const response = await fetchImpl(`https://api.airtable.com/v0/${baseId}/${table}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildAirtableRecordWithProfile(event, profile)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable write failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function withFetch(fetchImpl, callback) {
  const originalFetch = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export async function processLineSlipIntakeWebhook({
  rawBody,
  signature,
  env = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  return withFetch(fetchImpl, async () => {
    const lineChannelSecret = String(env.LINE_CHANNEL_SECRET || "");
    const lineChannelAccessToken = String(env.LINE_CHANNEL_ACCESS_TOKEN || "");
    const airtableApiKey = String(env.AIRTABLE_API_KEY || "");
    const airtableBaseId = String(env.AIRTABLE_BASE_ID || "");
    const airtableTableName = String(env.AIRTABLE_SYNC_TABLE || DEFAULT_SYNC_TABLE);
    const adminWorkerBaseUrl = String(env.ADMIN_WORKER_BASE_URL || "");
    const internalToken = String(env.INTERNAL_TOKEN || env.ADMIN_BEARER || "");
    const confirmKey = String(env.CONFIRM_KEY || "");
    const autoReplyEnabled = String(env.LINE_AUTO_REPLY_ENABLED || "false").toLowerCase() === "true";
    const lineModelLookupDebug = String(env.LINE_MODEL_LOOKUP_DEBUG || "");
    const lineWebhookDebug = String(env.LINE_WEBHOOK_DEBUG || "");
    const lineKenjiAiEnabled = String(env.LINE_KENJI_AI_ENABLED || "false").toLowerCase() === "true";
    const lineKenjiAiDebug = String(env.LINE_KENJI_AI_DEBUG || "false").toLowerCase() === "true";
    const lineOfficialChatUrl = String(env.LINE_OFFICIAL_CHAT_URL || "");

    if (!lineChannelSecret || !airtableApiKey || !airtableBaseId) {
      return json(500, {
        ok: false,
        error: "missing_env",
        required: ["LINE_CHANNEL_SECRET", "AIRTABLE_API_KEY", "AIRTABLE_BASE_ID"],
      });
    }

    if (!verifyLineSignature(String(rawBody || ""), signature, lineChannelSecret)) {
      return json(401, { ok: false, error: "invalid_signature" });
    }

    let payload;
    try {
      payload = JSON.parse(String(rawBody || "{}"));
    } catch {
      return json(400, { ok: false, error: "invalid_json" });
    }

    const events = Array.isArray(payload.events) ? payload.events : [];
    const saved = [];

    for (const item of events) {
      const lineUserId = getLineUserId(item);
      const messageText = getLineEventTextForIntent(item);
      const clientTagged = hasClientTag(messageText);
      const intent = inferIntent(messageText, item);
      const shouldFetchProfile =
        (clientTagged || intent === "model_availability" || FAQ_REPLY_INTENTS.has(intent) || (lineKenjiAiEnabled && (KENJI_MEMBER_INTENTS.has(intent) || isKenjiMemberLineCandidate(messageText)))) &&
        item?.source?.type === "user" &&
        lineChannelAccessToken;
      const profile = shouldFetchProfile ? await fetchLineProfile(lineChannelAccessToken, lineUserId, fetchImpl) : null;
      const recentContext = isImageMessage(item)
        ? await loadRecentPaymentContext({ env, lineUserId, fetchImpl })
        : [];
      const paymentSlipCandidate = looksLikePaymentSlipContext(item, recentContext);
      const paymentSlipProfile = paymentSlipCandidate && !profile && item?.source?.type === "user" && lineChannelAccessToken
        ? await fetchLineProfile(lineChannelAccessToken, lineUserId, fetchImpl)
        : profile;
      const paymentSlipResult = paymentSlipCandidate
        ? await processPaymentSlipImage({ env, event: item, fetchImpl }).catch((error) => ({
            ok: false,
            deduped: false,
            state: "retry_required",
            error: String(error?.message || error || "payment_slip_intake_failed"),
            replyText: RETRY_SLIP_ACK,
          }))
        : null;
      const record = await writeEventToAirtable({
        baseId: airtableBaseId,
        apiKey: airtableApiKey,
        tableName: airtableTableName,
        event: item,
        profile: paymentSlipProfile,
        fetchImpl,
      });
      const replyText = paymentSlipCandidate
        ? String(paymentSlipResult?.replyText || "")
        : await buildAutoReplyMessage(item, profile, {
            airtableBaseId,
            airtableApiKey,
            adminWorkerBaseUrl,
            internalToken,
            confirmKey,
            lineModelLookupDebug,
            lineWebhookDebug,
            lineKenjiAiEnabled,
            lineKenjiAiDebug,
            lineOfficialChatUrl,
            createPricingReviewEnabled: !record?.deduped,
          });
      const isSlipRedelivery = Boolean(paymentSlipCandidate && item?.deliveryContext?.isRedelivery);
      const shouldReply = Boolean((!record?.deduped || isSlipRedelivery) && autoReplyEnabled && replyText && getReplyToken(item));
      let replied = false;
      if (shouldReply) {
        try {
          replied = await sendLineReply(lineChannelAccessToken, getReplyToken(item), replyText, fetchImpl);
        } catch {
          replied = false;
        }
        if (!replied && paymentSlipCandidate) {
          console.error(JSON.stringify({ event: "line_payment_slip_reply_failed", category: "line_reply_failed", state: String(paymentSlipResult?.state || "retry_required") }));
          return json(502, { ok: false, error: "line_payment_slip_reply_failed", processed: saved.length });
        }
      }
      saved.push({
        id: record?.id || "",
        deduped: Boolean(record?.deduped),
        type: item?.type || "",
        intent,
        client_tagged: clientTagged,
        specific_model_requested: intent === "model_availability",
        replied,
        profile_name: String(profile?.displayName || ""),
        line_user_id: lineUserId,
        message_id: String(item?.message?.id || item?.webhookEventId || ""),
        payment_slip_intake: paymentSlipCandidate
          ? {
              ok: Boolean(paymentSlipResult?.ok),
              deduped: Boolean(paymentSlipResult?.deduped),
              proof_id: String(paymentSlipResult?.proofId || ""),
              state: String(paymentSlipResult?.state || "manual_review"),
              review_required: Boolean(paymentSlipResult?.reviewRequired),
              duplicate_payment_ref: Boolean(paymentSlipResult?.duplicatePaymentRef),
              extraction_method: String(paymentSlipResult?.extractionMethod || ""),
            }
          : null,
      });
    }

    return json(200, {
      ok: true,
      processed: events.length,
      saved,
    });
  });
}
