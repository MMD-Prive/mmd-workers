import currentWorker from "./front-gate-index.js";
export { KenjiModelIdempotency } from "./front-gate-index.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/"]);
const DEFAULT_SYNC_TABLE = "MMD — Console Inbox";

function asString(value) {
  return String(value || "").trim();
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function timingSafeStringEqual(a, b) {
  const left = asString(a);
  const right = asString(b);
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function createLineSignature(rawBody, channelSecret) {
  const secret = asString(channelSecret);
  if (!secret) return "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(rawBody || "")));
  return bytesToBase64(signature);
}

async function verifyLineSignature(rawBody, signature, channelSecret) {
  const expected = await createLineSignature(rawBody, channelSecret);
  return timingSafeStringEqual(expected, signature);
}

function getAirtableTable(env = {}) {
  return asString(env.AIRTABLE_SYNC_TABLE || env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || DEFAULT_SYNC_TABLE);
}

function encodeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function eventId(event = {}) {
  return asString(event?.message?.id || event?.webhookEventId || event?.replyToken);
}

function eventText(event = {}) {
  if (event?.type === "message" && event?.message?.type === "text") return asString(event.message.text);
  if (event?.type === "postback") return asString(event?.postback?.displayText || event?.postback?.data);
  return "";
}

function sourceIdentity(event = {}) {
  const source = event?.source || {};
  return {
    type: asString(source.type) || "unknown",
    userId: asString(source.userId),
    groupId: asString(source.groupId),
    roomId: asString(source.roomId),
  };
}

async function findExistingGroupEvent(env = {}, id = "") {
  const apiKey = asString(env.AIRTABLE_API_KEY);
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const table = getAirtableTable(env);
  if (!apiKey || !baseId || !table || !id) return null;

  const inboxId = `line_${id}`;
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("filterByFormula", `OR({line_id}=\"${encodeFormulaValue(id)}\",{inbox_id}=\"${encodeFormulaValue(inboxId)}\")`);

  const response = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.records) ? payload.records[0] || null : null;
}

async function persistGroupEvent(env = {}, event = {}) {
  const id = eventId(event);
  const source = sourceIdentity(event);
  if (!id || source.type !== "group" || !source.groupId) return { skipped: true, reason: "not_group_event" };

  const apiKey = asString(env.AIRTABLE_API_KEY);
  const baseId = asString(env.AIRTABLE_BASE_ID);
  const table = getAirtableTable(env);
  if (!apiKey || !baseId || !table) return { skipped: true, reason: "airtable_env_missing" };

  const existing = await findExistingGroupEvent(env, id);
  if (existing?.id) return { id: existing.id, deduped: true };

  const text = eventText(event);
  const messageType = asString(event?.message?.type) || "unknown";
  const sourceId = source.userId || source.groupId;
  const record = {
    fields: {
      inbox_id: `line_${id}`,
      source: "line",
      intent: text ? "note_only" : "line_event",
      member_name: "",
      line_user_id: sourceId,
      line_id: id,
      admin_note: text || `[message:${messageType}] LINE group event`,
      payload_json: JSON.stringify({
        source_channel: "line",
        source_type: "group",
        source_user_id: source.userId,
        source_group_id: source.groupId,
        source_message_id: id,
        message_type: messageType,
        received_at: new Date().toISOString(),
        parsed_intent: text ? "note_only" : "line_event",
        raw_text: text,
        evidence_only: messageType === "image",
      }),
      status: "new",
    },
  };

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    console.log(JSON.stringify({
      line_group_ingress: "airtable_write_failed",
      event_type: asString(event?.type) || "unknown",
      message_type: messageType,
      status: response.status,
    }));
    return { skipped: true, reason: "airtable_write_failed", status: response.status };
  }

  const payload = await response.json().catch(() => ({}));
  console.log(JSON.stringify({
    line_group_ingress: "observed",
    event_type: asString(event?.type) || "unknown",
    message_type: messageType,
    group_source_present: true,
    user_source_present: Boolean(source.userId),
  }));
  return { id: payload?.id || "", deduped: false };
}

async function observeSignedGroupEvents(request, env = {}) {
  const rawBody = await request.text();
  const signature = asString(request.headers.get("x-line-signature"));
  const valid = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
  if (!valid) return;

  let body;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    return;
  }

  const events = Array.isArray(body.events) ? body.events : [];
  for (const event of events) {
    if (event?.source?.type !== "group") continue;
    await persistGroupEvent(env, event);
  }
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    const isLineWebhook = request.method === "POST" && LINE_WEBHOOK_PATHS.has(url.pathname);
    const observerRequest = isLineWebhook ? request.clone() : null;

    const response = await currentWorker.fetch(request, env, ctx);

    if (observerRequest && response.ok) {
      const work = observeSignedGroupEvents(observerRequest, env).catch(() => {
        console.log(JSON.stringify({ line_group_ingress: "observer_failed" }));
      });
      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
      else await work;
    }

    return response;
  },
};
