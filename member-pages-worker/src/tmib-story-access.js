import { handleMemberAppApi, normalizeLevel, readMemberAppSession } from "./member-app-api.js";

const ROOT = "/member/api/liff/tmib/episodes/act-001";
const EPISODE_ID = "act-001";
const PRICE_THB = 299;
const PACKAGE_CODE = "tmib_act_001";
const PAYMENT_STAGE = "tmib_story";
const MEDIA_TTL_SECONDS = 5 * 60;
const AIRTABLE_API = "https://api.airtable.com/v0";
const PAYMENTS_TABLE_DEFAULT = "tblWGGJJOx5eBvBZJ";
const FRAMES = Array.from({ length: 17 }, (_, index) => String(index + 4).padStart(2, "0"));
const MEMBER_LEVELS = new Set(["public_member", "elite", "red_card", "standard", "premium", "vip", "svip", "black_card"]);

function clean(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(payload, status = 200, headers = {}) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, noarchive, nosnippet, noimageindex",
      "x-mmd-tmib-story": "v1",
      ...headers,
    },
  });
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || ""))));
}

function timingSafeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function secretFor(env) {
  return clean(env.TMIB_MEDIA_SIGNING_SECRET || env.LIFF_SESSION_SECRET, 8192);
}

async function userKey(env, lineUserId) {
  const secret = secretFor(env);
  if (secret.length < 32) return "";
  return hmacHex(secret, `tmib-user:${lineUserId}`);
}

function entitlementKey(hash) {
  return `tmib:episode:${EPISODE_ID}:user:${hash}`;
}

function canonicalPurchaseSession(hash) {
  return `tmib_${EPISODE_ID.replace(/[^a-z0-9]/g, "")}_${hash.slice(0, 32)}`;
}

function memberRequest(request) {
  const url = new URL(request.url);
  url.pathname = "/api/member/app/membership";
  url.search = "";
  return new Request(url, { method: "GET", headers: request.headers });
}

export function membershipGrantsTmib(membership) {
  if (!membership || typeof membership !== "object") return false;
  const level = normalizeLevel(membership.level);
  const status = clean(membership.status, 64).toLowerCase();
  const lifecycle = clean(membership.lifecycle, 64).toLowerCase();
  const access = clean(membership.access, 64).toLowerCase();
  return membership.levelVerified === true
    && membership.displayOnly !== true
    && MEMBER_LEVELS.has(level)
    && ["active", "grace"].includes(status)
    && lifecycle === "active"
    && access !== "restricted";
}

async function resolveMembership(request, env) {
  try {
    const response = await handleMemberAppApi(memberRequest(request), env);
    if (!response.ok) return null;
    const membership = await response.json().catch(() => null);
    return membershipGrantsTmib(membership) ? membership : null;
  } catch {
    return null;
  }
}

function first(fields, keys) {
  for (const key of keys) {
    const value = fields?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findPaymentByRef(env, paymentRef) {
  const token = clean(env.AIRTABLE_API_KEY, 8192);
  const base = clean(env.AIRTABLE_BASE_ID, 200);
  const table = clean(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || PAYMENTS_TABLE_DEFAULT, 200);
  if (!token || !base || !table || !paymentRef) return null;
  for (const field of ["payment_ref", "Payment Reference"]) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
    url.searchParams.set("maxRecords", "1");
    url.searchParams.set("filterByFormula", `{${field}}='${formulaValue(paymentRef)}'`);
    const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (response.status === 422) continue;
    if (!response.ok) return null;
    if (Array.isArray(payload?.records) && payload.records[0]) return payload.records[0];
  }
  return null;
}

export function paymentGrantsTmib(record) {
  const fields = record?.fields && typeof record.fields === "object" ? record.fields : {};
  const paymentStatus = clean(first(fields, ["Payment Status", "payment_status", "status"]), 80).toLowerCase();
  const verification = clean(first(fields, ["Verification Status", "verification_status"]), 80).toLowerCase();
  const packageCode = clean(first(fields, ["package_code", "Package Code", "package"]), 120).toLowerCase();
  const amount = Number(String(first(fields, ["amount_thb", "amount", "Amount", "Amount THB"]) ?? "").replace(/,/g, ""));
  const notes = clean(first(fields, ["notes", "Notes"]), 4000).toLowerCase();
  const stage = clean(first(fields, ["payment_stage", "payment_type", "stage"]), 80).toLowerCase()
    || clean((notes.match(/stage=([^;\n]+)/i) || [])[1], 80).toLowerCase();
  return ["paid", "completed", "success"].includes(paymentStatus)
    && ["verified", "approved"].includes(verification)
    && packageCode === PACKAGE_CODE
    && amount === PRICE_THB
    && stage === PAYMENT_STAGE;
}

function sameOrigin(request) {
  const origin = clean(request.headers.get("origin"), 400).toLowerCase();
  if (!origin) return false;
  return origin === "https://mmdbkk.com" || origin === "https://www.mmdbkk.com";
}

function canonicalPayUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.hostname !== "mmdbkk.com" || url.pathname !== "/sigil/pay" || url.hash) return "";
    const keys = [...url.searchParams.keys()];
    if (keys.some((key) => key !== "t") || !clean(url.searchParams.get("t"), 8192)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function paymentIntent(env, sessionId) {
  if (!env.PAYMENTS_WORKER?.fetch) return null;
  const response = await env.PAYMENTS_WORKER.fetch(new Request("https://payments.internal/v1/pay/verify", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-mmd-source": "tmib-story-access",
    },
    body: JSON.stringify({
      session_id: sessionId,
      payment_stage: PAYMENT_STAGE,
      amount: PRICE_THB,
      package_code: PACKAGE_CODE,
      payment_method: "promptpay",
    }),
  }));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) return null;
  const paymentRef = clean(payload.payment_ref || payload.transaction_ref, 220);
  const paymentUrl = canonicalPayUrl(payload.customer_payment_url);
  if (!paymentRef || !paymentUrl) return null;
  return { paymentRef, paymentUrl, sessionId };
}

