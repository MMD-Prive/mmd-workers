// HYPE_JOB_DAILY read-only collectors.
// Every collector returns { ok: true, ... } or { ok: false, error } and never throws.
// Only GET requests are issued. Nothing here writes to Airtable, payments, or any other store.
import { addDays, clean, firstText, ictDate, normalizeJobDate } from "./util.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const DEFAULT_PAYMENTS_TABLE = "tblWGGJJOx5eBvBZJ";
const MAX_PAGES = 3;
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
    return { ok: true, truncated, records: records.map(normalizeSession) };
  } catch (error) {
    return { ok: false, error: "sessions_read_failed", detail: clean(error?.message, 80) };
  }
}

export function normalizeSession(record = {}) {
  const f = record.fields || {};
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
