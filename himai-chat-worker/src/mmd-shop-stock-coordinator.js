import {
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

  async fetch(request) {
    const url = new URL(request.url);
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
      if (url.pathname === "/expire") {
        const result = await expireMmdShopReservations(this.env);
        const payment_expiry = [];
        for (const orderId of result.expired_order_ids || []) {
          payment_expiry.push(await expirePaymentIntent(this.env, orderId));
        }
        return { ok: true, ...result, payment_expiry };
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

export async function expireViaMmdShopCoordinator(env) {
  return requestCoordinator(env, "/expire", {});
}