async function readStoredGrant(env, hash) {
  if (!env.LIFF_IDENTITY_KV?.get) return null;
  return env.LIFF_IDENTITY_KV.get(entitlementKey(hash), "json").catch(() => null);
}

async function storeGrant(env, hash, data) {
  if (!env.LIFF_IDENTITY_KV?.put) return false;
  await env.LIFF_IDENTITY_KV.put(entitlementKey(hash), JSON.stringify(data));
  return true;
}

async function resolveEpisodeAccess(request, env, session, hash) {
  const stored = await readStoredGrant(env, hash);
  if (stored?.state === "granted") return { granted: true, source: "episode_purchase", paymentRef: clean(stored.payment_ref, 220) || null };

  const membership = await resolveMembership(request, env);
  if (membership) return { granted: true, source: "membership", level: normalizeLevel(membership.level) };

  if (stored?.state === "pending" && clean(stored.payment_ref, 220)) {
    const record = await findPaymentByRef(env, clean(stored.payment_ref, 220));
    if (paymentGrantsTmib(record)) {
      await storeGrant(env, hash, {
        state: "granted",
        payment_ref: clean(stored.payment_ref, 220),
        granted_at: new Date().toISOString(),
        source: "verified_payment",
      });
      return { granted: true, source: "episode_purchase", paymentRef: clean(stored.payment_ref, 220) };
    }
  }
  return { granted: false };
}

async function mediaMap(env, hash) {
  const secret = secretFor(env);
  const exp = Math.floor(Date.now() / 1000) + MEDIA_TTL_SECONDS;
  const media = {};
  for (const frame of FRAMES) {
    const sig = await hmacHex(secret, `tmib-media:${EPISODE_ID}:${frame}:${exp}:${hash}`);
    media[frame] = `${ROOT}/media/${frame}?exp=${exp}&sig=${sig}`;
  }
  return { media, expiresAt: new Date(exp * 1000).toISOString() };
}

async function handleAccess(request, env) {
  const session = await readMemberAppSession(request, env);
  if (!session?.lineUserId) return json({ ok: false, granted: false, error: { code: "LINE_SESSION_REQUIRED" } }, 401);
  const hash = await userKey(env, session.lineUserId);
  if (!hash) return json({ ok: false, granted: false, error: { code: "TMIB_SIGNING_UNAVAILABLE" } }, 503);
  const access = await resolveEpisodeAccess(request, env, session, hash);
  if (!access.granted) return json({ ok: true, granted: false, episode_id: EPISODE_ID, price_thb: PRICE_THB });
  const signed = await mediaMap(env, hash);
  return json({
    ok: true,
    granted: true,
    episode_id: EPISODE_ID,
    access_source: access.source,
    watermark: `MMD PRIVATE · ${hash.slice(0, 10).toUpperCase()}`,
    media_expires_at: signed.expiresAt,
    media: signed.media,
  });
}

