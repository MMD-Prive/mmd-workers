// Owner-only annual collected payments. Read-only; never derives accounting profit.
const API = "https://api.airtable.com/v0";
const PAYMENTS = "tblWGGJJOx5eBvBZJ";
const SESSIONS = "tblC98mKWbzmPuNzX";
const P = Object.freeze({
  ref: "fldOO6SY49iDw8VBZ",
  amount: "fldvCSwrUW8OMAooS",
  date: "fld3yAwxIu2dkw7fO",
  verification: "fldJ7a0Ube9F0bmRy",
  officialAt: "fldPNK6qgxCSdaJRM",
  session: "fld2wdhBvc8xrV6y5",
});
const S = Object.freeze({
  id: "fldLTq2kZbyRv22IA",
  jobType: "fldjK3U9bghnj7xUe",
});

function value(input) {
  if (Array.isArray(input)) return input.length === 1 ? value(input[0]) : "";
  if (input && typeof input === "object") return String(input.name || input.id || "").trim();
  return String(input ?? "").trim();
}

async function list(env, tableId, fields) {
  const token = env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN;
  const base = env.AIRTABLE_BASE_ID;
  if (!token || !base) throw new Error("storage_unavailable");
  const records = [];
  let offset = "";
  for (let page = 0; page < 100; page++) {
    const url = new URL(API + "/" + encodeURIComponent(base) + "/" + encodeURIComponent(tableId));
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const field of Object.values(fields)) url.searchParams.append("fields[]", field);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: { authorization: "Bearer " + token, accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("source_http_" + response.status);
    const data = await response.json();
    if (!Array.isArray(data.records)) throw new Error("source_invalid");
    records.push(...data.records);
    offset = value(data.offset);
    if (!offset) return records;
  }
  throw new Error("source_page_limit");
}

export function summarizeOwnerAnnualFinance(payments, sessions, year) {
  const bySession = new Map();
  for (const row of sessions) {
    const fields = row.fields || {};
    const jobType = value(fields[S.jobType]).toLowerCase();
    const lane = jobType === "mms" || jobType.startsWith("mms ") ? "mms" : jobType ? "mmd" : "";
    if (row.id) bySession.set(row.id, lane);
    const sessionId = value(fields[S.id]);
    if (sessionId) bySession.set(sessionId, lane);
  }
  const totals = { mmd: { received_thb: 0, payments: 0 }, mms: { received_thb: 0, payments: 0 }, unclassified: { received_thb: 0, payments: 0 } };
  const seen = new Set();
  const excluded = { not_official: 0, missing_date: 0, missing_received_amount: 0, duplicates: 0 };
  for (const row of payments) {
    const fields = row.fields || {};
    const status = value(fields[P.verification]).toLowerCase();
    if (!["verified", "official_verified"].includes(status) || !value(fields[P.officialAt])) { excluded.not_official++; continue; }
    const date = value(fields[P.date]);
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) { excluded.missing_date++; continue; }
    if (Number(date.slice(0, 4)) !== year) continue;
    const amount = Number(fields[P.amount]);
    if (!Number.isFinite(amount) || amount <= 0) { excluded.missing_received_amount++; continue; }
    const ref = value(fields[P.ref]) || row.id;
    if (!ref || seen.has(ref)) { excluded.duplicates++; continue; }
    seen.add(ref);
    const lane = bySession.get(value(fields[P.session])) || "unclassified";
    totals[lane].received_thb = Number((totals[lane].received_thb + amount).toFixed(2));
    totals[lane].payments++;
  }
  const classified = totals.mmd.received_thb + totals.mms.received_thb;
  return {
    ok: true, year, currency: "THB", basis: "official_verified_received_payments_linked_to_canonical_sessions",
    totals: { ...totals, classified_received_thb: Number(classified.toFixed(2)), all_included_received_thb: Number((classified + totals.unclassified.received_thb).toFixed(2)) },
    profit_thb: null, profit_state: "approved_actual_costs_and_refunds_not_reconciled",
    excluded, generated_at: new Date().toISOString(),
  };
}

export async function buildOwnerAnnualFinance(env, year) {
  const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric" }).format(new Date()));
  if (!Number.isInteger(year) || year < 2020 || year > currentYear) return { ok: false, error: "invalid_year" };
  try {
    const [payments, sessions] = await Promise.all([
      list(env, env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || PAYMENTS, P),
      list(env, env.AIRTABLE_TABLE_SESSIONS || SESSIONS, S),
    ]);
    return summarizeOwnerAnnualFinance(payments, sessions, year);
  } catch (error) {
    return { ok: false, year, error: "annual_finance_source_unavailable", reason: String(error.message || "").slice(0, 100) };
  }
}
