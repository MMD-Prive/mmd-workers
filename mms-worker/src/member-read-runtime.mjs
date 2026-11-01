import { mmsReadRecords, readSharedMmsJob, requestBookingState, mapMmsReads } from "./shared-booking-state.mjs";
const MEMBER_PREBOOKINGS_PATH = "/internal/mms/member/prebookings";
const INTERNAL_HOST = "mms.internal";
const MEMBER_REF_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$/;
const PREBOOKING_ID_RE = /^mmspre_[a-f0-9]{24}$/;

export function isMmsMemberReadRequest(urlOrPath = "") {
  const path = typeof urlOrPath === "string" ? urlOrPath : urlOrPath?.pathname;
  return normalizePath(path) === MEMBER_PREBOOKINGS_PATH;
}

export async function handleMmsMemberReadRequest(request, env = {}) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const url = new URL(request.url);
  const internalHost = String(env.MMS_INTERNAL_HOST || INTERNAL_HOST).toLowerCase();
  if (url.hostname.toLowerCase() !== internalHost) return json({ ok: false, error: { code: "NOT_FOUND", message: "Route not found" } }, 404);

  const memberRef = String(url.searchParams.get("member_ref") || "").trim();
  if (!MEMBER_REF_RE.test(memberRef)) {
    return json({ ok: false, error: { code: "MEMBER_REF_INVALID", message: "Verified member reference is required." } }, 400);
  }

  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(6000)]);
    const records = await listMemberPrebookings(env, memberRef, signal);
    const seen = new Set();
    for (const record of records) {
      const f = record?.fields;
      if (f?.["Member Ref"] !== memberRef) throw serviceError(503, "MMS_MEMBER_SCOPE_CONFLICT");
      const id = safeId(f["Prebooking ID"]);
      if (!id || !safeDate(f["Service Date"]) || seen.has(id)) throw serviceError(503, "MMS_PREBOOKINGS_RESPONSE_INVALID");
      seen.add(id);
    }
    const travelRead = await readLiveTravelEtas(env, records, signal);
    return json({ ok: true, data: { requests: records.map((record) => customerSafeRequest(record, travelRead)) } });
  } catch (error) {
    console.error(JSON.stringify({ event: "mms_member_prebooking_read_failed", code: error?.code || "READ_FAILED" }));
    return json({ ok: false, error: { code: error?.code || "MMS_PREBOOKING_READ_FAILED", message: "MMS requests are temporarily unavailable." } }, Number(error?.status) || 502);
  }
}

async function listMemberPrebookings(env, memberRef, signal) {
  const token = String(env.AIRTABLE_API_TOKEN || "").trim();
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  const tableId = String(env.AIRTABLE_PREBOOKINGS_TABLE_ID || "").trim();
  if (!token) throw serviceError(503, "AIRTABLE_NOT_CONFIGURED");
  if (!/^app[A-Za-z0-9]{14}$/.test(baseId) || !/^tbl[A-Za-z0-9]{14}$/.test(tableId)) throw serviceError(503, "AIRTABLE_TABLE_INVALID");

  const query = new URLSearchParams();
  query.set("maxRecords", "50");
  query.set("pageSize", "50");
  query.set("filterByFormula", `{Member Ref}='${memberRef}'`);
  query.set("sort[0][field]", "Created At");
  query.set("sort[0][direction]", "desc");

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}?${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw serviceError(502, "AIRTABLE_REQUEST_FAILED");
  if (!Array.isArray(payload.records) || payload.offset) throw serviceError(503, "MMS_PREBOOKINGS_RESPONSE_INVALID");
  return payload.records;
}

