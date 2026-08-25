import worker from "./admin-login-hero-worker.js";
import { handleMmsAdminRequest, isMmsAdminRequest } from "./mms-admin-runtime.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (isMmsAdminRequest(url.pathname)) {
      try {
        return await handleMmsAdminRequest(request, env, ctx);
      } catch (error) {
        console.error(JSON.stringify({
          event: "mms_admin_console_error",
          path: url.pathname,
          method: request.method,
          message: String(error?.message || error),
        }));
        return new Response(JSON.stringify({ ok: false, error: "mms_admin_internal_error" }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      }
    }
    return worker.fetch(request, env, ctx);
  },
};
