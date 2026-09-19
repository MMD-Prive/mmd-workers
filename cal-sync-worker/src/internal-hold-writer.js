const AIRTABLE_API = "https://api.airtable.com/v0";
const CAL_BOOKINGS_API = "https://api.cal.com/v2/bookings";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const SESSIONS_TABLE_ID = "tblC98mKWbzmPuNzX";
const PAYMENTS_TABLE_ID = "tblWGGJJOx5eBvBZJ";
const CAL_LINKS_TABLE_ID = "tbl6saWYEQrEdnMIK";
const CAL_API_VERSION = "2026-02-25";
const INTERNAL_HOLD_EVENT_TYPE_ID = 7057823;
const INTERNAL_HOST = "cal-sync.internal";
const SUPPORTED_HOLD_MINUTES = new Set([
  30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360,
  390, 420, 450, 480, 510, 540, 570, 600, 630, 660, 690, 720,
  1440, 2880, 4320,
]);

const F = Object.freeze({
  session: {
    id: "fldLTq2kZbyRv22IA",
    jobId: "fldHw5HdDDdkHXMhG",
    modelName: "flddVz6eoWRHrzIQr",
    start: "fldBeG0FkWwa8kgnp",
    end: "fldiDSz0wW9Ct9I3P",
    legacyStart: "fldf9v0UqmfjVWVrL",
    legacyEnd: "fldgImpiwmstRduw6",
    duration: "fldP7Xx99uf5BvJpF",
    paymentRef: "fldojgjSQLaO0uQLX",
    paymentStatus: "fldTY5lE6m0kQf72n",
    depositPaid: "fldooTlKtkY8VJy7L",
    state: "fldjE7J1ckyXId1Cf",
    modelState: "fld57fhdWqIcOy4Jp",
    modelAckAt: "fldFgkHXivIAThfDz",
  },
  payment: {
    ref: "fldOO6SY49iDw8VBZ",
    sessionId: "fld2wdhBvc8xrV6y5",
    amount: "fldvCSwrUW8OMAooS",
    status: "fldEJ1hmm7KwWuI6q",
    verification: "fldJ7a0Ube9F0bmRy",
    stage: "fldrr9g8ZZjqAbdKQ",
    type: "fldydUWHhqVLMkNSC",
    depositStatus: "fldD0mQWTfdmyBAeT",
    verifiedAt: "fldPNK6qgxCSdaJRM",
    updatedAt: "fldtNVdDacEH03W4f",
  },
});

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function field(record, id) {
  return record?.fields?.[id];
}
function quoteFormula(value) {
  return `'${clean(value, 180).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function airtableHeaders(token) {
  return { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" };
}
function calHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "content-type": "application/json",
    "cal-api-version": CAL_API_VERSION,
  };
}
function envConfig(env = {}) {
  return {
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 500),
    base: clean(env.AIRTABLE_BASE_ID, 80) || DEFAULT_BASE_ID,
    linksTable: clean(env.CAL_BOOKING_LINKS_TABLE_ID, 80) || CAL_LINKS_TABLE_ID,
    eventTypeId: Number(env.CAL_INTERNAL_HOLD_EVENT_TYPE_ID || INTERNAL_HOLD_EVENT_TYPE_ID),
  };
}
function asUtcIso(value) {
  const ms = Date.parse(clean(value, 80));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function sessionStart(record) {
  return clean(field(record, F.session.start), 80) || clean(field(record, F.session.legacyStart), 80) || null;
}
function sessionEnd(record) {
  return clean(field(record, F.session.end), 80) || clean(field(record, F.session.legacyEnd), 80) || null;
}
function sessionId(record) {
  return clean(field(record, F.session.id), 180) || null;
}
function jobId(record) {
  return clean(field(record, F.session.jobId), 180) || null;
}
function modelConfirmed(record) {
  if (field(record, F.session.modelAckAt)) return true;
  const state = [field(record, F.session.modelState), field(record, F.session.state)]
    .map(v => clean(v, 100).toLowerCase())
    .filter(Boolean)
    .join(" ");
  return /model_confirmed|confirmed|accepted|acknowledged|ready/.test(state)
    && !/declined|rejected|cancel/.test(state);
}
function durationMinutes(record, startAt, endAt) {
  const explicit = Number(field(record, F.session.duration));
  if (Number.isFinite(explicit) && explicit > 0) {
    const value = Math.round(explicit * 60);
    if (value > 0) return value;
  }
  const startMs = Date.parse(startAt || "");
  const endMs = Date.parse(endAt || "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 60000);
}
function paymentState(...values) {
  return values.map(v => clean(v, 120).toLowerCase()).filter(Boolean).join(" ");
}
function paymentVerified(payment) {
  if (!payment) return false;
  const state = paymentState(
    field(payment, F.payment.verification),
    field(payment, F.payment.depositStatus),
    field(payment, F.payment.status),
  );
  return /official_verified|verified|paid|confirmed|complete/.test(state)
    && !/pending|unverified|rejected|failed|void/.test(state);
}
function isDepositPayment(payment) {
  return /deposit|มัดจำ/.test(paymentState(field(payment, F.payment.stage), field(payment, F.payment.type)));
}
function latestDeposit(records, preferredRef = "") {
  return [...records].sort((a, b) => {
    const ar = clean(field(a, F.payment.ref), 180) === preferredRef ? 1 : 0;
    const br = clean(field(b, F.payment.ref), 180) === preferredRef ? 1 : 0;
    const ad = isDepositPayment(a) ? 1 : 0;
    const bd = isDepositPayment(b) ? 1 : 0;
    const av = paymentVerified(a) ? 1 : 0;
    const bv = paymentVerified(b) ? 1 : 0;
    const at = Date.parse(field(a, F.payment.updatedAt) || field(a, F.payment.verifiedAt) || 0) || 0;
    const bt = Date.parse(field(b, F.payment.updatedAt) || field(b, F.payment.verifiedAt) || 0) || 0;
    return (br - ar) || (bd - ad) || (bv - av) || (bt - at);
  })[0] || null;
}
function sessionPaymentFallbackVerified(record) {
  const state = paymentState(field(record, F.session.paymentStatus), field(record, F.session.depositPaid));
  return /official_verified|verified|paid|confirmed|complete/.test(state)
    && !/pending|unverified|rejected|failed|void/.test(state);
}
function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function listAirtable(env, table, fieldIds, formula = "", maxRecords = 1000, fetchImpl = fetch) {
  const { token, base } = envConfig(env);
  if (!token) throw new Error("airtable_token_missing");
  const records = [];
  let offset = "";
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const id of fieldIds) url.searchParams.append("fields[]", id);
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetchImpl(url, { headers: airtableHeaders(token) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`airtable_${table}_${response.status}`);
    records.push(...(Array.isArray(body.records) ? body.records : []));
    offset = clean(body.offset, 200);
  } while (offset && records.length < maxRecords);
  return records.slice(0, maxRecords);
}

async function readSessionById(env, id, fetchImpl = fetch) {
  const records = await listAirtable(
    env,
    SESSIONS_TABLE_ID,
    Object.values(F.session),
    `{session_id}=${quoteFormula(id)}`,
    2,
    fetchImpl,
  );
  if (records.length !== 1) return { ok: false, error: records.length ? "session_id_ambiguous" : "session_not_found" };
  return { ok: true, record: records[0] };
}

async function readPaymentsForSessions(env, ids, fetchImpl = fetch) {
  const unique = [...new Set(ids.map(v => clean(v, 180)).filter(Boolean))].slice(0, 80);
  if (!unique.length) return [];
  const formula = `OR(${unique.map(id => `{session_id}=${quoteFormula(id)}`).join(",")})`;
  return listAirtable(env, PAYMENTS_TABLE_ID, Object.values(F.payment), formula, 600, fetchImpl);
}

async function readExistingHold(env, id, fetchImpl = fetch) {
  const { token, base, linksTable } = envConfig(env);
  if (!token) return { ok: false, error: "airtable_token_missing" };
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(linksTable)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{Session ID}=${quoteFormula(id)}`);
  for (const name of ["Link ID", "Cal Booking UID", "Cal Booking ID", "Mapping Status", "Last Event At"]) {
    url.searchParams.append("fields[]", name);
  }
  const response = await fetchImpl(url, { headers: airtableHeaders(token) });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: `cal_link_lookup_${response.status}` };
  const records = Array.isArray(body?.records) ? body.records : [];
  const linked = records.filter(r => clean(r?.fields?.["Cal Booking UID"], 180));
  if (linked.length > 1) return { ok: false, error: "cal_link_ambiguous" };
  const record = linked[0] || records[0] || null;
  const uid = clean(record?.fields?.["Cal Booking UID"], 180);
  return {
    ok: true,
    exists: Boolean(uid),
    booking_uid: uid || null,
    booking_id: clean(record?.fields?.["Cal Booking ID"], 120) || null,
    record_id: record?.id || null,
  };
}

