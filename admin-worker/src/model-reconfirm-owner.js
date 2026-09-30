// Owner-only status / dry-run preview / smoke for MODEL_RECONFIRM guard v2.
// - status:  GET  /internal/admin/model-reconfirm/status   flags + destination check, read-only
// - preview: GET  /internal/admin/model-reconfirm/preview  dry-run for the next ICT date; sends nothing, writes nothing
// - smoke:   POST /internal/admin/model-reconfirm/smoke    ONE short line (no business data) to the owner destination
// Requires an admin browser session whose role is exactly "owner". The real sweep runs in events-worker;
// these routes never touch reconfirm fields and never message a model.
import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { inferChatKind } from "./hype-job-daily/owner.js";
import {
  GUARD_ACTIONS,
  buildOwnerFallbackText,
  ictDateOf,
  isGuardV2Enabled,
  maskId,
  normalizeJobDate,
  resolveOwnerDestination,
} from "./model-reconfirm-guard.js";
import { collectReconfirmDecisions, sendOwnerFallback } from "./model-reconfirm-runtime.js";

export const MODEL_RECONFIRM_OWNER_BASE = "/internal/admin/model-reconfirm";
export const SMOKE_CONFIRM = "send-smoke-test";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

const clean = (value) => String(value ?? "").trim();

