import baseWorker from "./index.js";
import { runModelReconfirmSweep, sendModelNewJobNotification } from "../../admin-worker/src/model-reconfirm-runtime.js";
import {
  handleCustomerAftercare,
  isCustomerAftercareRequest,
} from "./customer-aftercare-v2.js";

const ETA_PATH = "/__internal/model/session/eta";
const MODEL_AVAILABILITY_REMINDER_PATH = "/__internal/model/availability-reminder";
const MODEL_AVAILABILITY_REMINDER_PREFLIGHT_PATH = "/__internal/model/availability-reminder/preflight";
const MODEL_NEW_JOB_NOTIFICATION_PATH = "/__internal/model/session/new-job-notification";
const MODEL_LINE_IDENTITY_RECOVERY_PREFLIGHT_PATH = "/__internal/model/line-identity/recovery-preflight";
const LINE_PROFILE_BASE_URL = "https://api.line.me/v2/bot/profile";
const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const AIRTABLE_API = "https://api.airtable.com/v0";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (isCustomerAftercareRequest(path, method)) {
      return handleCustomerAftercare(request, env);
    }

    if (path === MODEL_AVAILABILITY_REMINDER_PREFLIGHT_PATH) {
      return handleModelAvailabilityReminderPreflight(request, env);
    }

    if (path === MODEL_LINE_IDENTITY_RECOVERY_PREFLIGHT_PATH) {
      return handleModelLineIdentityRecoveryPreflight(request, env);
    }

    if (path === MODEL_AVAILABILITY_REMINDER_PATH) {
      return handleModelAvailabilityReminder(request, env);
    }

    if (path === MODEL_NEW_JOB_NOTIFICATION_PATH) {
      return handleModelNewJobNotification(request, env);
    }

    if (path !== ETA_PATH) return baseWorker.fetch(request, env, ctx);
    if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const auth = requireAdminServiceAuth(request, env);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400);

    const sessionId = clean(body.session_id);
    const etaMinutes = normalizeEtaMinutes(body.eta_minutes);
    if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);
    if (!etaMinutes) return json({ ok: false, error: "eta_minutes_invalid", min: 1, max: 240 }, 400);

    const job = await findJobBySessionId(env, sessionId);
    if (!job.ok) return json({ ok: false, error: job.error }, job.status);

    const updatedAt = new Date().toISOString();
    const existingEvents = parseEvents(job.record.fields?.events_json);
    const event = {
      ts: updatedAt,
      event: "eta_update",
      by: "model",
      eta_minutes: etaMinutes,
      source: "mmd_model_dashboard",
    };
    const nextEvents = appendEtaEvent(existingEvents, event);

    const patched = await patchJob(env, job.record.id, {
      events_json: JSON.stringify(nextEvents),
      last_update_at: updatedAt,
    });
    if (!patched.ok) return json({ ok: false, error: patched.error }, patched.status);

    return json({
      ok: true,
      owner: "events-worker",
      session_id: sessionId,
      job_id: clean(patched.record.fields?.job_id || job.record.fields?.job_id),
      eta_minutes: etaMinutes,
      eta_updated_at: updatedAt,
    }, 200);
  },

  // events-worker already owns the 15-minute Cloudflare cron. Reuse that clock
  // for D-1 reconfirm instead of inventing browser timers or a second scheduler.
  async scheduled(controller, env, ctx) {
    const scheduledAt = Number(controller?.scheduledTime || Date.now());
    const reconfirmJob = runModelReconfirmSweep(env, { now: scheduledAt });
    const legacyJob = typeof baseWorker.scheduled === "function"
      ? baseWorker.scheduled(controller, env, ctx)
      : Promise.resolve();
    const job = Promise.allSettled([reconfirmJob, legacyJob]);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
    else await job;
  },
};

async function handleModelNewJobNotification(request, env = {}) {
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const auth = requireAdminServiceAuth(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json" }, 400);
  const sessionId = clean(body.session_id);
  if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);
  const result = await sendModelNewJobNotification(env, sessionId);
  return json(result, result.ok || result.skipped ? 200 : 502);
}

export function normalizeEtaMinutes(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 240) return 0;
  return number;
}

export function appendEtaEvent(events, event) {
  const list = Array.isArray(events) ? events.slice(-199) : [];
  list.push(event);
  return list;
}

function requireAdminServiceAuth(request, env) {
  const expected = clean(env.AUTH_SERVICE_ADMIN_TO_EVENTS || env.CONFIRM_KEY);
  if (!expected) return { ok: false, status: 503, error: "eta_service_auth_not_ready" };
  const supplied = clean(request.headers.get("X-Internal-Token"));
  if (!supplied || supplied !== expected) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true, status: 200 };
}

function modelLineUserId(value) {
  const candidate = clean(value);
  return /^U[0-9a-f]{32}$/i.test(candidate) ? candidate : "";
}