async function writeHoldLink(env, hold, existingRecordId = null, fetchImpl = fetch) {
  const { token, base, linksTable, eventTypeId } = envConfig(env);
  if (!token) return { ok: false, error: "airtable_token_missing" };
  const now = new Date().toISOString();
  const fields = {
    "Link ID": `cal:${hold.booking_uid}`,
    "Cal Booking UID": hold.booking_uid,
    "Cal Booking ID": hold.booking_id == null ? undefined : String(hold.booking_id),
    "Cal Event Type ID": String(eventTypeId),
    "Session ID": hold.session_id,
    "Job ID": hold.job_id || undefined,
    "Mapping Status": "linked",
    "Last Trigger Event": "MMD_INTERNAL_HOLD_CREATED",
    "Last Event At": now,
    "Start At": hold.start_at,
    "End At": hold.end_at,
    "Idempotency Key": `mmd:internal_hold:${hold.session_id}`,
    "Source": "cal_sync_writer",
    "Created At": existingRecordId ? undefined : now,
    "Updated At": now,
  };
  for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];
  const endpoint = `${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(linksTable)}${existingRecordId ? `/${encodeURIComponent(existingRecordId)}` : ""}`;
  const response = await fetchImpl(endpoint, {
    method: existingRecordId ? "PATCH" : "POST",
    headers: airtableHeaders(token),
    body: JSON.stringify({ fields, typecast: true }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: `cal_link_write_${response.status}` };
  return { ok: true, record_id: body.id || existingRecordId || null };
}

async function createCalBooking(env, record, fetchImpl = fetch) {
  const apiKey = clean(env.CAL_API_KEY, 500);
  if (!apiKey) return { ok: false, error: "cal_api_key_missing" };
  const { eventTypeId } = envConfig(env);
  if (!Number.isInteger(eventTypeId) || eventTypeId <= 0) return { ok: false, error: "event_type_invalid" };

  const sid = sessionId(record);
  const jid = jobId(record);
  const startAt = asUtcIso(sessionStart(record));
  const endAt = asUtcIso(sessionEnd(record));
  const minutes = durationMinutes(record, startAt, endAt);
  if (!sid) return { ok: false, error: "session_id_missing" };
  if (!startAt || !endAt || !minutes) return { ok: false, error: "schedule_missing" };
  if (!SUPPORTED_HOLD_MINUTES.has(minutes)) {
    return { ok: false, error: "unsupported_duration", duration_minutes: minutes };
  }

  const modelName = clean(field(record, F.session.modelName), 120) || "Model";
  const title = `MMD Internal Hold · ${modelName} · ${jid || sid}`.slice(0, 180);
  const body = {
    eventTypeId,
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
      session_id: sid,
      job_id: jid || "",
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
    return {
      ok: false,
      error: `cal_booking_create_${response.status}`,
      upstream_status: response.status,
    };
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

export async function ensureInternalHoldDirect(env, id, { fetchImpl = fetch, now = Date.now() } = {}) {
  const sid = clean(id, 180);
  if (!sid) return { ok: false, state: "deferred", reason: "session_id_missing" };

  const existing = await readExistingHold(env, sid, fetchImpl);
  if (!existing.ok) return { ok: false, state: "deferred", reason: existing.error };
  if (existing.exists) return { ok: true, state: "existing", booking_uid: existing.booking_uid };

  const sessionResult = await readSessionById(env, sid, fetchImpl);
  if (!sessionResult.ok) return { ok: false, state: "deferred", reason: sessionResult.error };
  const record = sessionResult.record;
  if (!modelConfirmed(record)) return { ok: false, state: "skipped", reason: "model_not_confirmed" };

  const startAt = asUtcIso(sessionStart(record));
  const endAt = asUtcIso(sessionEnd(record));
  if (!startAt || !endAt) return { ok: false, state: "deferred", reason: "schedule_missing" };
  if (Date.parse(startAt) <= Number(now)) return { ok: true, state: "skipped", reason: "session_started_or_past" };

  const payments = await readPaymentsForSessions(env, [sid], fetchImpl);
  const payment = latestDeposit(payments, clean(field(record, F.session.paymentRef), 180));
  const verified = payment ? paymentVerified(payment) : sessionPaymentFallbackVerified(record);
  if (verified) return { ok: true, state: "skipped", reason: "deposit_already_verified" };

  const created = await createCalBooking(env, record, fetchImpl);
  if (!created.ok) {
    return {
      ok: false,
      state: "deferred",
      reason: created.error,
      duration_minutes: created.duration_minutes,
      upstream_status: created.upstream_status,
    };
  }

  const linked = await writeHoldLink(env, {
    ...created,
    session_id: sid,
    job_id: jobId(record),
  }, existing.record_id, fetchImpl);

  if (!linked.ok) {
    return {
      ok: true,
      state: "created_ledger_pending",
      booking_uid: created.booking_uid,
      reason: linked.error,
    };
  }
  return {
    ok: true,
    state: "created",
    booking_uid: created.booking_uid,
    mapping_record_id: linked.record_id,
  };
}

async function coordinatorEnsure(env, sid) {
  const namespace = env.CAL_HOLD_COORDINATOR;
  if (!namespace || typeof namespace.idFromName !== "function") {
    return { ok: false, state: "deferred", reason: "hold_coordinator_not_ready" };
  }
  const id = namespace.idFromName(`internal-hold:${sid}`);
  const stub = namespace.get(id);
  const response = await stub.fetch("https://cal-hold.internal/ensure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sid }),
  });
  const body = await response.json().catch(() => ({}));
  return { ...body, http_status: response.status };
}

export async function ensureInternalHold(env, id) {
  const sid = clean(id, 180);
  if (!sid) return { ok: false, state: "deferred", reason: "session_id_missing" };
  return coordinatorEnsure(env, sid);
}

export class CalInternalHoldCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/ensure" || request.method.toUpperCase() !== "POST") {
      return json({ ok: false, error: "not_found" }, 404);
    }
    const input = await request.json().catch(() => null);
    const sid = clean(input?.session_id, 180);
    if (!sid) return json({ ok: false, state: "deferred", reason: "session_id_missing" }, 400);

    const terminal = await this.state.storage.get("terminal");
    if (terminal?.session_id === sid && terminal?.result?.ok === true) {
      return json({ ...terminal.result, coordinator_replay: true });
    }

    const inFlight = await this.state.storage.get("in_flight");
    const now = Date.now();
    if (inFlight?.session_id === sid && now - Number(inFlight.started_at || 0) < 120000) {
      return json({ ok: true, state: "in_progress", session_id: sid }, 202);
    }

    await this.state.storage.put("in_flight", { session_id: sid, started_at: now });
    let result;
    try {
      result = await ensureInternalHoldDirect(this.env, sid, { now });
      const terminalState = result?.ok === true && (
        ["created", "existing"].includes(result.state)
        || (result.state === "skipped" && ["deposit_already_verified", "session_started_or_past"].includes(result.reason))
      );
      if (terminalState) {
        await this.state.storage.put("terminal", {
          session_id: sid,
          result,
          stored_at: new Date().toISOString(),
        });
      }
      if (!terminalState) await this.state.storage.delete("terminal");
      return json(result, result?.state === "in_progress" ? 202 : 200);
    } catch (error) {
      result = { ok: false, state: "deferred", reason: clean(error?.message, 120) || "internal_hold_failed" };
      return json(result, 503);
    } finally {
      await this.state.storage.delete("in_flight");
    }
  }
}

