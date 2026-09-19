import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";
import {
  buildKenjiLv5OperationalContext,
  buildKenjiLv5CustomerReplyStrategy,
} from "../../shared/kenji-lv5-operational-concierge.mjs";
import { handleClientIntelligenceRequest } from "./client-intelligence-endpoint.js";
import { readAdminCalendar } from "./admin-calendar-runtime-v2.js";
import { resolvePerRenameAlias } from "./per-rename-client-search.js";

export const KENJI_LV5_LIVE_CONTEXT_SCHEMA = "mmd.kenji_live_context_fanin.v1";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const DEFAULT_CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const DEFAULT_ENTITLEMENTS_TABLE = "tblNImdF9PKAxhXGi";
const DEFAULT_CREDITS_TABLE = "tblKvhl2zZm9yYBmT";
const BANGKOK_TZ = "Asia/Bangkok";
const STANDARD_BOOKING_MIN_DURATION_HOURS = 1.5;

const CREDIT = Object.freeze({
  originalAmount: "fldTEoh5lolc9xn9y",
  availableAmount: "fldzuorjny0B7Iwgu",
  appliedAmount: "fldXAxkgJHutksHgQ",
  status: "fld54sOB3tz6VlULs",
  clientRecordId: "fldJHQ2mpj96G5VW8",
  paymentRef: "fldsjcpz8nM8NgHHt",
  sessionId: "fldwsZHbxqu5Bk7E8",
  verificationStatus: "fldQW1Mzqyd8oilDc",
  verifiedAmount: "fld2Fr7uC8Urstmvd",
  verifiedAt: "fldmmdSKcfT0dxIiu",
  verificationSource: "fldlwTOl5TeBl7P0I",
});

const CAPABILITY_PRIORITY = Object.freeze([
  "black_card",
  "svip",
  "vip",
  "private_premium",
  "private_standard",
  "red_card",
  "public_member",
  "guest_pass",
]);

const ACTIVE_CREDIT_STATES = new Set(["available", "partially_used"]);
const APPROVED_CREDIT_SOURCE = "payment_authority";
const MONEY_TOLERANCE = 0.001;

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function token(value) {
  return clean(value, 160).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recId(value) {
  const id = clean(value, 80);
  return /^rec[A-Za-z0-9]+$/.test(id) ? id : "";
}

function lineId(value) {
  const id = clean(value, 80);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function telegramId(value) {
  const id = clean(value, 40);
  return /^\d{5,20}$/.test(id) ? id : "";
}

function normalizeEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function field(record, id) {
  return record?.fields?.[id];
}

function firstText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const found = value.find((item) => clean(item));
      if (found !== undefined) return clean(found);
    } else if (clean(value)) return clean(value);
  }
  return "";
}

function unique(values) {
  return [...new Set(values.map((item) => clean(item)).filter(Boolean))];
}

function escapeFormula(value) {
  return clean(value, 500).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function baseId(env = {}) {
  return clean(env.AIRTABLE_BASE_ID, 80) || DEFAULT_BASE_ID;
}

function airtableToken(env = {}) {
  return clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000);
}

