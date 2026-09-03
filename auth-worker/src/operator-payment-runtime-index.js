import runtime from "./my-mmd-runtime-index.js";
import { handleOperatorPaymentEvent, OPERATOR_PAYMENT_EVENT_PATH } from "./operator-payment-event.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === OPERATOR_PAYMENT_EVENT_PATH) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
          status: 405,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            allow: "POST",
          },
        });
      }
      return handleOperatorPaymentEvent(request, env);
    }
    return runtime.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    return runtime.scheduled(controller, env, ctx);
  },
};