async function listCandidateSessions(env, { horizonDays = 60, limit = 25, now = Date.now(), fetchImpl = fetch } = {}) {
  const all = await listAirtable(env, SESSIONS_TABLE_ID, Object.values(F.session), "", 1200, fetchImpl);
  const horizon = now + boundedInt(horizonDays, 60, 1, 180) * 86400000;
  const prelim = all.filter(record => {
    if (!modelConfirmed(record)) return false;
    const start = Date.parse(sessionStart(record) || "");
    return Number.isFinite(start) && start > now && start <= horizon && Boolean(sessionId(record));
  });
  if (!prelim.length) return [];

  const ids = prelim.map(sessionId);
  const payments = await readPaymentsForSessions(env, ids, fetchImpl);
  const bySession = new Map();
  for (const payment of payments) {
    const sid = clean(field(payment, F.payment.sessionId), 180);
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid).push(payment);
  }

  const candidates = [];
  for (const record of prelim.sort((a, b) => Date.parse(sessionStart(a)) - Date.parse(sessionStart(b)))) {
    const sid = sessionId(record);
    const existing = await readExistingHold(env, sid, fetchImpl);
    if (!existing.ok || existing.exists) continue;
    const latest = latestDeposit(bySession.get(sid) || [], clean(field(record, F.session.paymentRef), 180));
    const verified = latest ? paymentVerified(latest) : sessionPaymentFallbackVerified(record);
    if (verified) continue;
    const startAt = asUtcIso(sessionStart(record));
    const endAt = asUtcIso(sessionEnd(record));
    const minutes = durationMinutes(record, startAt, endAt);
    if (!startAt || !endAt || !SUPPORTED_HOLD_MINUTES.has(minutes)) continue;
    candidates.push({
      session_id: sid,
      job_id: jobId(record),
      start_at: startAt,
      end_at: endAt,
      duration_minutes: minutes,
    });
    if (candidates.length >= boundedInt(limit, 25, 1, 100)) break;
  }
  return candidates;
}

