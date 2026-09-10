const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENTS_TABLE = "Clients";
const SESSIONS_TABLE = "Sessions";
const PAYMENTS_TABLE = "Payments";
const LEGACY_STAGING_TABLE = "tbl1u0foFBvgFpT9G";
const HISTORY_DAYS = 365;
const HISTORY_MAX_ITEMS = 50;

const COMMITTED_LINE_MATCH_TYPE = "line_user_id_exact";
const COMMITTED_LINE_DECISION = "link_existing_client";
const COMMITTED_LINE_REVIEW_STATUS = "committed";

export async function readClientBackedHistory(env = {}, lineUserId = "", now = new Date()) {
  const lineId = canonicalLineId(lineUserId);
  if (!lineId || !env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return [];

  try {
    const client = await resolveCanonicalClientForLine(env, lineId);
    if (!client) return [];
    const email = normalizeEmail(client?.fields?.["Contact Email"] || client?.fields?.email);
    if (!email) return [];

    const [sessions, payments] = await Promise.all([
      airtableList(env, String(env.AIRTABLE_TABLE_SESSIONS || SESSIONS_TABLE), {
        filterByFormula: `LOWER({email}&"")=${formulaString(email)}`,
        maxRecords: 200,
      }),
      airtableList(env, String(env.AIRTABLE_TABLE_PAYMENTS || PAYMENTS_TABLE), {
        filterByFormula: `LOWER({Member Email}&"")=${formulaString(email)}`,
        maxRecords: 200,
      }),
    ]);

    return buildHistoryItems({ sessions, payments, now });
  } catch (error) {
    console.warn({ event: "my_mmd_client_history_lookup_failed", failure_class: safeFailure(error) });
    return [];
  }
}

export async function resolveCanonicalClientForLine(env = {}, lineUserId = "") {
  const lineId = canonicalLineId(lineUserId);
  if (!lineId || !env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return null;

  const clientsTable = String(env.AIRTABLE_TABLE_CLIENTS || CLIENTS_TABLE);
  const lineField = String(env.AIRTABLE_CLIENTS_LINE_USER_ID_FIELD || "line_user_id").trim();
  const stagingTable = String(env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || env.AIRTABLE_TABLE_LINE_OFC_STAGING || LEGACY_STAGING_TABLE).trim();

  const direct = await airtableList(env, clientsTable, {
    filterByFormula: `{${lineField}}=${formulaString(lineId)}`,
    maxRecords: 2,
  });
  if (direct.length > 1) return null;
  if (direct.length === 1) return direct[0];

  const committed = await airtableList(env, stagingTable, {
    filterByFormula: `AND({line_user_id}=${formulaString(lineId)},{match_type}=${formulaString(COMMITTED_LINE_MATCH_TYPE)},{decision}=${formulaString(COMMITTED_LINE_DECISION)},{review_status}=${formulaString(COMMITTED_LINE_REVIEW_STATUS)})`,
  });
  const ids = new Set();
  for (const row of committed) {
    const fields = row?.fields || {};
    if (fields.dry_run_only === true) continue;
    const linked = Array.isArray(fields.matched_client) ? fields.matched_client : [];
    if (linked.length !== 1) return null;
    const id = safeRecordId(linked[0]);
    if (id) ids.add(id);
  }
  if (ids.size !== 1) return null;

  const clientId = ids.values().next().value;
  const linked = await airtableList(env, clientsTable, {
    filterByFormula: `RECORD_ID()=${formulaString(clientId)}`,
    maxRecords: 2,
  });
  if (linked.length !== 1 || String(linked[0]?.id || "") !== clientId) return null;
  const existingLine = String(linked[0]?.fields?.[lineField] || "").trim();
  if (existingLine && existingLine !== lineId) return null;
  return linked[0];
}

export function buildHistoryItems({ sessions = [], payments = [], now = new Date() } = {}) {
  const to = dateOnly(now);
  const from = to ? addCalendarDays(to, -HISTORY_DAYS) : "";
  if (!from) return [];

  const items = [];
  for (const record of Array.isArray(sessions) ? sessions : []) {
    const fields = record?.fields || {};
    const date = dateOnly(fields.job_date || fields["Session Date"] || fields.created_at);
    if (!date || date < from || date > to) continue;
    const status = normalizeToken(fields["Session Status"] || fields.status);
    if (!["completed", "complete", "done"].includes(status)) continue;
    const importReview = normalizeToken(fields.import_review_status);
    if (importReview && importReview !== "approved") continue;
    items.push({
      id: `client-service-${safeId(record?.id, items.length + 1)}`,
      kind: "booking",
      occurredAt: date,
      title: serviceTitle(fields.job_type),
      detail: null,
      statusLabel: "Completed",
    });
  }

  for (const record of Array.isArray(payments) ? payments : []) {
    const fields = record?.fields || {};
    const date = dateOnly(fields["Payment Date"] || fields["Created At"] || fields.created_at);
    if (!date || date < from || date > to) continue;
    const status = normalizeToken(fields["Payment Status"] || fields.payment_status);
    if (!["paid", "completed", "settled"].includes(status)) continue;
    const verification = normalizeToken(fields["Verification Status"] || fields.verification_status);
    const importReview = normalizeToken(fields.import_review_status);
    const evidenceSource = normalizeToken(fields.payment_evidence_source);
    const reviewedHistory = verification === "verified" || importReview === "approved" || evidenceSource === "imported_history";
    if (!reviewedHistory) continue;
    items.push({
      id: `client-payment-${safeId(record?.id, items.length + 1)}`,
      kind: "payment",
      occurredAt: date,
      title: "Payment history",
      detail: null,
      statusLabel: "Verified",
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const item of items.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))) {
    const key = `${item.kind}:${item.occurredAt}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= HISTORY_MAX_ITEMS) break;
  }
  return deduped;
}

function serviceTitle(value) {
  const token = normalizeToken(value);
  if (!token || token === "historical_service") return "MMD service";
  if (token.includes("massage")) return "MMD service";
  if (token.includes("travel")) return "MMD service";
  if (token.includes("model")) return "MMD service";
  return "MMD service";
}

async function airtableList(env, tableName, params = {}) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const init = { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" } };
  const records = [];
  const seenOffsets = new Set();
  for (let page = 0; page < 50; page += 1) {
    const response = env.AIRTABLE_HTTP?.fetch
      ? await env.AIRTABLE_HTTP.fetch(new Request(url.toString(), init))
      : await fetch(url.toString(), init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.records)) throw new Error(`airtable_${response.status || "malformed"}`);
    records.push(...payload.records);
    if (!payload.offset) return records;
    if (seenOffsets.has(payload.offset)) break;
    seenOffsets.add(payload.offset);
    url.searchParams.set("offset", payload.offset);
  }
  // Never authorize from a partial identity set: a later page can contain a
  // contradictory reviewed Client link for the same LINE account.
  throw new Error("airtable_read_incomplete");
}

function canonicalLineId(value) {
  const id = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}
function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
function safeRecordId(value) {
  const id = String(value || "").trim();
  return /^rec[A-Za-z0-9]{6,32}$/.test(id) ? id : "";
}
function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
function safeId(value, fallback) {
  const id = String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, "");
  return id || String(fallback);
}
function dateOnly(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}
function addCalendarDays(date, days) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return "";
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return parsed.toISOString().slice(0, 10);
}
function safeFailure(error) {
  return String(error?.message || error || "unknown").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80) || "unknown";
}
