// HYPE_JOB_DAILY read-only collectors.
// Every collector returns { ok: true, ... } or { ok: false, error } and never throws.
// Only GET requests are issued. Nothing here writes to Airtable, payments, or any other store.
import { classifyModelRef } from "../model-reconfirm-guard.js";
import { addDays, clean, firstText, ictDate, normalizeJobDate } from "./util.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const DEFAULT_PAYMENTS_TABLE = "tblWGGJJOx5eBvBZJ";
const DEFAULT_MODELS_TABLE = "models"; // same default as model-reconfirm-runtime
const DEFAULT_CONSOLE_INBOX_TABLE = "tblFHmfpB2TTrzO2e"; // same default as refund-ops
const MAX_PAGES = 3;
const MODEL_ID_RE = /^rec[A-Za-z0-9]{14,24}$/;
const SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;

// Payments is canonical money truth written by payments-worker. Only these fields are read.
// Field IDs match payments-worker / admin-worker precedent (cancellation-credit-recovery.js,
// payments-worker wrangler.toml); each can be overridden with the same env names used elsewhere.
export function paymentFieldMap(env = {}) {
  return {
    ref: clean(env.AT_PAYMENTS__PAYMENT_REF, 60) || "fldOO6SY49iDw8VBZ",
    sessionId: clean(env.AT_PAYMENTS__SESSION_ID, 60) || "fld2wdhBvc8xrV6y5",
    paymentStatus: clean(env.AT_PAYMENTS__PAYMENT_STATUS, 60) || "fldEJ1hmm7KwWuI6q",
    verification: clean(env.AT_PAYMENTS__VERIFICATION_STATUS, 60) || "fldJ7a0Ube9F0bmRy",
    depositStatus: clean(env.AT_PAYMENTS__DEPOSIT_STATUS, 60) || "fldD0mQWTfdmyBAeT",
    amountReceived: clean(env.AT_PAYMENTS__AMOUNT_RECEIVED, 60) || "fld5rTIVEF1DXwfe2",
  };
}

function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

function airtableReady(env) {
  return Boolean(clean(env.AIRTABLE_API_KEY, 5000) && clean(env.AIRTABLE_BASE_ID, 100));
}

async function airtableGet(env, tableId, params) {
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableId)}?${params.toString()}`;
  const request = new Request(url, {
    method: "GET",
    headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  const response = await airtableFetch(env, request);
  if (!response.ok) throw new Error(`airtable_http_${response.status}`);
  return response.json();
}

export async function collectSessions(env = {}, now = Date.now()) {
  if (!airtableReady(env)) return { ok: false, error: "sessions_source_not_configured" };
  try {
    const table = clean(env.AIRTABLE_TABLE_SESSIONS, 100) || DEFAULT_SESSIONS_TABLE;
    const dateField = clean(env.AT_SESSIONS__JOB_DATE, 80).replace(/[{}]/g, "") || "job_date";
    const today = ictDate(now);
    const days = [0, 1, 2, 3].map((n) => addDays(today, n));
    const formula = `OR(${days.map((d) => `IS_SAME({${dateField}}, DATETIME_PARSE('${d}'), 'day')`).join(",")})`;
    const records = [];
    let offset = "";
    let truncated = false;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
      if (offset) params.set("offset", offset);
      const data = await airtableGet(env, table, params);
      if (Array.isArray(data?.records)) records.push(...data.records);
      offset = clean(data?.offset, 200);
      if (!offset) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }
    return { ok: true, truncated, records: records.map((record) => normalizeSession(record, { modelRef: clean(env.AT_SESSIONS__MODEL_RECORD_ID, 80) || "Assigned Model" })) };
  } catch (error) {
    return { ok: false, error: "sessions_read_failed", detail: clean(error?.message, 80) };
  }
}

export function normalizeSession(record = {}, names = {}) {
  const f = record.fields || {};
  const modelRefField = names.modelRef || "Assigned Model";
  const scheduleSource = firstText(f.start_at, f.scheduled_at, f.date_time);
  const clientName = Array.isArray(f.client_name)
    ? [...new Set(f.client_name.map((v) => clean(v, 120)).filter(Boolean))]
    : clean(firstText(f.client_name, f.member_name, f.customer_name, f.name), 120);
  return {
    record_id: clean(record.id, 40),
    session_id: firstText(f.session_id, f.sid, f.job_id),
    job_date: normalizeJobDate(firstText(f.job_date, f.service_date, f.date, f["Job Date"]) || scheduleSource),
    job_date_raw: firstText(f.job_date, f.service_date, f.date, f["Job Date"], scheduleSource),
    start_time: firstText(f.start_time, f["Start Time"], scheduleSource),
    state: firstText(f.session_state),
    status: firstText(f.status, f["Session Status"], f.job_status),
    // Link classification only (never picks the first of several links). Tolerant of sessions that carry no link field.
    model_ref: classifyModelRef(f[modelRefField]),
    model_name: firstText(f.model_name, f["Assigned Model"], f["Model Name"], f.model, f.assigned_model),
    client_name: clientName,
  };
}

export async function collectPayments(env = {}, sessionIds = []) {
  if (!airtableReady(env)) return { ok: false, error: "payments_source_not_configured" };
  try {
    const ids = [...new Set((Array.isArray(sessionIds) ? sessionIds : []).map((id) => clean(id, 120)).filter((id) => SESSION_ID_RE.test(id)))];
    if (!ids.length) return { ok: true, records: [] };
    const table = clean(env.AIRTABLE_TABLE_PAYMENTS, 100) || DEFAULT_PAYMENTS_TABLE;
    const map = paymentFieldMap(env);
    const records = [];
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const formula = `OR(${batch.map((id) => `{session_id}='${id}'`).join(",")})`;
      let offset = "";
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula, returnFieldsByFieldId: "true" });
        for (const fieldId of Object.values(map)) params.append("fields[]", fieldId);
        if (offset) params.set("offset", offset);
        const data = await airtableGet(env, table, params);
        if (Array.isArray(data?.records)) records.push(...data.records);
        offset = clean(data?.offset, 200);
        if (!offset) break;
        if (page === MAX_PAGES - 1) return { ok: false, error: "payments_read_truncated" };
      }
    }
    return { ok: true, records: records.map((record) => normalizePayment(record, map)) };
  } catch (error) {
    return { ok: false, error: "payments_read_failed", detail: clean(error?.message, 80) };
  }
}

export function normalizePayment(record = {}, map = paymentFieldMap()) {
  const f = record.fields || {};
  const amountRaw = f[map.amountReceived];
  const amount = amountRaw === undefined || amountRaw === null || amountRaw === "" ? null : Number(amountRaw);
  return {
    record_id: clean(record.id, 40),
    payment_ref: firstText(f[map.ref]),
    session_id: firstText(f[map.sessionId]),
    payment_status: firstText(f[map.paymentStatus]),
    verification_status: firstText(f[map.verification]),
    deposit_status: firstText(f[map.depositStatus]),
    amount_thb: Number.isFinite(amount) ? amount : null,
  };
}


// ---------- Model connection (read-only) ----------
// A Model is "connected" when its canonical record has a LINE user id in the same shape model-reconfirm-guard checks.
// Only that boolean leaves this function; the LINE user id itself is never returned or logged.
const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/i;

export async function collectModels(env = {}, modelIds = []) {
  if (!airtableReady(env)) return { ok: false, error: "models_source_not_configured" };
  try {
    const ids = [...new Set((Array.isArray(modelIds) ? modelIds : []).map((id) => clean(id, 40)).filter((id) => MODEL_ID_RE.test(id)))];
    if (!ids.length) return { ok: true, records: {} };
    const table = clean(env.AIRTABLE_TABLE_MODELS, 100) || DEFAULT_MODELS_TABLE;
    const lineField = clean(env.AT_MODELS__LINE_USER_ID, 80) || "line_user_id";
    const records = {};
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const formula = `OR(${batch.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
      const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
      params.append("fields[]", lineField);
      const data = await airtableGet(env, table, params);
      if (clean(data?.offset, 200)) return { ok: false, error: "models_read_truncated" };
      for (const record of Array.isArray(data?.records) ? data.records : []) {
        records[clean(record.id, 40)] = { connected: LINE_USER_ID_RE.test(clean(record.fields?.[lineField], 80)) };
      }
    }
    return { ok: true, records };
  } catch (error) {
    return { ok: false, error: "models_read_failed", detail: clean(error?.message, 80) };
  }
}

