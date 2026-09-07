import { AI_OPS_CLIENT_JS } from "./ai-ops-layer-client.js";
import { aiOpsJsonResponse } from "./ai-ops-layer-runtime.js";

export const AI_OPS_CONTEXT_PATH = "/v1/admin/ai-ops/context";
export const AI_OPS_CLIENT_PATH = "/v1/admin/ai-ops/client.js";

export function handleAiOpsRequest(request) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === AI_OPS_CONTEXT_PATH) {
    return aiOpsJsonResponse(request);
  }
  if (request.method === "GET" && url.pathname === AI_OPS_CLIENT_PATH) {
    return new Response(AI_OPS_CLIENT_JS, {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  return null;
}