async function airtableGet(env, table, recordId) {
  const key = airtableToken(env);
  if (!key || !table || !recId(recordId)) return null;
  const url = `${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return response.json().catch(() => null);
}

async function airtableList(env, table, { formula = "", maxRecords = 100, returnFieldsByFieldId = false } = {}) {
  const key = airtableToken(env);
  if (!key || !table) throw new Error("airtable_config_missing");
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", String(Math.min(Math.max(maxRecords, 1), 100)));
  url.searchParams.set("maxRecords", String(Math.min(Math.max(maxRecords, 1), 100)));
  if (formula) url.searchParams.set("filterByFormula", formula);
  if (returnFieldsByFieldId) url.searchParams.set("returnFieldsByFieldId", "true");
  const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw new Error(`airtable_${response.status || "malformed"}`);
  return payload.records;
}

function canonicalClientProjection(record = {}, fallback = {}) {
  const fields = record?.fields || {};
  const gender = explicitCanonicalCustomerGender(fields);
  return {
    canonical_client_id: recId(record?.id || fallback.client_id),
    display_name: firstText(
      fallback.per_rename,
      fallback.remembered_name,
      fields["Client Name (Display)"],
      fields["Client Name"],
      fields.mmd_client_name,
      fields.nickname,
      fields.username,
    ),
    email: normalizeEmail(firstText(fallback.member_email, fields["Contact Email"], fields.email)),
    line_user_id: lineId(firstText(fallback.line_user_id, fields.line_user_id, fields["LINE User ID"])),
    telegram_user_id: telegramId(firstText(fallback.telegram_user_id, fields.telegram_user_id, fields["Telegram User ID"])),
    customer_gender: gender.value,
    customer_gender_source: gender.source,
    per_rename: firstText(fallback.per_rename, fallback.remembered_name),
    source: fallback.per_rename_authoritative === true ? "per_rename_authoritative" : "canonical_client",
  };
}

function explicitCanonicalCustomerGender(fields = {}) {
  const directCandidates = [
    fields["Customer Gender"],
    fields["Client Gender"],
    fields["Gender"],
    fields.gender,
    fields["Sex"],
    fields.sex,
    fields["เพศ"],
  ];
  for (const candidate of directCandidates) {
    const normalized = normalizeCustomerGender(candidate);
    if (normalized) return { value: normalized, source: "canonical_field" };
  }

  const note = firstText(
    fields["LINE OFC Notes"],
    fields["Client Notes"],
    fields["Notes"],
    fields.notes,
  );
  if (note) {
    const match = note.match(/(?:^|\n)\s*(?:gender|sex|เพศ)\s*[:=]\s*([^\n,;|]+)/i);
    const normalized = normalizeCustomerGender(match?.[1]);
    if (normalized) return { value: normalized, source: "explicit_labeled_note" };
  }

  return { value: "unknown", source: "not_recorded" };
}

function normalizeCustomerGender(value) {
  const raw = clean(value, 80).normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  if (!raw) return "";
  if (["male", "man", "m", "ชาย", "ผู้ชาย"].includes(raw)) return "male";
  if (["female", "woman", "f", "หญิง", "ผู้หญิง"].includes(raw)) return "female";
  if (["nonbinary", "non-binary", "non binary", "nb", "นอนไบนารี"].includes(raw)) return "nonbinary";
  if (["other", "อื่น", "อื่นๆ"].includes(raw)) return "other";
  if (["prefer not to say", "prefer_not_to_say", "ไม่ระบุ", "ไม่ประสงค์ระบุ"].includes(raw)) return "prefer_not_to_say";
  return "";
}

export async function resolveLiveCanonicalClient(env = {}, input = {}) {
  const explicitId = recId(input.canonical_client_id || input.client_id || input.client_record_id);
  if (explicitId) {
    const record = await airtableGet(env, clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS, 120) || DEFAULT_CLIENTS_TABLE, explicitId);
    if (!record?.id) return { status: "unresolved", reason: "canonical_client_not_found" };
    return { status: "resolved", client: canonicalClientProjection(record, input) };
  }

  const stableTelegramUserId = telegramId(input.telegram_user_id);
  if (stableTelegramUserId) {
    const table = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS, 120) || DEFAULT_CLIENTS_TABLE;
    const records = await airtableList(env, table, {
      formula: `AND({telegram_user_id}="${escapeFormula(stableTelegramUserId)}",LOWER({telegram_verification_status}&"")="verified")`,
      maxRecords: 2,
    });
    if (records.length === 1) {
      return {
        status: "resolved",
        client: canonicalClientProjection(records[0], { ...input, telegram_user_id: stableTelegramUserId }),
      };
    }
    if (records.length > 1) return { status: "unresolved", reason: "telegram_identity_conflict" };
    return { status: "unresolved", reason: "telegram_identity_not_linked" };
  }

  const query = firstText(input.per_rename, input.client_query, input.display_name, input.line_user_id, input.line_display_name);
  if (!query) return { status: "unresolved", reason: "identity_input_required" };

  const resolved = await resolvePerRenameAlias(env, query);
  if (resolved.state !== "resolved" || !resolved.record?.client_id) {
    return {
      status: "unresolved",
      reason: resolved.state === "multiple" ? "per_rename_multiple_clients" : resolved.state === "ambiguous" ? "per_rename_ambiguous" : "per_rename_not_resolved",
      choices: Array.isArray(resolved.records) ? resolved.records.slice(0, 12).map((item) => ({ client_id: recId(item.client_id), display_name: clean(item.client_name, 120) })) : [],
    };
  }

  const table = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS, 120) || DEFAULT_CLIENTS_TABLE;
  const record = await airtableGet(env, table, resolved.record.client_id);
  if (!record?.id) return { status: "unresolved", reason: "canonical_client_not_found_after_per_rename" };
  return { status: "resolved", client: canonicalClientProjection(record, resolved.record) };
}

async function readClient360(env, canonicalClientId) {
  if (!recId(canonicalClientId)) return { status: "unavailable", data: null };
  const request = new Request(`https://admin-worker.local/v1/admin/clients/intelligence?client_id=${encodeURIComponent(canonicalClientId)}`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  try {
    const response = await handleClientIntelligenceRequest(request, env);
    const data = await response.json().catch(() => null);
    return { status: response.ok && data?.ok !== false ? "live" : "unavailable", http_status: response.status, data };
  } catch (error) {
    return { status: "unavailable", http_status: 0, data: null, error: clean(error?.message || error, 120) };
  }
}