// ---------- Refund completed packs (read-only) ----------
// Reads the same Console Inbox rows refund-ops writes. Only pack bookkeeping and link fields are kept:
// bank details, account numbers and the private R2 key are never copied out of the payload.
const OWNER_URL_HOSTS = [/^(?:[a-z0-9-]+\.)*mmdbkk\.com$/i, /^miniapp\.line\.me$/i];

// Accepts only https URLs on the project's own hosts. Anything else is treated as "unavailable", never repaired or guessed.
export function safeOwnerUrl(value) {
  const raw = String(value ?? "").trim().slice(0, 1500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (!OWNER_URL_HOSTS.some((re) => re.test(url.hostname))) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseInboxPayload(record = {}) {
  const raw = String(record?.fields?.payload_json ?? "").slice(0, 30000);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeRefundPack(record = {}) {
  const f = record.fields || {};
  const p = parseInboxPayload(record);
  const amount = Number(String(p.owner_refund_amount ?? "").replace(/[,\s]/g, ""));
  return {
    inbox_ref: clean(f.inbox_id, 60),
    customer_name: clean(f.member_name || p.customer_name, 120),
    session_id: clean(p.session_id, 120),
    job_id: clean(p.job_id, 120),
    receipt_uploaded: Boolean(p.receipt_r2_key),
    receipt_uploaded_at: clean(p.receipt_uploaded_at, 60),
    refund_amount_thb: Number.isFinite(amount) && amount > 0 && clean(p.owner_refund_currency || "THB", 12).toUpperCase() === "THB" ? amount : null,
    urls: {
      customer_confirmation_url: safeOwnerUrl(p.customer_receipt_url || p.customer_confirmation_url),
      customer_job_confirm_url: safeOwnerUrl(p.customer_job_confirm_url),
      admin_job_url: safeOwnerUrl(p.admin_job_url),
      model_job_app_url: safeOwnerUrl(p.model_job_app_url),
    },
  };
}

export async function collectRefundPacks(env = {}) {
  if (!airtableReady(env)) return { ok: false, error: "refund_source_not_configured" };
  try {
    const table = clean(env.AIRTABLE_TABLE_CONSOLE_INBOX_ID, 100) || DEFAULT_CONSOLE_INBOX_TABLE;
    const params = new URLSearchParams({
      maxRecords: "100",
      pageSize: "100",
      filterByFormula: "OR({intent}='refund_bank_detail',{intent}='bank_detail_ops')",
    });
    params.set("sort[0][field]", "created_at");
    params.set("sort[0][direction]", "desc");
    for (const field of ["inbox_id", "member_name", "created_at", "payload_json"]) params.append("fields[]", field);
    const data = await airtableGet(env, table, params);
    const items = (Array.isArray(data?.records) ? data.records : []).map(normalizeRefundPack).filter((pack) => pack.receipt_uploaded);
    return { ok: true, items };
  } catch (error) {
    return { ok: false, error: "refund_read_failed", detail: clean(error?.message, 80) };
  }
}
