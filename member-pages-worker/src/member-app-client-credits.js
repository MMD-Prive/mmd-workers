const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const CLIENT_CREDITS_TABLE = "tblKvhl2zZm9yYBmT";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const ROUTE = "/api/member/app/credits";
const ACTIVE_STATUSES = new Set(["available", "partially_used"]);
const VERIFIED_CREDIT_STATUS = "verified";
const VERIFIED_CREDIT_SOURCE = "payment_authority";
const CAMPAIGN_CREDIT_SOURCE = "campaign_worker";
const DOUBLE_MOMENT_CAMPAIGN = "promo_double_moment_sep2026";
const DOUBLE_MOMENT_PAID_AMOUNT = 20000;
const DOUBLE_MOMENT_BONUS_AMOUNT = 3500;
const DOUBLE_MOMENT_MINIMUM_SERVICE = 20000;
const MONEY_TOLERANCE = 0.001;

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
function creditFields(record) {
  return record?.fields && typeof record.fields === "object" ? record.fields : {};
}
export function isVerifiedClientCreditRecord(record) {
  const fields = creditFields(record);
  const verificationStatus = normalized(fields["Verification Status"]);
  const verificationSource = normalized(fields["Verification Source"]);
  const creditAuthority = normalized(fields["Credit Authority"]) || verificationSource;
  const creditType = normalized(fields["Credit Type"]) || "carried_forward_deposit";
  const campaignId = clean(fields["Campaign ID"], 120);
  const campaignClaimId = clean(fields["Campaign Claim ID"], 160);
  const policyVersion = clean(fields["Policy Version"], 80);
  const verifiedAmount = Math.max(0, asNumber(fields["Verified Amount THB"]) || 0);
  const backingPaymentAmount = Math.max(0, asNumber(fields["Backing Payment Amount THB"]) || 0);
  const originalAmount = Math.max(0, asNumber(fields["Original Amount THB"]) || 0);
  const availableAmount = Math.max(0, asNumber(fields["Available Amount THB"]) || 0);
  const appliedAmount = Math.max(0, asNumber(fields["Applied Amount THB"]) || 0);
  const reservedAmount = Math.max(0, asNumber(fields["Reserved Amount THB"]) || 0);
  const bonusSequence = asNumber(fields["Bonus Sequence"]);
  const minimumServiceAmount = Math.max(0, asNumber(fields["Minimum Service Amount THB"]) || 0);
  const amountsValid = originalAmount > 0
    && availableAmount <= originalAmount + MONEY_TOLERANCE
    && appliedAmount <= originalAmount + MONEY_TOLERANCE
    && reservedAmount <= originalAmount + MONEY_TOLERANCE
    && availableAmount + appliedAmount + reservedAmount <= originalAmount + MONEY_TOLERANCE;

  if (verificationStatus !== VERIFIED_CREDIT_STATUS || !amountsValid) return false;

  if (creditType === "bonus_credit") {
    return creditAuthority === CAMPAIGN_CREDIT_SOURCE
      && verificationSource === VERIFIED_CREDIT_SOURCE
      && campaignId === DOUBLE_MOMENT_CAMPAIGN
      && campaignClaimId.length > 0
      && policyVersion === "v1"
      && originalAmount === DOUBLE_MOMENT_BONUS_AMOUNT
      && backingPaymentAmount + MONEY_TOLERANCE >= DOUBLE_MOMENT_PAID_AMOUNT
      && [1, 2].includes(bonusSequence)
      && minimumServiceAmount === DOUBLE_MOMENT_MINIMUM_SERVICE;
  }

  return creditAuthority === VERIFIED_CREDIT_SOURCE
    && verificationSource === VERIFIED_CREDIT_SOURCE
    && verifiedAmount + MONEY_TOLERANCE >= originalAmount;
}
function safeCredit(record, now) {
  const fields = creditFields(record);
  let status = normalized(fields.Status) || "unknown";
  const expiryValue = clean(fields["Expires At"], 80);
  const expiryMs = expiryValue ? Date.parse(expiryValue) : null;
  const hasInvalidExpiry = !!expiryValue && !Number.isFinite(expiryMs);
  if (ACTIVE_STATUSES.has(status)) {
    if (hasInvalidExpiry) status = "unknown";
    else if (expiryMs !== null && now > expiryMs) status = "expired";
  }
  const creditType = normalized(fields["Credit Type"]) || null;
  // A historical carry-forward record can be legitimate without carrying the
  // modern cancellation deadline. Do not infer a cancellation-specific notice
  // until the live record provides one valid, customer-safe expiry.
  const isCancellationCarry = Number.isFinite(expiryMs)
    && creditType === "carried_forward_deposit"
    && ["client_cancel_no_penalty", "client_cancel_gt_48h"].includes(normalized(fields.Reason));
  return {
    creditId: clean(fields.credit_id, 120) || null,
    status,
    verified: true,
    verificationState: VERIFIED_CREDIT_STATUS,
    verificationStatus: VERIFIED_CREDIT_STATUS,
    verifiedAmountThb: Math.max(0, asNumber(fields["Verified Amount THB"]) || 0),
    creditType,
    expiresAt: Number.isFinite(expiryMs) ? new Date(expiryMs).toISOString() : null,
    expiryState: hasInvalidExpiry ? "checking" : expiryMs === null ? "not_set" : "confirmed",
    noticeType: isCancellationCarry ? "cancelled_deposit_credit" : null,
    originalAmountThb: Math.max(0, asNumber(fields["Original Amount THB"]) || 0),
    availableAmountThb: ACTIVE_STATUSES.has(status) ? Math.max(0, asNumber(fields["Available Amount THB"]) || 0) : 0,
    appliedAmountThb: Math.max(0, asNumber(fields["Applied Amount THB"]) || 0),
    reservedAmountThb: Math.max(0, asNumber(fields["Reserved Amount THB"]) || 0),
    creditType: normalized(fields["Credit Type"]) || "carried_forward_deposit",
    campaignId: clean(fields["Campaign ID"], 120) || null,
    bonusSequence: asNumber(fields["Bonus Sequence"]),
    minimumServiceAmountThb: Math.max(0, asNumber(fields["Minimum Service Amount THB"]) || 0),
    issuedAt: clean(fields["Issued At"], 80) || clean(fields["Created At"], 80) || null,
    expiresAt: clean(fields["Expires At"], 80) || null,
    refundable: fields.Refundable === true,
    note: clean(fields["Customer Display Note"], 500) || null,
    customerDisplayNote: clean(fields["Customer Display Note"], 500) || null,
    createdAt: clean(fields["Created At"], 80) || null,
  };
}
export function verifiedCreditsFromRecords(records = [], now = Date.now()) {
  const items = records
    .filter(isVerifiedClientCreditRecord)
    .map((record) => safeCredit(record, now))
    .filter((item) => ["available", "partially_used", "used", "refunded", "expired", "unknown"].includes(item.status))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const availableBalanceThb = items
    .filter((item) => item.verified === true && ACTIVE_STATUSES.has(item.status))
    .reduce((sum, item) => sum + item.availableAmountThb, 0);
  const buckets = items
    .filter((item) => item.verified === true && ACTIVE_STATUSES.has(item.status))
    .reduce((summary, item) => {
      if (item.creditType === "paid_credit") summary.paidAvailableThb += item.availableAmountThb;
      else if (item.creditType === "bonus_credit") summary.bonusAvailableThb += item.availableAmountThb;
      else summary.carriedForwardAvailableThb += item.availableAmountThb;
      return summary;
    }, { paidAvailableThb: 0, bonusAvailableThb: 0, carriedForwardAvailableThb: 0 });
  return { items, availableBalanceThb, buckets };
}
async function readCredits(env, clientId) {
  const records = await listAirtable(env, CLIENT_CREDITS_TABLE, { pageSize: 100, filterByFormula: `{client_record_id}=${formulaString(clientId)}` });
  return verifiedCreditsFromRecords(records);
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
    return response({
      state: "resolved",
      verificationState: "verified_only",
      balance: { currency: "THB", available: credits.availableBalanceThb, ...credits.buckets },
      items: credits.items,
    });
  } catch {
    return response({ state: "checking", balance: null, items: [], error: { code: "CLIENT_CREDIT_READ_UNAVAILABLE" } }, 503);
  }
}
