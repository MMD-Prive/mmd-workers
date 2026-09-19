const LINE_PROFILE_URL = "https://api.line.me/v2/profile";
const CLAIM_OPEN_PATH = "/v1/internal/promotions/claims/open";

export async function handlePromotionClaimOpen(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") return new Response(null, { status: 204, headers: apiHeaders() });
  if (request.method.toUpperCase() !== "POST") return apiJson({ ok: false, error: "method_not_allowed" }, 405);

  const accessToken = bearerToken(request);
  if (!accessToken) return apiJson({ ok: false, error: "line_access_token_required" }, 401);

  const profile = await verifyLineAccessToken(accessToken, env);
  if (!profile.ok) return apiJson({ ok: false, error: profile.error }, profile.status);

  const membership = await resolveMemberSnapshot(profile.userId, env);
  if (!membership.ok) return apiJson({ ok: false, error: membership.error }, membership.status);
  if (!env.PROMOTION_WORKER?.fetch) return apiJson({ ok: false, error: "promotion_worker_binding_missing" }, 503);

  const lineUserIdHash = await hmacHex(profile.userId, env.LINE_ID_HASH_SECRET);
  const body = await request.json().catch(() => ({}));
  const upstream = await env.PROMOTION_WORKER.fetch(new Request("https://promotion-worker.internal" + CLAIM_OPEN_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-secret": String(env.INTERNAL_SERVICE_SECRET || ""),
      "x-request-id": String(request.headers.get("x-request-id") || crypto.randomUUID()),
    },
    body: JSON.stringify({
      lineUserIdHash,
      campaignReferenceDate: new Date().toISOString(),
      membershipStartAt: membership.data.membershipStartAt || undefined,
      membershipEndAt: membership.data.membershipEndAt,
      membershipTier: membership.data.membershipTier,
      matchedMemberId: membership.data.memberId,
      matchedClientId: membership.data.clientId || "",
      matchStatus: membership.data.matchStatus || "matched",
      source: "liff_verified",
      clientInput: {
        promo: safeText(body.promo),
        code: safeText(body.code),
      },
    }),
  }));

  const payload = await upstream.json().catch(() => ({ error: "invalid_promotion_response" }));
  return apiJson({ ok: upstream.ok, data: upstream.ok ? customerSafeClaim(payload) : undefined, error: upstream.ok ? undefined : payload.error || "claim_open_failed" }, upstream.status);
}

export async function verifyLineAccessToken(accessToken, env = {}) {
  const endpoint = String(env.LINE_PROFILE_ENDPOINT || LINE_PROFILE_URL);
  let response;
  try {
    response = await fetch(endpoint, { headers: { authorization: "Bearer " + accessToken, accept: "application/json" } });
  } catch {
    return { ok: false, status: 502, error: "line_verification_unavailable" };
  }
  const profile = await response.json().catch(() => ({}));
  const userId = safeText(profile.userId);
  if (!response.ok || !/^U[0-9a-f]{32}$/i.test(userId)) return { ok: false, status: 401, error: "invalid_line_access_token" };
  return { ok: true, status: 200, userId };
}

async function resolveMemberSnapshot(lineUserId, env) {
  if (!env.PROMOTION_MEMBER_STATUS_RESOLVER?.fetch) return { ok: false, status: 503, error: "member_status_resolver_missing" };
  const response = await env.PROMOTION_MEMBER_STATUS_RESOLVER.fetch(new Request("https://promotion-member-status-resolver.internal/v1/internal/members/by-line", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-internal-secret": String(env.INTERNAL_SERVICE_SECRET || "") },
    body: JSON.stringify({ lineUserId }),
  }));
  const payload = await response.json().catch(() => ({}));
  const data = payload.data || payload;
  if (!response.ok) return { ok: false, status: response.status, error: payload.error || "member_match_failed" };
  if (!data.memberId || !data.membershipEndAt || !data.membershipTier) return { ok: false, status: 409, error: "member_snapshot_incomplete" };
  return { ok: true, data };
}

async function hmacHex(value, secret) {
  const raw = String(secret || "");
  if (raw.length < 32) throw new Error("line_id_hash_secret_missing");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bearerToken(request) {
  const authorization = String(request.headers.get("authorization") || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function customerSafeClaim(payload) {
  const claim = payload.claim || {};
  return {
    claim_reference: claim.claimId || "",
    claim_status: claim.claimStatus || "review_required",
    review_status: claim.reviewStatus || "review_required",
    resumed: Boolean(payload.resumed),
    campaign_reference_date: claim.campaignReferenceDate || "",
  };
}

function safeText(value) { return String(value || "").trim().slice(0, 160); }
function apiHeaders() { return { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "https://mmdbkk.com", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "authorization,content-type,x-request-id", vary: "origin" }; }
function apiJson(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: apiHeaders() }); }
