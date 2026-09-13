export const TELEGRAM_ALERT_MATRIX_VERSION = "mmd_telegram_alert_matrix_v1";

export const TELEGRAM_ALERT_MATRIX = Object.freeze({
  payment_match_uncertain: Object.freeze({ lane: "payments", severity: "warning", dedupe_window_seconds: 900 }),
  membership_review_required: Object.freeze({ lane: "membership", severity: "warning", dedupe_window_seconds: 900 }),
  identity_client_verification_failed: Object.freeze({ lane: "identity", severity: "warning", dedupe_window_seconds: 900 }),
  model_confirmation_overdue: Object.freeze({ lane: "jobs", severity: "warning", dedupe_window_seconds: 900 }),
  job_start_missing_confirmations: Object.freeze({ lane: "jobs", severity: "critical", dedupe_window_seconds: 900 }),
  complaint_dispute_opened: Object.freeze({ lane: "care", severity: "critical", dedupe_window_seconds: 900 }),
  payout_ready: Object.freeze({ lane: "payout", severity: "info", dedupe_window_seconds: 1800 }),
  auth_system_degraded: Object.freeze({ lane: "system", severity: "critical", dedupe_window_seconds: 900 }),
});

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export function telegramAlertDiagnostic(env = {}) {
  const endpoint = clean(env.TELEGRAM_WORKER_BASE || env.TELEGRAM_URL || env.TELEGRAM_INTERNAL_SEND_URL, 500);
  const token = clean(env.AUTH_SERVICE_ADMIN_TO_TELEGRAM || env.AUTH_SERVICE_LINE_TO_TELEGRAM || env.TELEGRAM_INTERNAL_TOKEN || env.INTERNAL_API_TOKEN, 1000);
  const chat = clean(env.HYPE_CHAT_ID || env.TELEGRAM_OPS_CHAT_ID, 100);
  const thread = clean(env.HYPE_THREAD_ID || env.TELEGRAM_OPS_THREAD_ID, 100);
  const missing = [];
  if (!endpoint) missing.push("endpoint");
  if (!token) missing.push("service_credential");
  if (!chat) missing.push("chat_route");
  if (!thread) missing.push("thread_route");
  return {
    version: TELEGRAM_ALERT_MATRIX_VERSION,
    state: missing.length === 0 ? "configured" : missing.length <= 2 ? "partial" : "degraded",
    configured: missing.length === 0,
    missing,
    events: Object.keys(TELEGRAM_ALERT_MATRIX),
  };
}

function normalizedEndpoint(env = {}) {
  const raw = clean(env.TELEGRAM_INTERNAL_SEND_URL || env.TELEGRAM_URL || env.TELEGRAM_WORKER_BASE, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.pathname === "/" || !url.pathname) url.pathname = "/telegram/internal/send";
    return url.toString();
  } catch {
    return "";
  }
}

export async function sendCanonicalTelegramAlert(env = {}, input = {}) {
  const event = clean(input.event, 80).toLowerCase();
  const spec = TELEGRAM_ALERT_MATRIX[event];
  if (!spec) return { ok: false, skipped: true, reason: "unknown_alert_event" };

  const diagnostic = telegramAlertDiagnostic(env);
  if (!diagnostic.configured) {
    return { ok: false, skipped: true, reason: "telegram_config_missing", diagnostic };
  }

  const endpoint = normalizedEndpoint(env);
  const token = clean(env.AUTH_SERVICE_ADMIN_TO_TELEGRAM || env.AUTH_SERVICE_LINE_TO_TELEGRAM || env.TELEGRAM_INTERNAL_TOKEN || env.INTERNAL_API_TOKEN, 1000);
  const text = clean(input.text, 3500);
  const idempotencyKey = clean(input.idempotency_key || `${event}:${input.reference_id || input.session_id || "unknown"}`, 240);
  if (!endpoint || !token || !text) return { ok: false, skipped: true, reason: "telegram_payload_incomplete" };

  const body = {
    flow: `mmd_ops_${spec.lane}`,
    chat_id: clean(env.HYPE_CHAT_ID || env.TELEGRAM_OPS_CHAT_ID, 100),
    message_thread_id: Number(clean(env.HYPE_THREAD_ID || env.TELEGRAM_OPS_THREAD_ID, 20)) || undefined,
    text,
    idempotency_key: idempotencyKey,
    metadata: {
      event,
      severity: spec.severity,
      authority: "notification_only",
      matrix_version: TELEGRAM_ALERT_MATRIX_VERSION,
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    return {
      ok: response.ok && payload?.ok !== false,
      status: response.status,
      event,
      lane: spec.lane,
      delivery: response.ok ? "accepted" : "failed",
    };
  } catch {
    return { ok: false, event, lane: spec.lane, delivery: "failed", reason: "telegram_transport_failed" };
  }
}
