const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENTS_TABLE = "Clients";
const SESSIONS_TABLE = "Sessions";
const PAYMENTS_TABLE = "Payments";
const LEGACY_STAGING_TABLE = "tbl1u0foFBvgFpT9G";
const HISTORY_MAX_RECORDS = 2000;

const COMMITTED_LINE_MATCH_TYPE = "line_user_id_exact";
const COMMITTED_LINE_DECISION = "link_existing_client";
const COMMITTED_LINE_REVIEW_STATUS = "committed";

export async function readClientBackedHistory(env = {}, lineUserId = "", now = new Date()) {
  return (await readClientBackedHistoryResult(env, lineUserId, now)).items;
}

export async function readClientBackedHistoryResult(env = {}, lineUserId = "", now = new Date(), { requireLinkedClient = false } = {}) {
  const lineId = canonicalLineId(lineUserId);
  if (!lineId || !env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return { state: "checking", source: "canonical_client_history", items: [], summary: emptyHistorySummary() };
  }

  try {
    const client = await resolveCanonicalClientForLine(env, lineId);
    if (!client) {
      return { state: "resolved", source: "canonical_client_history", items: [], summary: emptyHistorySummary() };
    }

    const fields = client?.fields || {};
    const email = normalizeEmail(fields["Contact Email"] || fields.email);
    const clientName = String(fields["Client Name"] || fields.nickname || "").trim();
    const sessionsTable = String(env.AIRTABLE_TABLE_SESSIONS || SESSIONS_TABLE);
    const paymentsTable = String(env.AIRTABLE_TABLE_PAYMENTS || PAYMENTS_TABLE);

    const sessionQueries = [];
    if (email) sessionQueries.push(airtableList(env, sessionsTable, { filterByFormula: `LOWER({email}&"")=${formulaString(email)}`, maxRecords: HISTORY_MAX_RECORDS }));
    if (clientName) sessionQueries.push(airtableList(env, sessionsTable, { filterByFormula: `ARRAYJOIN({Client})=${formulaString(clientName)}`, maxRecords: HISTORY_MAX_RECORDS }).catch(() => []));

    const paymentQueries = [];
    if (email) paymentQueries.push(airtableList(env, paymentsTable, { filterByFormula: `LOWER({Member Email}&"")=${formulaString(email)}`, maxRecords: HISTORY_MAX_RECORDS }));
    if (clientName) paymentQueries.push(airtableList(env, paymentsTable, { filterByFormula: `ARRAYJOIN({Client})=${formulaString(clientName)}`, maxRecords: HISTORY_MAX_RECORDS }).catch(() => []));

    const [sessionGroups, paymentGroups] = await Promise.all([Promise.all(sessionQueries), Promise.all(paymentQueries)]);
    const sessions = dedupeRecords(sessionGroups.flat()).filter((record) => !requireLinkedClient || linkedIds(record?.fields?.Client).includes(String(client.id)));
    const payments = dedupeRecords(paymentGroups.flat());
    const items = buildHistoryItems({ sessions, payments, now });
    return { state: "resolved", source: "canonical_client_history", clientId: String(client?.id || "") || null, items, summary: buildHistorySummary(items) };
  } catch (error) {
    console.warn({ event: "my_mmd_client_history_lookup_failed", failure_class: safeFailure(error) });
    return { state: "checking", source: "canonical_client_history", items: [], summary: emptyHistorySummary() };
  }
}

