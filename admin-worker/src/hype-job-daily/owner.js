// Owner-only status / preview / destination smoke for HYPE_JOB_DAILY.
// - status:  GET  /internal/admin/hype-job-daily/status   read-only config + run-state check
// - preview: GET  /internal/admin/hype-job-daily/preview  builds today's digest, returns it in the response, sends nothing
// - smoke:   POST /internal/admin/hype-job-daily/smoke    sends ONE short test line (no business data) to the configured destination
// - retry:   POST /internal/admin/hype-job-daily/retry    re-runs today's digest ONLY if today's run FAILED ({"confirm":"retry-today-run"})
// Requires an authenticated admin browser session whose role is exactly "owner". Never writes business truth
// status/preview/smoke never touch the daily run-state. retry resets ONLY a FAILED run for today, so it cannot cause a duplicate digest.
import { readCredentialBoundAdminActor } from "../credential-bound-admin-session.js";
import { buildDigest } from "./builder.js";
import { collectAll, defaultSources } from "./default-sources.js";
import { formatDigest } from "./formatter.js";
import { durableObjectStore } from "./run-state-do.js";
import { SEND_AT_MINUTES, isEnabled, resolveDestination, retryHypeJobDailyToday, runKey, sendTelegramInternal } from "./runner.js";
import { clean, errorClass, ictDate, ictMinutes } from "./util.js";

