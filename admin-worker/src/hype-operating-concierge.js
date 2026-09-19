import { resolveKenjiLv5LiveContext } from "./kenji-lv5-live-context.js";

export const HYPE_OPERATIONAL_STATUS_PATH = "/__internal/hype/operational-status";

const CUSTOMER_SAFE_ACTIONS = new Set([
  "resolve_identity",
  "request_missing_input",
  "offer_alternate_slot",
  "check_availability",
  "prepare_booking_intent",
  "review_credit",
  "prepare_payment",
  "review_payment",
  "handoff_per",
]);

export async function handleHypeOperationalStatusRpc(request, env = {}) {
  let url;
  try { url = new URL(request.url); } catch { return json({ ok:false, error:"invalid_request" }, 400); }
  if (url.pathname !== HYPE_OPERATIONAL_STATUS_PATH) return json({ ok:false, error:"not_found" }, 404);
  if (url.hostname !== "admin-worker.internal") return json({ ok:false, error:"internal_only" }, 403);
  if (request.method !== "POST") return json({ ok:false, error:"method_not_allowed" }, 405);
  if (clean(request.headers.get("x-mmd-service-binding"), 80) !== "telegram-worker") {
    return json({ ok:false, error:"internal_caller_invalid" }, 403);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok:false, error:"invalid_json" }, 400);
  const telegramUserId = clean(body.telegram_user_id, 40);
  if (!/^\d{5,20}$/.test(telegramUserId)) return json({ ok:false, error:"telegram_identity_invalid" }, 400);

  const context = await resolveKenjiLv5LiveContext(env, {
    telegram_user_id: telegramUserId,
    intent: body.intent && typeof body.intent === "object"
      ? body.intent
      : { type: "status", trigger: "telegram_hype" },
  });

  const projection = buildHypeCustomerStatusProjection(context);
  return json(projection, projection.ok ? 200 : projection.state === "connect_required" ? 404 : 503);
}

export function buildHypeCustomerStatusProjection(context = {}) {
  const identityResolved = context?.fan_in?.identity_resolution === "canonical"
    && context?.fan_in?.telegram_identity_present === true;
  if (!identityResolved) {
    return {
      ok: false,
      state: "connect_required",
      code: "telegram_identity_not_linked",
      customer_message: "ยังไม่พบ Telegram ที่ยืนยันกับบัญชี MMD นี้",
      next_action: {
        action: "resolve_identity",
        label: "เชื่อม Telegram ผ่าน MY MMD",
        href: "/my-mmd/",
      },
    };
  }

  const identity = context.client_360 || {};
  const entitlement = context.entitlement || context.entitlement_live || {};
  const jobs = context.job || {};
  const payment = context.payment || context.payment_live || {};
  const activeJobs = Array.isArray(jobs.active_jobs) ? jobs.active_jobs : [];
  const firstJob = activeJobs[0] || null;
  const nextAction = customerSafeAction(context.next_actions);

  return {
    ok: true,
    state: context.live_truth_complete === true ? "ready" : "partial",
    readiness: clean(context.readiness, 80) || "unknown",
    display_name: clean(identity.display_name, 120),
    membership: {
      status: token(entitlement.status),
      lifecycle: token(entitlement.lifecycle),
      level: token(entitlement.membership_level || entitlement.canonical_membership_level),
      expire_at: clean(entitlement.expire_at, 80),
      blocked: entitlement.blocked === true || entitlement.member_blocked === true,
    },
    job: {
      status: token(jobs.status),
      active_count: activeJobs.length,
      next: firstJob ? {
        status: token(firstJob.status),
        model_name: clean(firstJob.model_name, 120),
        start_at: clean(firstJob.start_at, 80),
        payment_state: token(firstJob.payment_state),
      } : null,
    },
    payment: {
      status: token(payment.status),
      paid: payment.paid === true,
      review_required: payment.review_required === true,
      outstanding_amount_thb: nonNegative(payment.outstanding_amount_thb),
      credit_balance_thb: nonNegative(payment.credit_balance_thb),
    },
    next_action: nextAction,
    guardrails: {
      read_only: true,
      source_of_truth: false,
      protected_actions_require_canonical_backend: true,
      customer_safe_projection_only: true,
    },
  };
}

function customerSafeAction(actions) {
  const rows = Array.isArray(actions) ? actions : [];
  for (const action of rows) {
    const name = token(action?.action);
    if (!CUSTOMER_SAFE_ACTIONS.has(name)) continue;
    return {
      action: name,
      label: clean(action?.label, 140),
      mode: clean(action?.mode, 60),
      href: safeCustomerHref(action?.href),
    };
  }
  return null;
}

function safeCustomerHref(value) {
  const href = clean(value, 500);
  if (!href) return "";
  if (/^\/(?:my-mmd|member|promotion|booking|sigil\/member)(?:\/|\?|$)/.test(href)) return href;
  return "";
}

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function token(value) {
  return clean(value, 120).toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-hype-role": "telegram-operating-concierge",
    },
  });
}
