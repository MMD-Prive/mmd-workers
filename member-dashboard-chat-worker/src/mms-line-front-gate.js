import currentWorker from "./my-mmd-bounded-status-front-gate.js";
import { handleMmsLineRequest, isMmsLineRequest } from "./mms-line-runtime.mjs";
import { handleKenjiSeedLineRequest, isKenjiSeedLineRequest } from "./kenji-seed-line-runtime.mjs";

export { KenjiModelIdempotency } from "./my-mmd-bounded-status-front-gate.js";

function seedSmokeRequest(request) {
  if (request.method !== "GET" || request.headers.get("x-mmd-kenji-seed-smoke") !== "1") return request;
  const url = new URL(request.url);
  url.searchParams.set("kenji_seed_smoke", "1");
  const intent = String(request.headers.get("x-mmd-kenji-seed-intent") || "").trim();
  if (intent) url.searchParams.set("intent", intent);
  return new Request(url.toString(), request);
}

export default {
  async fetch(request, env = {}, ctx) {
    if (isMmsLineRequest(request)) return handleMmsLineRequest(request, env, ctx);
    if (isKenjiSeedLineRequest(request)) return handleKenjiSeedLineRequest(seedSmokeRequest(request), env, ctx, currentWorker);
    return currentWorker.fetch(request, env, ctx);
  },
};