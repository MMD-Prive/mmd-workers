import { resolveLiveCanonicalClient } from "./kenji-lv5-live-context.js";

export const HYPE_SHOP_ORDERS_PATH = "/__internal/hype/shop-orders";
export const HYPE_SHOP_ORDERS_SMOKE_PATH = "/__internal/hype/shop-orders/smoke";
const SERVICE_HOST = "admin-worker.internal";
const MEMBER_PAGES_PATH = "/__internal/hype/shop-orders";
const SMOKE_CALLER = "hype-shop-production-smoke";

export async function handleHypeShopOrdersRpc(request, env = {}) {
  const gate = validateRequest(request);
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  if (!plain(body) || Object.keys(body).some((key) => !["telegram_user_id", "order_id"].includes(key))) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const telegramUserId = telegramId(body.telegram_user_id);
  if (!telegramUserId) return json({ ok: false, error: "invalid_request" }, 400);

  const result = await readBoundedShopOrdersForTelegram(env, telegramUserId, clean(body.order_id, 180));
  return json(result.body, result.status);
}


export async function handleHypeShopOrdersSmokeRpc(request, env = {}) {
  const gate = validateSmokeRequest(request);
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  if (!plain(body) || Object.keys(body).some((key) => key !== "line_user_id")) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const syntheticLineUserId = lineId(body.line_user_id);
  if (!syntheticLineUserId) return json({ ok: false, error: "invalid_request" }, 400);

  const binding = env.MEMBER_PAGES_SHOP_ORDERS;
  if (!binding?.fetch) {
    return json({
      ok: false,
      state: "unavailable",
      error: "shop_orders_binding_missing",
    }, 503);
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
      body: JSON.stringify({ line_user_id: syntheticLineUserId }),
    }));
    payload = await response.json().catch(() => null);
  } catch {
    return json({
      ok: false,
      state: "unavailable",
      error: "member_pages_smoke_unavailable",
    }, 503);
  }

  if (!response?.ok || payload?.ok !== true) {
    return json({
      ok: false,
      state: "upstream_failed",
      upstream_status: Number(response?.status || 0),
      upstream_state: token(payload?.state) || null,
      upstream_error: token(payload?.error) || null,
    }, 503);
  }

  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  const correlation = safeCorrelation(payload.correlation);
  const sourceGuardrails = plain(payload.guardrails) ? payload.guardrails : {};
  const checks = {
    authority_contract: clean(payload.authority, 160) === "mmd.hype_shop_orders_projection.v1",
    zero_owned_orders: orders.length === 0,
    zero_candidates: correlation.candidate_count === 0 && !correlation.candidate_order_id,
    read_only: sourceGuardrails.read_only === true,
    ownership_filtered_server_side: sourceGuardrails.ownership_filtered_server_side === true,
    payment_mutation_blocked: sourceGuardrails.payment_mutation_allowed === false,
    fulfillment_mutation_blocked: sourceGuardrails.fulfillment_mutation_allowed === false,
    refund_mutation_blocked: sourceGuardrails.refund_mutation_allowed === false,
    address_not_exposed: sourceGuardrails.address_exposed === false,
    phone_not_exposed: sourceGuardrails.phone_exposed === false,
  };
  const ok = Object.values(checks).every(Boolean);

  return json({
    ok,
    state: ok ? "pass" : "synthetic_collision_or_projection_violation",
    authority: clean(payload.authority, 160) || null,
    checks,
    guardrails: {
      synthetic_read_only: true,
      customer_data_returned: false,
      business_truth_mutated: false,
    },
  }, ok ? 200 : 409);
}

