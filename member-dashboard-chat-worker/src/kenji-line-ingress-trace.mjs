const TRACE_TABLE_FALLBACK = "tblPpkRvqCoTKVlzj";
const TRACE_RETENTION_DAYS = 7;
const HASH_PREFIX_LENGTH = 24;
const PRODUCTION_LINE_HOSTS = new Set(["mmdbkk.com", "www.mmdbkk.com"]);

function text(value) {
  return value == null ? "" : String(value).trim();
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function boundedToken(value, fallback = "unknown", max = 48) {
  const token = text(value).toLowerCase();
  if (!token || !/^[a-z0-9_.:-]+$/i.test(token)) return fallback;
  return token.slice(0, max);
}

async function sha256Prefix(value) {
  const input = text(value);
  if (!input) return "";
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, HASH_PREFIX_LENGTH);
}

function traceTable(env = {}) {
  return text(env.AIRTABLE_TABLE_LINE_WEBHOOK_INGRESS_TRACE_ID || TRACE_TABLE_FALLBACK);
}

function traceEnabled(env = {}, request = null) {
  const configured = text(env.KENJI_LINE_INGRESS_TRACE_ENABLED);
  if (configured) return enabled(configured);
  try {
    return PRODUCTION_LINE_HOSTS.has(new URL(request?.url || "").hostname.toLowerCase());
  } catch (_) {
    return false;
  }
}

function addDaysIso(iso, days) {
  const base = new Date(iso);
  return new Date(base.getTime() + days * 86400000).toISOString();
}

function safeEventSummary(body = {}) {
  const events = Array.isArray(body?.events) ? body.events : [];
  const first = events[0] || {};
  const sourceType = ["user", "group", "room"].includes(text(first?.source?.type).toLowerCase())
    ? text(first.source.type).toLowerCase()
    : "unknown";
  return {
    event_count: events.length,
    event_type: boundedToken(first?.type),
    event_mode: boundedToken(first?.mode),
    webhook_event_id: text(first?.webhookEventId),
    redelivery: events.some((event) => event?.deliveryContext?.isRedelivery === true),
    source_type: sourceType,
    message_type: first?.type === "message" ? boundedToken(first?.message?.type) : "none",
  };
}

export async function buildKenjiLineIngressSnapshot(request, rawBody, nowIso = new Date().toISOString()) {
  let body = {};
  let parseError = "";
  try {
    body = JSON.parse(rawBody || "{}");
  } catch (_) {
    parseError = "json_parse_failed";
  }

  const event = safeEventSummary(body);
  const traceId = `line_ing_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const route = (() => {
    try {
      return new URL(request.url).pathname.slice(0, 120);
    } catch (_) {
      return "/webhooks/line";
    }
  })();

  return {
    trace_id: traceId,
    received_at: nowIso,
    route,
    method: boundedToken(request.method, "unknown", 12).toUpperCase(),
    content_length: new TextEncoder().encode(rawBody || "").byteLength,
    signature_present: Boolean(text(request.headers.get("x-line-signature"))),
    event_count: event.event_count,
    destination_hash: await sha256Prefix(body?.destination),
    event_type: event.event_type,
    event_mode: event.event_mode,
    webhook_event_id_hash: await sha256Prefix(event.webhook_event_id),
    redelivery: event.redelivery,
    source_type: event.source_type,
    message_type: event.message_type,
    trace_status: "ingress_captured",
    safe_error: parseError,
    retention_expires_at: addDaysIso(nowIso, TRACE_RETENTION_DAYS),
  };
}

async function createIngressTrace(env = {}, snapshot = {}) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = traceTable(env);
  if (!apiKey || !baseId || !table) return { skipped: true, reason: "trace_config_missing" };

  try {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ fields: snapshot }),
    });
    if (!response.ok) return { skipped: true, reason: "trace_create_failed", status: response.status };
    const payload = await response.json().catch(() => ({}));
    return { ok: true, record_id: text(payload?.id) };
  } catch (_) {
    return { skipped: true, reason: "trace_create_failed" };
  }
}

async function completeIngressTrace(env = {}, createResult = {}, response = null) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = traceTable(env);
  const recordId = text(createResult?.record_id);
  if (!apiKey || !baseId || !table || !recordId || !response) return { skipped: true, reason: "trace_completion_unavailable" };

  const runtime = text(response.headers?.get?.("x-mmd-kenji-runtime"));
  const refined = text(response.headers?.get?.("x-mmd-kenji-intent-refined"));
  const runtimeEntered = runtime.length > 0 || text(response.headers?.get?.("x-mmd-worker")) === "member-dashboard-chat-worker";
  const fields = {
    handler_status: Number(response.status) || 0,
    handler_runtime: runtime.slice(0, 120),
    intent_refined: refined.slice(0, 120),
    runtime_entered: runtimeEntered,
    trace_status: "completed",
    completed_at: new Date().toISOString(),
  };

  try {
    const result = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    return result.ok
      ? { ok: true }
      : { skipped: true, reason: "trace_complete_failed", status: result.status };
  } catch (_) {
    return { skipped: true, reason: "trace_complete_failed" };
  }
}

function schedule(ctx, promise) {
  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(promise.catch(() => null));
    return;
  }
  promise.catch(() => null);
}

export async function handleKenjiLineWithIngressTrace({ request, env = {}, ctx = null, handler } = {}) {
  if (typeof handler !== "function") throw new TypeError("handler_required");
  if (!request || String(request.method || "GET").toUpperCase() !== "POST" || !traceEnabled(env, request)) {
    return handler(request, env, ctx);
  }

  // Clone and inspect only the transport envelope. The original request remains
  // byte-for-byte available to the canonical signature verifier and handler.
  const rawBody = await request.clone().text().catch(() => "");
  const snapshot = await buildKenjiLineIngressSnapshot(request, rawBody);

  console.log(JSON.stringify({
    line_webhook_ingress: "captured",
    trace_id: snapshot.trace_id,
    route: snapshot.route,
    event_count: snapshot.event_count,
    event_type: snapshot.event_type,
    event_mode: snapshot.event_mode,
    redelivery: snapshot.redelivery,
    signature_present: snapshot.signature_present,
  }));

  // Start persistence before entering signature / intent / Matrix logic, but do
  // not await network I/O on the customer reply path. waitUntil keeps this
  // diagnostic write alive without changing LINE handler behavior.
  const created = createIngressTrace(env, snapshot);
  schedule(ctx, created);

  let response;
  try {
    response = await handler(request, env, ctx);
  } catch (error) {
    const completion = created.then(async (result) => {
      const apiKey = text(env.AIRTABLE_API_KEY);
      const baseId = text(env.AIRTABLE_BASE_ID);
      const table = traceTable(env);
      const recordId = text(result?.record_id);
      if (!apiKey || !baseId || !table || !recordId) return;
      await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ fields: {
          trace_status: "handler_threw",
          safe_error: "handler_exception",
          completed_at: new Date().toISOString(),
        } }),
      }).catch(() => null);
    });
    schedule(ctx, completion);
    throw error;
  }

  schedule(ctx, created.then((result) => completeIngressTrace(env, result, response)));
  return response;
}
