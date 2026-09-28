export const HYPE_TELEGRAM_ROUTER_READ_SCHEMA = "mmd.hype_telegram_router_health_read.v1";

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function projectLane(item = {}) {
  return {
    key: clean(item.key, 80),
    label: clean(item.label, 140),
    status: clean(item.status, 40) || "unknown",
    topic: clean(item.topic, 80),
    destination_configured: item.destination_configured === true,
    service_auth_configured: item.service_auth_configured === true,
    source_workers: (Array.isArray(item.source_workers) ? item.source_workers : []).slice(0, 8).map((x) => clean(x, 80)).filter(Boolean),
    flows: (Array.isArray(item.flows) ? item.flows : []).slice(0, 12).map((x) => clean(x, 80)).filter(Boolean),
    fallback: clean(item.fallback, 80) || null,
    migration_state: clean(item.migration_state, 80) || "unknown",
    shared_destination: clean(item.shared_destination, 80) || null,
    route_owner: clean(item.route_owner, 80) || "telegram-worker",
    authority: clean(item.authority, 180),
  };
}

export function projectTelegramRouterHealth(payload = {}) {
  if (!payload || typeof payload !== "object" || !payload.schema) {
    return {
      available: false,
      status: "unknown",
      summary: "Telegram Router health source unavailable",
      lanes: [],
      causes: [],
      legacy_direct_senders: [],
      operational_only: true,
      business_truth_inferred: false,
    };
  }
  const lanes = (Array.isArray(payload.lanes) ? payload.lanes : []).slice(0, 40).map(projectLane);
  const direct = (Array.isArray(payload.legacy_direct_senders) ? payload.legacy_direct_senders : []).slice(0, 20).map((item) => ({
    worker: clean(item.worker, 80),
    reason: clean(item.reason, 240),
    migration_required: item.migration_required === true,
  }));
  const counts = payload.counts && typeof payload.counts === "object" ? payload.counts : {};
  const status = clean(payload.status, 40) || "unknown";
  const summary = status === "configured"
    ? "Telegram router configured"
    : status === "partial"
      ? "Telegram router usable with legacy/direct sender migration remaining"
      : status === "degraded"
        ? "Telegram router degraded; inspect causes before relying on delivery"
        : "Telegram router health unknown";
  return {
    available: true,
    schema: HYPE_TELEGRAM_ROUTER_READ_SCHEMA,
    source_schema: clean(payload.schema, 120),
    registry_version: clean(payload.registry_version, 120),
    checked_at: clean(payload.checked_at, 80) || null,
    status,
    canonical_owner: clean(payload.canonical_owner, 80) || "telegram-worker",
    counts: {
      lanes_total: nonNegative(counts.lanes_total),
      configured: nonNegative(counts.configured),
      partial: nonNegative(counts.partial),
      unavailable: nonNegative(counts.unavailable),
      legacy_direct_senders: nonNegative(counts.legacy_direct_senders),
    },
    causes: (Array.isArray(payload.causes) ? payload.causes : []).slice(0, 20).map((x) => clean(x, 120)).filter(Boolean),
    lanes,
    legacy_direct_senders: direct,
    summary,
    transport: {
      bot_configured: payload?.transport?.bot_configured === true,
      ops_chat_configured: payload?.transport?.ops_chat_configured === true,
      webhook_secret_configured: payload?.transport?.webhook_secret_configured === true,
      internal_auth_configured: payload?.transport?.internal_auth_configured === true,
      live_probe_attempted: payload?.transport?.live_probe?.attempted === true,
      live_probe_ok: payload?.transport?.live_probe?.ok === true,
      webhook_canonical: payload?.transport?.live_probe?.webhook_canonical === true,
      pending_update_count: payload?.transport?.live_probe?.pending_update_count ?? null,
      live_probe_reason: clean(payload?.transport?.live_probe?.reason, 120) || null,
    },
    operational_only: true,
    business_truth_inferred: false,
    authority: {
      notification_only: true,
      telegram_route_owner: "telegram-worker",
      payment_truth: "payments-worker",
      entitlement_truth: "my_mmd_entitlement_resolver_v1",
    },
  };
}

export async function readHypeTelegramRouterHealth(env = {}, options = {}) {
  const binding = env.TELEGRAM_ROUTER;
  const token = clean(env.AUTH_SERVICE_STUDIO_TO_TELEGRAM || env.INTERNAL_TOKEN, 2000);
  if (!binding || typeof binding.fetch !== "function" || !token) {
    return projectTelegramRouterHealth(null);
  }
  const probe = options.probe === true ? "1" : "0";
  try {
    const response = await binding.fetch(new Request("https://telegram-worker.internal/telegram/internal/router/health?probe=" + probe, {
      method: "GET",
      headers: { authorization: "Bearer " + token },
    }));
    const payload = await response.json().catch(() => null);
    if (!payload || (response.status >= 500 && !payload.schema)) return projectTelegramRouterHealth(null);
    return projectTelegramRouterHealth(payload);
  } catch {
    return projectTelegramRouterHealth(null);
  }
}