export async function resolveCanonicalClientForLine(env = {}, lineUserId = "") {
  const lineId = canonicalLineId(lineUserId);
  if (!lineId || !env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return null;
  const clientsTable = String(env.AIRTABLE_TABLE_CLIENTS || CLIENTS_TABLE);
  const lineField = String(env.AIRTABLE_CLIENTS_LINE_USER_ID_FIELD || "line_user_id").trim();
  const stagingTable = String(env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || env.AIRTABLE_TABLE_LINE_OFC_STAGING || LEGACY_STAGING_TABLE).trim();
  const direct = await airtableList(env, clientsTable, { filterByFormula: `{${lineField}}=${formulaString(lineId)}`, maxRecords: 2 });
  if (direct.length > 1) return null;
  if (direct.length === 1) return direct[0];
  const committed = await airtableList(env, stagingTable, { filterByFormula: `AND({line_user_id}=${formulaString(lineId)},{match_type}=${formulaString(COMMITTED_LINE_MATCH_TYPE)},{decision}=${formulaString(COMMITTED_LINE_DECISION)},{review_status}=${formulaString(COMMITTED_LINE_REVIEW_STATUS)})`, maxRecords: 3 });
  const ids = new Set();
  for (const row of committed) {
    const rowFields = row?.fields || {};
    if (rowFields.dry_run_only === true) continue;
    const linked = Array.isArray(rowFields.matched_client) ? rowFields.matched_client : [];
    if (linked.length !== 1) return null;
    const id = safeRecordId(linked[0]);
    if (id) ids.add(id);
  }
  if (ids.size !== 1) return null;
  const clientId = ids.values().next().value;
  const linked = await airtableList(env, clientsTable, { filterByFormula: `RECORD_ID()=${formulaString(clientId)}`, maxRecords: 2 });
  if (linked.length !== 1 || String(linked[0]?.id || "") !== clientId) return null;
  const existingLine = String(linked[0]?.fields?.[lineField] || "").trim();
  if (existingLine && existingLine !== lineId) return null;
  return linked[0];
}

export function buildHistoryItems({ sessions = [], payments = [], now = new Date() } = {}) {
  const to = dateOnly(now);
  if (!to) return [];
  const items = [];
  for (const record of Array.isArray(sessions) ? sessions : []) {
    const fields = record?.fields || {};
    const date = dateOnly(fields.job_date || fields["Session Date"] || fields.created_at);
    if (!date || date > to) continue;
    const status = normalizeToken(fields["Session Status"] || fields.status);
    if (!["completed", "complete", "done"].includes(status)) continue;
    const importReview = normalizeToken(fields.import_review_status);
    if (importReview && !["approved", "materialized", "verified"].includes(importReview)) continue;
    const rawJobType = String(fields.job_type || fields.session_type_raw || fields["Session Type"] || "").trim();
    const parsedCodes = parseJobCodes(rawJobType);
    const model = firstNonEmpty(fields.model_name, fields["Assigned Model"], fields.model, fields.Model);
    const location = firstNonEmpty(fields.location_name, fields["Location Name"], fields.location, fields.Location);
    const startTime = firstNonEmpty(fields.start_time, timeOnly(fields["Start Time"]));
    const endTime = firstNonEmpty(fields.end_time, timeOnly(fields["End Time"]));
    const durationMinutes = positiveNumber(fields.duration_minutes) ?? hoursToMinutes(fields.duration_hours) ?? calculateDurationMinutes(startTime, endTime);
    const totalAmount = moneyValue(fields["Total Amount"], fields.amount_thb, fields.total_amount_thb, fields.total_amount);
    const depositAmount = moneyValue(fields["Deposit Paid"], fields.deposit_amount_thb, fields.deposit_amount);
    const explicitBalance = moneyValue(fields.balance_amount_thb, fields.balance_amount, fields["Balance Due"]);
    const balanceAmount = explicitBalance ?? (totalAmount !== null && depositAmount !== null ? Math.max(0, roundMoney(totalAmount - depositAmount)) : null);
    items.push({
      id: `client-service-${safeId(record?.id, items.length + 1)}`, kind: "booking", occurredAt: date,
      title: parsedCodes.serviceCodes.length ? parsedCodes.serviceCodes.join(" + ") : serviceTitle(rawJobType),
      detail: [model, location].filter(Boolean).join(" · ") || null, statusLabel: "Completed", model: model || null,
      canonicalModelIds: linkedIds(fields["Canonical Model"]), serviceCodes: parsedCodes.serviceCodes, chargeComponents: parsedCodes.chargeComponents,
      rawJobType: rawJobType || null, location: location || null, mapUrl: firstNonEmpty(fields.google_map_url, fields.map_url) || null,
      startTime: startTime || null, endTime: endTime || null, durationMinutes, totalAmountThb: totalAmount,
      depositAmountThb: depositAmount, balanceAmountThb: balanceAmount, currency: totalAmount !== null ? "THB" : null,
      source: importReview ? "reviewed_history" : "canonical_session",
    });
  }
  for (const record of Array.isArray(payments) ? payments : []) {
    const fields = record?.fields || {};
    const date = dateOnly(fields["Payment Date"] || fields["Created At"] || fields.created_at);
    if (!date || date > to) continue;
    const status = normalizeToken(fields["Payment Status"] || fields.payment_status);
    if (!["paid", "completed", "settled"].includes(status)) continue;
    const verification = normalizeToken(fields["Verification Status"] || fields.verification_status);
    const importReview = normalizeToken(fields.import_review_status);
    const evidenceSource = normalizeToken(fields.payment_evidence_source);
    const reviewedHistory = verification === "verified" || ["approved", "materialized", "verified"].includes(importReview) || evidenceSource === "imported_history";
    if (!reviewedHistory) continue;
    const amount = moneyValue(fields.Amount, fields.amount_thb, fields.amount);
    items.push({ id: `client-payment-${safeId(record?.id, items.length + 1)}`, kind: "payment", occurredAt: date, title: "Payment history", detail: null, statusLabel: "Verified", amountThb: amount, currency: amount !== null ? "THB" : null, paymentReference: firstNonEmpty(fields["Payment Reference"], fields.payment_ref) || null, source: evidenceSource === "imported_history" ? "reviewed_history" : "canonical_payment" });
  }
  const seen = new Set();
  return items.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)) || kindRank(a.kind) - kindRank(b.kind) || String(a.id).localeCompare(String(b.id))).filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
}

