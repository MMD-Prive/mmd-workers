import { HIMAI_SCRIPT, MMD_SCRIPT, HIMAI_STYLE } from "./generated-shop-assets.mjs";
import { SHOP_RELIABILITY_SOURCE } from "../../webflow/shared/shop-reliability-runtime.mjs";
import himaiChatWorker from "./index.js";
import { authorityRuntimeHealth } from "../../shared/posthog-authority-events.mjs";
import { handleShopCatalog } from "./shop-catalog.js";
import { handleShopMovements } from "./shop-movements.js";
import { handleShopAlert } from "./shop-alerts.js";
import { handleSupplierPortal } from "./supplier-portal.js";
import { renderDistributorPortalPage } from "./distributor-portal-page.js";
import { handleMmdShopCheckout } from "./mmd-shop-checkout.js";
import { handleMmdShopOrderPage, isMmdShopOrderPageRequest } from "./mmd-shop-order-page.js";
import { handleMmdShopProductPage, isMmdShopProductPageRequest } from "./mmd-shop-product-page.js";
import {
  abortPaymentClaimViaMmdShopCoordinator,
  claimPaymentViaMmdShopCoordinator,
  commitViaMmdShopCoordinator,
  expireViaMmdShopCoordinator,
  releaseViaMmdShopCoordinator,
  reserveViaMmdShopCoordinator,
  stockHealthViaMmdShopCoordinator,
  MmdShopStockCoordinator,
} from "./mmd-shop-stock-coordinator.js";
import { readMmdShopReservation } from "../../shared/mmd-shop-stock-reservation.mjs";

export { MmdShopStockCoordinator };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const asset = {
      "/shop/api/runtime/reliability-v1.js": [SHOP_RELIABILITY_SOURCE, "application/javascript"],
      "/mmd-shop/api/runtime/reliability-v1.js": [SHOP_RELIABILITY_SOURCE, "application/javascript"],
      "/shop/api/runtime/storefront-v1.js": [HIMAI_SCRIPT, "application/javascript"],
      "/mmd-shop/api/runtime/storefront-v1.js": [MMD_SCRIPT, "application/javascript"],
      "/shop/api/runtime/storefront-v1.css": [HIMAI_STYLE, "text/css"],
    }[path];
    if (asset) {
      if (!["GET", "HEAD"].includes(request.method)) return json({ ok: false, error: "method_not_allowed" }, 405);
      return new Response(request.method === "HEAD" ? null : asset[0], { headers: {
        "content-type": asset[1] + "; charset=utf-8", "cache-control": "no-store",
        "x-content-type-options": "nosniff", "x-mmd-checkout-reliability": "1",
      } });
    }

    if (request.method.toUpperCase() === "GET" && ["/health", "/mmd-shop/api/health", "/shop/api/health"].includes(path)) {
      const healthUrl = new URL(request.url);
      healthUrl.pathname = "/health";
      healthUrl.search = "";
      const response = await himaiChatWorker.fetch(new Request(healthUrl.toString(), { method: "GET", headers: request.headers }), env, ctx);
      if (!response?.ok) return response;
      const payload = await response.clone().json().catch(() => null);
      if (!payload || typeof payload !== "object") return response;
      return json({
        ...payload,
        analytics: authorityRuntimeHealth(env, "himai-chat-worker", ctx),
        commerce: { reliability_version: 1, checkout_idempotency: env.MMD_SHOP_STOCK_COORDINATOR ? "durable" : "unconfigured",
          price_quote_required: true, stock_model: "shared_physical_stock", payment_authority: "payments-worker" },
      }, response.status);
    }

    if (path === "/mmd-shop/internal/reservation/release" && request.method.toUpperCase() === "POST") {
      return handleInternalReservationMutation(request, env, "release");
    }
    if (path === "/mmd-shop/internal/reservation/reserve" && request.method.toUpperCase() === "POST") {
      return handleInternalReservationMutation(request, env, "reserve");
    }
    if (path === "/mmd-shop/internal/reservation/commit" && request.method.toUpperCase() === "POST") {
      return handleInternalReservationMutation(request, env, "commit");
    }
    if (path === "/mmd-shop/internal/reservation/claim-payment" && request.method.toUpperCase() === "POST") {
      return handleInternalReservationMutation(request, env, "claim-payment");
    }
    if (path === "/mmd-shop/internal/reservation/abort-payment-claim" && request.method.toUpperCase() === "POST") {
      return handleInternalReservationMutation(request, env, "abort-payment-claim");
    }

    if (isMmdShopProductPageRequest(request)) return handleMmdShopProductPage(request);
    if (isMmdShopOrderPageRequest(request)) return handleMmdShopOrderPage(request);
    if (request.method.toUpperCase() === "GET" && url.pathname === "/shop/distributor") return renderDistributorPortalPage();

    try {
      const checkoutResponse = await handleMmdShopCheckout(request, env, ctx);
      if (checkoutResponse) return checkoutResponse;
    } catch (error) {
      console.error("MMD Shop checkout route error:", error);
      return errorResponse("mmd_shop_checkout_failed", error);
    }

    try {
      const alertResponse = await handleShopAlert(request, env);
      if (alertResponse) return alertResponse;
    } catch (error) {
      console.error("Shop alert error:", error);
      return errorResponse("shop_alert_failed", error);
    }

    try {
      const supplierPortalResponse = await handleSupplierPortal(request, env);
      if (supplierPortalResponse) return supplierPortalResponse;
    } catch (error) {
      console.error("Supplier portal error:", error);
      return errorResponse("supplier_portal_failed", error);
    }

    try {
      const catalogResponse = await handleShopCatalog(request, env);
      if (catalogResponse) return catalogResponse;
    } catch (error) {
      console.error("Shop catalog error:", error);
      return errorResponse("shop_catalog_failed", error);
    }

    try {
      const movementsResponse = await handleShopMovements(request, env);
      if (movementsResponse) return movementsResponse;
    } catch (error) {
      console.error("Shop movements error:", error);
      return errorResponse("shop_movements_failed", error);
    }

    return himaiChatWorker.fetch(request, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      expireViaMmdShopCoordinator(env)
        .then((result) => console.log(JSON.stringify({ event: "mmd_shop_reservation_expiry_sweep", ...result })))
        .catch((error) => console.error("MMD Shop reservation expiry sweep failed:", error))
    );
    ctx.waitUntil(
      stockHealthViaMmdShopCoordinator(env)
        .then((result) => console.log(JSON.stringify({
          event: "mmd_shop_stock_health_sweep",
          ok: result?.ok === true,
          low_stock_batches: Number(result?.report?.metrics?.low_stock_batches || 0),
          reconciliation_mismatches: Number(result?.report?.metrics?.reconciliation_mismatches || 0),
          fingerprint_changed: result?.fingerprint_changed === true,
          alert_ok: result?.alert?.ok === true,
          alert_skipped: result?.alert?.skipped === true,
        })))
        .catch((error) => console.error("MMD Shop stock health sweep failed:", error))
    );
  },
};

