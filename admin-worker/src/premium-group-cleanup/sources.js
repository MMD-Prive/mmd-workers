// Read-only Airtable sources for the premium group cleanup audit. Never writes.
import { clean } from "../hype-job-daily/util.js";

const DEFAULT_BASE = "appsV1ILPRfIjkaYg";
const DEFAULT_ENTITLEMENTS = "tblNImdF9PKAxhXGi";
const DEFAULT_CLIENTS = "tblVv58TCbwh5j1fS";
const MAX_PAGES = 5;

function cfg(env = {}) {
  return {
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 400),
    base: clean(env.AIRTABLE_BASE_ID, 40) || DEFAULT_BASE,
    entitlements: clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID, 40) || DEFAULT_ENTITLEMENTS,
    clients: clean(env.AIRTABLE_TABLE_CLIENTS_ID, 40) || DEFAULT_CLIENTS,
  };
}

async function getJson(url, token, fetchImpl) {
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`airtable_http_${res.status}`);
  return res.json();
}

export async function readEntitlements(env, fetchImpl = fetch) {
  const c = cfg(env);
  if (!c.token) throw new Error("airtable_token_missing");
  const records = [];
  let offset = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ pageSize: "100" });
    if (offset) qs.set("offset", offset);
    const data = await getJson(`https://api.airtable.com/v0/${c.base}/${c.entitlements}?${qs}`, c.token, fetchImpl);
    records.push(...(data.records || []));
    offset = data.offset || "";
    if (!offset) return { records, truncated: false };
  }
  return { records, truncated: true };
}

export function makeTelegramLookup(env, fetchImpl = fetch) {
  const c = cfg(env);
  return async function lookupTelegram(lineUserId) {
    const id = clean(lineUserId, 80);
    if (!id || /["\\]/.test(id)) return { state: "not_linked" };
    const qs = new URLSearchParams({ maxRecords: "3", filterByFormula: `{line_user_id}="${id}"` });
    let data;
    try {
      data = await getJson(`https://api.airtable.com/v0/${c.base}/${c.clients}?${qs}`, c.token, fetchImpl);
    } catch {
      return { state: "lookup_failed" };
    }
    const rows = (data.records || []).map((r) => r.fields || {});
    const verified = rows.filter((f) => clean(f.telegram_verification_status, 40).toLowerCase() === "verified" && clean(f.telegram_user_id, 40));
    const ids = new Set(verified.map((f) => clean(f.telegram_user_id, 40)));
    if (ids.size === 1) return { state: "linked", telegram_user_id: [...ids][0] };
    if (ids.size > 1 || rows.length > 1) return { state: "ambiguous" };
    return { state: "not_linked" };
  };
}