function modelAvailabilityReminderText(displayName = "") {
  const name = clean(displayName).slice(0, 80);
  return [
    "MMD MODEL · อัปเดตสถานะวันนี้",
    name ? `${name} กรุณาอัปเดตสถานะที่สะดวกตอนนี้` : "กรุณาอัปเดตสถานะที่สะดวกตอนนี้",
    "",
    "เปิด MMD MODEL > Availability แล้วเลือกสถานะปัจจุบัน เพื่อให้คิวที่ MMD เห็นตรงกับคุณ",
    "ถ้ายังไม่สะดวก ไม่ต้องเลือก “ว่าง” — ระบบจะรอการยืนยันจากคุณ",
    "",
    "https://www.mmdbkk.com/sigil/model/dashboard/availability",
  ].join("\n");
}

function modelLineTransport(env = {}) {
  const modelToken = clean(env.MODEL_LINE_CHANNEL_ACCESS_TOKEN);
  if (modelToken) return { token: modelToken, transport: "events-worker-model-line", token_mode: "model" };
  return { token: "", transport: "none", token_mode: "missing" };
}

async function handleModelAvailabilityReminderPreflight(request, env = {}) {
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const auth = requireAdminServiceAuth(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json" }, 400);

  const to = modelLineUserId(body.line_user_id);
  if (!to) {
    return json({
      ok: true,
      ready: false,
      state: "model_line_identity_invalid",
      token_mode: "unknown",
      recipient_reachable: false,
      message_sent: false,
    }, 200);
  }

  const transport = modelLineTransport(env);
  if (!transport.token) {
    return json({
      ok: true,
      ready: false,
      state: "model_line_transport_not_ready",
      token_mode: transport.token_mode,
      transport: transport.transport,
      recipient_reachable: false,
      message_sent: false,
    }, 200);
  }

  let response;
  try {
    response = await fetch(`${LINE_PROFILE_BASE_URL}/${encodeURIComponent(to)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${transport.token}` },
    });
  } catch {
    return json({
      ok: true,
      ready: false,
      state: "model_line_transport_unavailable",
      token_mode: transport.token_mode,
      transport: transport.transport,
      recipient_reachable: false,
      message_sent: false,
    }, 200);
  }

  if (!response.ok) {
    const tokenRejected = response.status === 401 || response.status === 403;
    return json({
      ok: true,
      ready: false,
      state: tokenRejected ? "model_line_token_rejected" : "model_line_recipient_unreachable",
      token_mode: transport.token_mode,
      transport: transport.transport,
      recipient_reachable: false,
      provider_status: response.status,
      message_sent: false,
    }, 200);
  }

  return json({
    ok: true,
    ready: true,
    state: "ready",
    token_mode: transport.token_mode,
    transport: transport.transport,
    recipient_reachable: true,
    provider_status: response.status,
    message_sent: false,
  }, 200);
}