export function buildHistorySummary(items = []) {
  const bookings = (Array.isArray(items) ? items : []).filter((item) => item?.kind === "booking");
  const modelCounts = new Map(); const serviceCounts = new Map(); let verifiedServiceSpendThb = 0; let spendRecordCount = 0; let travelFeeJobs = 0;
  for (const item of bookings) {
    if (Number.isFinite(Number(item.totalAmountThb))) { verifiedServiceSpendThb += Number(item.totalAmountThb); spendRecordCount += 1; }
    const model = String(item.model || "").trim(); if (model) modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
    for (const code of Array.isArray(item.serviceCodes) ? item.serviceCodes : []) serviceCounts.set(code, (serviceCounts.get(code) || 0) + 1);
    if ((item.chargeComponents || []).some((part) => part?.code === "TR")) travelFeeJobs += 1;
  }
  const lastServiceDate = bookings.reduce((latest, item) => String(item.occurredAt || "") > latest ? String(item.occurredAt || "") : latest, "");
  return { verifiedServiceCount: bookings.length, verifiedServiceSpendThb: roundMoney(verifiedServiceSpendThb), spendRecordCount, lastServiceDate: lastServiceDate || null, modelUsage: [...modelCounts.entries()].map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count || a.model.localeCompare(b.model)), serviceUsage: [...serviceCounts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)), travelFeeJobs };
}

export function parseJobCodes(value) {
  const raw = String(value || "").trim();
  if (!raw || normalizeToken(raw) === "historical_service") return { serviceCodes: [], chargeComponents: [] };
  const tokens = raw.replace(/[+|/,]+/g, " ").split(/\s+/).map((token) => token.trim().toUpperCase()).filter(Boolean);
  const serviceCodes = []; const chargeComponents = [];
  for (const token of tokens) { if (token === "TR") { chargeComponents.push({ code: "TR", type: "travel_fee" }); continue; } if (!serviceCodes.includes(token)) serviceCodes.push(token); }
  return { serviceCodes, chargeComponents };
}

