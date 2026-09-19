import himaiChatWorker from "./index.js";
import { handleShopCatalog } from "./shop-catalog.js";
import { handleShopMovements } from "./shop-movements.js";
import { handleShopAlert } from "./shop-alerts.js";
import { handleSupplierPortal } from "./supplier-portal.js";
import { renderDistributorPortalPage } from "./distributor-portal-page.js";
import { handleMmdShopCheckout } from "./mmd-shop-checkout.js";
import { handleMmdShopOrderPage, isMmdShopOrderPageRequest } from "./mmd-shop-order-page.js";
import { handleMmdShopProductPage, isMmdShopProductPageRequest } from "./mmd-shop-product-page.js";
import { expireMmdShopReservations } from "../../shared/mmd-shop-stock-reservation.mjs";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
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
  }
};

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
