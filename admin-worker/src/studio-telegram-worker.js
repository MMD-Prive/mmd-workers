import studioWorker from "./studio-finance-worker.js";
import {
  handleCreateSessionClientLineageRequest,
  isCreateSessionClientLineageRequest,
} from "./create-session-client-lineage-runtime.js";
import { enrichLineageWithPreSessionIndex } from "./pre-session-client-index.js";
import {
  handleCanonicalLinkedJobCreate,
  isCanonicalLinkedJobCreate,
} from "./create-session-canonical-link-runtime.js";
import {
  MODEL_ACTIVATION_ADMIN_PATH,
  MODEL_ACTIVATION_LIFF_PATH,
  activateModelLine,
  issueModelActivation,
} from "./model-first-time-activation.js";
import {
  handleModelGpsVisibilityRequest,
  isModelGpsVisibilityRequest,
} from "./model-gps-visibility.js";
import {
  handleModelLocationRequest,
  isModelLocationRequest,
} from "./model-location-runtime.js";
import {
  handleModelReconfirmRequest,
  isModelReconfirmRequest,
} from "./model-reconfirm-runtime.js";
import {
  handleHistoricalSlipBackfillRequest,
  isHistoricalSlipBackfillRequest,
} from "./historical-slip-backfill-runtime.js";

const STUDIO_API_PREFIX = "/studio/api";
const HISTORICAL_BACKFILL_CANONICAL_API = "/v1/admin/payments/historical-backfill";
const HISTORICAL_BACKFILL_TRANSPORT_API = `${STUDIO_API_PREFIX}/payments/historical-backfill`;
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

    // /studio/api/* is already a credential-bound, explicitly routed admin
    // transport. Map only this exact payments sub-tree to the canonical API
    // contract until Cloudflare owns the narrow /v1/admin/payments route.
    if (isHistoricalBackfillTransport(path)) {
      const canonicalRequest = rewriteHistoricalBackfillTransport(request, path);
      return handleHistoricalSlipBackfillRequest(canonicalRequest, env, ctx);
    }

    // Historical payment evidence is an admin review lane only. The runtime can
    // create pending Payment Proof evidence and hand an explicitly reviewed item
    // to payments-worker, but it cannot mark paid or mutate points/membership/
    // entitlement/session state itself.
    if (isHistoricalSlipBackfillRequest(path, method)) {
      return handleHistoricalSlipBackfillRequest(request, env, ctx);
    }

    // Pre-job reconfirm stays additive to the canonical job/session runtime:
    // Create Session remains the source of job truth; the wrapper only persists
    // the D-1 schedule, enriches model reads, and handles acknowledgement without
    // changing the canonical lifecycle state.
    if (isModelReconfirmRequest(path, method)) {
      return handleModelReconfirmRequest(request, env, ctx, studioWorker);
    }

    // GPS location collection is a separate, fail-closed channel. The capability
    // endpoint never requests device location; ingest is disabled by default and
    // can only write one short-lived point while permission + Active Job are true.
    if (isModelLocationRequest(path)) {
      return handleModelLocationRequest(request, env, ctx);
    }

    // Model Dashboard GPS Visibility is a permission preference only. It never
    // accepts or stores coordinates and does not request device location access.
    if (isModelGpsVisibilityRequest(path)) {
      return handleModelGpsVisibilityRequest(request, env);
    }

    // Public first-time activation verifies its own signed invite + LINE ID token.
    // The admin issuer reaches this composed worker only after admin-login-hero-worker
    // has applied the canonical credential-bound /v1/admin/* gate.
    if (path === MODEL_ACTIVATION_LIFF_PATH) {
      return activateModelLine(request, env, studioWorker);
    }
    if (path === MODEL_ACTIVATION_ADMIN_PATH) {
      return issueModelActivation(request, env);
    }

    // The credential-bound admin wrapper has already authenticated /v1/admin/*
    // and injected the internal authorization bridge before requests reach this
    // composed worker. Handle Create Session lineage here so the historical
    // ingress bridge terminates on a real canonical backend instead of falling
    // through to a 404 in the legacy core router.
    if (isCreateSessionClientLineageRequest(path, method)) {
      // Keep one untouched request body for the optional candidate lookup. The
      // canonical lineage runtime always runs first; Pre-Session Airtable is only
      // consulted when that runtime would otherwise return the free-form manual
      // public-only fallback.
      const preSessionRequest = request.clone();
      const response = await handleCreateSessionClientLineageRequest(request, env);
      const enrichedResponse = await enrichLineageWithPreSessionIndex(
        preSessionRequest,
        response,
        env,
      );
      const headers = new Headers(enrichedResponse.headers);
      headers.set("X-MMD-Manual-Public-Fallback", CREATE_SESSION_MANUAL_FALLBACK_MARKER);
      return new Response(enrichedResponse.body, {
        status: enrichedResponse.status,
        statusText: enrichedResponse.statusText,
        headers,
      });
    }

    // Create Job must resolve to canonical Airtable record identities before the
    // legacy payment/session creation path runs. Raw LINE names or R2 objects are
    // not sufficient authority. After creation, reconcile the canonical Client
    // and Model links into both Sessions and Jobs without removing legacy text
    // snapshots used by older surfaces.
    if (isCanonicalLinkedJobCreate(path, method)) {
      return handleCanonicalLinkedJobCreate(request, env, ctx, studioWorker);
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

function isHistoricalBackfillTransport(path) {
  return path === HISTORICAL_BACKFILL_TRANSPORT_API || path.startsWith(`${HISTORICAL_BACKFILL_TRANSPORT_API}/`);
}

function rewriteHistoricalBackfillTransport(request, path) {
  const url = new URL(request.url);
  const suffix = path.slice(HISTORICAL_BACKFILL_TRANSPORT_API.length);
  url.pathname = `${HISTORICAL_BACKFILL_CANONICAL_API}${suffix}`;
  return new Request(url, request);
}

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