function emptyHistorySummary() { return { verifiedServiceCount: 0, verifiedServiceSpendThb: 0, spendRecordCount: 0, lastServiceDate: null, modelUsage: [], serviceUsage: [], travelFeeJobs: 0 }; }
function dedupeRecords(records = []) { const out = []; const seen = new Set(); for (const record of records) { const id = String(record?.id || "").trim(); const key = id || JSON.stringify(record?.fields || {}); if (seen.has(key)) continue; seen.add(key); out.push(record); } return out; }
function kindRank(kind) { return kind === "booking" ? 0 : kind === "payment" ? 1 : 2; }
function serviceTitle(value) { const token = normalizeToken(value); if (!token || token === "historical_service") return "MMD service"; return String(value || "MMD service").trim() || "MMD service"; }
async function airtableList(env, tableName, params = {}) {
  const maxRecords = Math.max(1, Math.min(Number(params.maxRecords || HISTORY_MAX_RECORDS), HISTORY_MAX_RECORDS)); const records = []; let offset = "";
  do { const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`); if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula); url.searchParams.set("pageSize", String(Math.min(100, maxRecords - records.length))); if (offset) url.searchParams.set("offset", offset); const init = { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" } }; const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(new Request(url.toString(), init)) : await fetch(url.toString(), init); const payload = await response.json().catch(() => ({})); if (!response.ok || !Array.isArray(payload.records)) throw new Error(`airtable_${response.status || "malformed"}`); records.push(...payload.records.slice(0, maxRecords - records.length)); offset = typeof payload.offset === "string" ? payload.offset : ""; } while (offset && records.length < maxRecords);
  return records;
}
function canonicalLineId(value) { const id = String(value || "").trim(); return /^U[0-9a-f]{32}$/i.test(id) ? id : ""; }
function normalizeEmail(value) { const email = String(value || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function safeRecordId(value) { const id = String(value || "").trim(); return /^rec[A-Za-z0-9]{6,32}$/.test(id) ? id : ""; }
function formulaString(value) { return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function normalizeToken(value) { return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_"); }
function safeId(value, fallback) { const id = String(value || "").trim().replace(/[^A-Za-z0-9_-]/g, ""); return id || String(fallback); }
function dateOnly(value) { if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10); const text = String(value || "").trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text; const parsed = Date.parse(text); return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : ""; }
function timeOnly(value) { const text = String(value || "").trim(); const simple = text.match(/^(\d{1,2}):(\d{2})/); if (simple) return `${simple[1].padStart(2, "0")}:${simple[2]}`; const parsed = Date.parse(text); if (!Number.isFinite(parsed)) return ""; const date = new Date(parsed); return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`; }
function calculateDurationMinutes(start, end) { const a = parseClock(start); const b = parseClock(end); if (a === null || b === null) return null; const diff = b >= a ? b - a : (24 * 60) - a + b; return diff > 0 ? diff : null; }
function parseClock(value) { const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/); if (!match) return null; const hour = Number(match[1]); const minute = Number(match[2]); if (hour > 23 || minute > 59) return null; return hour * 60 + minute; }
function hoursToMinutes(value) { const number = positiveNumber(value); return number === null ? null : Math.round(number * 60); }
function positiveNumber(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function moneyValue(...values) { for (const value of values) { if (value === null || value === undefined || value === "") continue; const number = Number(String(value).replace(/,/g, "").replace(/[^0-9.-]/g, "")); if (Number.isFinite(number) && number >= 0) return roundMoney(number); } return null; }
function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function firstNonEmpty(...values) { for (const value of values) { const text = String(value ?? "").trim(); if (text) return text; } return ""; }
function linkedIds(value) { return (Array.isArray(value) ? value : []).map((item) => String(item?.id || item || "").trim()).filter(Boolean); }
function safeFailure(error) { return String(error?.message || error || "unknown").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80) || "unknown"; }