async function readLiveTravelEtas(env, prebookings, signal) {
  const requests = new Map(prebookings.map(record => [safeId(record.fields?.['Prebooking ID']), record]).filter(([id]) => id));
  if (!requests.size) return { byPrebooking: new Map(), checking: false };
  try {
    const clauses = [...requests.keys()].map(id => `{Prebooking ID}='${id}'`);
    const records = await mmsReadRecords(env, 'JOBS', clauses.length === 1 ? clauses[0] : `OR(${clauses.join(',')})`, signal);
    const groups = new Map();
    for (const record of records) {
      const id = safeId(record.fields?.['Prebooking ID']);
      if (!requests.has(id)) throw new Error('MMS_JOB_SCOPE_CONFLICT');
      if (record.fields?.['Member Ref'] && record.fields['Member Ref'] !== requests.get(id).fields['Member Ref']) throw new Error('MMS_JOB_SCOPE_CONFLICT');
      groups.set(id, [...(groups.get(id) || []), record]);
    }
    const entries = await mapMmsReads([...groups], async ([id, jobs]) => {
      if (jobs.length !== 1) return [id, { bookingState: requestBookingState('', false), status: 'checking' }];
      const shared = await readSharedMmsJob(env, jobs[0], { prebooking: requests.get(id), signal });
      const fields = shared.record.fields;
      const enRoute = shared.state === 'ACCEPTED' && fields['Travel Label'] === 'กำลังเดินทาง';
      const minutes = enRoute ? etaMinutesFromLabel(fields['ETA Label']) : null;
      return [id, { bookingState: shared.bookingState,
        ...(shared.state === 'CHECKING' || enRoute && !minutes ? { status: 'checking' } : {}),
        ...(enRoute && minutes ? { status: 'en_route', minutes } : {}),
      }];
    });
    return { byPrebooking: new Map(entries), checking: false };
  } catch { return { byPrebooking: new Map(), checking: true }; }
}

function customerSafeRequest(record, travelRead = { byPrebooking: new Map(), checking: false }) {
  const fields = record?.fields && typeof record.fields === "object" ? record.fields : {};
  const id = safeId(fields["Prebooking ID"]);
  const date = safeDate(fields["Service Date"]);
  if (!id || !date) return null;

  const shared = travelRead.byPrebooking.get(id)?.bookingState || requestBookingState(fields.Status, !travelRead.checking);
  return compact({
    request_id: id,
    prebooking_id: id,
    type: "mms",
    request_type: "mms_prebooking",
    service_family: "mms",
    title: "MMS Pre-booking",
    status: shared.status,
    request_status: safeStatus(fields.Status),
    bookingState: shared,
    service_date: date,
    service_time: safeTime(fields["Service Time"]),
    zone: safeText(fields.Zone, 80),
    skills: safeStringArray(fields["Selected Skills"], 6, 80),
    created_at: safeTimestamp(fields["Created At"]),
    updated_at: safeTimestamp(fields["Updated At"]),
    ...(travelRead.checking ? { travel_status: "checking" } : {}),
    ...(travelRead.byPrebooking.get(id)?.status === "checking" ? { travel_status: "checking" } : {}),
    ...(travelRead.byPrebooking.get(id)?.status === "en_route" ? { travel_status: "en_route", eta_minutes: travelRead.byPrebooking.get(id).minutes } : {}),
  });
}

function etaMinutesFromLabel(label) {
  const text = String(label || "").trim();
  const hour = /^(\d{1,2}) ชม\.(?: (\d{1,2}) นาที)?$/.exec(text);
  if (hour) return Number(hour[1]) * 60 + Number(hour[2] || 0);
  const minute = /^(\d{1,3}) นาที$/.exec(text);
  return minute ? Number(minute[1]) : null;
}

function safeStatus(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (["confirmed", "scheduled"].includes(key)) return "confirmed";
  if (["completed", "complete"].includes(key)) return "completed";
  if (["cancelled", "canceled"].includes(key)) return "cancelled";
  if (["options_ready", "matching", "matched"].includes(key)) return "matching";
  if (["waiting_customer", "action_required"].includes(key)) return key;
  if (["submitted", "received"].includes(key)) return "received";
  if (["pending_coordination", "pending", "coordination_pending"].includes(key)) return "coordination_pending";
  return "reviewing";
}

function safeId(value) {
  const text = String(value || "").trim();
  return PREBOOKING_ID_RE.test(text) ? text : "";
}
function safeDate(value) {
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text ? text : "";
}
function safeTime(value) {
  const text = String(value || "").trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}
function safeTimestamp(value) {
  const text = String(value || "").trim();
  if (!text || !Number.isFinite(Date.parse(text))) return "";
  return new Date(text).toISOString();
}
function safeText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function safeStringArray(value, maxItems, maxText) {
  const values = Array.isArray(value) ? value : [];
  return values.map((item) => safeText(item, maxText)).filter(Boolean).slice(0, maxItems);
}
function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== "" && item !== null && item !== undefined && (!Array.isArray(item) || item.length > 0)));
}
function normalizePath(path = "") {
  const clean = String(path || "/").replace(/\/{2,}/g, "/");
  return clean.length > 1 ? clean.replace(/\/+$/g, "") : clean;
}
function serviceError(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}
function methodNotAllowed(allow) {
  return new Response(null, { status: 405, headers: { allow } });
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
