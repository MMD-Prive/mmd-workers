import studioWorker from "./studio-real-worker.js";
import {
  handleCreateSessionClientLineageRequest,
  isCreateSessionClientLineageRequest,
} from "./create-session-client-lineage-runtime.js";

const STUDIO_API_PREFIX = "/studio/api";
const COMMIT_PATHS = new Set([
  `${STUDIO_API_PREFIX}/intake/commit`,
  `${STUDIO_API_PREFIX}/review/commit`,
  `${STUDIO_API_PREFIX}/model-preview/commit`,
]);
const CREATE_SESSION_MANUAL_FALLBACK_MARKER = "canonical-v1";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePathname(url.pathname);
    const method = request.method.toUpperCase();

    // The credential-bound admin wrapper has already authenticated /v1/admin/*
    // and injected the internal authorization bridge before requests reach this
    // composed worker. Handle Create Session lineage here so the historical
    // ingress bridge terminates on a real canonical backend instead of falling
    // through to a 404 in the legacy core router.
    if (isCreateSessionClientLineageRequest(path, method)) {
      const response = await handleCreateSessionClientLineageRequest(request, env);
      const headers = new Headers(response.headers);
      headers.set("X-MMD-Manual-Public-Fallback", CREATE_SESSION_MANUAL_FALLBACK_MARKER);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const bodyPromise = method === "POST" && COMMIT_PATHS.has(path)
      ? request.clone().json().catch(() => ({}))
      : Promise.resolve({});

    const response = await studioWorker.fetch(request, env, ctx);

    if (method === "POST" && COMMIT_PATHS.has(path) && response.ok) {
      const notifyPromise = Promise.all([
        bodyPromise,
        response.clone().json().catch(() => ({})),
      ]).then(([body, result]) => notifyStudioTelegram(env, { path, body, result }));

      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifyPromise.catch(() => null));
      else await notifyPromise.catch(() => null);
    }

    return response;
  },
};

export async function notifyStudioTelegram(env, { path, body, result }) {
  if (token(env.TELEGRAM_STUDIO_NOTIFY_ENABLED || env.TELEGRAM_NOTIFY_ENABLED || "true") === "false") {
    return { ok: false, skipped: true, reason: "disabled" };
  }

  const endpoint = clean(env.TELEGRAM_INTERNAL_SEND_URL || env.TELEGRAM_NOTIFY_URL);
  const chatId = clean(env.TELEGRAM_STUDIO_CHAT_ID || env.TELEGRAM_CHAT_ID || env.TELEGRAM_BOOKING_CHAT_ID || env.TELEGRAM_INTERNAL_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID);
  if (!endpoint || !chatId) return { ok: false, skipped: true, reason: "missing_telegram_config" };

  const threadId = clean(env.TG_THREAD_STUDIO_ALERT || env.TG_THREAD_ALERTS_EXCEPTIONS || env.TG_THREAD_ALERT || env.TELEGRAM_STUDIO_THREAD_ID || env.TELEGRAM_ALERT_THREAD_ID || env.TELEGRAM_THREAD_ID || "9");
  const kind = studioAlertKind(path);
  const text = buildStudioTelegramText({ kind, body, result });
  const payload = compact({
    chat_id: chatId,
    message_thread_id: threadId,
    thread_id: threadId,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    text,
    source: "admin_studio_worker",
    intent: `studio_${kind}_alert`,
    record_id: clean(result.record_id),
    idempotency_key: clean(result.idempotency_key),
    model_name: clean(body.model_name || body.modelName || body.model || body.name),
    field: clean(body.field || body.field_code),
    layer: clean(body.layer),
  });

  const headers = { "Content-Type": "application/json" };
  const internalHeader = clean(env.AUTH_SERVICE_STUDIO_TO_TELEGRAM);
  if (!internalHeader) return { ok: false, skipped: true, reason: "missing_studio_telegram_service_auth" };
  headers["X-Internal-Token"] = internalHeader;

  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
    const responseText = await response.text();
    return { ok: response.ok, status: response.status, skipped: false, response: responseText.slice(0, 240) };
  } catch (error) {
    return { ok: false, skipped: false, error: String(error?.message || error) };
  }
}

function studioAlertKind(path) {
  if (path.endsWith("/intake/commit")) return "intake_commit";
  if (path.endsWith("/review/commit")) return "review_commit";
  if (path.endsWith("/model-preview/commit")) return "publish_commit";
  return "commit";
}

function buildStudioTelegramText({ kind, body, result }) {
  const modelName = clean(body.model_name || body.modelName || body.model || body.name || "Studio Model");
  const field = clean(body.field || body.field_code || "-");
  const runNumber = clean(body.run_number || body.runNumber);
  const layer = clean(body.layer || "-");
  const template = clean(body.template_hint || body.template || body.template_title || body.template_id);
  const decision = clean(body.decision || body.status);
  const publishTarget = clean(body.publish_target || body.target || body.public_route_target || body.route_target);
  const recordId = clean(result.record_id || result.studio_intake_id || result.studio_review_id || result.publish_id);
  const idempotencyKey = clean(result.idempotency_key);

  return [
    "🖼️ <b>MMD Studio Alert</b>",
    `Step: <b>${escHtml(labelKind(kind))}</b>`,
    `Model: <b>${escHtml(modelName)}</b>`,
    `Field: <code>${escHtml(field)}</code>${runNumber ? ` · Run: <code>${escHtml(runNumber)}</code>` : ""}`,
    `Layer: ${escHtml(layer)}`,
    template ? `Template: ${escHtml(template)}` : "",
    decision ? `Decision: <b>${escHtml(decision)}</b>` : "",
    publishTarget ? `Target: ${escHtml(publishTarget)}` : "",
    recordId ? `Airtable: <code>${escHtml(recordId)}</code>` : "",
    idempotencyKey ? `Idempotency: <code>${escHtml(idempotencyKey)}</code>` : "",
    "",
    kind === "publish_commit"
      ? "Note: Studio final commit only. Webflow/public publish still needs explicit approval."
      : "Note: Studio commit recorded. Review before downstream publish.",
  ].filter(Boolean).join("\n");
}

function labelKind(kind) {
  return {
    intake_commit: "Intake Commit",
    review_commit: "Review Commit",
    publish_commit: "Publish Commit",
  }[kind] || "Studio Commit";
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function clean(value) {
  return String(value ?? "").trim();
}

function token(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function escHtml(value) {
  return clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function normalizePathname(pathname = "") {
  const normalized = String(pathname || "/").replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/g, "") : normalized || "/";
}
