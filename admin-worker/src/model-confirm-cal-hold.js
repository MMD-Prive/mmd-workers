const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const SESSIONS_TABLE_ID = "tblC98mKWbzmPuNzX";
const CAL_LINKS_TABLE_ID = "tbl6saWYEQrEdnMIK";
const CAL_BOOKINGS_API = "https://api.cal.com/v2/bookings";
const CAL_API_VERSION = "2026-02-25";
const INTERNAL_HOLD_EVENT_TYPE_ID = 7057823;
const MODEL_SESSION_ACTION_PATH = "/v1/model/session/action";
const SUPPORTED_HOLD_MINUTES = new Set([
  30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
  390, 420, 450, 480, 510, 540, 570, 600, 630, 660, 690, 720,
  1440, 2880, 4320,
]);

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function quoteFormula(value) {
  return `'${clean(value, 180).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function airtableHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/json",
    "content-type": "application/json",
  };
}

function calHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "content-type": "application/json",
    "cal-api-version": CAL_API_VERSION,
  };
}

function asUtcIso(value) {
  const ms = Date.parse(clean(value, 80));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function durationMinutes(start, end, durationHours) {
  const fromHours = Number(durationHours);
  if (Number.isFinite(fromHours) && fromHours > 0) {
    const minutes = Math.round(fromHours * 60);
    if (minutes > 0) return minutes;
  }
  const startMs = Date.parse(start || "");
  const endMs = Date.parse(end || "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 60000);
}

function depositIsVerified(fields = {}) {
  const state = [fields.payment_status, fields.deposit_status, fields.deposit_paid]
    .map((value) => clean(value, 80).toLowerCase())
    .filter(Boolean)
    .join(" ");
  return /official_verified|verified|paid|confirmed|complete/.test(state)
    && !/pending|unverified|rejected|failed|void/.test(state);
}

async function readSessionById(env, sessionId, fetchImpl) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 500);
  if (!token) return { ok: false, error: "airtable_token_missing" };
  const base = clean(env.AIRTABLE_BASE_ID, 80) || DEFAULT_BASE_ID;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(base)}/${SESSIONS_TABLE_ID}`);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{session_id}=${quoteFormula(sessionId)}`);
  for (const name of [
    "session_id", "job_id", "client_name", "model_name", "job_type",
    "start_time", "end_time", "Start Time", "End Time", "duration_hours",
    "location_name", "payment_status", "deposit_paid", "model_session_state",
  ]) url.searchParams.append("fields[]", name);

  const response = await fetchImpl(url, { headers: airtableHeaders(token) });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: `session_lookup_${response.status}` };
  const record = body?.records?.[0] || null;
  if (!record) return { ok: false, error: "session_not_found" };
  return { ok: true, record };
}

async function readExistingHold(env, sessionId, fetchImpl) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 500);
  if (!token) return { ok: false, error: "airtable_token_missing" };
  const base = clean(env.AIRTABLE_BASE_ID, 80) || DEFAULT_BASE_ID;
  const table = clean(env.CAL_BOOKING_LINKS_TABLE_ID, 80) || CAL_LINKS_TABLE_ID;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{Session ID}=${quoteFormula(sessionId)}`);
  for (const name of ["Cal Booking UID", "Cal Booking ID", "Mapping Status", "Last Event At"]) {
    url.searchParams.append("fields[]", name);
  }
  const response = await fetchImpl(url, { headers: airtableHeaders(token) });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: `cal_link_lookup_${response.status}` };
  const record = body?.records?.[0] || null;
  const uid = clean(record?.fields?.["Cal Booking UID"], 180);
  return { ok: true, exists: Boolean(uid), booking_uid: uid || null, record_id: record?.id || null };
}

