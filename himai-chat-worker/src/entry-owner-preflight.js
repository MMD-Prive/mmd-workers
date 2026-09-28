import baseWorker from "./entry.js";
import { handleSupplierOwnerPreflightRequest } from "./supplier-owner-preflight.js";

export { MmdShopStockCoordinator } from "./entry.js";

export default {
  async fetch(request, env, ctx) {
    try {
      const preflightResponse = await handleSupplierOwnerPreflightRequest(request, env, ctx);
      if (preflightResponse) return preflightResponse;
    } catch (error) {
      console.error("Himai Supplier owner preflight error:", error);
      return json({
        ok: false,
        error: "owner_preflight_unavailable",
      }, 500);
    }

    return baseWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker.scheduled === "function") {
      return baseWorker.scheduled(controller, env, ctx);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
