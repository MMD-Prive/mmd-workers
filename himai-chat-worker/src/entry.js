import himaiChatWorker from "./index.js";
import { handleShopCatalog } from "./shop-catalog.js";

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

    return himaiChatWorker.fetch(request, env, ctx);
  }
};
