import runtime from "./runtime-index-with-application-v4.js";
export { MmsCoordinator } from "./runtime-index-with-application-v4.js";
export { MmsDispatchCoordinator } from "./my-mms-dispatch-runtime.mjs";

export default {
  async fetch(request, env, ctx) {
    const response = await runtime.fetch(request, env, ctx);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (request.method === "GET" && (path === "/health" || path === "/ping") && response.ok) {
      try {
        const payload = await response.clone().json();
        payload.bindings = {
          ...(payload.bindings || {}),
          dispatch_coordinator: Boolean(env.MMS_DISPATCH_COORDINATOR),
          dispatch_jobs: Boolean(env.AIRTABLE_JOBS_TABLE_ID),
          dispatch_offers: Boolean(env.AIRTABLE_OFFERS_TABLE_ID),
        };
        const headers = new Headers(response.headers);
        headers.set("Content-Type", "application/json; charset=utf-8");
        headers.set("Cache-Control", "no-store");
        return new Response(JSON.stringify(payload), { status: response.status, headers });
      } catch {
        return response;
      }
    }
    return response;
  },
};
