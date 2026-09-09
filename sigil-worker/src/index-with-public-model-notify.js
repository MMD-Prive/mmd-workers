import baseWorker, { PublicModelCoordinator } from "./index.js";
import { notifyPublicModelApplication } from "./public-model-notify.js";
import { PUBLIC_MODEL_APPLY_PATH } from "./public-model.js";

export { PublicModelCoordinator };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const shouldNotify = request.method === "POST" && url.pathname === PUBLIC_MODEL_APPLY_PATH;
    const notificationRequest = shouldNotify ? request.clone() : null;

    const response = await baseWorker.fetch(request, env, ctx);
    if (!shouldNotify || !response.ok || !notificationRequest) return response;

    const result = await response.clone().json().catch(() => null);
    if (!result?.ok || !result.application_id) return response;

    const payload = await notificationRequest.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response;

    const task = notifyPublicModelApplication({
      env,
      payload,
      applicationId: result.application_id,
      duplicate: result.duplicate === true,
    }).catch((error) => {
      console.error(JSON.stringify({
        event: "public_model_telegram_notify_failed",
        application_id: result.application_id,
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
      }));
    });

    if (ctx?.waitUntil) ctx.waitUntil(task);
    else await task;

    return response;
  },
};
