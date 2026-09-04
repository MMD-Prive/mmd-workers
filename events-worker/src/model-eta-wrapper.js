import baseWorker from "./index.js";

const ETA_PATH = "/__internal/model/session/eta";
const AIRTABLE_API = "https://api.airtable.com/v0";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

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
};

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