function entitlementTable(env = {}) {
  return clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS, 160) || DEFAULT_ENTITLEMENTS_TABLE;
}

async function readEntitlement(env, client = {}) {
  const clauses = [];
  const email = normalizeEmail(client.email);
  const lineUserId = lineId(client.line_user_id);
  const emailField = clean(env.AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD, 120) || "member_email";
  const lineField = clean(env.AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD, 120) || "line_user_id";
  if (email) clauses.push(`LOWER({${emailField}}&\"\")=\"${escapeFormula(email.toLowerCase())}\"`);
  if (lineUserId) clauses.push(`{${lineField}}=\"${escapeFormula(lineUserId)}\"`);
  if (!clauses.length) return { status: "unavailable", reason: "stable_member_identity_missing", snapshot: null };

  try {
    const records = await airtableList(env, entitlementTable(env), {
      formula: clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`,
      maxRecords: 100,
    });
    const adapted = records.map((record) => ({
      ...record,
      fields: {
        ...(record.fields || {}),
        member_status: record?.fields?.member_lifecycle_status || record?.fields?.member_status || "",
      },
    }));
    const snapshot = resolveMemberEntitlements(adapted);
    if (snapshot?.schema_version !== "my_mmd_entitlement_resolver_v1" || snapshot?.fail_closed !== true) {
      return { status: "unavailable", reason: "resolver_contract_invalid", snapshot: null };
    }
    return { status: "verified", snapshot, record_count: records.length };
  } catch (error) {
    return { status: "unavailable", reason: clean(error?.message || error, 120), snapshot: null };
  }
}

function chooseCapability(snapshot = {}) {
  const state = snapshot.capability_state || {};
  for (const bucket of ["active", "grace", "inactive", "recognized"]) {
    const values = new Set(Array.isArray(state[bucket]) ? state[bucket].map(token) : []);
    const capability = CAPABILITY_PRIORITY.find((item) => values.has(item));
    if (capability) return { capability, bucket };
  }
  return { capability: "none", bucket: "inactive" };
}

function entitlementProjection(source = {}) {
  const snapshot = source.snapshot || {};
  if (source.status !== "verified") {
    return {
      status: "unavailable",
      lifecycle: "unavailable",
      canonical_membership_level: "none",
      private_visibility_envelope: "none",
      public_service_access: false,
      new_model_reveals_allowed: false,
      member_blocked: true,
      source_status: source.status || "unavailable",
    };
  }
  const selected = chooseCapability(snapshot);
  const matching = Array.isArray(snapshot.entitlements)
    ? snapshot.entitlements.filter((item) => token(item?.capability) === selected.capability)
    : [];
  const lifecycle = snapshot.member_blocked === true
    ? "blocked"
    : clean(matching.find((item) => token(item?.lifecycle) === selected.bucket)?.lifecycle || matching[0]?.lifecycle || selected.bucket, 80).toLowerCase();
  const expires = unique(matching.map((item) => item?.expire_at)).filter(Boolean);
  const access = snapshot.access || {};
  return {
    status: snapshot.member_blocked === true ? "blocked" : lifecycle,
    lifecycle,
    canonical_membership_level: selected.capability,
    private_visibility_envelope: snapshot.member_blocked === true ? "none" : token(access.private_visibility_envelope || "none"),
    public_service_access: snapshot.member_blocked === true ? false : access.public_service_access === true,
    new_model_reveals_allowed: snapshot.member_blocked === true ? false : access.new_model_reveals_allowed === true,
    member_blocked: snapshot.member_blocked === true,
    expire_at: expires.length === 1 ? expires[0] : "",
    source_status: "verified",
  };
}

function bangkokDate(input = {}) {
  const explicit = clean(input.date, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const start = Date.parse(clean(input.start_at, 80));
  const date = Number.isFinite(start) ? new Date(start) : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function endAtFromIntent(input = {}) {
  const date = clean(input.date || input.date_label, 10);
  const start = clean(input.time || input.time_label, 5);
  const startAt = clean(input.start_at, 80);
  const startMs = Number.isFinite(Date.parse(startAt))
    ? Date.parse(startAt)
    : (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(start)
      ? Date.parse(`${date}T${start}:00+07:00`)
      : NaN);
  const suppliedDuration = number(input.duration_hours, 0);
  const minimumDurationHours = Math.max(STANDARD_BOOKING_MIN_DURATION_HOURS, suppliedDuration || 0);
  const minimumEndMs = Number.isFinite(startMs)
    ? startMs + Math.round(minimumDurationHours * 60 * 60 * 1000)
    : NaN;

  const direct = clean(input.end_at, 80);
  if (direct) {
    const directMs = Date.parse(direct);
    if (Number.isFinite(startMs) && Number.isFinite(directMs) && directMs - startMs < STANDARD_BOOKING_MIN_DURATION_HOURS * 60 * 60 * 1000) {
      return new Date(minimumEndMs).toISOString();
    }
    return direct;
  }

  const end = clean(input.end_time, 5);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(end)) {
    const startMinutes = /^\d{2}:\d{2}$/.test(start) ? Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) : -1;
    const endMinutes = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));
    let spanMinutes = startMinutes >= 0 ? endMinutes - startMinutes : 0;
    if (startMinutes >= 0 && spanMinutes <= 0) spanMinutes += 24 * 60;
    if (startMinutes >= 0 && spanMinutes < STANDARD_BOOKING_MIN_DURATION_HOURS * 60 && Number.isFinite(minimumEndMs)) {
      return new Date(minimumEndMs).toISOString();
    }
    const base = new Date(`${date}T12:00:00+07:00`);
    if (startMinutes >= 0 && endMinutes <= startMinutes) base.setUTCDate(base.getUTCDate() + 1);
    const endDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: BANGKOK_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(base);
    return `${endDate}T${end}:00+07:00`;
  }

  return Number.isFinite(minimumEndMs) ? new Date(minimumEndMs).toISOString() : "";
}

function normalizeIntent(input = {}) {
  return {
    type: token(input.type || input.intent || "general"),
    trigger: token(input.trigger),
    model_id: clean(input.model_id, 160),
    model_name: clean(input.model_name, 160),
    customer_name: clean(input.customer_name, 120),
    service: clean(input.service || input.service_lane, 120),
    date: clean(input.date || input.date_label, 80),
    time: clean(input.time || input.time_label, 40),
    start_at: clean(input.start_at, 80),
    end_at: endAtFromIntent(input),
    end_time: clean(input.end_time, 40),
    duration_hours: (clean(input.time || input.time_label, 40) || clean(input.start_at, 80))
      ? Math.max(STANDARD_BOOKING_MIN_DURATION_HOURS, number(input.duration_hours, 0) || 0)
      : number(input.duration_hours, 0),
    duration_source: (clean(input.time || input.time_label, 40) || clean(input.start_at, 80))
      && !clean(input.end_time || input.end_at, 80)
      && number(input.duration_hours, 0) < STANDARD_BOOKING_MIN_DURATION_HOURS
      ? (number(input.duration_hours, 0) > 0 ? "mmd_standard_minimum_90m_floor" : "mmd_standard_minimum_90m_default")
      : clean(input.duration_source, 80),
    location: clean(input.location || input.location_area || input.zone, 160),
    amount_thb: number(input.amount_thb, 0),
    deposit_amount_thb: number(input.deposit_amount_thb, 0),
    raw: clean(input.raw, 1000),
  };
}

function intentStartMs(intent = {}) {
  const direct = Date.parse(clean(intent.start_at, 80));
  if (Number.isFinite(direct)) return direct;
  if (/^\d{4}-\d{2}-\d{2}$/.test(intent.date) && /^\d{1,2}:\d{2}$/.test(intent.time)) {
    const [h, m] = intent.time.split(":").map(Number);
    const iso = `${intent.date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`;
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function sameModel(item = {}, intent = {}) {
  if (intent.model_id) return clean(item?.model?.record_id || item?.model?.model_id, 160) === intent.model_id;
  if (!intent.model_name) return false;
  return clean(item?.model?.name, 160).toLowerCase() === intent.model_name.toLowerCase();
}

function overlapsRequested(item = {}, intent = {}) {
  const requestedStart = intentStartMs(intent);
  if (!Number.isFinite(requestedStart)) return false;
  const requestedEnd = Date.parse(clean(intent.end_at, 80));
  const itemStart = Date.parse(clean(item.start_at, 80));
  const itemEnd = Date.parse(clean(item.end_at, 80));
  if (!Number.isFinite(itemStart) || !Number.isFinite(itemEnd)) return false;
  if (Number.isFinite(requestedEnd) && requestedEnd > requestedStart) return requestedStart < itemEnd && itemStart < requestedEnd;
  return requestedStart >= itemStart && requestedStart < itemEnd;
}

function calendarProjection(calendar = {}, clientId, intent = {}) {
  const items = Array.isArray(calendar?.items) ? calendar.items : [];
  const clientItems = items.filter((item) => clean(item?.client?.record_id, 80) === clientId);
  const modelItems = items.filter((item) => sameModel(item, intent));
  const conflicts = modelItems.filter((item) => overlapsRequested(item, intent));
  const requestedStart = intentStartMs(intent);
  const hasRequestedSlot = Number.isFinite(requestedStart) && Boolean(intent.model_id || intent.model_name);
  const status = hasRequestedSlot ? (conflicts.length ? "unavailable" : "available") : "unknown";
  const holds = items.filter((item) => item?.internal_hold === true).map((item) => ({
    id: clean(item.session_id, 160),
    start_at: clean(item.start_at, 80),
    end_at: clean(item.end_at, 80),
    status: "internal_hold",
  }));
  const nextAvailableStart = conflicts
    .map((item) => clean(item.end_at, 80))
    .filter(Boolean)
    .sort()[0] || "";
  return {
    date: clean(calendar?.date || bangkokDate(intent), 20),
    status,
    available: status === "available",
    conflicts: conflicts.map((item) => ({
      id: clean(item.session_id, 160),
      start_at: clean(item.start_at, 80),
      end_at: clean(item.end_at, 80),
      type: item?.internal_hold === true ? "internal_hold" : "session",
    })),
    holds,
    next_available_start: nextAvailableStart,
    source: "admin_calendar_live_projection",
    client_items: clientItems,
    all_items: items,
  };
}

function jobProjection(calendar = {}, clientId) {
  const items = Array.isArray(calendar?.items) ? calendar.items : [];
  const jobs = items
    .filter((item) => clean(item?.client?.record_id, 80) === clientId)
    .map((item) => ({
      job_id: clean(item?.job?.job_id || item?.job?.record_id || item?.session_id, 160),
      session_id: clean(item?.session_id, 160),
      status: clean(item?.job?.status || item?.session_state || "unknown", 80),
      model_id: clean(item?.model?.record_id || item?.model?.model_id, 160),
      model_name: clean(item?.model?.name, 160),
      start_at: clean(item?.start_at, 80),
      end_at: clean(item?.end_at, 80),
      payment_state: clean(item?.deposit?.status || item?.deposit?.verification || "unknown", 80),
      internal_hold: item?.internal_hold === true,
    }));
  return { jobs, status: jobs.length ? "active_or_pending" : "clear" };
}

function depositProjection(item = {}) {
  const deposit = item?.deposit || {};
  const state = token(deposit.status || deposit.verification || deposit.state || deposit.deposit_status || "unknown");
  const paid = deposit.paid === true || deposit.verified === true || ["official_verified", "verified", "paid", "confirmed", "complete", "completed"].includes(state);
  const reviewRequired = ["pending", "pending_review", "review", "review_required", "unmatched", "uncertain", "needs_review"].includes(state);
  const amount = number(deposit.amount_thb || deposit.amount || deposit.paid_amount_thb, 0);
  return {
    status: paid ? "paid" : state,
    paid,
    review_required: reviewRequired,
    deposit_paid_thb: paid ? amount : 0,
    payment_ref: clean(deposit.payment_ref || item?.payment_ref, 160),
    source: "canonical_payment_projection",
  };
}

function chooseRelevantClientItem(calendar = {}, clientId, intent = {}) {
  const items = Array.isArray(calendar?.items) ? calendar.items.filter((item) => clean(item?.client?.record_id, 80) === clientId) : [];
  if (!items.length) return null;
  const same = items.filter((item) => sameModel(item, intent));
  const pool = same.length ? same : items;
  const requestedStart = intentStartMs(intent);
  return [...pool].sort((a, b) => {
    if (!Number.isFinite(requestedStart)) return String(b.start_at || "").localeCompare(String(a.start_at || ""));
    const da = Math.abs((Date.parse(a.start_at || "") || 0) - requestedStart);
    const db = Math.abs((Date.parse(b.start_at || "") || 0) - requestedStart);
    return da - db;
  })[0] || null;
}

function verifiedCredit(record = {}) {
  const verification = token(field(record, CREDIT.verificationStatus));
  const source = token(field(record, CREDIT.verificationSource));
  const original = Math.max(0, number(field(record, CREDIT.originalAmount), 0));
  const available = Math.max(0, number(field(record, CREDIT.availableAmount), 0));
  const applied = Math.max(0, number(field(record, CREDIT.appliedAmount), 0));
  const verifiedAmount = Math.max(0, number(field(record, CREDIT.verifiedAmount), 0));
  return verification === "verified"
    && source === APPROVED_CREDIT_SOURCE
    && original > 0
    && verifiedAmount + MONEY_TOLERANCE >= original
    && available <= original + MONEY_TOLERANCE
    && applied <= original + MONEY_TOLERANCE;
}

async function readCreditBalance(env, clientId) {
  if (!recId(clientId)) return { status: "unavailable", balance_thb: 0, pending_count: 0 };
  try {
    const table = clean(env.AIRTABLE_CLIENT_CREDITS_TABLE_ID, 80) || DEFAULT_CREDITS_TABLE;
    const records = await airtableList(env, table, {
      formula: `{client_record_id}=\"${escapeFormula(clientId)}\"`,
      maxRecords: 100,
      returnFieldsByFieldId: true,
    });
    let balance = 0;
    let pending = 0;
    for (const record of records) {
      const status = token(field(record, CREDIT.status));
      if (verifiedCredit(record) && ACTIVE_CREDIT_STATES.has(status)) balance += Math.max(0, number(field(record, CREDIT.availableAmount), 0));
      else if (!verifiedCredit(record) && [...ACTIVE_CREDIT_STATES, "pending_review"].includes(status)) pending += 1;
    }
    return { status: "verified", balance_thb: balance, pending_count: pending };
  } catch (error) {
    return { status: "unavailable", balance_thb: 0, pending_count: 0, error: clean(error?.message || error, 120) };
  }
}

async function readHypeObservation(env, input = {}) {
  const configured = Boolean(clean(env.TELEGRAM_OPS_CHAT_ID || env.TELEGRAM_CHAT_ID || env.HYPE_CHAT_ID, 80));
  const threadId = clean(env.HYPE_THREAD_ID || env.TELEGRAM_ALERTS_THREAD_ID || env.TG_THREAD_ALERTS || env.TG_THREAD_ALERTS_EXCEPTIONS, 32);
  const userId = telegramId(input.telegram_user_id);
  const secret = clean(env.AUTH_SERVICE_AUTH_TO_TELEGRAM, 1000);
  const binding = env.TELEGRAM_ACCESS_RECONCILER;
  if (!userId || !binding?.fetch || !secret) {
    return {
      status: configured ? "notification_ready" : "unavailable",
      configured,
      notification_only: true,
      access_observation: userId ? "unavailable" : "not_requested",
      thread_id: threadId,
      telegram_rooms: [],
    };
  }
  try {
    const response = await binding.fetch(new Request("https://telegram-worker.internal/telegram/internal/access/reconcile", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-auth-reconcile-secret": secret,
      },
      body: JSON.stringify({ mode: "inspect", telegram_user_id: userId }),
    }));
    const payload = await response.json().catch(() => null);
    return {
      status: response.ok && payload?.ok === true ? "observed" : (configured ? "notification_ready" : "unavailable"),
      configured,
      notification_only: true,
      access_observation: response.ok && payload?.ok === true ? "observed" : "unavailable",
      thread_id: threadId,
      telegram_rooms: Array.isArray(payload?.telegram_rooms) ? payload.telegram_rooms : [],
    };
  } catch {
    return {
      status: configured ? "notification_ready" : "unavailable",
      configured,
      notification_only: true,
      access_observation: "unavailable",
      thread_id: threadId,
      telegram_rooms: [],
    };
  }
}

