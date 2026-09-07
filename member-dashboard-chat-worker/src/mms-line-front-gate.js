import currentWorker from "./my-mmd-bounded-status-front-gate.js";
import { handleMmsLineRequest, isMmsLineRequest } from "./mms-line-runtime.mjs";

export { KenjiModelIdempotency } from "./my-mmd-bounded-status-front-gate.js";

export default {
  async fetch(request, env = {}, ctx) {
    if (isMmsLineRequest(request)) return handleMmsLineRequest(request, env, ctx);
    return currentWorker.fetch(request, env, ctx);
  },
};
