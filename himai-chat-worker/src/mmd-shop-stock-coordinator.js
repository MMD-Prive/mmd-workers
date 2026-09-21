import { handleShopCheckoutSession } from "./shop-checkout-idempotency.js";
import { expireCheckoutReceipt } from "../../shared/shop-checkout-once.mjs";
import {
  inspectMmdShopStockHealth,
  formatMmdShopStockHealthAlert,
  mmdShopStockHealthFingerprint,
} from "./mmd-shop-stock-health.js";
import { sendMmdShopOperationalAlert } from "./shop-alerts.js";
import {
  abortMmdShopPaymentClaim,
  claimMmdShopReservationForPayment,
  commitMmdShopReservation,
  expireMmdShopReservations,
  releaseMmdShopReservation,
  reserveMmdShopStock,
} from "../../shared/mmd-shop-stock-reservation.mjs";

export class MmdShopStockCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.tail = Promise.resolve();
  }

  async alarm() { await expireCheckoutReceipt(this.state.storage); }

  async fetch(request) {
    const url = new URL(request.url);
    if (["/shop/api/checkout", "/mmd-shop/api/checkout"].includes(url.pathname)) return handleShopCheckoutSession(request, this.state, this.env);
    if (url.pathname === "/health") return Response.json({ ok: true, coordinator: "mmd_shop_stock" });

    const body = request.method === "POST" ? await request.json().catch(() => null) : null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const run = async () => {
      if (url.pathname === "/reserve") {
        const reservation = await reserveMmdShopStock(this.env, body);
        return { ok: true, reservation };
      }
      if (url.pathname === "/release") {
        const result = await releaseMmdShopReservation(this.env, body.reservation, body.reason || "released");
        return { ok: true, ...result };
      }
      if (url.pathname === "/claim-payment") {
        const result = await claimMmdShopReservationForPayment(this.env, body.reservation, body.review_key || "");
        return { ok: true, ...result };
      }
      if (url.pathname === "/abort-payment-claim") {
        const result = await abortMmdShopPaymentClaim(this.env, body.reservation, body.review_key || "", body.reason || "payment_review_failed");
        return { ok: true, ...result };
      }
      if (url.pathname === "/commit") {
        const result = await commitMmdShopReservation(this.env, body.reservation);
        return { ok: true, ...result };
      }
      if (url.pathname === "/expire") {
        const result = await expireMmdShopReservations(this.env);
        const payment_expiry = [];
        for (const orderId of result.payment_expiry_order_ids || result.expired_order_ids || []) {
          payment_expiry.push(await expirePaymentIntent(this.env, orderId));
        }
        return { ok: true, ...result, payment_expiry };
      }
      if (url.pathname === "/stock-health") {
        const report = await inspectMmdShopStockHealth(this.env);
        const fingerprint = mmdShopStockHealthFingerprint(report);
        const previous = String(await this.state.storage.get("stock_health_fingerprint") || "");
        const actionable = Number(report.metrics?.low_stock_batches || 0) > 0
          || Number(report.metrics?.reconciliation_mismatches || 0) > 0
          || Number(report.metrics?.untracked_checkout_products || 0) > 0;
        const healthyFingerprint = JSON.stringify({ low: [], mismatch: [], untracked: [] });
        let alert = { ok: true, skipped: true, reason: "unchanged" };

        if (fingerprint !== previous) {
          if (actionable) {
            alert = await sendMmdShopOperationalAlert(
              this.env,
              formatMmdShopStockHealthAlert(report),
            );
          } else if (previous && previous !== healthyFingerprint) {
            alert = await sendMmdShopOperationalAlert(
              this.env,
              formatMmdShopStockHealthAlert(report, { recovered: true }),
            );
          } else {
            alert = { ok: true, skipped: true, reason: "healthy_initial_state" };
          }

          if (alert.ok === true || alert.skipped === true) {
            await this.state.storage.put("stock_health_fingerprint", fingerprint);
            await this.state.storage.put("stock_health_checked_at", new Date().toISOString());
          }
        }

        return {
          ok: true,
          report,
          fingerprint_changed: fingerprint !== previous,
          alert,
        };
      }
      return { ok: false, error: "not_found", status: 404 };
    };

    const task = this.tail.then(run, run);
    this.tail = task.then(() => undefined, () => undefined);

    try {
      const result = await task;
      return Response.json(result, { status: Number(result?.status || (result?.ok === false ? 400 : 200)) });
    } catch (error) {
      return Response.json({
        ok: false,
        error: String(error?.message || error || "coordinator_failed").slice(0, 300),
      }, { status: Number(error?.status || 500) });
    }
  }
}

async function expirePaymentIntent(env, orderId) {
  if (!env.PAYMENTS_WORKER?.fetch) return { order_id: orderId, ok: false, skipped: true, reason: "payments_worker_binding_missing" };
  const token = String(env.INTERNAL_TOKEN || "").trim();
  if (!token) return { order_id: orderId, ok: false, skipped: true, reason: "internal_token_missing" };

  const response = await env.PAYMENTS_WORKER.fetch("https://payments-worker.internal/v1/internal/shop/expire-intent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": token,
    },
    body: JSON.stringify({ order_id: orderId }),
  });
  const data = await response.json().catch(() => ({}));
  return {
    order_id: orderId,
    ok: response.ok && data.ok === true,
    status: response.status,
    error: data.error || null,
  };
}

function namespace(env) {
  if (!env?.MMD_SHOP_STOCK_COORDINATOR) {
    const error = new Error("mmd_shop_stock_coordinator_not_configured");
    error.status = 503;
    throw error;
  }
  return env.MMD_SHOP_STOCK_COORDINATOR;
}

async function requestCoordinator(env, path, payload) {
  const ns = namespace(env);
  const id = ns.idFromName("global");
  const stub = ns.get(id);
  const response = await stub.fetch("https://mmd-shop-stock.internal" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) {
    const error = new Error(data.error || "mmd_shop_stock_coordinator_failed");
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function reserveViaMmdShopCoordinator(env, input) {
  const result = await requestCoordinator(env, "/reserve", input);
  return result.reservation;
}

export async function releaseViaMmdShopCoordinator(env, reservation, reason) {
  const result = await requestCoordinator(env, "/release", { reservation, reason });
  return result;
}

export async function claimPaymentViaMmdShopCoordinator(env, reservation, reviewKey) {
  const result = await requestCoordinator(env, "/claim-payment", { reservation, review_key: reviewKey });
  return result;
}

export async function abortPaymentClaimViaMmdShopCoordinator(env, reservation, reviewKey, reason) {
  const result = await requestCoordinator(env, "/abort-payment-claim", { reservation, review_key: reviewKey, reason });
  return result;
}

export async function commitViaMmdShopCoordinator(env, reservation) {
  const result = await requestCoordinator(env, "/commit", { reservation });
  return result;
}

export async function expireViaMmdShopCoordinator(env) {
  return requestCoordinator(env, "/expire", {});
}

export async function stockHealthViaMmdShopCoordinator(env) {
  return requestCoordinator(env, "/stock-health", {});
}