// This endpoint is intentionally non-sending. It is the only proof accepted
// before an owner-reviewed verified claim can replace a stale Model LINE ID:
// the old ID must be unreachable while the claim's canonical LINE ID is
// reachable through the exact same MMD MODEL transport.
async function handleModelLineIdentityRecoveryPreflight(request, env = {}) {
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const auth = requireAdminServiceAuth(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json" }, 400);

  const previous = modelLineUserId(body.previous_line_user_id);
  const candidate = modelLineUserId(body.candidate_line_user_id);
  if (!previous || !candidate || previous === candidate) {
    return json({
      ok: true,
      ready: false,
      state: "model_line_identity_recovery_invalid",
      token_mode: "unknown",
      previous_recipient_reachable: false,
      candidate_recipient_reachable: false,
      message_sent: false,
    }, 200);
  }

  const transport = modelLineTransport(env);
  if (!transport.token) {
    return json({
      ok: true,
      ready: false,
      state: "model_line_transport_not_ready",
      token_mode: transport.token_mode,
      transport: transport.transport,
      previous_recipient_reachable: false,
      candidate_recipient_reachable: false,
      message_sent: false,
    }, 200);
  }

  const lookup = async (lineUserId) => {
    try {
      return await fetch(`${LINE_PROFILE_BASE_URL}/${encodeURIComponent(lineUserId)}`, {
        method: "GET",
        headers: { authorization: `Bearer ${transport.token}` },
      });
    } catch {
      return null;
    }
  };

  // Validate the candidate first. A positive result proves that this token is
  // for the intended MMD MODEL LINE world before the old binding is examined.
  const candidateResponse = await lookup(candidate);
  if (!candidateResponse) {
    return json({
      ok: true,
      ready: false,
      state: "model_line_transport_unavailable",
      token_mode: transport.token_mode,
      transport: transport.transport,
      previous_recipient_reachable: false,
      candidate_recipient_reachable: false,
      message_sent: false,
    }, 200);
  }
  if (!candidateResponse.ok) {
    const tokenRejected = candidateResponse.status === 401 || candidateResponse.status === 403;
    return json({
      ok: true,
      ready: false,
      state: tokenRejected ? "model_line_token_rejected" : "model_line_recovery_candidate_unreachable",
      token_mode: transport.token_mode,
      transport: transport.transport,
      previous_recipient_reachable: false,
      candidate_recipient_reachable: false,
      candidate_provider_status: candidateResponse.status,
      message_sent: false,
    }, 200);
  }

  const previousResponse = await lookup(previous);
  if (!previousResponse) {
    return json({
      ok: true,
      ready: false,
      state: "model_line_transport_unavailable",
      token_mode: transport.token_mode,
      transport: transport.transport,
      previous_recipient_reachable: false,
      candidate_recipient_reachable: true,
      candidate_provider_status: candidateResponse.status,
      message_sent: false,
    }, 200);
  }
  if (previousResponse.ok) {
    return json({
      ok: true,
      ready: false,
      state: "model_line_recovery_current_identity_reachable",
      token_mode: transport.token_mode,
      transport: transport.transport,
      previous_recipient_reachable: true,
      candidate_recipient_reachable: true,
      previous_provider_status: previousResponse.status,
      candidate_provider_status: candidateResponse.status,
      message_sent: false,
    }, 200);
  }
  if (previousResponse.status === 401 || previousResponse.status === 403) {
    return json({
      ok: true,
      ready: false,
      state: "model_line_token_rejected",
      token_mode: transport.token_mode,
      transport: transport.transport,
      previous_recipient_reachable: false,
      candidate_recipient_reachable: true,
      previous_provider_status: previousResponse.status,
      candidate_provider_status: candidateResponse.status,
      message_sent: false,
    }, 200);
  }
  // LINE's profile endpoint uses 404 for a user that this OA cannot reach.
  // Rate limits and provider failures are inconclusive and must never permit
  // a canonical identity replacement.
  if (previousResponse.status !== 404) {
    return json({
      ok: true,
      ready: false,
      state: "model_line_recovery_previous_identity_unverified",
      token_mode: transport.token_mode,
      transport: transport.transport,
      previous_recipient_reachable: false,
      candidate_recipient_reachable: true,
      previous_provider_status: previousResponse.status,
      candidate_provider_status: candidateResponse.status,
      message_sent: false,
    }, 200);
  }

  return json({
    ok: true,
    ready: true,
    state: "model_line_identity_recovery_ready",
    token_mode: transport.token_mode,
    transport: transport.transport,
    previous_recipient_reachable: false,
    candidate_recipient_reachable: true,
    previous_provider_status: previousResponse.status,
    candidate_provider_status: candidateResponse.status,
    message_sent: false,
  }, 200);
}

async function handleModelAvailabilityReminder(request, env = {}) {
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const auth = requireAdminServiceAuth(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json" }, 400);

  const to = modelLineUserId(body.line_user_id);
  if (!to) return json({ ok: false, error: "model_line_user_id_invalid" }, 400);

  const lineTransport = modelLineTransport(env);
  const token = lineTransport.token;
  if (!token) return json({ ok: false, error: "model_line_transport_not_ready" }, 503);

  let response;
  try {
    response = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        to,
        messages: [{ type: "text", text: modelAvailabilityReminderText(body.display_name) }],
      }),
    });
  } catch {
    return json({ ok: false, error: "model_line_transport_unavailable" }, 503);
  }

  if (!response.ok) {
    return json({
      ok: false,
      error: `model_line_push_http_${response.status}`,
      provider_status: response.status,
    }, 502);
  }

  return json({
    ok: true,
    channel: "line",
    transport: lineTransport.transport,
  }, 200);
}

async function findJobBySessionId(env, sessionId) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const table = clean(env.AIRTABLE_TABLE_JOBS || "jobs");
  const apiKey = clean(env.AIRTABLE_API_KEY);
  if (!baseId || !table || !apiKey) return { ok: false, status: 503, error: "eta_storage_not_ready" };

  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", `{session_id}="${escapeFormula(sessionId)}"`);
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: 503, error: "eta_storage_lookup_failed" };
  const record = data.records?.[0];
  if (!record) return { ok: false, status: 404, error: "eta_job_not_found" };
  return { ok: true, status: 200, record };
}

async function patchJob(env, recordId, fields) {
  const baseId = clean(env.AIRTABLE_BASE_ID);
  const table = clean(env.AIRTABLE_TABLE_JOBS || "jobs");
  const apiKey = clean(env.AIRTABLE_API_KEY);
  if (!baseId || !table || !apiKey) return { ok: false, status: 503, error: "eta_storage_not_ready" };

  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: 503, error: "eta_storage_write_failed" };
  return { ok: true, status: 200, record: data };
}

function parseEvents(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(clean(value) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function clean(value) {
  return String(value ?? "").trim();
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
