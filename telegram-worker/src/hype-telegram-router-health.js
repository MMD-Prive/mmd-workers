import { TG_THREADS } from "../lib/telegram.js";

export const HYPE_TELEGRAM_ROUTER_HEALTH_SCHEMA = "mmd.hype_telegram_router_health.v1";
export const HYPE_TELEGRAM_ROUTER_REGISTRY_VERSION = "2026-09-21.1";

const CANONICAL_WEBHOOK_URL = "https://mmdbkk.com/telegram/webhook";

const ROUTER_LANES = Object.freeze([
  {
    key: "booking",
    label: "Booking / booking draft",
    topic: "booking",
    sources: ["sigil-booking-worker", "events-worker", "admin-worker"],
    flows: ["booking", "booking_draft", "dispatch", "booking_dispatch"],
    fallback: "alerts",
    authority: "events/admin booking truth only",
  },
  {
    key: "membership",
    label: "Membership / renewal payment",
    topic: "membership",
    sources: ["member-dashboard-chat-worker", "payments-worker", "admin-worker"],
    flows: ["membership", "payments_membership"],
    fallback: "alerts",
    authority: "payments-worker + entitlement resolver",
  },
  {
    key: "payments",
    label: "Payment proof / verified / confirmation",
    topic: "payment",
    sources: ["member-dashboard-chat-worker", "payments-worker", "admin-worker"],
    flows: ["payment", "confirm", "payment_proof", "payment_verified", "payments_confirm"],
    fallback: "alerts",
    authority: "payments-worker",
  },
  {
    key: "points",
    label: "Points",
    topic: "points",
    sources: ["payments-worker", "member-pages-worker"],
    flows: ["points", "points_threshold"],
    fallback: "alerts",
    authority: "canonical points ledger",
  },
  {
    key: "system_alerts",
    label: "System / auth / recovery incidents",
    topic: "alerts",
    sources: ["admin-worker", "member-dashboard-chat-worker", "auth-worker", "studio"],
    flows: ["alert", "alerts", "exception", "recovery", "studio_alert"],
    fallback: null,
    authority: "notification only",
  },
  {
    key: "public_model",
    label: "Public Model applications",
    topic: "public_model",
    sources: ["sigil-worker"],
    flows: ["public_model", "public_model_application", "applications"],
    fallback: "alerts",
    authority: "sigil-worker application truth",
    migration_state: "legacy_direct_sender",
  },
  {
    key: "mms_applications",
    label: "MMS Therapist applications",
    topic: "public_model",
    sources: ["mms-worker"],
    flows: ["mms_application", "mms_therapist_application"],
    fallback: "alerts",
    authority: "mms-worker",
    migration_state: "legacy_direct_sender",
    shared_destination: "public_model",
  },
  {
    key: "mms_ops",
    label: "MMS operational alerts / handoff",
    topic: "alerts",
    sources: ["mms-worker"],
    flows: ["mms_alert", "mms_manual_handoff", "mms_job"],
    fallback: null,
    authority: "mms-worker",
    migration_state: "legacy_direct_sender",
  },
  {
    key: "partner_ops",
    label: "Partner confirmations / review",
    topic: "partner",
    sources: ["partners-worker"],
    flows: ["partner_confirm", "partner_review"],
    fallback: "alerts",
    authority: "partners-worker",
    migration_state: "legacy_direct_sender",
  },
  {
    key: "care_back",
    label: "CARE BACK / Membership operations",
    topic: "membership",
    sources: ["member-pages-worker", "admin-worker"],
    flows: ["care_back", "coupon_review", "membership_ops"],
    fallback: "alerts",
    authority: "member-pages/admin canonical coupon + membership state",
  },
  {
    key: "himai_orders",
    label: "HIMAI orders",
    topic: "himai_orders",
    sources: ["himai-chat-worker"],
    flows: ["himai_orders", "himai_order"],
    fallback: "himai_alerts",
    authority: "himai-chat-worker",
    migration_state: "legacy_direct_sender",
  },
  {
    key: "himai_payments",
    label: "HIMAI payments",
    topic: "himai_payments",
    sources: ["himai-chat-worker", "payments-worker"],
    flows: ["himai_payments", "himai_payment"],
    fallback: "himai_alerts",
    authority: "payments-worker where payment truth applies",
    migration_state: "legacy_direct_sender",
  },
  {
    key: "himai_alerts",
    label: "HIMAI alerts",
    topic: "himai_alerts",
    sources: ["himai-chat-worker"],
    flows: ["himai_alerts", "himai_alert"],
    fallback: "alerts",
    authority: "notification only",
    migration_state: "legacy_direct_sender",
  },
  {
    key: "mmd_shop_orders",
    label: "MMD Shop orders",
    topic: "mmd_shop_orders",
    sources: ["himai-chat-worker"],
    flows: ["mmd_shop_orders", "mmd_shop_order"],
    fallback: "mmd_shop_alerts",
    authority: "himai-chat-worker",
    migration_state: "legacy_direct_sender",
  },
  {
    key: "mmd_shop_payments",
    label: "MMD Shop payments",
    topic: "mmd_shop_payments",
    sources: ["payments-worker", "himai-chat-worker"],
    flows: ["mmd_shop_payments", "mmd_shop_payment"],
    fallback: "mmd_shop_alerts",
    authority: "payments-worker",
    migration_state: "legacy_direct_sender",
  },
  {
    key: "mmd_shop_alerts",
    label: "MMD Shop alerts",
    topic: "mmd_shop_alerts",
    sources: ["himai-chat-worker"],
    flows: ["mmd_shop_alerts", "mmd_shop_alert"],
    fallback: "alerts",
    authority: "notification only",
    migration_state: "legacy_direct_sender",
  },
  {
    key: "rules_model",
    label: "Model rules acknowledgement",
    topic: "rules_model",
    sources: ["telegram-worker", "member-dashboard-chat-worker"],
    flows: ["rules_model", "model_rules", "model_rules_ack"],
    fallback: "alerts",
    authority: "acknowledgement evidence only",
  },
  {
    key: "rules_customer",
    label: "Customer rules acknowledgement",
    topic: "rules_customer",
    sources: ["telegram-worker", "member-dashboard-chat-worker"],
    flows: ["rules_customer", "customer_rules", "customer_rules_ack"],
    fallback: "alerts",
    authority: "acknowledgement evidence only",
  },
  {
    key: "legacy_archive",
    label: "Legacy archive / system log",
    topic: "legacy_archive",
    sources: ["telegram-worker", "migration/backfill"],
    flows: ["legacy_archive", "system", "system_log"],
    fallback: "alerts",
    authority: "archive / notification only",
  },
]);

