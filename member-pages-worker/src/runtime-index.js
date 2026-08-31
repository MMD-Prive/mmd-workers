import worker from "./index.js";
import { rewritePendingStatusStartResponse } from "./liff-status-resolution-guard.js";

export * from "./legacy-member-pages.js";
export { CareBackBirthdayWishCoordinator } from "./care-back-birthday-wish-durable-object.js";

export default {
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    return rewritePendingStatusStartResponse(request, response);
  },
};
