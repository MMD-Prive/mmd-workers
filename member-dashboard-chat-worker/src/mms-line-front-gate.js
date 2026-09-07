import currentWorker from "./my-mmd-bounded-status-front-gate.js";
import { handleMmsLineRequest, isMmsLineRequest } from "./mms-line-runtime.mjs";
import { handleKenjiSeedLineRequest, isKenjiSeedLineRequest } from "./kenji-seed-line-runtime.mjs";

export { KenjiModelIdempotency } from "./my-mmd-bounded-status-front-gate.js";

export default {
  async fetch(request, env = {}, ctx) {
    if (isMmsLineRequest(request)) return handleMmsLineRequest(request, env, ctx);
    if (isKenjiSeedLineRequest(request)) return handleKenjiSeedLineRequest(request, env, ctx, currentWorker);
    return currentWorker.fetch(request, env, ctx);
  },
};