const LEGACY_DIRECT_SENDERS = Object.freeze([
  { worker: "mms-worker", reason: "direct Telegram Bot API sender still exists for MMS application/manual handoff" },
  { worker: "sigil-worker", reason: "Public Model notification has a direct Telegram sender" },
  { worker: "himai-chat-worker", reason: "Shop/HIMAI notification helpers still send directly" },
  { worker: "payments-worker", reason: "legacy direct Telegram helpers remain alongside canonical internal-send usage" },
]);

function clean(value, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function bool(value) {
  return Boolean(clean(value));
}

function positiveInt(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function safeStatus(value) {
  return ["configured", "partial", "degraded", "unavailable"].includes(value) ? value : "unavailable";
}

function partnerThread(env = {}) {
  return positiveInt(env.TG_THREAD_PARTNER_CONFIRM || env.TG_THREAD_PRICING_REVIEW || 61);
}

function topicMap(env = {}) {
  const threads = TG_THREADS(env);
  return {
    booking: positiveInt(threads.booking),
    membership: positiveInt(threads.membership),
    payment: positiveInt(threads.payment),
    points: positiveInt(threads.points),
    alerts: positiveInt(threads.alerts),
    public_model: positiveInt(threads.public_model),
    himai_orders: positiveInt(threads.himai_orders),
    himai_payments: positiveInt(threads.himai_payments),
    himai_alerts: positiveInt(threads.himai_alerts),
    mmd_shop_orders: positiveInt(threads.mmd_shop_orders),
    mmd_shop_payments: positiveInt(threads.mmd_shop_payments),
    mmd_shop_alerts: positiveInt(threads.mmd_shop_alerts),
    rules_model: positiveInt(threads.rules_model),
    rules_customer: positiveInt(threads.rules_customer),
    legacy_archive: positiveInt(threads.legacy_archive),
    partner: partnerThread(env),
  };
}

function laneProjection(spec, topics, transportReady) {
  const threadReady = positiveInt(topics[spec.topic]) > 0;
  const migrationState = clean(spec.migration_state) || "canonical_internal_send";
  let status = transportReady && threadReady ? "configured" : "unavailable";
  if (status === "configured" && migrationState === "legacy_direct_sender") status = "partial";
  return {
    key: spec.key,
    label: spec.label,
    status,
    topic: spec.topic,
    destination_configured: threadReady,
    source_workers: spec.sources,
    flows: spec.flows,
    fallback: spec.fallback,
    migration_state: migrationState,
    shared_destination: spec.shared_destination || null,
    route_owner: "telegram-worker",
    authority: spec.authority,
  };
}

async function telegramApiProbe(env = {}) {
  const token = clean(env.TELEGRAM_BOT_TOKEN, 2000);
  if (!token) return { attempted: false, ok: false, reason: "telegram_bot_token_missing" };
  try {
    const [meResponse, webhookResponse] = await Promise.all([
      fetch("https://api.telegram.org/bot" + token + "/getMe"),
      fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo"),
    ]);
    const [me, webhook] = await Promise.all([
      meResponse.json().catch(() => ({})),
      webhookResponse.json().catch(() => ({})),
    ]);
    const webhookUrl = clean(webhook?.result?.url, 1000);
    const botOk = meResponse.ok && me?.ok === true;
    const webhookOk = webhookResponse.ok && webhook?.ok === true;
    return {
      attempted: true,
      ok: botOk && webhookOk && webhookUrl === CANONICAL_WEBHOOK_URL,
      bot_api_ok: botOk,
      webhook_api_ok: webhookOk,
      webhook_canonical: webhookUrl === CANONICAL_WEBHOOK_URL,
      webhook_secret_configured: bool(env.TELEGRAM_WEBHOOK_SECRET_TOKEN),
      pending_update_count: Math.max(0, Number(webhook?.result?.pending_update_count) || 0),
      reason: !botOk
        ? "telegram_bot_api_unavailable"
        : !webhookOk
          ? "telegram_webhook_probe_failed"
          : webhookUrl !== CANONICAL_WEBHOOK_URL
            ? "canonical_webhook_mismatch"
            : null,
    };
  } catch {
    return {
      attempted: true,
      ok: false,
      bot_api_ok: false,
      webhook_api_ok: false,
      webhook_canonical: false,
      webhook_secret_configured: bool(env.TELEGRAM_WEBHOOK_SECRET_TOKEN),
      pending_update_count: null,
      reason: "telegram_api_unreachable",
    };
  }
}

export async function buildTelegramRouterHealth(env = {}, { probe = false } = {}) {
  const botConfigured = bool(env.TELEGRAM_BOT_TOKEN);
  const chatConfigured = bool(env.TELEGRAM_CHAT_ID);
  const webhookSecretConfigured = bool(env.TELEGRAM_WEBHOOK_SECRET_TOKEN);
  const internalAuthConfigured = [
    env.INTERNAL_API_TOKEN,
    env.AUTH_SERVICE_BOOKING_TO_TELEGRAM,
    env.AUTH_SERVICE_EVENTS_TO_TELEGRAM,
    env.AUTH_SERVICE_STUDIO_TO_TELEGRAM,
    env.AUTH_SERVICE_AUTH_TO_TELEGRAM,
    env.AUTH_SERVICE_LINE_TO_TELEGRAM,
    env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM,
  ].some(bool);
  const transportReady = botConfigured && chatConfigured;
  const topics = topicMap(env);
  const lanes = ROUTER_LANES.map((spec) => laneProjection(spec, topics, transportReady));
  const live = probe ? await telegramApiProbe(env) : { attempted: false, ok: null };

  const unavailable = lanes.filter((lane) => lane.status === "unavailable");
  const partial = lanes.filter((lane) => lane.status === "partial");
  const directSenders = LEGACY_DIRECT_SENDERS.map((item) => ({ ...item, migration_required: true }));

  const causes = [];
  if (!botConfigured) causes.push("telegram_bot_token_missing");
  if (!chatConfigured) causes.push("telegram_chat_missing");
  if (!webhookSecretConfigured) causes.push("telegram_webhook_secret_missing");
  if (!internalAuthConfigured) causes.push("telegram_internal_auth_missing");
  if (unavailable.length) causes.push("one_or_more_lane_destinations_missing");
  if (probe && live.ok === false) causes.push(live.reason || "telegram_live_probe_failed");
  if (directSenders.length) causes.push("legacy_direct_senders_present");

  let overall = "configured";
  if (!transportReady || !webhookSecretConfigured || !internalAuthConfigured || unavailable.length || (probe && live.ok === false)) {
    overall = "degraded";
  } else if (partial.length || directSenders.length) {
    overall = "partial";
  }

  return {
    ok: overall !== "degraded",
    schema: HYPE_TELEGRAM_ROUTER_HEALTH_SCHEMA,
    registry_version: HYPE_TELEGRAM_ROUTER_REGISTRY_VERSION,
    checked_at: new Date().toISOString(),
    status: safeStatus(overall),
    canonical_owner: "telegram-worker",
    transport: {
      bot_configured: botConfigured,
      ops_chat_configured: chatConfigured,
      webhook_secret_configured: webhookSecretConfigured,
      internal_auth_configured: internalAuthConfigured,
      live_probe: live,
    },
    counts: {
      lanes_total: lanes.length,
      configured: lanes.filter((lane) => lane.status === "configured").length,
      partial: partial.length,
      unavailable: unavailable.length,
      legacy_direct_senders: directSenders.length,
    },
    causes,
    lanes,
    legacy_direct_senders: directSenders,
    authority: {
      notification_only: true,
      payment_truth: "payments-worker",
      entitlement_truth: "my_mmd_entitlement_resolver_v1",
      telegram_route_owner: "telegram-worker",
      may_mutate_business_truth: false,
    },
  };
}

export const HYPE_TELEGRAM_ROUTER_INTERNALS = Object.freeze({
  ROUTER_LANES,
  LEGACY_DIRECT_SENDERS,
  topicMap,
  laneProjection,
  telegramApiProbe,
});