export function isModelReconfirmOwnerRequest(path) {
  const p = String(path || "").replace(/\/+$/g, "");
  return [`${MODEL_RECONFIRM_OWNER_BASE}/status`, `${MODEL_RECONFIRM_OWNER_BASE}/preview`, `${MODEL_RECONFIRM_OWNER_BASE}/smoke`].includes(p);
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export function buildStatus(env = {}, now = Date.now()) {
  const destination = resolveOwnerDestination(env);
  const kind = destination ? inferChatKind(destination.chat_id) : null;
  const telegramConfigured = Boolean(clean(env.TELEGRAM_INTERNAL_SEND_URL) && clean(env.AUTH_SERVICE_EVENTS_TO_TELEGRAM || env.AUTH_SERVICE_STUDIO_TO_TELEGRAM));
  const guard = isGuardV2Enabled(env);
  const warnings = [];
  if (!guard) warnings.push("MODEL_RECONFIRM_GUARD_V2 is off here: the legacy sweep has no next-day, ambiguity or owner-fallback protection");
  if (!destination) warnings.push("owner_destination_missing: neither MODEL_RECONFIRM_OWNER_CHAT_ID nor HYPE_JOB_DAILY_CHAT_ID is set; owner fallback will not send");
  if (destination && kind !== "private_chat") warnings.push("destination is a group/channel by id format: confirm it is the owner-only HYPE OWNER DAILY room");
  if (!telegramConfigured) warnings.push("Telegram internal send is not configured here (URL or service token missing)");
  warnings.push("the sweep runs in events-worker: MODEL_RECONFIRM_ENABLED, MODEL_RECONFIRM_GUARD_V2, the owner chat id and the LINE token must be verified there; this route only sees admin-worker env");
  return {
    ok: true,
    read_only: true,
    date_ict: ictDateOf(now),
    flags_seen_here: { model_reconfirm_enabled: clean(env.MODEL_RECONFIRM_ENABLED).toLowerCase() === "true", guard_v2: guard },
    owner_destination: destination
      ? { configured: true, source: destination.source, chat_id_masked: maskId(destination.chat_id), chat_kind_by_id_format: kind, thread_configured: Boolean(destination.thread_id) }
      : { configured: false, reason: "owner_destination_missing" },
    telegram_send_configured: telegramConfigured,
    line_token_visible_here: Boolean(clean(env.MODEL_LINE_CHANNEL_ACCESS_TOKEN || env.LINE_CHANNEL_ACCESS_TOKEN)),
    warnings,
  };
}

export async function buildPreview(env = {}, now = Date.now(), deps = {}) {
  const collect = deps.collect || collectReconfirmDecisions;
  // The LINE token normally lives on events-worker, so this dry-run assumes the transport is ready and says so.
  const collected = await collect(env, { now, lineTransportReady: true });
  if (!collected.ok) return { ok: false, sends_nothing: true, error: clean(collected.error) || "reconfirm_preview_unavailable", target_date: collected.target_date };
  const destination = resolveOwnerDestination(env);
  const tally = { send: 0, skip: 0, owner_action: 0, review_required: 0 };
  const reasons = {};
  const items = collected.items.map(({ record, decision }) => {
    tally[decision.action] = (tally[decision.action] || 0) + 1;
    reasons[decision.reason] = (reasons[decision.reason] || 0) + 1;
    const fields = record.fields || {};
    const sessionId = clean(fields.session_id) || record.id;
    const modelName = clean(fields.model_name || fields["Model Name"]);
    const item = {
      session_id_masked: maskId(sessionId),
      job_date: normalizeJobDate(fields.job_date || fields.service_date || fields.date),
      action: decision.action,
      reason: decision.reason,
    };
    if (decision.action === GUARD_ACTIONS.OWNER_ACTION || decision.action === GUARD_ACTIONS.REVIEW_REQUIRED) {
      item.owner_message = buildOwnerFallbackText({ kind: decision.action, reason: decision.reason, sessionId, jobDate: item.job_date, modelName });
    }
    return item;
  });
  return {
    ok: true,
    sends_nothing: true,
    writes_nothing: true,
    target_date: collected.target_date,
    line_transport_assumed_ready: true,
    owner_destination_configured: Boolean(destination),
    counts: tally,
    reasons,
    items,
    warnings: [
      ...(destination ? [] : ["owner_destination_missing: owner_action / review_required items would not be sent"]),
      ...(isGuardV2Enabled(env) ? [] : ["guard_v2 is off here: the events-worker sweep only follows this plan once MODEL_RECONFIRM_GUARD_V2=true there"]),
    ],
  };
}

export async function sendSmoke(env = {}, now = Date.now(), deps = {}) {
  const destination = resolveOwnerDestination(env);
  if (!destination) return { ok: false, status: 409, error: "owner_destination_missing" };
  const text = `🧪 MODEL RECONFIRM — owner destination smoke test\nNo model, customer or payment data in this message.\nSent on owner request (${ictDateOf(now)} ICT).`;
  const result = await (deps.send || ((d, p) => sendOwnerFallback(env, d, p)))(destination, { text, intent: "model_reconfirm_smoke" }).catch(() => ({ ok: false, error: "telegram_transport_unavailable" }));
  return result?.ok
    ? { ok: true, status: 200, sent: true, destination: { chat_id_masked: maskId(destination.chat_id), source: destination.source, chat_kind_by_id_format: inferChatKind(destination.chat_id) } }
    : { ok: false, status: 502, sent: false, error: clean(result?.error).slice(0, 120) || "telegram_send_failed" };
}

export async function handleModelReconfirmOwnerRequest(request, env = {}, deps = {}) {
  const path = new URL(request.url).pathname.replace(/\/+$/g, "");
  if (!isModelReconfirmOwnerRequest(path)) return json({ ok: false, error: "not_found" }, 404);
  const method = String(request.method || "GET").toUpperCase();
  const action = path.slice(MODEL_RECONFIRM_OWNER_BASE.length + 1);
  const expected = action === "smoke" ? "POST" : "GET";
  if (method !== expected) return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: expected });

  const actor = await (deps.readActor || readCredentialBoundAdminActor)(request, env).catch(() => null);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (clean(actor.role).toLowerCase() !== "owner") return json({ ok: false, error: "owner_only" }, 403);

  const now = Number.isFinite(Number(deps.now)) ? Number(deps.now) : Date.now();
  try {
    if (action === "status") return json(buildStatus(env, now));
    if (action === "preview") return json(await buildPreview(env, now, deps));
    const body = await request.json().catch(() => ({}));
    if (clean(body?.confirm) !== SMOKE_CONFIRM) return json({ ok: false, error: "confirm_required", required: SMOKE_CONFIRM }, 400);
    const { status, ...rest } = await sendSmoke(env, now, deps);
    return json(rest, status);
  } catch {
    return json({ ok: false, error: "model_reconfirm_owner_failed" }, 500);
  }
}
