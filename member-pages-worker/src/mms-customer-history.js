import { resolveCanonicalClientForLine } from "./member-app-client-history.js";

const STAGING_TABLE = "tbl1u0foFBvgFpT9G";
const LIMIT = 50;
const token = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const text = (value) => String(value || "").trim();
const formula = (value) => `'${text(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const owns = (fields, clientId) => Array.isArray(fields.Client) && fields.Client.length === 1 && fields.Client[0] === clientId;
const validDate = (value) => {
  const date = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
};

// The same canonical Sessions/Payments used by MMD; no LINE notes or display
// names authorize a browser read. Email narrows the query, Client proves ownership.
export async function readMmsCustomerHistory(env, lineUserId, now = new Date()) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("MMS_HISTORY_UNAVAILABLE");
  if (!/^U[0-9a-f]{32}$/i.test(text(lineUserId))) return { state: "checking", items: [] };
  const client = await resolveCanonicalClientForLine(env, lineUserId);
  if (!client) return { state: "checking", items: [] };
  const fields = client.fields || {};
  const states = [fields.status, fields.membership_status, fields["Client Status"]].map(token);
  if (states.some((value) => ["blocked", "suspended", "revoked", "pending_review", "review_required"].includes(value))) {
    return { state: "checking", items: [] };
  }
  const email = text(fields["Contact Email"] || fields.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { state: "checking", items: [] };
  const [sessions, payments, staging] = await Promise.all([
    list(env, env.AIRTABLE_TABLE_SESSIONS || "Sessions", `AND(LOWER({email}&"")=${formula(email)},LOWER({job_type}&"")='mms')`),
    list(env, env.AIRTABLE_TABLE_PAYMENTS || "Payments", `LOWER({Member Email}&"")=${formula(email)}`),
    list(env, env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || env.AIRTABLE_TABLE_LINE_OFC_STAGING || STAGING_TABLE,
      `{line_user_id}=${formula(lineUserId)}`),
  ]);
  const allItems = buildMmsHistoryItems({ sessions, payments, clientId: client.id, now });
  const materializedReviews = new Set(sessions.filter((row) => owns(row.fields || {}, client.id)
    && token(row.fields?.import_review_status) === "approved").map((row) => text(row.fields.imported_source_ref)));
  // Staging is evidence only. A pending row never becomes a completed service.
  const pending = staging.some((row) => {
    let raw;
    try { raw = JSON.parse(row.fields?.raw_row_json || "{}"); } catch { return false; }
    if (!/^mms:line_ofc:/.test(text(raw.source_ref))) return false;
    const importId = text(row.fields?.import_id);
    return !sessions.some((session) => owns(session.fields || {}, client.id)
      && materializedReviews.has(text(session.fields?.imported_source_ref))
      && text(session.fields?.notes).split("; ").includes(`import:${importId}`));
  });
  return { state: allItems.length ? "ready" : pending ? "checking" : "empty", pendingReview: pending,
    items: allItems.slice(0, LIMIT), hasMore: allItems.length > LIMIT };
}

export function buildMmsHistoryItems({ sessions = [], payments = [], clientId, now = new Date() }) {
  const today = now.toISOString().slice(0, 10);
  const seen = new Set();
  return sessions.flatMap((record) => {
    const fields = record.fields || {};
    if (!owns(fields, clientId) || token(fields.job_type) !== "mms") return [];
    if (!["completed", "complete", "done"].includes(token(fields["Session Status"] || fields.status))) return [];
    const historical = /^hist_sess_/.test(text(fields.session_id)) || Boolean(fields.imported_source_ref);
    const review = token(fields.import_review_status);
    if ((historical && review !== "approved") || (review && review !== "approved")) return [];
    const date = validDate(fields.job_date || fields["Session Date"] || fields.created_at);
    if (!date || date > today) return [];
    const reference = text(fields.session_id || record.id);
    if (!/^[A-Za-z0-9_-]{3,120}$/.test(reference) || seen.has(reference)) return [];
    seen.add(reference);
    const linkedPayments = payments.filter((payment) => owns(payment.fields || {}, clientId)
      && text(payment.fields?.session_id) === text(fields.session_id) && fields.session_id);
    const verified = linkedPayments.filter((payment) => {
      const p = payment.fields || {};
      const approval = token(p.import_review_status);
      if (approval && approval !== "approved") return false;
      return ["paid", "completed", "settled"].includes(token(p["Payment Status"] || p.payment_status))
        && (approval === "approved" || token(p["Verification Status"] || p.verification_status) === "verified");
    });
    return [{ id: reference, occurredAt: date, title: "Male Massage", serviceStatus: "completed",
      paymentStatus: verified.length && verified.length === linkedPayments.length ? "verified" : "checking",
      // Keep arbitrary notes, identity anchors, addresses and internal review
      // context out of the self-service projection.
      source: historical ? "reviewed_history" : "service_record" }];
  }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
}

async function list(env, table, filterByFormula) {
  const rows = [];
  let offset = "";
  const offsets = new Set();
  for (let page = 0; page < 50; page += 1) {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    url.searchParams.set("filterByFormula", filterByFormula);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const request = new Request(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" } });
    const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.records)) throw new Error("MMS_HISTORY_UNAVAILABLE");
    rows.push(...payload.records);
    offset = text(payload.offset);
    if (!offset) return rows;
    if (offsets.has(offset)) break;
    offsets.add(offset);
  }
  throw new Error("MMS_HISTORY_READ_INCOMPLETE");
}
