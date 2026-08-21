import himaiChatWorker from "./index.js";
import { handleShopCatalog } from "./shop-catalog.js";
import { handleShopMovements } from "./shop-movements.js";

export default {
  async fetch(request, env, ctx) {
    try {
      const catalogResponse = await handleShopCatalog(request, env);
      if (catalogResponse) return catalogResponse;
    } catch (error) {
      console.error("Shop catalog error:", error);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "shop_catalog_failed",
          detail: error?.message || String(error)
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*"
          }
        }
      );
    }

    try {
      const movementsResponse = await handleShopMovements(request, env);
      if (movementsResponse) return movementsResponse;
    } catch (error) {
      console.error("Shop movements error:", error);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "shop_movements_failed",
          detail: error?.message || String(error)
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*"
          }
        }
      );
    }

    return himaiChatWorker.fetch(request, env, ctx);
  }
};