async function handleInternalReservationMutation(request, env, action) {
  const expected = String(env.INTERNAL_TOKEN || "").trim();
  const supplied = String(
    request.headers.get("x-internal-token")
    || request.headers.get("authorization")
    || ""
  ).replace(/^Bearer\s+/i, "").trim();

  if (!expected || supplied !== expected) {
    return json({ ok: false, error: "internal_auth_required" }, 401);
  }

  const body = await request.json().catch(() => null);
  if (action === "reserve") {
    try {
      const result = await reserveViaMmdShopCoordinator(env, body?.input || body || {});
      return json({ ok: true, reservation: result }, 200);
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error || "reservation_failed") }, Number(error?.status || 500));
    }
  }

  const reservation = body?.reservation || readMmdShopReservation(body?.notes || "");
  if (!reservation) return json({ ok: false, error: "reservation_required" }, 400);

  try {
    let result;
    if (action === "commit") {
      result = await commitViaMmdShopCoordinator(env, reservation);
    } else if (action === "claim-payment") {
      result = await claimPaymentViaMmdShopCoordinator(env, reservation, body?.review_key || "");
    } else if (action === "abort-payment-claim") {
      result = await abortPaymentClaimViaMmdShopCoordinator(env, reservation, body?.review_key || "", body?.reason || "payment_review_failed");
    } else {
      result = await releaseViaMmdShopCoordinator(env, reservation, body?.reason || "released");
    }
    return json({ ok: true, ...result }, 200);
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error || "reservation_mutation_failed") }, Number(error?.status || 500));
  }
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorResponse(code, error) {
  return new Response(JSON.stringify({
    ok: false,
    error: code,
    detail: error?.message || String(error)
  }), {
    status: 500,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}
