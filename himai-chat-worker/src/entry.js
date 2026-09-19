import himaiChatWorker from "./index.js";
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
  MmdShopStockCoordinator,
} from "./mmd-shop-stock-coordinator.js";
import { readMmdShopReservation } from "../../shared/mmd-shop-stock-reservation.mjs";

export { MmdShopStockCoordinator };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    if (path === "/mmd-shop/internal/reservation/release" && request.method.toUpperCase() === "POST") {
      return handleInternalReservationMutation(request, env, "release");
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
      const checkoutResponse = await handleMmdShopCheckout(request, env);
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