export const HYPE_JOB_DAILY_OWNER_BASE = "/internal/admin/hype-job-daily";
export const SMOKE_CONFIRM = "send-smoke-test";
export const RETRY_CONFIRM = "retry-today-run";
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export function isHypeJobDailyOwnerRequest(path) {
  const p = String(path || "").replace(/\/+$/g, "");
  return p === `${HYPE_JOB_DAILY_OWNER_BASE}/status` || p === `${HYPE_JOB_DAILY_OWNER_BASE}/preview` || p === `${HYPE_JOB_DAILY_OWNER_BASE}/smoke` || p === `${HYPE_JOB_DAILY_OWNER_BASE}/retry`;
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export function maskId(value) {
  const text = clean(value, 40);
  return text ? `…${text.slice(-4)}` : "";
}

// Heuristic from the id format only. It is NOT verified with Telegram.
export function inferChatKind(chatId) {
  const id = clean(chatId, 40);
  if (/^-100\d+$/.test(id)) return "supergroup_or_channel";
  if (/^-\d+$/.test(id)) return "basic_group";
  if (/^\d+$/.test(id)) return "private_chat";
  return "unknown";
}

function hhmm(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export async function buildStatus(env = {}, now = Date.now(), deps = {}) {
  const destination = resolveDestination(env);
  const store = deps.store || durableObjectStore(env.HYPE_JOB_DAILY_RUN_STATE);
  const sendConfigured = Boolean(clean(env.TELEGRAM_INTERNAL_SEND_URL, 500) && clean(env.AUTH_SERVICE_STUDIO_TO_TELEGRAM, 500));
  const key = runKey(ictDate(now));
  let today = { available: false };
  if (store?.state) {
    try {
      const record = await store.state(key);
      today = { available: true, status: record?.status || "no_run_yet", attempts: record?.attempts ?? 0, parts_sent: record?.parts_sent ?? 0, last_error: record?.last_error || "" };
    } catch (error) {
      today = { available: false, error: errorClass(error) };
    }
  }
  const kind = destination ? inferChatKind(destination.chat_id) : null;
  const warnings = [];
  if (!store) warnings.push("run-state Durable Object binding is missing: the digest cannot run");
  if (!sendConfigured) warnings.push("Telegram internal send is not configured (URL or service token missing)");
  if (!destination) warnings.push("HYPE_JOB_DAILY_CHAT_ID is not set: the digest will not send");
  if (destination && kind !== "private_chat") warnings.push("destination is a group/channel by id format: confirm every member is allowed to see customer names and payment amounts");
  if (destination?.thread_id && kind === "basic_group") warnings.push("a thread id is set but a basic group has no threads");
  if (isEnabled(env) && (!store || !destination || !sendConfigured)) warnings.push("flag is ON but configuration is incomplete");
  return {
    ok: true,
    flag_enabled: isEnabled(env),
    destination: destination ? { configured: true, chat_id_masked: maskId(destination.chat_id), chat_kind_by_id_format: kind, thread_configured: Boolean(destination.thread_id), thread_id_masked: destination.thread_id ? maskId(destination.thread_id) : null } : { configured: false },
    telegram_send_configured: sendConfigured,
    run_state_binding: Boolean(store),
    schedule: { send_at_ict: hhmm(SEND_AT_MINUTES), now_ict: hhmm(ictMinutes(now)), date_ict: ictDate(now), run_key: key },
    today,
    warnings,
    read_only: true,
  };
}

export async function buildPreview(env = {}, now = Date.now(), deps = {}) {
  const input = await collectAll(env, now, deps.sources || defaultSources);
  const digest = buildDigest(input, now);
  return {
    ok: true,
    sends_nothing: true,
    date_ict: digest.date_ict,
    sources_ok: { sessions: !digest.failed.sessions, payments: !digest.failed.payments, review: !digest.failed.review, recovery: !digest.failed.recovery },
    counts: { jobs_today: digest.sections.jobs_today.length, upcoming: digest.sections.upcoming.length, p0: digest.sections.p0.length, payment_watch: digest.sections.payment.length },
    payment_stats: digest.payment_stats,
    parts: formatDigest(digest),
  };
}

export async function sendSmoke(env = {}, now = Date.now(), deps = {}) {
  const destination = resolveDestination(env);
  if (!destination) return { ok: false, status: 409, error: "destination_not_configured" };
  const payload = {
    chat_id: destination.chat_id,
    text: `🧪 HYPE JOB DAILY — destination smoke test\nNo customer or payment data in this message.\nSent on owner request at ${hhmm(ictMinutes(now))} ICT (${ictDate(now)}).`,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    source: "admin-worker",
    intent: "hype_job_daily_smoke",
  };
  if (destination.thread_id) { payload.message_thread_id = destination.thread_id; payload.thread_id = destination.thread_id; }
  const result = await (deps.send || ((p) => sendTelegramInternal(env, p)))(payload).catch((error) => ({ ok: false, error: errorClass(error) }));
  try { console.log({ event: "hype_job_daily_smoke", ok: result?.ok === true, http_status: result?.status ?? null, error: result?.ok ? undefined : clean(result?.error, 120) }); } catch { /* never throw from logging */ }
  return result?.ok
    ? { ok: true, status: 200, sent: true, destination: { chat_id_masked: maskId(destination.chat_id), chat_kind_by_id_format: inferChatKind(destination.chat_id) } }
    : { ok: false, status: 502, sent: false, error: clean(result?.error, 120) || "telegram_send_failed" };
}

export async function handleHypeJobDailyOwnerRequest(request, env = {}, deps = {}) {
  const path = new URL(request.url).pathname.replace(/\/+$/g, "");
  if (!isHypeJobDailyOwnerRequest(path)) return json({ ok: false, error: "not_found" }, 404);
  const method = String(request.method || "GET").toUpperCase();
  const action = path.slice(HYPE_JOB_DAILY_OWNER_BASE.length + 1);
  const expected = action === "smoke" || action === "retry" ? "POST" : "GET";
  if (method !== expected) return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: expected });

  const actor = await (deps.readActor || readCredentialBoundAdminActor)(request, env).catch(() => null);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (clean(actor.role, 40).toLowerCase() !== "owner") return json({ ok: false, error: "owner_only" }, 403);

  const now = Number.isFinite(Number(deps.now)) ? Number(deps.now) : Date.now();
  try {
    if (action === "status") return json(await buildStatus(env, now, deps));
    if (action === "preview") return json(await buildPreview(env, now, deps));
    const body = await request.json().catch(() => ({}));
    if (action === "retry") {
      if (clean(body?.confirm, 60) !== RETRY_CONFIRM) return json({ ok: false, error: "confirm_required", required: RETRY_CONFIRM }, 400);
      const result = await (deps.retry || retryHypeJobDailyToday)(env, { now, deps: deps.runnerDeps });
      return json({ ok: result?.status === "sent", result });
    }
    if (clean(body?.confirm, 60) !== SMOKE_CONFIRM) return json({ ok: false, error: "confirm_required", required: SMOKE_CONFIRM }, 400);
    const result = await sendSmoke(env, now, deps);
    const { status, ...rest } = result;
    return json(rest, status);
  } catch (error) {
    return json({ ok: false, error: "hype_job_daily_owner_failed", detail: errorClass(error) }, 500);
  }
}
