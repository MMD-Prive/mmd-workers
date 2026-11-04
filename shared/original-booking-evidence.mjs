// Read-only original confirmations. These are never completed-service or financial facts.
const CLIENTS = "tblVv58TCbwh5j1fS";
const EVIDENCE = "tblx7NdfHO5iY6qtg";
const BACKLINK = "fld4baNAJwnMsnhMg";
const F = Object.freeze({ key: "fldrwYcKR7m01F3QC", client: "fldJS42gaiUmLkfaB", type: "fldaBUjLrcLmly7Tw", channel: "fldv1iiuqeOpe9m3a", date: "fldfH7hcGTzSCmPnh", review: "fldPP6tY8J4UTDJnJ", trigger: "fldrAADHp3H3Xw3yP", payload: "fldJRMAwwzxB9DlCi" });
const recordId = value => /^rec[A-Za-z0-9]{14}$/.test(String(value || ""));
const ids = value => Array.isArray(value) ? value.map(x => typeof x === "string" ? x : x?.id) : [];
const select = value => typeof value === "string" ? value : value?.name;
const unavailable = () => ({ state: "unavailable", items: [] });
const hash = value => /^[a-f0-9]{64}$/.test(String(value || ""));
function date(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false; const d = new Date(`${value}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value; }

export function projectOriginalBookingEvidence(row, clientId) {
  if (!recordId(clientId) || !recordId(row?.id)) return null;
  const f = row.fields || row.cellValuesByFieldId || {};
  const linked = ids(f[F.client]);
  if (linked.length !== 1 || linked[0] !== clientId || select(f[F.type]) !== "other" || select(f[F.channel]) !== "line_ofc_note" || select(f[F.trigger]) !== "none" || !["staged", "matched", "approved_for_console"].includes(select(f[F.review]))) return null;
  let p; try { p = JSON.parse(f[F.payload]); } catch { return null; }
  if (!p || p.schema !== "booking_confirmation_evidence_v1" || p.evidence_status !== "original_booking_confirmation" || p.completion_proven !== false || p.current_booking_state !== "not_assessed" || p.create_session !== false || p.create_booking !== false || p.financial_materialization !== false) return null;
  if (!/^booking_confirmation_[a-f0-9]{24}$/.test(f[F.key] || "") || p.evidence_group_key !== f[F.key] || !date(p.service_date) || f[F.date] !== p.service_date) return null;
  if (!hash(p.archive_sha256) || !hash(p.entry_sha256) || !recordId(p.identity_match_record_id) || !Array.isArray(p.source_rows) || !p.source_rows.length || !p.source_rows.every(n => Number.isSafeInteger(n) && n > 0) || !Array.isArray(p.message_sha256) || p.message_sha256.length !== p.source_rows.length || !p.message_sha256.every(hash)) return null;
  const model = typeof p.model_text === "string" ? p.model_text.trim() : "";
  if (!model || model.length > 120 || /[<>\x00-\x1f]|https?:|instructions?|system\s*prompt|ignore\s+previous/i.test(model)) return null;
  return { id: f[F.key], kind: "booking_confirmation", occurredAt: p.service_date, title: `ยืนยันจองเดิม · ${model}`, statusLabel: "มีใบยืนยันจอง", detail: "หลักฐานเดิม ยังไม่ยืนยันว่าใช้บริการเสร็จแล้ว", model, source: "original_booking_confirmation", completionProven: false };
}

export function mergeOriginalBookingEvidence(existing = [], evidence = []) {
  const seen = new Set();
  return [...existing, ...evidence].filter(item => { if (!item || !item.id || seen.has(item.id)) return false; seen.add(item.id); return true; }).sort((a, b) => String(b.occurredAt || b.date || "").localeCompare(String(a.occurredAt || a.date || "")));
}

export async function readOriginalBookingEvidence(env = {}, clientId = "", fetchImpl = null) {
  if (!recordId(clientId) || !env.AIRTABLE_API_KEY || !/^app[A-Za-z0-9]{14}$/.test(env.AIRTABLE_BASE_ID || "")) return unavailable();
  const get = async (table, suffix = "", params = {}) => {
    const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}${suffix}`);
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const [key, value] of Object.entries(params)) { if (Array.isArray(value)) for (const v of value) url.searchParams.append(key, v); else url.searchParams.set(key, value); }
    // Workers rejects redirect:"error". Expose redirects without following
    // Location; the non-2xx guard below rejects them before reading evidence.
    const req = new Request(url, { method: "GET", redirect: "manual", headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    const response = fetchImpl ? await fetchImpl(req) : env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
    if (!response.ok) throw Error("source_unavailable");
    return response.json();
  };
  try {
    const client = await get(CLIENTS, `/${clientId}`, { "fields[]": [BACKLINK] });
    if (client.id !== clientId) return unavailable();
    const linked = ids(client.fields?.[BACKLINK]);
    if (linked.some(id => !recordId(id)) || new Set(linked).size !== linked.length || linked.length > 200) return unavailable();
    if (!linked.length) return { state: "resolved", items: [] };
    const rows = [];
    for (let start = 0; start < linked.length; start += 50) {
      const chunk = linked.slice(start, start + 50);
      const result = await get(EVIDENCE, "", { filterByFormula: `OR(${chunk.map(id => `RECORD_ID()='${id}'`).join(",")})`, "fields[]": Object.values(F), pageSize: "100" });
      if (!Array.isArray(result.records) || result.records.length !== chunk.length || result.offset || result.records.some(row => !chunk.includes(row.id)) || new Set(result.records.map(row => row.id)).size !== result.records.length) return unavailable();
      rows.push(...result.records);
    }
    // A repeated key or conflicting linked identity invalidates the whole snapshot.
    const seen = new Set(); const items = [];
    for (const row of rows) {
      const item = projectOriginalBookingEvidence(row, clientId);
      if (!item) continue;
      if (seen.has(item.id)) return unavailable();
      seen.add(item.id); items.push(item);
    }
    return { state: "resolved", items: mergeOriginalBookingEvidence([], items) };
  } catch { return unavailable(); }
}

export function bookingEvidenceAdvisory(value = {}) {
  return { state: value.state || "unavailable", context_only: true, may_claim_completed: false, may_assume_availability: false, may_grant_access: false, may_quote_rate: false, items: Array.isArray(value.items) ? value.items.slice(0, 100).map(({ model, occurredAt }) => ({ model_label: model, service_date: occurredAt, evidence_type: "original_booking_confirmation" })) : [] };
}
