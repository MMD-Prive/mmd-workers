import { handleMemberAppApi, normalizeLevel, readMemberAppSession } from "./member-app-api.js";
import {
  TMIB_EPISODE_CATALOG,
  getTmibEpisode,
  normalizeTmibEpisodeId,
  publicTmibEpisodeMetadata,
} from "./tmib-episode-catalog.js";

const API_ROOT = "/member/api/liff/tmib/episodes";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const REMEMBERED_LOGIN_COOKIE = "__Host-mmd_liff_remember";
const MEDIA_TTL_SECONDS = 5 * 60;
const AIRTABLE_API = "https://api.airtable.com/v0";
const PAYMENTS_TABLE_DEFAULT = "tblWGGJJOx5eBvBZJ";
const MEMBER_LEVELS = new Set(["public_member", "elite", "red_card", "standard", "premium", "vip", "svip", "black_card"]);
const ACT_001 = getTmibEpisode("act-001");

function clean(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function episodeRoot(episode) {
  return `${API_ROOT}/${episode.id}`;
}

function parseRoute(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const path = normalizePath(url.pathname);
  const prefix = `${API_ROOT}/`;
  if (!path.startsWith(prefix)) return null;
  const parts = path.slice(prefix.length).split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const episodeId = normalizeTmibEpisodeId(parts[0]);
  if (!episodeId) return null;
  const action = parts[1];
  if (["catalog", "access", "purchase"].includes(action) && parts.length === 2) {
    return { episodeId, action, detail: "" };
  }
  if (action === "media" && parts.length === 3) {
    return { episodeId, action, detail: clean(parts[2], 16) };
  }
  return null;
}

function json(payload, status = 200, headers = {}, setCookies = []) {
  const responseHeaders = new Headers({
    "cache-control": "no-store, private",
    "x-robots-tag": "noindex, noarchive, nosnippet, noimageindex",
    "x-mmd-tmib-story": "v2",
    ...headers,
  });
  appendSetCookies(responseHeaders, setCookies);
  return Response.json(payload, { status, headers: responseHeaders });
}

function setCookiesFrom(response) {
  if (typeof response?.headers?.getSetCookie === "function") return response.headers.getSetCookie();
  const value = response?.headers?.get("set-cookie");
  return value ? [value] : [];
}

function appendSetCookies(headers, cookies = []) {
  for (const cookie of cookies) {
    if (cookie) headers.append("set-cookie", String(cookie));
  }
}

function sessionCookiePair(cookies = []) {
  for (const cookie of cookies) {
    const pair = String(cookie || "").split(";", 1)[0].trim();
    if (pair.startsWith(SESSION_COOKIE + "=") && pair.slice(SESSION_COOKIE.length + 1)) return pair;
  }
  return "";
}

function requestWithSessionCookie(request, pair) {
  const headers = new Headers(request.headers);
  const entries = String(headers.get("cookie") || "").split(";").map((item) => item.trim()).filter(Boolean)
    .filter((item) => item.slice(0, item.indexOf("=")).trim() !== SESSION_COOKIE);
  entries.push(pair);
  headers.set("cookie", entries.join("; "));
  return new Request(request, { headers });
}

function mergeSetCookies(...groups) {
  const byCookieName = new Map();
  for (const cookie of groups.flat()) {
    const value = String(cookie || "").trim();
    const pair = value.split(";", 1)[0];
    const index = pair.indexOf("=");
    if (index > 0) byCookieName.set(pair.slice(0, index), value);
  }
  return [...byCookieName.values()];
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

function entitlementKey(episode, hash) {
  return `tmib:episode:${episode.id}:user:${hash}`;
}

function canonicalPurchaseSession(episode, hash) {
  return `tmib_${episode.id.replace(/[^a-z0-9]/g, "")}_${hash.slice(0, 32)}`;
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

function cookieValue(request, name) {
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

async function resolveMembership(request, env) {
  try {
    const response = await handleMemberAppApi(memberRequest(request), env);
    const payload = response.ok ? await response.json().catch(() => null) : null;
    return {
      membership: membershipGrantsTmib(payload) ? payload : null,
      cookies: setCookiesFrom(response),
    };
  } catch {
    return { membership: null, cookies: [] };
  }
}

async function resolveMemberContext(request, env, dependencies = {}) {
  const readSession = dependencies.readSession || readMemberAppSession;
  const renewMembership = dependencies.renewMembership || ((currentRequest) => resolveMembership(currentRequest, env));
  const currentSession = await readSession(request, env);
  if (currentSession?.lineUserId) return { session: currentSession, membershipCheck: null, cookies: [], request };
  if (!cookieValue(request, REMEMBERED_LOGIN_COOKIE)) return { session: null, membershipCheck: null, cookies: [], request };

  let membershipCheck;
  try {
    membershipCheck = await renewMembership(request, env);
  } catch {
    membershipCheck = { membership: null, cookies: [] };
  }
  const cookies = Array.isArray(membershipCheck?.cookies) ? membershipCheck.cookies : [];
  const pair = sessionCookiePair(cookies);
  const refreshedRequest = pair ? requestWithSessionCookie(request, pair) : request;
  const session = pair ? await readSession(refreshedRequest, env) : null;
  return { session: session?.lineUserId ? session : null, membershipCheck, cookies, request: refreshedRequest };
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

function resolveEpisode(value) {
  return typeof value === "object" && value?.id ? getTmibEpisode(value.id) : getTmibEpisode(value || "act-001");
}

export function paymentGrantsTmib(record, episodeValue = "act-001") {
  const episode = resolveEpisode(episodeValue);
  if (!episode) return false;
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
    && packageCode === episode.packageCode.toLowerCase()
    && amount === episode.priceThb
    && stage === episode.paymentStage.toLowerCase();
}

function sameOrigin(request) {
  const origin = clean(request.headers.get("origin"), 400).toLowerCase();
  if (!origin) return false;
  return origin === "https://mmdbkk.com" || origin === "https://www.mmdbkk.com";
}

function canonicalPayUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.hostname !== "mmdbkk.com" || url.pathname !== "/pay/checkout" || url.hash) return "";
    const keys = [...url.searchParams.keys()];
    if (keys.some((key) => key !== "t") || !clean(url.searchParams.get("t"), 8192)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function paymentIntent(env, episode, sessionId) {
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
      payment_stage: episode.paymentStage,
      amount: episode.priceThb,
      package_code: episode.packageCode,
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

async function readStoredGrant(env, episode, hash) {
  if (!env.LIFF_IDENTITY_KV?.get) return null;
  return env.LIFF_IDENTITY_KV.get(entitlementKey(episode, hash), "json").catch(() => null);
}

async function storeGrant(env, episode, hash, data) {
  if (!env.LIFF_IDENTITY_KV?.put) return false;
  await env.LIFF_IDENTITY_KV.put(entitlementKey(episode, hash), JSON.stringify(data));
  return true;
}

async function resolveEpisodeAccess(request, env, hash, episode, membershipCheck = null) {
  if (episode.publicFree === true || episode.accessMode === "public_free") {
    return { granted: true, source: "public_free", cookies: [] };
  }

  const stored = await readStoredGrant(env, episode, hash);
  if (stored?.state === "granted") return { granted: true, source: "episode_purchase", paymentRef: clean(stored.payment_ref, 220) || null, cookies: [] };

  if (episode.membershipIncluded === true) {
    const resolvedMembership = membershipCheck || await resolveMembership(request, env);
    if (resolvedMembership.membership) return {
      granted: true,
      source: "membership",
      level: normalizeLevel(resolvedMembership.membership.level),
      cookies: resolvedMembership.cookies || [],
    };
    membershipCheck = resolvedMembership;
  }

  if (stored?.state === "pending" && clean(stored.payment_ref, 220)) {
    const record = await findPaymentByRef(env, clean(stored.payment_ref, 220));
    if (paymentGrantsTmib(record, episode)) {
      await storeGrant(env, episode, hash, {
        state: "granted",
        payment_ref: clean(stored.payment_ref, 220),
        granted_at: new Date().toISOString(),
        source: "verified_payment",
      });
      return { granted: true, source: "episode_purchase", paymentRef: clean(stored.payment_ref, 220), cookies: membershipCheck?.cookies || [] };
    }
  }
  return { granted: false, cookies: membershipCheck?.cookies || [] };
}

async function mediaMap(env, hash, episode) {
  const secret = secretFor(env);
  const exp = Math.floor(Date.now() / 1000) + MEDIA_TTL_SECONDS;
  const media = {};
  for (const frame of episode.frames) {
    const sig = await hmacHex(secret, `tmib-media:${episode.id}:${frame}:${exp}:${hash}`);
    media[frame] = `${episodeRoot(episode)}/media/${frame}?exp=${exp}&sig=${sig}`;
  }
  return { media, expiresAt: new Date(exp * 1000).toISOString() };
}

function catalogPayload(episode) {
  const metadata = publicTmibEpisodeMetadata(episode);
  return {
    ok: true,
    authority: "member-pages-worker",
    schema: "tmib_episode_catalog_v1",
    ...metadata,
    access_path: `${episodeRoot(episode)}/access`,
    purchase_path: episode.purchasable === true ? `${episodeRoot(episode)}/purchase` : "",
  };
}

async function handleAccess(request, env, episode) {
  const publicFree = episode.publicFree === true || episode.accessMode === "public_free";
  const context = publicFree
    ? { session: null, membershipCheck: null, cookies: [] }
    : await resolveMemberContext(request, env);
  const session = context.session;
  if (!publicFree && !session?.lineUserId) {
    return json({ ok: false, granted: false, error: { code: "LINE_SESSION_REQUIRED" } }, 401, {}, context.cookies);
  }
  const hash = publicFree ? "public" : await userKey(env, session.lineUserId);
  if (!hash) return json({ ok: false, granted: false, error: { code: "TMIB_SIGNING_UNAVAILABLE" } }, 503, {}, context.cookies);
  const access = await resolveEpisodeAccess(request, env, hash, episode, context.membershipCheck);
  const cookies = mergeSetCookies(context.cookies, access.cookies || []);
  if (!access.granted) return json({ ...catalogPayload(episode), granted: false }, 200, {}, cookies);
  const signed = await mediaMap(env, hash, episode);
  return json({
    ...catalogPayload(episode),
    granted: true,
    access_source: access.source,
    watermark: publicFree ? "MMD · PUBLIC STORY" : "MMD PRIVATE · " + hash.slice(0, 10).toUpperCase(),
    media_expires_at: signed.expiresAt,
    media: signed.media,
  }, 200, {}, cookies);
}

async function handlePurchase(request, env, episode) {
  if (!sameOrigin(request)) return json({ ok: false, error: { code: "SAME_ORIGIN_REQUIRED" } }, 403);
  if (episode.status !== "live" || episode.purchasable !== true) {
    return json({ ok: false, error: { code: "EPISODE_NOT_PURCHASABLE" } }, 409);
  }
  const context = await resolveMemberContext(request, env);
  const session = context.session;
  if (!session?.lineUserId) return json({ ok: false, error: { code: "LINE_SESSION_REQUIRED" } }, 401, {}, context.cookies);
  const hash = await userKey(env, session.lineUserId);
  if (!hash) return json({ ok: false, error: { code: "TMIB_SIGNING_UNAVAILABLE" } }, 503, {}, context.cookies);
  const existing = await resolveEpisodeAccess(request, env, hash, episode, context.membershipCheck);
  const cookies = mergeSetCookies(context.cookies, existing.cookies || []);
  if (existing.granted) return json({
    ok: true,
    already_granted: true,
    episode_id: episode.id,
    redirect_to: episode.storyPath,
  }, 200, {}, cookies);
  const intent = await paymentIntent(env, episode, canonicalPurchaseSession(episode, hash));
  if (!intent) return json({ ok: false, error: { code: "PAYMENT_INTENT_UNAVAILABLE" } }, 503);
  await storeGrant(env, episode, hash, {
    state: "pending",
    payment_ref: intent.paymentRef,
    payment_session_id: intent.sessionId,
    amount_thb: episode.priceThb,
    package_code: episode.packageCode,
    episode_id: episode.id,
    created_at: new Date().toISOString(),
  });
  return json({
    ok: true,
    episode_id: episode.id,
    amount_thb: episode.priceThb,
    currency: "THB",
    payment_ref: intent.paymentRef,
    story_path: episode.storyPath,
    redirect_to: intent.paymentUrl,
    customer_payment_url: intent.paymentUrl,
  }, 200, {}, cookies);
}

async function handleMedia(request, env, episode, frame) {
  if (!episode.frames.includes(frame)) return json({ ok: false, error: { code: "FRAME_NOT_FOUND" } }, 404);
  const publicFree = episode.publicFree === true || episode.accessMode === "public_free";
  const context = publicFree
    ? { session: null, cookies: [] }
    : await resolveMemberContext(request, env);
  const session = context.session;
  if (!publicFree && !session?.lineUserId) {
    return json({ ok: false, granted: false, error: { code: "LINE_SESSION_REQUIRED" } }, 401, {}, context.cookies);
  }
  const hash = publicFree ? "public" : await userKey(env, session.lineUserId);
  const url = new URL(request.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = clean(url.searchParams.get("sig"), 128);
  const now = Math.floor(Date.now() / 1000);
  if (!hash || !Number.isInteger(exp) || exp < now || exp > now + MEDIA_TTL_SECONDS + 30 || !/^[a-f0-9]{64}$/.test(sig)) {
    return json({ ok: false, error: { code: "MEDIA_TOKEN_INVALID" } }, 403, {}, context.cookies);
  }
  const expected = await hmacHex(secretFor(env), `tmib-media:${episode.id}:${frame}:${exp}:${hash}`);
  if (!timingSafeEqual(sig, expected)) return json({ ok: false, error: { code: "MEDIA_TOKEN_INVALID" } }, 403, {}, context.cookies);
  const bucket = env.MMD_MODEL_ASSETS;
  if (!bucket?.get) return json({ ok: false, error: { code: "TMIB_MEDIA_STORAGE_UNAVAILABLE" } }, 503, {}, context.cookies);
  const object = await bucket.get(`tmib/${episode.id}/${frame}.webp`);
  if (!object) return json({ ok: false, error: { code: "TMIB_MEDIA_NOT_SEEDED", frame } }, 503, {}, context.cookies);
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("content-type", headers.get("content-type") || "image/webp");
  headers.set("cache-control", "private, max-age=60, no-store");
  headers.set("content-disposition", `inline; filename="tmib-${episode.id}-${frame}.webp"`);
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-robots-tag", "noindex, noarchive, nosnippet, noimageindex");
  headers.set("x-mmd-tmib-story", "media-v2");
  appendSetCookies(headers, context.cookies);
  return new Response(object.body, { status: 200, headers });
}

export function isTmibStoryAccessPath(input) {
  return Boolean(parseRoute(input));
}

export async function handleTmibStoryAccess(request, env = {}) {
  const route = parseRoute(request.url);
  if (!route) return json({ ok: false, error: { code: "TMIB_ROUTE_NOT_FOUND" } }, 404);
  const episode = getTmibEpisode(route.episodeId);
  if (!episode) return json({ ok: false, error: { code: "TMIB_EPISODE_NOT_FOUND" } }, 404);

  if (route.action === "catalog") {
    if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "GET" });
    return json(catalogPayload(episode));
  }
  if (route.action === "access") {
    if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "GET" });
    return handleAccess(request, env, episode);
  }
  if (route.action === "purchase") {
    if (request.method !== "POST") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "POST" });
    return handlePurchase(request, env, episode);
  }
  if (route.action === "media") {
    if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405, { allow: "GET" });
    return handleMedia(request, env, episode, route.detail);
  }
  return json({ ok: false, error: { code: "TMIB_ROUTE_NOT_FOUND" } }, 404);
}

export const TMIB_STORY_INTERNALS = Object.freeze({
  EPISODE_ID: ACT_001.id,
  PRICE_THB: ACT_001.priceThb,
  PACKAGE_CODE: ACT_001.packageCode,
  PAYMENT_STAGE: ACT_001.paymentStage,
  ROOT: episodeRoot(ACT_001),
  FRAMES: ACT_001.frames,
  API_ROOT,
  CATALOG: TMIB_EPISODE_CATALOG,
  paymentGrantsTmib,
  membershipGrantsTmib,
  resolveMemberContext,
  canonicalPayUrl,
});
