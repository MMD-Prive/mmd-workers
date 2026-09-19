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
    const records = await listMemberPrebookings(env, memberRef);
    return json({ ok: true, data: { requests: records.map(customerSafeRequest).filter(Boolean) } });
  } catch (error) {
    console.error(JSON.stringify({ event: "mms_member_prebooking_read_failed", code: error?.code || "READ_FAILED" }));
    return json({ ok: false, error: { code: error?.code || "MMS_PREBOOKING_READ_FAILED", message: "MMS requests are temporarily unavailable." } }, Number(error?.status) || 502);
  }
}

async function listMemberPrebookings(env, memberRef) {
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
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw serviceError(502, "AIRTABLE_REQUEST_FAILED");
  return Array.isArray(payload.records) ? payload.records : [];
}

function customerSafeRequest(record) {
  const fields = record?.fields && typeof record.fields === "object" ? record.fields : {};
  const id = safeId(fields["Prebooking ID"]);
  const date = safeDate(fields["Service Date"]);
  if (!id || !date) return null;

  return compact({
    request_id: id,
    prebooking_id: id,
    type: "mms",
    request_type: "mms_prebooking",
    service_family: "mms",
    title: "MMS Pre-booking",
    status: safeStatus(fields.Status),
    service_date: date,
    service_time: safeTime(fields["Service Time"]),
    zone: safeText(fields.Zone, 80),
    skills: safeStringArray(fields["Selected Skills"], 6, 80),
    created_at: safeTimestamp(fields["Created At"]),
    updated_at: safeTimestamp(fields["Updated At"]),
  });
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
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
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