export function buildKenjiLv5LiveFanInProjection({
  identityResolution = {},
  client360 = {},
  entitlement = {},
  calendar = {},
  credit = {},
  hype = {},
  intent = {},
} = {}) {
  const normalizedIntent = normalizeIntent(intent);
  const resolved = identityResolution.status === "resolved" && recId(identityResolution?.client?.canonical_client_id);
  const client = resolved ? identityResolution.client : {};
  const canonicalClientId = recId(client.canonical_client_id);
  const entitlementProjected = entitlementProjection(entitlement);
  const cal = calendarProjection(calendar, canonicalClientId, normalizedIntent);
  const job = jobProjection(calendar, canonicalClientId);
  const relevant = chooseRelevantClientItem(calendar, canonicalClientId, normalizedIntent);
  const payment = {
    ...depositProjection(relevant || {}),
    credit_balance_thb: credit.status === "verified" ? number(credit.balance_thb, 0) : 0,
    credit_verification_status: credit.status || "unavailable",
    credit_pending_count: number(credit.pending_count, 0),
  };

  const operational = buildKenjiLv5OperationalContext({
    client: {
      status: resolved ? "resolved" : "unresolved",
      canonical_client_id: canonicalClientId,
      display_name: clean(client.display_name, 120),
      customer_gender: clean(client.customer_gender, 40) || "unknown",
      customer_gender_source: clean(client.customer_gender_source, 80) || "not_recorded",
      relationship_context: clean(client360?.data?.relationship?.relationship_state || client360?.data?.relationship?.summary, 160),
    },
    entitlement: entitlementProjected,
    calendar: cal,
    job,
    payment,
    hype,
    intent: normalizedIntent,
  });

  const essentialSources = {
    identity: resolved ? "live" : "blocked",
    client_360: client360.status || "unavailable",
    entitlement: entitlement.status || "unavailable",
    calendar_job_payment: calendar?.ok === false ? "unavailable" : "live",
    credit: credit.status || "unavailable",
    hype: hype.status || "unavailable",
  };
  const liveTruthComplete = resolved
    && essentialSources.client_360 === "live"
    && essentialSources.entitlement === "verified"
    && essentialSources.calendar_job_payment === "live";

  if (!liveTruthComplete && operational.readiness === "ready") operational.readiness = "blocked";
  const fanInBlockers = [];
  if (!resolved) fanInBlockers.push(identityResolution.reason || "canonical_client_unresolved");
  if (essentialSources.client_360 !== "live") fanInBlockers.push("client_360_unavailable");
  if (essentialSources.entitlement !== "verified") fanInBlockers.push("entitlement_truth_unavailable");
  if (essentialSources.calendar_job_payment !== "live") fanInBlockers.push("calendar_job_payment_projection_unavailable");

  return {
    ...operational,
    schema: KENJI_LV5_LIVE_CONTEXT_SCHEMA,
    phase: "P2_live_context_fanin",
    live_truth_complete: liveTruthComplete,
    fan_in: {
      sources: essentialSources,
      blockers: unique(fanInBlockers),
      identity_resolution: resolved ? "canonical" : "unresolved",
      per_rename: clean(client.per_rename, 120),
      line_identity_present: Boolean(lineId(client.line_user_id)),
      telegram_identity_present: Boolean(telegramId(client.telegram_user_id)),
    },
    client_360_live: client360.data || null,
    entitlement_live: entitlementProjected,
    calendar_live: {
      date: cal.date,
      status: cal.status,
      conflicts: cal.conflicts,
      holds: cal.holds,
      source: cal.source,
    },
    job_live: job,
    payment_live: payment,
    hype_live: hype,
    reply_strategy: buildKenjiLv5CustomerReplyStrategy(operational),
  };
}

