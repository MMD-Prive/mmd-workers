import baseWorker, { PublicModelCoordinator } from "./index.js";
import { notifyPublicModelApplication } from "./public-model-notify.js";
import { PUBLIC_MODEL_APPLY_PATH } from "./public-model.js";
import {
  handlePrivateModelRequest,
  isPrivateModelRequestPath,
  probePrivateModelReadiness,
} from "./private-model.js";

export { PublicModelCoordinator };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (isPrivateModelRequestPath(url.pathname)) {
      return handlePrivateModelRequest(request, env, ctx);
    }

    if ((url.pathname === "/health" || url.pathname === "/ping") && request.method === "GET") {
      const response = await baseWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const body = await response.clone().json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return response;
      const privateModel = await probePrivateModelReadiness(env);
      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set("cache-control", "no-store");
      return new Response(JSON.stringify({
        ...body,
        capabilities: {
          ...(body.capabilities || {}),
          private_model_apply: privateModel.private_model_apply,
          private_model_upload: privateModel.private_model_upload,
        },
      }), { status: response.status, headers });
    }

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