import { CareBackStoreError, getCareBackStore } from "./care-back-claim-store.js";

const PATH = "/__internal/hype/member-wallet";
const SERVICE_HOST = "member-pages-worker.internal";
const ALLOWED_CALLER = "admin-worker";
const PROFILE_PATH = "/__internal/member-profile/read";
const PROFILE_PURPOSE = "liff_member_profile_read";
const RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const SCHEMA = "mmd.hype_member_wallet_projection.v1";
const PROFILE_TIMEOUT_MS = 2500;
const SCOPES = new Set(["points", "coupons", "wallet"]);
const COUPON_STATES = new Set([
  "ready",
  "wish_required",
  "verification_required",
  "used",
  "expired",
  "revoked",
  "invalid",
]);

export const HYPE_MEMBER_WALLET_PATH = PATH;

export function isHypeMemberWalletRequest(request) {
  if (!(request instanceof Request)) return false;
  try {
    return request.method === "POST" && new URL(request.url).pathname === PATH;
  } catch {
    return false;
  }
}

export async function handleHypeMemberWallet(request, env = {}) {
  if (!authorized(request)) return json({ ok: false, error: "not_found" }, 404);

  const body = await request.json().catch(() => null);
  if (!plain(body) || Object.keys(body).some((key) => !["line_user_id", "scope"].includes(key))) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }

  const lineUserId = canonicalLineId(body.line_user_id);
  const scope = token(body.scope);
  if (!lineUserId || !SCOPES.has(scope)) return json({ ok: false, error: "invalid_request" }, 400);

  const resolved = await readCanonicalProfile(env, lineUserId);
  if (resolved.status === "ambiguous") {
    return json({ ok: false, status: "review_required", error: "member_identity_ambiguous", authority: SCHEMA }, 409);
  }
  if (resolved.status !== "resolved") {
    return json({ ok: false, status: "unavailable", error: "member_profile_unavailable", authority: SCHEMA }, 503);
  }

  const points = scope === "coupons"
    ? { status: "not_requested", active_points: null }
    : projectPoints(resolved.profile);

  let coupon = scope === "points"
    ? emptyCoupon("not_requested")
    : await readCouponProjection(env, {
        lineUserId,
        memberId: resolved.memberId,
      });

  return json({
    ok: true,
    authority: SCHEMA,
    identity_status: "resolved",
    scope,
    points,
    coupon,
    guardrails: {
      read_only: true,
      customer_safe_projection_only: true,
      points_require_verified_source: true,
      coupon_activation_allowed: false,
      coupon_reissue_allowed: false,
      coupon_code_exposed_only_when_ready: true,
      raw_identity_exposed: false,
      member_id_exposed: false,
    },
  });
}

async function readCanonicalProfile(env, lineUserId) {
  const binding = env.MEMBER_STATUS_RESOLVER;
  const secret = text(env.MEMBER_STATUS_RESOLVER_SECRET);
  if (!binding?.fetch || secret.length < 32) return { status: "unavailable" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("hype_member_wallet_profile_timeout"), PROFILE_TIMEOUT_MS);
  try {
    const response = await binding.fetch(new Request(`https://mmd-auth-worker.internal${PROFILE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [RESOLVER_SECRET_HEADER]: secret,
      },
      body: JSON.stringify({ line_user_id: lineUserId, purpose: PROFILE_PURPOSE }),
      signal: controller.signal,
    }));
    const payload = await response.json().catch(() => null);
    if (response.status === 409 || payload?.error?.code === "MEMBER_MATCH_AMBIGUOUS") {
      return { status: "ambiguous" };
    }
    const data = plain(payload?.data) ? payload.data : null;
    const profile = plain(data?.profile) ? data.profile : null;
    const memberId = text(data?.member_id).slice(0, 160);
    if (!response.ok || payload?.ok !== true || data?.member_exists !== true || !profile || !memberId) {
      return { status: "unavailable" };
    }
    return { status: "resolved", profile, memberId };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export function projectHypePoints(profile = {}) {
  return projectPoints(profile);
}

function projectPoints(profile = {}) {
  const points = plain(profile?.customer_360?.points) ? profile.customer_360.points : null;
  if (token(points?.status) !== "verified") return { status: "unavailable", active_points: null };
  const value = Number(points.active_points);
  if (!Number.isInteger(value) || value < 0) return { status: "unavailable", active_points: null };
  return {
    status: "verified",
    active_points: value,
    rate_thb_per_point: 100,
  };
}

async function readCouponProjection(env, { lineUserId, memberId }) {
  if (!memberId || text(env.LIFF_SESSION_SECRET).length < 32) return emptyCoupon("unavailable");

  const store = getCareBackStore(env);
  if (!store || typeof store.readCouponWallet !== "function") return emptyCoupon("unavailable");

  try {
    const identityHash = await keyedDigest(env, `identity:${lineUserId}`);
    const wallet = await store.readCouponWallet({ identityHash, memberId });
    return projectCouponWallet(wallet);
  } catch (error) {
    if (error instanceof CareBackStoreError && String(error.code || "").endsWith("_CONFLICT")) {
      return emptyCoupon("review_required");
    }
    return emptyCoupon("unavailable");
  }
}

export function projectHypeCouponWallet(wallet = {}) {
  return projectCouponWallet(wallet);
}

function projectCouponWallet(wallet = {}) {
  const state = token(wallet.status);
  if (!COUPON_STATES.has(state)) return emptyCoupon("unavailable");

  const ready = state === "ready";
  const code = ready && /^[A-HJ-NP-Z2-9]{6}$/.test(text(wallet.code)) ? text(wallet.code) : "";
  if (ready && !code) return emptyCoupon("unavailable");

  const approved = Number(wallet.approved_discount_percent);
  const approvedDiscount = ready && Number.isInteger(approved) && approved > 0 && approved <= 10 ? approved : null;

  return {
    status: state,
    code: code || null,
    approved_discount_percent: approvedDiscount,
    expires_at: ready ? safeTimestamp(wallet.expires_at) : null,
    single_use: wallet.single_use === true,
  };
}

function emptyCoupon(status) {
  return {
    status,
    code: null,
    approved_discount_percent: null,
    expires_at: null,
    single_use: true,
  };
}

async function keyedDigest(env, value) {
  const secret = text(env.LIFF_SESSION_SECRET);
  if (secret.length < 32) throw new Error("identity_secret_unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function authorized(request) {
  if (!(request instanceof Request)) return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return (
    request.method === "POST"
    && url.pathname === PATH
    && url.hostname === SERVICE_HOST
    && token(request.headers.get("x-mmd-internal-call")) === "true"
    && text(request.headers.get("x-mmd-service-binding")) === ALLOWED_CALLER
  );
}

function canonicalLineId(value) {
  const id = text(value);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function safeTimestamp(value) {
  const raw = text(value);
  const time = Date.parse(raw);
  return raw && Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function plain(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function token(value) {
  return text(value).toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-member-wallet-projection": SCHEMA,
    },
  });
}
