// Read-only owner evidence. Never creates identity, entitlement, payment or points.
export const OWNER_MEMBERSHIP_AUTHORITY = "owner_per_rename_membership_context_v1";
const MONTHS = ["มกราคม|มค", "กุมภาพันธ์|กพ", "มีนาคม|มีค", "เมษายน|เมย", "พฤษภาคม|พค", "มิถุนายน|มิย", "กรกฎาคม|กค", "สิงหาคม|สค", "กันยายน|กย", "ตุลาคม|ตค", "พฤศจิกายน|พย", "ธันวาคม|ธค"];
const monthMap = new Map(MONTHS.flatMap((names, index) => names.split("|").map(name => [name, index + 1])));
// Specific owner-confirmed display facts; no universal x2/tier-duration inference.
const ACCOUNT_FACTS = Object.freeze({
  U96f8216d8644acc6a7ae566cd5609842: { start_date: "2025-08-25", years: 1, source: "owner_confirmed_20261004_090613" },
  Ua379e5257fed424d57ecde5add22c0fb: { expiry_date: "2028-10-03", source: "owner_confirmed_eak94_expiry" },
});
export function parsePerRenameStartDate(name) {
  const value = String(name || "").normalize("NFKC").replace(/\./g, "").trim();
  if ([...value.matchAll(/(?:^|\s)\d{1,2}\s*[ก-๙]+\s*(?:\d{4}|\d{2})(?=\s|$)/g)].length !== 1) return null;
  const match = value.match(/(?:^|\s)(\d{1,2})\s*([ก-๙]+)\s*(\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]), month = monthMap.get(match[2]);
  const rawYear = Number(match[3]);
  const year = match[3].length === 2 ? 2500 + rawYear - 543 : rawYear >= 2400 ? rawYear - 543 : rawYear;
  if (!month || year < 2000 || year > 2100) return null;
  const iso = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0,10) === iso ? iso : null;
}
export function membershipExpiryFromStart(startDate, years) {
  if (![1,2,3].includes(years) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) return null;
  const date = new Date(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== startDate) return null;
  const targetYear = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
  // Calendar anniversary, clamped for Feb 29; entitlement ends the prior day.
  const anniversary = Date.UTC(targetYear, month, Math.min(date.getUTCDate(), lastDay));
  return new Date(anniversary - 86400000).toISOString().slice(0,10);
}
export function projectOwnerMembershipContext({ lineUserId, clients = [], staging = [], now = Date.now() } = {}) {
  const matches = clients.filter(row => row.fields?.line_user_id === lineUserId);
  if (matches.length !== 1 || !/^U[a-f0-9]{32}$/i.test(lineUserId || "")) return null;
  const rows = staging.filter(row => {
    const f = row.fields || {};
    return f["LINE User ID"] === lineUserId && f["Import ID"] === `line_ofc_per_rename_v1_${lineUserId.toLowerCase()}`
      && typeof f["Current LINE Rename"] === "string" && f["Current LINE Rename"].trim()
      && /^[a-f0-9]{64}$/i.test(f["Source Hash"] || "")
      && Array.isArray(f["Canonical Client"]) && f["Canonical Client"].length === 1 && f["Canonical Client"][0] === matches[0].id
      && Number.isFinite(Date.parse(f["Imported At"])) && Date.parse(f["Imported At"]) <= now;
  });
  // Import timestamps are import freshness, not proof that a rename is latest.
  // Multiple evidence rows fail closed rather than selecting a later import.
  if (rows.length !== 1) return null;
  const f = rows[0].fields, start = parsePerRenameStartDate(f["Current LINE Rename"]);
  const tierMatch = f["Current LINE Rename"].match(/(?:^|\s)(SVIP|VIP)(?=\s|$)/i);
  const level = tierMatch ? tierMatch[1].toLowerCase() : "unknown";
  const fact = ACCOUNT_FACTS[lineUserId];
  let expiry = "", provenance = "", conflict = "";
  if (fact?.expiry_date) { expiry = fact.expiry_date; provenance = fact.source; }
  else if (fact?.years) {
    if (start === fact.start_date) { expiry = membershipExpiryFromStart(start, fact.years); provenance = fact.source; }
    else conflict = "owner_confirmed_start_conflicts_with_per_rename";
  } else if (["vip","svip"].includes(level)) { expiry = "2028-07-31"; provenance = "owner_existing_vip_svip_expiry_20261004_090704"; }
  const expireAt = expiry ? `${expiry}T16:59:59.999Z` : "";
  return { authority: OWNER_MEMBERSHIP_AUTHORITY, membership_known: true, canonical_sync: "pending",
    status: expireAt ? "owner_confirmed_expiry" : "known_member_pending_sync",
    start_date: start, expire_at: expireAt, level, lifecycle: expireAt ? (Date.parse(expireAt) < now ? "expired" : "active") : "unknown",
    source_record_id: rows[0].id, source_imported_at: f["Imported At"], expiry_source: provenance,
    source_freshness: "import_timestamp_only", conflict: conflict || "", access_verified: false };
}
export async function readKenjiOwnerMembershipContext(env, lineUserId) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !/^U[a-f0-9]{32}$/i.test(lineUserId || "")) return null;
  const read = async (table, field, fields) => {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
    url.searchParams.set("filterByFormula", `{${field}}="${lineUserId}"`);
    url.searchParams.set("maxRecords", "4");
    for (const name of fields) url.searchParams.append("fields[]", name);
    const request = new Request(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` }, signal: AbortSignal.timeout(900) });
    const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
    if (!response.ok) throw new Error("owner_context_unavailable");
    const body = await response.json();
    if (!Array.isArray(body.records) || body.offset || body.records.length >= 4) throw new Error("owner_context_ambiguous");
    return body.records;
  };
  try {
    const [clients, staging] = await Promise.all([
      read("tblVv58TCbwh5j1fS", "line_user_id", ["line_user_id"]),
      read("tblOs8yyLK09SKrCt", "LINE User ID", ["Import ID", "LINE User ID", "Current LINE Rename", "Source Hash", "Imported At", "Canonical Client"]),
    ]);
    return projectOwnerMembershipContext({ lineUserId, clients, staging });
  } catch { return null; }
}
