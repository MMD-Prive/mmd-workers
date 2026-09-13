const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const CLIENT_CREDITS_TABLE = "tblKvhl2zZm9yYBmT";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const ROUTE = "/api/member/app/credits";
const ACTIVE_STATUSES = new Set(["available", "partially_used"]);

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function normalized(value) {
  return clean(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
}
function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function response(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store", "x-mmd-member-app-api": "v1" } });
}
function cookieValue(request, name) {
  const raw = String(request.headers.get("cookie") || "");
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}
async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function readVerifiedSession(request, env = {}) {
  const token = cookieValue(request, SESSION_COOKIE);
  const secret = clean(env.LIFF_SESSION_SECRET, 1000);
  const store = env.LIFF_IDENTITY_KV;
  if (!token || secret.length < 32 || !store?.get) return null;
  try {
    const hash = await hmacHex(secret, `session:${token}`);
    const session = await store.get(`liff:session:${hash}`, "json");
    if (!session || Number(session.expires_at || 0) <= Date.now()) return null;
    const lineUserId = clean(session.line_user_id, 160);
    if (!/^U[a-f0-9]{32}$/i.test(lineUserId)) return null;
    return { lineUserId };
  } catch {
    return null;
  }
}
function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
async function fetchAirtablePage(env, tableId, query = {}) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 40) || DEFAULT_BASE_ID;
  if (!token || !baseId) throw new Error("AIRTABLE_CONFIG_MISSING");
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const timeoutMs = Math.max(1500, Math.min(12000, Number(env.AIRTABLE_REQUEST_TIMEOUT_MS || 10000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetch(url.toString(), { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: controller.signal });
    const payload = await result.json().catch(() => null);
    if (!result.ok || !payload || !Array.isArray(payload.records)) throw new Error(`AIRTABLE_${result.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}
async function listAirtable(env, tableId, query = {}) {
  const records = [];
  let offset = "";
  do {
    const payload = await fetchAirtablePage(env, tableId, { ...query, ...(offset ? { offset } : {}) });
    records.push(...payload.records);
    offset = clean(payload.offset, 300);
  } while (offset);
  return records;
}
async function resolveCanonicalClient(env, lineUserId) {
  const records = await listAirtable(env, CLIENTS_TABLE, { pageSize: 3, filterByFormula: `{line_user_id}=${formulaString(lineUserId)}` });
  if (records.length !== 1) return { state: records.length === 0 ? "unresolved" : "ambiguous", clientId: null };
  const clientId = clean(records[0]?.id, 40);
  return /^rec[A-Za-z0-9]{14}$/.test(clientId) ? { state: "resolved", clientId } : { state: "unresolved", clientId: null };
}
function safeCredit(record) {
  const fields = record?.fields && typeof record.fields === "object" ? record.fields : {};
  const status = normalized(fields.Status) || "unknown";
  return {
    creditId: clean(fields.credit_id, 120) || null,
    status,
    reason: normalized(fields.Reason) || "other",
    originalAmountThb: Math.max(0, asNumber(fields["Original Amount THB"]) || 0),
    availableAmountThb: Math.max(0, asNumber(fields["Available Amount THB"]) || 0),
    appliedAmountThb: Math.max(0, asNumber(fields["Applied Amount THB"]) || 0),
    refundable: fields.Refundable === true,
    note: clean(fields["Customer Display Note"], 500) || null,
    createdAt: clean(fields["Created At"], 80) || null,
  };
}
async function readCredits(env, clientId) {
  const records = await listAirtable(env, CLIENT_CREDITS_TABLE, { pageSize: 100, filterByFormula: `{client_record_id}=${formulaString(clientId)}` });
  const items = records.map(safeCredit)
    .filter((item) => ["available", "partially_used", "used", "refunded"].includes(item.status))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const availableBalanceThb = items.filter((item) => ACTIVE_STATUSES.has(item.status)).reduce((sum, item) => sum + item.availableAmountThb, 0);
  return { items, availableBalanceThb };
}
export function isMemberClientCreditsRequest(request) {
  try {
    const path = new URL(request.url).pathname;
    return path === ROUTE || path === `${ROUTE}/`;
  } catch {
    return false;
  }
}
export async function handleMemberClientCredits(request, env = {}) {
  if (request.method !== "GET") return response({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET required." } }, 405);
  const session = await readVerifiedSession(request, env);
  if (!session) return response({ ok: false, error: { code: "MEMBER_SESSION_REQUIRED", message: "Verified member session required." } }, 401);
  try {
    const client = await resolveCanonicalClient(env, session.lineUserId);
    if (client.state !== "resolved") {
      return response({ state: "checking", balance: null, items: [], error: { code: client.state === "ambiguous" ? "CLIENT_IDENTITY_AMBIGUOUS" : "CLIENT_IDENTITY_UNRESOLVED" } }, 503);
    }
    const credits = await readCredits(env, client.clientId);
    return response({ state: "resolved", balance: { currency: "THB", available: credits.availableBalanceThb }, items: credits.items });
  } catch {
    return response({ state: "checking", balance: null, items: [], error: { code: "CLIENT_CREDIT_READ_UNAVAILABLE" } }, 503);
  }
}
