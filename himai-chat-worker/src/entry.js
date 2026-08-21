import himaiChatWorker from "./index.js";
import { handleShopCatalog } from "./shop-catalog.js";

export default {
  async fetch(request, env, ctx) {
    const catalogResponse = await handleShopCatalog(request, env);
    if (catalogResponse) return catalogResponse;
    return himaiChatWorker.fetch(request, env, ctx);
  }
};