async function writeHoldLink(env, hold, fetchImpl) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 500);
  if (!token) return { ok: false, error: "airtable_token_missing" };
  const base = clean(env.AIRTABLE_BASE_ID, 80) || DEFAULT_BASE_ID;
  const table = clean(env.CAL_BOOKING_LINKS_TABLE_ID, 80) || CAL_LINKS_TABLE_ID;
  const now = new Date().toISOString();
  const fields = {
    "Link ID": `cal:${hold.booking_uid}`,
    "Cal Booking UID": hold.booking_uid,
    "Cal Booking ID": hold.booking_id == null ? undefined : String(hold.booking_id),
    "Cal Event Type ID": String(INTERNAL_HOLD_EVENT_TYPE_ID),
    "Session ID": hold.session_id,
    "Job ID": hold.job_id || undefined,
    "Mapping Status": "linked",
    "Last Trigger Event": "MMD_INTERNAL_HOLD_CREATED",
    "Last Event At": now,
    "Start At": hold.start_at,
    "End At": hold.end_at,
    "Idempotency Key": `mmd:internal_hold:${hold.session_id}`,
    "Source": "mmd_admin",
    "Created At": now,
    "Updated At": now,
  };
  for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];
  const response = await fetchImpl(`${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: airtableHeaders(token),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!response.ok) return { ok: false, error: `cal_link_write_${response.status}` };
  const body = await response.json().catch(() => ({}));
  return { ok: true, record_id: body.id || null };
}

async function createCalBooking(env, session, fetchImpl) {
  const apiKey = clean(env.CAL_API_KEY, 500);
  if (!apiKey) return { ok: false, error: "cal_api_key_missing" };
  const fields = session.fields || {};
  const sessionId = clean(fields.session_id, 180);
  const jobId = clean(fields.job_id, 180);
  const startAt = asUtcIso(fields.start_time || fields["Start Time"]);
  const endAt = asUtcIso(fields.end_time || fields["End Time"]);
  const minutes = durationMinutes(startAt, endAt, fields.duration_hours);
  if (!sessionId) return { ok: false, error: "session_id_missing" };
  if (!startAt || !endAt || !minutes) return { ok: false, error: "schedule_missing" };
  if (!SUPPORTED_HOLD_MINUTES.has(minutes)) {
    return { ok: false, error: "unsupported_duration", duration_minutes: minutes };
  }

  const modelName = clean(fields.model_name, 120) || "Model";
  const title = `MMD Internal Hold · ${modelName} · ${jobId || sessionId}`.slice(0, 180);
  const body = {
    eventTypeId: Number(env.CAL_INTERNAL_HOLD_EVENT_TYPE_ID || INTERNAL_HOLD_EVENT_TYPE_ID),
    start: startAt,
    lengthInMinutes: minutes,
    attendee: {
      name: clean(env.CAL_INTERNAL_ATTENDEE_NAME, 120) || "MMD Privé Internal Hold",
      email: clean(env.CAL_INTERNAL_ATTENDEE_EMAIL, 180) || "malemodel.bkk@gmail.com",
      timeZone: clean(env.MMD_TIMEZONE, 80) || "Asia/Bangkok",
      language: "en",
    },
    bookingFieldsResponses: { title },
    metadata: {
      session_id: sessionId,
      job_id: jobId || "",
      source: "mmd_model_confirm",
      hold_kind: "internal_hold",
    },
    allowConflicts: true,
    allowBookingOutOfBounds: true,
  };

  const response = await fetchImpl(CAL_BOOKINGS_API, {
    method: "POST",
    headers: calHeaders(apiKey),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status !== "success") {
    return { ok: false, error: `cal_booking_create_${response.status}` };
  }
  const data = payload?.data || {};
  const bookingUid = clean(data.uid || data.bookingUid, 180);
  if (!bookingUid) return { ok: false, error: "cal_booking_uid_missing" };
  return {
    ok: true,
    booking_uid: bookingUid,
    booking_id: data.id ?? data.bookingId ?? null,
    start_at: asUtcIso(data.start || data.startTime) || startAt,
    end_at: asUtcIso(data.end || data.endTime) || endAt,
    duration_minutes: minutes,
  };
}

export async function createInternalHoldForSession(env, sessionId, { fetchImpl = fetch } = {}) {
  const normalizedSessionId = clean(sessionId, 180);
  if (!normalizedSessionId) return { ok: false, state: "deferred", reason: "session_id_missing" };

  const existing = await readExistingHold(env, normalizedSessionId, fetchImpl);
  if (!existing.ok) return { ok: false, state: "deferred", reason: existing.error };
  if (existing.exists) {
    return { ok: true, state: "existing", booking_uid: existing.booking_uid };
  }

  const sessionResult = await readSessionById(env, normalizedSessionId, fetchImpl);
  if (!sessionResult.ok) return { ok: false, state: "deferred", reason: sessionResult.error };
  const fields = sessionResult.record.fields || {};
  const modelState = clean(fields.model_session_state, 80).toLowerCase();
  if (modelState && !/confirmed|accepted|acknowledged|ready/.test(modelState)) {
    return { ok: false, state: "skipped", reason: "model_not_confirmed" };
  }
  if (depositIsVerified(fields)) {
    return { ok: true, state: "skipped", reason: "deposit_already_verified" };
  }

  const created = await createCalBooking(env, sessionResult.record, fetchImpl);
  if (!created.ok) return { ok: false, state: "deferred", reason: created.error, duration_minutes: created.duration_minutes };

  const linked = await writeHoldLink(env, {
    ...created,
    session_id: normalizedSessionId,
    job_id: clean(fields.job_id, 180) || null,
  }, fetchImpl);
  if (!linked.ok) {
    // Booking already exists in Cal. The webhook carries session_id/job_id metadata
    // and can repair the external identity ledger later without touching MMD truth.
    return { ok: true, state: "created_ledger_pending", booking_uid: created.booking_uid };
  }
  return { ok: true, state: "created", booking_uid: created.booking_uid, mapping_record_id: linked.record_id };
}

export async function ensureInternalHoldThroughBridge(env, sessionId) {
  const sid = clean(sessionId, 180);
  if (!sid) return { ok: false, state: "deferred", reason: "session_id_missing" };
  const binding = env?.CAL_SYNC_WORKER;
  if (!binding || typeof binding.fetch !== "function") {
    return { ok: false, state: "deferred", reason: "cal_sync_service_binding_missing" };
  }
  try {
    const response = await binding.fetch(new Request("https://cal-sync.internal/internal/holds/ensure", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ session_id: sid }),
    }));
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return { ok: false, state: "deferred", reason: "cal_sync_invalid_response" };
    }
    if (!response.ok && body.ok !== true) {
      return {
        ok: false,
        state: clean(body.state, 80) || "deferred",
        reason: clean(body.reason || body.error, 120) || `cal_sync_${response.status}`,
      };
    }
    return body;
  } catch (error) {
    return { ok: false, state: "deferred", reason: clean(error?.message, 120) || "cal_sync_unavailable" };
  }
}

export function isModelConfirmActionRequest(request) {
  try {
    const url = new URL(request.url);
    return String(request.method || "GET").toUpperCase() === "POST"
      && url.pathname.replace(/\/+$/g, "") === MODEL_SESSION_ACTION_PATH;
  } catch {
    return false;
  }
}

export async function maybeCreateInternalHoldAfterModelConfirm(request, response, env, { fetchImpl = fetch } = {}) {
  if (!(response instanceof Response) || !response.ok || !isModelConfirmActionRequest(request)) return response;

  let requestBody;
  try { requestBody = await request.json(); } catch { return response; }
  if (clean(requestBody?.action, 80).toLowerCase() !== "accept_job") return response;

  let responseBody;
  try { responseBody = await response.clone().json(); } catch { return response; }
  if (!responseBody || responseBody.ok !== true) return response;
  const session = responseBody.session || responseBody.data?.session || null;
  const normalizedState = clean(session?.normalized_state || session?.state, 80).toLowerCase();
  if (normalizedState && normalizedState !== "confirmed") return response;
  const sessionId = clean(session?.session_id || responseBody.session_id || requestBody?.session_id, 180);
  if (!sessionId) return response;

  let result;
  try {
    result = await ensureInternalHoldThroughBridge(env, sessionId);
  } catch (error) {
    result = { ok: false, state: "deferred", reason: clean(error?.message, 120) || "unknown_error" };
  }

  console.log(JSON.stringify({
    type: "mmd_cal_internal_hold",
    session_id: sessionId,
    ok: result.ok === true,
    state: result.state || "deferred",
    reason: result.reason || null,
    booking_uid_present: Boolean(result.booking_uid),
  }));

  // MMD confirmation is canonical. Cal failure must never roll back or rewrite
  // the confirmed MMD Session state; the Cal bridge is an external scheduling projection.
  return response;
}
