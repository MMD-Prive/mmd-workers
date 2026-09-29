const DEFAULT_WAIT_MS = 650;
const DEFAULT_WINDOW_MS = 2_200;
const DEFAULT_MAX_MESSAGES = 4;
const MAX_WAIT_MS = 1_200;
const MAX_WINDOW_MS = 5_000;

function text(value) {
  return value == null ? "" : String(value).trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function lineUserId(event = {}) {
  const value = text(event?.source?.userId);
  return event?.source?.type === "user" && /^U[0-9a-f]{32}$/i.test(value) ? value : "";
}

function stableEventId(event = {}) {
  return text(event?.message?.id || event?.webhookEventId);
}

function customerText(event = {}) {
  return event?.type === "message" && event?.message?.type === "text"
    ? text(event.message.text).replace(/\s+/g, " ").slice(0, 1200)
    : "";
}

function textEventWith(event = {}, value = "") {
  return {
    ...event,
    message: {
      ...(event.message || {}),
      text: value,
    },
  };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function prepareKenjiLineWebhookBatch(events = []) {
  const source = Array.isArray(events) ? events : [];
  const grouped = new Map();
  source.forEach((event, index) => {
    const uid = lineUserId(event);
    const value = customerText(event);
    if (!uid || !value || event?.deliveryContext?.isRedelivery === true) return;
    if (!grouped.has(uid)) grouped.set(uid, []);
    grouped.get(uid).push({ index, event, value });
  });

  const metadata = new Map();
  for (const rows of grouped.values()) {
    if (rows.length < 2) continue;
    const aggregate = rows.map((row) => row.value).join("\n");
    rows.forEach((row, position) => {
      metadata.set(row.index, {
        suppressed: position !== rows.length - 1,
        aggregate_text: position === rows.length - 1 ? aggregate : row.value,
        aggregate_count: rows.length,
        aggregation_source: "webhook_batch",
      });
    });
  }

  return source.map((event, index) => {
    const meta = metadata.get(index);
    if (!meta) {
      return {
        raw_event: event,
        turn_event: event,
        suppressed: false,
        aggregate_count: customerText(event) ? 1 : 0,
        aggregation_source: "single",
      };
    }
    return {
      raw_event: event,
      turn_event: meta.suppressed ? event : textEventWith(event, meta.aggregate_text),
      suppressed: meta.suppressed,
      aggregate_count: meta.aggregate_count,
      aggregation_source: meta.aggregation_source,
    };
  });
}

export async function aggregateKenjiLineTurn({ env = {}, event = {}, batchCount = 1 } = {}) {
  const value = customerText(event);
  const uid = lineUserId(event);
  const eventId = stableEventId(event);
  if (!enabled(env.KENJI_LINE_MESSAGE_AGGREGATION_ENABLED)) {
    return { ok: true, event, should_reply: true, count: Math.max(1, Number(batchCount) || 1), source: "disabled" };
  }
  if (!value || !uid || !eventId || event?.deliveryContext?.isRedelivery === true) {
    return { ok: true, event, should_reply: true, count: value ? Math.max(1, Number(batchCount) || 1) : 0, source: "not_eligible" };
  }
  if (!env.KENJI_MODEL_DEDUPE?.idFromName || !env.KENJI_MODEL_DEDUPE?.get) {
    return { ok: true, event, should_reply: true, count: Math.max(1, Number(batchCount) || 1), source: "binding_unavailable" };
  }

  const waitMs = boundedInteger(env.KENJI_LINE_MESSAGE_AGGREGATION_WAIT_MS, DEFAULT_WAIT_MS, 0, MAX_WAIT_MS);
  const windowMs = boundedInteger(env.KENJI_LINE_MESSAGE_AGGREGATION_WINDOW_MS, DEFAULT_WINDOW_MS, 500, MAX_WINDOW_MS);
  const maxMessages = boundedInteger(env.KENJI_LINE_MESSAGE_AGGREGATION_MAX_MESSAGES, DEFAULT_MAX_MESSAGES, 2, 8);
  const uidHash = await sha256Hex(uid);
  const stub = env.KENJI_MODEL_DEDUPE.get(env.KENJI_MODEL_DEDUPE.idFromName(`kenji-line-turn-buffer-v1:${uidHash}`));

  try {
    const put = await stub.fetch("https://kenji-model-dedupe.internal/line-turn-buffer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "put",
        event_id: eventId,
        text: value,
        count: Math.max(1, Number(batchCount) || 1),
        received_at: Date.now(),
        window_ms: windowMs,
        max_messages: maxMessages,
      }),
    });
    const putPayload = await put.json().catch(() => ({}));
    if (!put.ok || putPayload?.ok !== true) {
      return { ok: true, event, should_reply: true, count: Math.max(1, Number(batchCount) || 1), source: "buffer_fail_open" };
    }

    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

    const claim = await stub.fetch("https://kenji-model-dedupe.internal/line-turn-buffer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "claim",
        event_id: eventId,
        window_ms: windowMs,
        max_messages: maxMessages,
      }),
    });
    const payload = await claim.json().catch(() => ({}));
    if (!claim.ok || payload?.ok !== true) {
      return { ok: true, event, should_reply: true, count: Math.max(1, Number(batchCount) || 1), source: "claim_fail_open" };
    }
    if (payload.should_reply !== true) {
      return {
        ok: true,
        event,
        should_reply: false,
        count: 0,
        source: payload.superseded === true ? "burst_superseded" : "burst_suppressed",
      };
    }

    const aggregateText = text(payload.aggregate_text).slice(0, 2400);
    return {
      ok: true,
      event: aggregateText ? textEventWith(event, aggregateText) : event,
      should_reply: true,
      count: Math.max(1, Number(payload.count) || Math.max(1, Number(batchCount) || 1)),
      source: Number(payload.count) > 1 ? "burst_aggregated" : "single",
    };
  } catch (_) {
    return { ok: true, event, should_reply: true, count: Math.max(1, Number(batchCount) || 1), source: "aggregation_error_fail_open" };
  }
}

export const KENJI_LINE_TURN_AGGREGATION_INTERNALS = Object.freeze({
  DEFAULT_WAIT_MS,
  DEFAULT_WINDOW_MS,
  DEFAULT_MAX_MESSAGES,
  MAX_WAIT_MS,
  MAX_WINDOW_MS,
  customerText,
  lineUserId,
  stableEventId,
});
