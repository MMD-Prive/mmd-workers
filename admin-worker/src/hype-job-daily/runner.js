// HYPE_JOB_DAILY runner: gate -> claim -> collect/build -> send -> mark.
// Never throws: every failure is logged (no body, no token, no PII) and recorded in the run state.
import { buildDigest } from "./builder.js";
import { collectAll, defaultSources } from "./default-sources.js";
import { formatDigest } from "./formatter.js";
import { durableObjectStore } from "./run-state-do.js";
import { addDays, clean, errorClass, ictDate, ictMinutes } from "./util.js";

export const SEND_AT_MINUTES = 8 * 60 + 45; // 08:45 ICT
export const MAX_ATTEMPTS = 3;
export const CLAIM_TIMEOUT_MS = 30 * 60 * 1000;
const FINALIZE_WINDOW_MINUTES = 15; // 00:00-00:14 ICT: close out yesterday's unfinished run
const SEND_TIMEOUT_MS = 10000;

export function isEnabled(env = {}) {
  return String(env.HYPE_JOB_DAILY_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function runKey(dateIct) {
  return `HYPE_JOB_DAILY:${dateIct}`;
}

export function resolveDestination(env = {}) {
  const chatId = clean(env.HYPE_JOB_DAILY_CHAT_ID, 60);
  if (!chatId) return null;
  return { chat_id: chatId, thread_id: clean(env.HYPE_JOB_DAILY_THREAD_ID, 20) };
}

function log(level, event, fields) {
  const line = { event, ...fields };
  try { (level === "error" ? console.error : console.log)(line); } catch { /* logging must never throw */ }
}

// Short, non-sensitive description of a failed send, kept in the run state and logs so a 404/5xx can be traced:
// the receiver's own error code, the path it says it did not recognise, and the endpoint host+path we called.
// Never includes the token, the message text, or the chat id.
export function failureDetail(body, endpoint, extra = {}) {
  const parts = [];
  if (extra.via) parts.push(`via=${clean(extra.via, 20)}`);
  if (extra.contentType) parts.push(`ct=${clean(extra.contentType, 40).split(";")[0]}`);
  if (extra.server) parts.push(`srv=${clean(extra.server, 24)}`);
  if (extra.cfRay) parts.push(`ray=${clean(extra.cfRay, 24)}`);
  const err = typeof body?.error === "string" ? clean(body.error, 40) : "";
  if (err) parts.push(`err=${err}`);
  const path = typeof body?.path === "string" ? clean(body.path, 60) : "";
  if (path) parts.push(`rx_path=${path}`);
  // Start of a non-JSON / unrecognised response body (e.g. an edge error page). Long digit runs (ids) are redacted.
  const snippet = clean(extra.snippet, 90).replace(/\d{6,}/g, "#");
  if (snippet) parts.push(`body=${snippet}`);
  try {
    const u = new URL(endpoint);
    parts.push(`ep=${u.hostname}`);
  } catch { /* endpoint unparsable: omit */ }
  return parts.join(" ");
}

// Sends one message through telegram-worker /telegram/internal/send (same contract as model-reconfirm-runtime).
export async function sendTelegramInternal(env, payload, via = "") {
  const endpoint = clean(env.TELEGRAM_INTERNAL_SEND_URL, 500);
  const serviceToken = clean(env.AUTH_SERVICE_STUDIO_TO_TELEGRAM, 500);
  if (!endpoint || !serviceToken) return { ok: false, error: "telegram_send_not_configured", retryable: false };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": serviceToken },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const raw = await response.text().catch(() => "");
    let body = {};
    try { body = JSON.parse(raw) || {}; } catch { body = {}; }
    if (response.ok && body?.telegram?.ok === true) return { ok: true, status: response.status };
    const status = response.status;
    const detail = failureDetail(body, endpoint, {
      via,
      contentType: response.headers?.get?.("content-type"),
      server: response.headers?.get?.("server"),
      cfRay: response.headers?.get?.("cf-ray"),
      snippet: raw,
    });
    return { ok: false, status, error: `telegram_http_${status}`, detail, retryable: status >= 500 || status === 429 };
  } catch (error) {
    return { ok: false, error: errorClass(error), retryable: true };
  }
}

export async function runHypeJobDaily(env = {}, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const deps = options.deps || {};
  if (!isEnabled(env)) return { status: "disabled" };

  const dateIct = ictDate(now);
  const key = runKey(dateIct);
  const minutes = ictMinutes(now);
  const store = deps.store || durableObjectStore(env.HYPE_JOB_DAILY_RUN_STATE);
  if (!store) {
    log("error", "hype_job_daily_not_configured", { date_key: dateIct, reason: "run_state_binding_missing" });
    return { status: "not_configured", reason: "run_state_binding_missing" };
  }

  try {
    if (minutes < FINALIZE_WINDOW_MINUTES) {
      const yesterday = runKey(addDays(dateIct, -1));
      const result = await store.finalizeMissed(yesterday, { now });
      if (result?.changed) log("error", "hype_job_daily_late_missed", { date_key: addDays(dateIct, -1) });
    }
    if (minutes < SEND_AT_MINUTES) return { status: "not_due" };

    const destination = resolveDestination(env);
    if (!destination) {
      log("error", "hype_job_daily_not_configured", { date_key: dateIct, reason: "destination_not_configured" });
      return { status: "not_configured", reason: "destination_not_configured" };
    }

    const claim = await store.claim(key, { now, claim_timeout_ms: CLAIM_TIMEOUT_MS, max_attempts: MAX_ATTEMPTS });
    if (claim.decision !== "proceed") {
      if (claim.decision === "max_attempts") log("error", "hype_job_daily_max_attempts", { date_key: dateIct, attempts: claim.attempt });
      return { status: claim.decision, attempt: claim.attempt };
    }
    const attempt = claim.attempt;

    let parts;
    try {
      const input = await collectAll(env, now, deps.sources || defaultSources);
      const digest = buildDigest(input, now);
      parts = formatDigest(digest);
    } catch (error) {
      log("error", "hype_job_daily_failed", { date_key: dateIct, stage: "build", attempt, error: errorClass(error) });
      await store.mark(key, { status: "failed", now, error: `build:${errorClass(error)}` });
      return { status: "failed", stage: "build", attempt };
    }

    const send = deps.send || ((payload) => sendTelegramInternal(env, payload, options.via || "cron"));
    let sent = claim.parts_sent > 0 && claim.parts_sent < parts.length ? claim.parts_sent : 0;
    for (let index = sent; index < parts.length; index += 1) {
      const payload = {
        chat_id: destination.chat_id,
        text: parts[index],
        parse_mode: "HTML",
        disable_web_page_preview: true,
        source: "admin-worker",
        intent: "hype_job_daily",
        date_key: dateIct,
      };
      if (destination.thread_id) { payload.message_thread_id = destination.thread_id; payload.thread_id = destination.thread_id; }
      const result = await send(payload).catch((error) => ({ ok: false, error: errorClass(error), retryable: true }));
      if (!result?.ok) {
        log("error", "hype_job_daily_failed", {
          date_key: dateIct, stage: "send", attempt, part: index + 1, parts: parts.length,
          error: clean(result?.error, 120), detail: clean(result?.detail, 260) || undefined, http_status: result?.status ?? null,
          message_length: parts[index].length, retryable: result?.retryable !== false,
        });
        await store.mark(key, { status: "failed", now, error: `send:${clean(result?.error, 60)}${result?.detail ? ` ${clean(result.detail, 240)}` : ""}`, parts_sent: sent });
        return { status: "failed", stage: "send", attempt, parts_sent: sent };
      }
      sent += 1;
    }
    await store.mark(key, { status: "sent", now, parts_sent: sent });
    log("info", "hype_job_daily_sent", { date_key: dateIct, attempt, parts: parts.length });
    return { status: "sent", attempt, parts: parts.length };
  } catch (error) {
    log("error", "hype_job_daily_failed", { date_key: dateIct, stage: "run_state", error: errorClass(error) });
    return { status: "failed", stage: "run_state" };
  }
}

// Owner-triggered retry of today's failed run. Only a run that FAILED is reset (attempts back to 0, parts_sent kept);
// a sent / late_missed / in-progress run is never touched, so it cannot cause a duplicate digest.
export async function retryHypeJobDailyToday(env = {}, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const deps = options.deps || {};
  if (!isEnabled(env)) return { status: "disabled" };
  const key = runKey(ictDate(now));
  const store = deps.store || durableObjectStore(env.HYPE_JOB_DAILY_RUN_STATE);
  if (!store) return { status: "not_configured", reason: "run_state_binding_missing" };
  try {
    const reset = await store.resetFailed(key, { now });
    if (!reset?.changed) return { status: "not_retryable", run_status: reset?.status ?? null };
    return await runHypeJobDaily(env, { now, via: "owner_retry", deps: { ...deps, store } });
  } catch (error) {
    log("error", "hype_job_daily_failed", { stage: "retry", error: errorClass(error) });
    return { status: "failed", stage: "retry" };
  }
}

// Entry used by admin-worker scheduled(). Isolated: never rejects.
export async function runHypeJobDailyScheduled(env, event) {
  try {
    return await runHypeJobDaily(env, { now: Number(event?.scheduledTime) || Date.now() });
  } catch (error) {
    log("error", "hype_job_daily_failed", { stage: "scheduled", error: errorClass(error) });
    return { status: "failed", stage: "scheduled" };
  }
}