async function handlePurchase(request, env) {
  if (!sameOrigin(request)) return json({ ok: false, error: { code: "SAME_ORIGIN_REQUIRED" } }, 403);
  const session = await readMemberAppSession(request, env);
  if (!session?.lineUserId) return json({ ok: false, error: { code: "LINE_SESSION_REQUIRED" } }, 401);
  const hash = await userKey(env, session.lineUserId);
  if (!hash) return json({ ok: false, error: { code: "TMIB_SIGNING_UNAVAILABLE" } }, 503);
  const existing = await resolveEpisodeAccess(request, env, session, hash);
  if (existing.granted) return json({ ok: true, already_granted: true, episode_id: EPISODE_ID, redirect_to: "/tmib/act-001" });
  const intent = await paymentIntent(env, canonicalPurchaseSession(hash));
  if (!intent) return json({ ok: false, error: { code: "PAYMENT_INTENT_UNAVAILABLE" } }, 503);
  await storeGrant(env, hash, {
    state: "pending",
    payment_ref: intent.paymentRef,
    payment_session_id: intent.sessionId,
    amount_thb: PRICE_THB,
    package_code: PACKAGE_CODE,
    created_at: new Date().toISOString(),
  });
  return json({
    ok: true,
    episode_id: EPISODE_ID,
    amount_thb: PRICE_THB,
    payment_ref: intent.paymentRef,
    redirect_to: intent.paymentUrl,
    customer_payment_url: intent.paymentUrl,
  });
}

async function handleMedia(request, env, frame) {
  if (!FRAMES.includes(frame)) return json({ ok: false, error: { code: "FRAME_NOT_FOUND" } }, 404);
  const session = await readMemberAppSession(request, env);
  if (!session?.lineUserId) return json({ ok: false, error: { code: "LINE_SESSION_REQUIRED" } }, 401);
  const hash = await userKey(env, session.lineUserId);
  const url = new URL(request.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = clean(url.searchParams.get("sig"), 128);
  const now = Math.floor(Date.now() / 1000);
  if (!hash || !Number.isInteger(exp) || exp < now || exp > now + MEDIA_TTL_SECONDS + 30 || !/^[a-f0-9]{64}$/.test(sig)) {
    return json({ ok: false, error: { code: "MEDIA_TOKEN_INVALID" } }, 403);
  }
  const expected = await hmacHex(secretFor(env), `tmib-media:${EPISODE_ID}:${frame}:${exp}:${hash}`);
  if (!timingSafeEqual(sig, expected)) return json({ ok: false, error: { code: "MEDIA_TOKEN_INVALID" } }, 403);
  const bucket = env.MMD_MODEL_ASSETS;
  if (!bucket?.get) return json({ ok: false, error: { code: "TMIB_MEDIA_STORAGE_UNAVAILABLE" } }, 503);
  const object = await bucket.get(`tmib/${EPISODE_ID}/${frame}.webp`);
  if (!object) return json({ ok: false, error: { code: "TMIB_MEDIA_NOT_SEEDED", frame } }, 503);
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("content-type", headers.get("content-type") || "image/webp");
  headers.set("cache-control", "private, max-age=60, no-store");
  headers.set("content-disposition", `inline; filename="tmib-${EPISODE_ID}-${frame}.webp"`);
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-robots-tag", "noindex, noarchive, nosnippet, noimageindex");
  headers.set("x-mmd-tmib-story", "media-v1");
  return new Response(object.body, { status: 200, headers });
}

export function isTmibStoryAccessPath(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const path = normalizePath(url.pathname);
  return path === `${ROOT}/access`
    || path === `${ROOT}/purchase`
    || path.startsWith(`${ROOT}/media/`);
}

export async function handleTmibStoryAccess(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (path === `${ROOT}/access`) {
    if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "GET" });
    return handleAccess(request, env);
  }
  if (path === `${ROOT}/purchase`) {
    if (request.method !== "POST") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "POST" });
    return handlePurchase(request, env);
  }
  if (path.startsWith(`${ROOT}/media/`)) {
    if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "GET" });
    return handleMedia(request, env, clean(path.slice(`${ROOT}/media/`.length), 8));
  }
  return json({ ok: false, error: { code: "TMIB_ROUTE_NOT_FOUND" } }, 404);
}

export const TMIB_STORY_INTERNALS = Object.freeze({
  EPISODE_ID,
  PRICE_THB,
  PACKAGE_CODE,
  PAYMENT_STAGE,
  ROOT,
  FRAMES,
  paymentGrantsTmib,
  membershipGrantsTmib,
});