export async function readBoundedShopOrdersForTelegram(env = {}, telegramUserId, orderId = "") {
  const identity = await resolveLiveCanonicalClient(env, { telegram_user_id: telegramUserId }).catch(() => null);
  if (identity?.status !== "resolved" || !recordId(identity?.client?.canonical_client_id)) {
    return {
      status: 404,
      body: { ok: false, state: "connect_required", error: "canonical_client_unresolved" },
    };
  }

  const lineUserId = lineId(identity.client.line_user_id);
  if (!lineUserId) {
    return {
      status: 409,
      body: { ok: false, state: "line_identity_required", error: "canonical_line_identity_missing" },
    };
  }

  const binding = env.MEMBER_PAGES_SHOP_ORDERS;
  if (!binding?.fetch) {
    return {
      status: 503,
      body: { ok: false, state: "unavailable", error: "shop_orders_binding_missing" },
    };
  }

  try {
    const response = await binding.fetch(new Request(`https://member-pages-worker.internal${MEMBER_PAGES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "admin-worker",
      },
      body: JSON.stringify({
        line_user_id: lineUserId,
        ...(clean(orderId, 180) ? { order_id: clean(orderId, 180) } : {}),
      }),
    }));
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      return {
        status: response.status === 409 ? 409 : 503,
        body: {
          ok: false,
          state: response.status === 409 ? "review_required" : "unavailable",
          error: clean(payload?.error, 120) || "shop_orders_unavailable",
        },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        state: "ready",
        authority: clean(payload.authority, 160),
        display_name: clean(identity.client.display_name, 120),
        orders: Array.isArray(payload.orders) ? payload.orders.map(safeOrder).slice(0, 5) : [],
        correlation: safeCorrelation(payload.correlation),
        guardrails: {
          read_only: true,
          canonical_identity_required: true,
          telegram_identity_verified: true,
          line_identity_verified: true,
          ownership_filtered_server_side: true,
          payment_mutation_allowed: false,
          fulfillment_mutation_allowed: false,
          refund_mutation_allowed: false,
        },
      },
    };
  } catch {
    return {
      status: 503,
      body: { ok: false, state: "unavailable", error: "shop_orders_unavailable" },
    };
  }
}

function safeOrder(value = {}) {
  const fulfillment = plain(value.fulfillment) ? value.fulfillment : {};
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    order_id: clean(value.order_id, 180) || null,
    order_date: safeTimestamp(value.order_date),
    order_status: token(value.order_status) || "unknown",
    payment_status: token(value.payment_status) || "unknown",
    total_thb: nonNegativeOrNull(value.total_thb),
    items: items.slice(0, 12).map((item) => ({
      item_name: clean(item?.item_name, 240) || "MMD Shop Item",
      quantity: nonNegativeOrNull(item?.quantity) || 0,
      line_total_thb: nonNegativeOrNull(item?.line_total_thb),
      status: token(item?.status) || "unknown",
    })),
    fulfillment: {
      state: token(fulfillment.state) || "unknown",
      delivery_method: token(fulfillment.delivery_method) || null,
      courier: clean(fulfillment.courier, 180) || null,
      tracking_number: clean(fulfillment.tracking_number, 220) || null,
      updated_at: safeTimestamp(fulfillment.updated_at),
    },
  };
}

function safeCorrelation(value = {}) {
  return {
    requested_order_id: clean(value.requested_order_id, 180) || null,
    exact_owned_match: value.exact_owned_match === true,
    auto_correlation_allowed: value.auto_correlation_allowed === true,
    candidate_count: boundedInt(value.candidate_count, 0, 50),
    candidate_order_id: clean(value.candidate_order_id, 180) || null,
    method: token(value.method) || "none",
  };
}

function validateRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return json({ ok: false, error: "invalid_request" }, 400); }
  if (url.pathname !== HYPE_SHOP_ORDERS_PATH) return json({ ok: false, error: "not_found" }, 404);
  if (url.hostname !== SERVICE_HOST) return json({ ok: false, error: "internal_only" }, 403);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (clean(request.headers.get("x-mmd-service-binding"), 80) !== "telegram-worker") {
    return json({ ok: false, error: "internal_caller_invalid" }, 403);
  }
  return null;
}


function validateSmokeRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return json({ ok: false, error: "invalid_request" }, 400); }
  if (url.pathname !== HYPE_SHOP_ORDERS_SMOKE_PATH) return json({ ok: false, error: "not_found" }, 404);
  if (url.hostname !== SERVICE_HOST) return json({ ok: false, error: "internal_only" }, 403);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (clean(request.headers.get("x-mmd-internal-call"), 20) !== "true") {
    return json({ ok: false, error: "internal_call_required" }, 403);
  }
  if (clean(request.headers.get("x-mmd-service-binding"), 80) !== SMOKE_CALLER) {
    return json({ ok: false, error: "internal_caller_invalid" }, 403);
  }
  return null;
}

function safeTimestamp(value) {
  const raw = clean(value, 80);
  const parsed = Date.parse(raw);
  return raw && Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function boundedInt(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : min;
}

function nonNegativeOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
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

function plain(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
      "x-mmd-hype-shop-orders": "bounded-v1",
    },
  });
}