export async function previewInternalHoldReconcile(env, options = {}) {
  const candidates = await listCandidateSessions(env, options);
  return {
    ok: true,
    mode: "preview",
    candidates,
    count: candidates.length,
    authority: {
      session: "mmd",
      payment: "payments-worker",
      scheduling_projection: "cal-sync-worker",
    },
  };
}

export async function reconcileInternalHolds(env, options = {}) {
  const candidates = await listCandidateSessions(env, options);
  const outcomes = [];
  for (const candidate of candidates) {
    const result = await ensureInternalHold(env, candidate.session_id);
    outcomes.push({ ...candidate, result });
  }
  return {
    ok: outcomes.every(x => x.result?.ok === true || x.result?.state === "in_progress"),
    mode: "write",
    candidates: candidates.length,
    outcomes,
    summary: {
      created: outcomes.filter(x => x.result?.state === "created").length,
      existing: outcomes.filter(x => x.result?.state === "existing").length,
      in_progress: outcomes.filter(x => x.result?.state === "in_progress").length,
      skipped: outcomes.filter(x => x.result?.state === "skipped").length,
      deferred: outcomes.filter(x => x.result?.ok !== true).length,
    },
  };
}

function writeEnabled(env = {}) {
  return clean(env.CAL_INTERNAL_HOLD_WRITE_ENABLED, 20).toLowerCase() === "true";
}
function internalRequest(request) {
  try {
    return new URL(request.url).hostname.toLowerCase() === INTERNAL_HOST;
  } catch {
    return false;
  }
}

