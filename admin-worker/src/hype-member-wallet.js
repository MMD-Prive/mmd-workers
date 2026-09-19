import { resolveLiveCanonicalClient } from "./kenji-lv5-live-context.js";

export const HYPE_MEMBER_WALLET_PATH = "/__internal/hype/member-wallet";

const SERVICE_HOST = "admin-worker.internal";
const ALLOWED_CALLER = "telegram-worker";
const MEMBER_PAGES_PATH = "/__internal/hype/member-wallet";
const SCOPES = new Set(["points", "coupons"]);

export async function handleHypeMemberWalletRpc(request, env = {}) {
  const gate = validateRequest(request);
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  if (!plain(body) || Object.keys(body).some((key) => !["telegram_user_id", "scope"].includes(key))) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const telegramUserId = telegramId(body.telegram_user_id);
  const scope = token(body.scope);
  if (!telegramUserId || !SCOPES.has(scope)) return json({ ok: false, error: "invalid_request" }, 400);

  const identity = await resolveLiveCanonicalClient(env, { telegram_user_id: telegramUserId }).catch(() => null);
  if (identity?.status !== "resolved" || !recordId(identity?.client?.canonical_client_id)) {
    return json({
      ok: false,
      state: "connect_required",
      error: "canonical_client_unresolved",
    }, 404);
  }

  const lineUserId = lineId(identity.client.line_user_id);
  if (!lineUserId) {
    return json({
      ok: false,
      state: "line_identity_required",
      error: "canonical_line_identity_missing",
    }, 409);
  }

  const binding = env.MEMBER_PAGES_MEMBER_WALLET;
  if (!binding?.fetch) {
    return json({ ok: false, state: "unavailable", error: "member_wallet_binding_missing" }, 503);
  }

  let response;
  let payload;
  try {
    response = await binding.fetch(new Request(`https://member-pages-worker.internal${MEMBER_PAGES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "admin-worker",
      },
      body: JSON.stringify({
        line_user_id: lineUserId,
        scope,
      }),
    }));
    payload = await response.json().catch(() => null);
  } catch {
    return json({ ok: false, state: "unavailable", error: "member_wallet_unavailable" }, 503);
  }

  if (!response.ok || payload?.ok !== true) {
    const review = response.status === 409 || payload?.status === "review_required";
    return json({
      ok: false,
      state: review ? "review_required" : "unavailable",
      error: review ? "member_wallet_review_required" : "member_wallet_unavailable",
    }, review ? 409 : 503);
  }

  return json({
    ok: true,
    state: "ready",
    authority: clean(payload.authority, 120),
    display_name: clean(identity.client.display_name, 120),
    scope,
    points: safePoints(payload.points),
    coupon: safeCoupon(payload.coupon),
    guardrails: {
      read_only: true,
      canonical_identity_required: true,
      telegram_identity_verified: true,
      line_identity_verified: true,
      customer_safe_projection_only: true,
      coupon_activation_allowed: false,
      coupon_reissue_allowed: false,
    },
  });
}

function safePoints(value = {}) {
  if (token(value.status) !== "verified") {
    return { status: token(value.status) || "unavailable", active_points: null, rate_thb_per_point: 100 };
  }
  const points = Number(value.active_points);
  if (!Number.isInteger(points) || points < 0) {
    return { status: "unavailable", active_points: null, rate_thb_per_point: 100 };
  }
  return {
    status: "verified",
    active_points: points,
    rate_thb_per_point: 100,
  };
}

function safeCoupon(value = {}) {
  const status = token(value.status) || "unavailable";
  const ready = status === "ready";
  const code = ready && /^[A-HJ-NP-Z2-9]{6}$/.test(clean(value.code, 16))
    ? clean(value.code, 16)
    : null;
  const discount = Number(value.approved_discount_percent);
  return {
    status: ready && !code ? "unavailable" : status,
    code,
    approved_discount_percent: ready && Number.isInteger(discount) && discount > 0 && discount <= 10 ? discount : null,
    expires_at: ready ? safeTimestamp(value.expires_at) : null,
    single_use: value.single_use === true,
  };
}

function validateRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return json({ ok: false, error: "invalid_request" }, 400); }
  if (url.pathname !== HYPE_MEMBER_WALLET_PATH) return json({ ok: false, error: "not_found" }, 404);
  if (url.hostname !== SERVICE_HOST) return json({ ok: false, error: "internal_only" }, 403);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (clean(request.headers.get("x-mmd-service-binding"), 80) !== ALLOWED_CALLER) {
    return json({ ok: false, error: "internal_caller_invalid" }, 403);
  }
  return null;
}

function safeTimestamp(value) {
  const raw = clean(value, 80);
  const time = Date.parse(raw);
  return raw && Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function plain(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordId(value) {
  const id = clean(value, 80);
  return /^rec[A-Za-z0-9]+$/.test(id) ? id : "";
}

function lineId(value) {
  const id = clean(value, 80);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function telegramId(value) {
  const id = clean(value, 40);
  return /^\d{5,20}$/.test(id) ? id : "";
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
      "x-mmd-hype-member-wallet": "bounded-v1",
    },
  });
}