export async function resolveKenjiLv5LiveContext(env = {}, input = {}) {
  const intent = normalizeIntent(input.intent || {});
  let identityResolution;
  try {
    identityResolution = await resolveLiveCanonicalClient(env, input.client || input.identity || input);
  } catch (error) {
    identityResolution = { status: "unresolved", reason: clean(error?.message || error, 120) || "identity_resolution_unavailable" };
  }

  if (identityResolution.status !== "resolved") {
    return buildKenjiLv5LiveFanInProjection({
      identityResolution,
      client360: { status: "blocked", data: null },
      entitlement: { status: "blocked", snapshot: null },
      calendar: { ok: false, items: [], date: bangkokDate(intent) },
      credit: { status: "blocked", balance_thb: 0, pending_count: 0 },
      hype: await readHypeObservation(env, input),
      intent,
    });
  }

  const client = identityResolution.client;
  const date = bangkokDate(intent);
  const [client360, entitlement, calendarResult, credit, hype] = await Promise.all([
    readClient360(env, client.canonical_client_id),
    readEntitlement(env, client),
    readAdminCalendar(env, date)
      .then((data) => ({ ...(data || {}), ok: true }))
      .catch((error) => ({ ok: false, date, items: [], error: clean(error?.message || error, 120) })),
    readCreditBalance(env, client.canonical_client_id),
    readHypeObservation(env, { ...input, telegram_user_id: input.telegram_user_id || client.telegram_user_id }),
  ]);

  return buildKenjiLv5LiveFanInProjection({
    identityResolution,
    client360,
    entitlement,
    calendar: calendarResult,
    credit,
    hype,
    intent,
  });
}