export async function handleInternalHoldRequest(request, env = {}) {
  if (!internalRequest(request)) return null;
  const url = new URL(request.url);
  if (!["/internal/holds/ensure", "/internal/holds/reconcile"].includes(url.pathname)) return null;
  if (!writeEnabled(env)) return json({ ok: false, error: "internal_hold_write_disabled" }, 503);

  if (url.pathname === "/internal/holds/ensure") {
    if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    const body = await request.json().catch(() => null);
    const sid = clean(body?.session_id, 180);
    if (!sid) return json({ ok: false, error: "session_id_required" }, 400);
    const result = await ensureInternalHold(env, sid);
    return json(result, result?.ok === false ? 503 : result?.state === "in_progress" ? 202 : 200);
  }

  const options = {
    horizonDays: boundedInt(url.searchParams.get("horizon_days"), 60, 1, 180),
    limit: boundedInt(url.searchParams.get("limit"), 25, 1, 100),
  };
  if (request.method.toUpperCase() === "GET") {
    return json(await previewInternalHoldReconcile(env, options));
  }
  if (request.method.toUpperCase() === "POST") {
    return json(await reconcileInternalHolds(env, options));
  }
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

export function internalHoldHealth(env = {}) {
  return {
    write_enabled: writeEnabled(env),
    coordinator_configured: Boolean(env.CAL_HOLD_COORDINATOR && typeof env.CAL_HOLD_COORDINATOR.idFromName === "function"),
    event_type_id: Number(env.CAL_INTERNAL_HOLD_EVENT_TYPE_ID || INTERNAL_HOLD_EVENT_TYPE_ID),
    writer: "cal-sync-worker",
  };
}
