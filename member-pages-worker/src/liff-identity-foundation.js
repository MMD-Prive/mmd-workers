import { getLiffGatewayStore, LiffGatewayStorageError } from "./liff-gateway-airtable.js";
import { CareBackStoreError, getCareBackStore } from "./care-back-claim-store.js";
import { assertBirthdayWishOwnership, BirthdayWishStorageError, getBirthdayWishStore } from "./care-back-birthday-wish-store.js";
import { PUBLIC_JSON_BODY_MAX_BYTES, readBoundedJsonObject } from "./bounded-json.js";
import { createOrLoadBirthdayWishThroughCoordinator, getBirthdayWishCoordinatorState } from "./care-back-birthday-wish-coordinator.js";
import legacyWorker from "./legacy-member-pages.js";

const WORKER = "member-pages-worker";
const VERSION = "20260819-care-back-wish-gate";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const SESSION_TTL_SECONDS = 15 * 60;
const HALL_TOKEN_TTL_SECONDS = 5 * 60;
const VERIFY_TIMEOUT_MS = 5000;
const MEMBER_RESOLVER_TIMEOUT_MS = 5000;
const SESSION_COOKIE = "__Host-mmd_liff_session";
const MEMBER_RESOLVER_PATH = "/__internal/member-status/resolve";
const MEMBER_PROFILE_RESOLVER_PATH = "/__internal/member-profile/read";
const MEMBER_RESOLVER_PURPOSE = "liff_identity_resolution";
const MEMBER_PROFILE_RESOLVER_PURPOSE = "liff_member_profile_read";
const MEMBER_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const PAYMENT_BINDING_STATUS = "contract_unavailable";
const CANONICAL_MEMBER_ROUTE = "/sigil/member/membership";

const LEGACY_IDENTIFY_PATHS = new Set(["/member/api/liff/identify", "/member/api/liff/identify/"]);
const START_PATHS = new Set(["/member/api/liff/start", "/member/api/liff/start/"]);
const INTENT_PATHS = new Set(["/member/api/liff/intent", "/member/api/liff/intent/"]);
const AUDIENCE_PATHS = new Set(["/member/api/liff/audience", "/member/api/liff/audience/"]);
const PACKAGE_PATHS = new Set(["/member/api/liff/package", "/member/api/liff/package/"]);
const PAYMENT_INTENT_PATHS = new Set(["/member/api/liff/payment-intent", "/member/api/liff/payment-intent/"]);
const STATUS_PATHS = new Set(["/member/api/liff/status", "/member/api/liff/status/"]);
const PROFILE_PATHS = new Set(["/member/api/liff/profile", "/member/api/liff/profile/"]);
const DASHBOARD_PATHS = new Set(["/api/member/dashboard", "/api/member/dashboard/"]);
const MMS_CATALOG_PATHS = new Set(["/member/api/mms/catalog", "/member/api/mms/catalog/", "/member/api/liff/mms/catalog", "/member/api/liff/mms/catalog/"]);
const MMS_MATCH_PATHS = new Set(["/member/api/mms/match", "/member/api/mms/match/", "/member/api/liff/mms/match", "/member/api/liff/mms/match/"]);
const MMS_PREBOOKING_PATHS = new Set(["/member/api/mms/prebookings", "/member/api/mms/prebookings/", "/member/api/liff/mms/prebookings", "/member/api/liff/mms/prebookings/"]);
const CARE_BACK_CLAIM_PATHS = new Set(["/member/api/liff/care-back/claim", "/member/api/liff/care-back/claim/"]);
const CARE_BACK_STATE_PATHS = new Set(["/member/api/liff/care-back/state", "/member/api/liff/care-back/state/"]);
const CARE_BACK_WISH_PATHS = new Set(["/member/api/liff/care-back/wish", "/member/api/liff/care-back/wish/"]);
const CLOSED_LEGACY_CARE_BACK_WISH_PATHS = new Set(["/api/care-back-wish", "/api/care-back-wish/"]);
const HALL_TOKEN_PATHS = new Set(["/member/api/liff/hall-token", "/member/api/liff/hall-token/"]);
const APPROVED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);
const LIFF_INTENTS = new Set(["signup", "renew", "status", "promo", "hall", "continue_payment", "mms_booking", "unknown"]);
const HALL_AUDIENCES = new Set(["female_view", "lgbt_view", "manual_review", "unknown"]);
const START_BODY_KEYS = new Set(["id_token", "line_id_token", "intent", "liff_intent", "promo_code", "campaign"]);
const INTENT_BODY_KEYS = new Set(["intent", "liff_intent"]);
const AUDIENCE_BODY_KEYS = new Set(["hall_audience_context"]);
const PACKAGE_BODY_KEYS = new Set(["requested_package_code", "promo_code"]);
const PAYMENT_INTENT_BODY_KEYS = new Set(["package_code", "payment_stage"]);
const HALL_BODY_KEYS = new Set();
const CARE_BACK_BODY_KEYS = new Set();
const CARE_BACK_WISH_BODY_KEYS = new Set(["wish_text", "wish_option", "request_id"]);
const CARE_BACK_CAMPAIGN = "care_back";
const BROWSER_IDENTITY_FIELDS = [
  "line_user_id",
  "lineUserId",
  "line_id",
  "line_display_name",
  "lineDisplayName",
  "line_picture_url",
  "linePictureUrl",
  "sub",
  "profile",
  "line_profile",
  "user",
  "member_id",
  "member_ref",
  "mmd_member_id",
  "tier",
  "points",
  "status",
  "membership_status",
  "payment_status",
  "private_access",
  "entitlements",
  "source_channel",
  "entry_token_hash",
  "liff_session_id",
  "amount",
  "amount_thb",
];

export default {
  async fetch(request, env = {}, ctx) {
    const path = normalizePath(new URL(request.url).pathname);
    if (isMmsMemberPrefix(path)) {
      let response;
      if (request.method === "OPTIONS") {
        response = isApprovedOrigin(request, env)
          ? new Response(null, { status: 204, headers: apiHeaders("POST,GET,OPTIONS") })
          : json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
      } else if (MMS_CATALOG_PATHS.has(path)) {
        response = await handleMmsCatalog(request, env);
      } else if (MMS_MATCH_PATHS.has(path)) {
        response = await handleMmsMatch(request, env);
      } else if (MMS_PREBOOKING_PATHS.has(path)) {
        response = await handleMmsPrebooking(request, env);
      } else {
        response = json({ ok: false, error: { code: "MMS_ROUTE_NOT_FOUND", message: "Unknown MMS member route." } }, 404);
      }
      return withLiffCors(request, response, env);
    }
    if (isLiffPrefix(path)) {
      let response;
      if (request.method === "OPTIONS") {
        response = isApprovedOrigin(request)
          ? new Response(null, { status: 204, headers: apiHeaders("POST,GET,OPTIONS") })
          : json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
      } else if (LEGACY_IDENTIFY_PATHS.has(path)) {
        response = json({ ok: false, error: { code: "LEGACY_LIFF_IDENTITY_DISABLED", message: "Use the server-verified LIFF identity flow." } }, 410);
      } else if (START_PATHS.has(path)) {
        response = await handleStart(request, env);
      } else if (INTENT_PATHS.has(path)) {
        response = await handleIntent(request, env);
      } else if (AUDIENCE_PATHS.has(path)) {
        response = await handleAudience(request, env);
      } else if (PACKAGE_PATHS.has(path)) {
        response = await handlePackage(request, env);
      } else if (PAYMENT_INTENT_PATHS.has(path)) {
        response = await handlePaymentIntent(request, env);
      } else if (STATUS_PATHS.has(path)) {
        response = await handleStatus(request, env);
      } else if (PROFILE_PATHS.has(path)) {
        response = await handleMemberProfile(request, env);
      } else if (CARE_BACK_CLAIM_PATHS.has(path)) {
        response = await handleCareBackClaim(request, env);
      } else if (CARE_BACK_STATE_PATHS.has(path)) {
        response = await handleCareBackState(request, env);
      } else if (CARE_BACK_WISH_PATHS.has(path)) {
        response = await handleCareBackWish(request, env);
      } else if (HALL_TOKEN_PATHS.has(path)) {
        response = await handleHallToken(request, env);
      } else {
        response = json({ ok: false, error: { code: "LIFF_ROUTE_NOT_FOUND", message: "Unknown LIFF identity route." } }, 404);
      }
      return withLiffCors(request, response, env);
    }
    if (DASHBOARD_PATHS.has(path)) {
      let response;
      if (request.method === "OPTIONS") {
        response = isApprovedOrigin(request)
          ? new Response(null, { status: 204, headers: apiHeaders("GET,OPTIONS") })
          : json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
      } else {
        response = await handleMemberDashboard(request, env);
      }
      return withLiffCors(request, response, env);
    }
    if (CLOSED_LEGACY_CARE_BACK_WISH_PATHS.has(path)) {
      return json({ ok: false, error: { code: "NOT_FOUND", message: "Not found." } }, 404);
    }
    return legacyWorker.fetch(request, env, ctx);
  },
};

async function handleMmsCatalog(request, env) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  return forwardMmsResponse(await callMmsService(env, "/mms/api/catalog", { method: "GET" }));
}

async function handleMmsMatch(request, env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const allowed = new Set(["recipient_gender", "zone", "skills"]);
  if (hasUnexpectedKeys(parsed.body, allowed) || hasBrowserIdentityClaims(parsed.body)) return browserIdentityRejected();
  const auth = await authenticateMmsMember(request, env);
  if (!auth.ok) return auth.response;
  const upstream = await callMmsService(env, "/mms/api/therapists/match", {
    method: "POST",
    body: parsed.body,
  });
  return commitMmsResponse(env, auth, upstream);
}

async function handleMmsPrebooking(request, env) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const allowed = new Set([
    "idempotency_key",
    "recipient_gender",
    "zone",
    "service_date",
    "service_time",
    "duration_minutes",
    "skills",
    "requested_therapist_ids",
    "note",
    "language",
  ]);
  if (hasUnexpectedKeys(parsed.body, allowed) || hasBrowserIdentityClaims(parsed.body)) return browserIdentityRejected();
  const auth = await authenticateMmsMember(request, env);
  if (!auth.ok) return auth.response;
  const upstream = await callMmsService(env, "/mms/api/prebookings", {
    method: "POST",
    body: { ...parsed.body, member_ref: auth.session.member_id },
  });
  return commitMmsResponse(env, auth, upstream);
}

async function authenticateMmsMember(request, env) {
  if (!env.LIFF_IDENTITY_KV || !env.LIFF_SESSION_SECRET) {
    return { ok: false, response: unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED") };
  }
  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth;
  if (!auth.session.member_exists || !auth.session.member_id) {
    return {
      ok: false,
      response: await saveRotatedError(env, auth, "MMS_MEMBER_REQUIRED", "Verified MMD membership is required.", 403),
    };
  }
  return auth;
}

async function callMmsService(env, path, options = {}) {
  if (!env.MMS_WORKER?.fetch) {
    return { ok: false, status: 503, payload: { ok: false, error: { code: "MMS_UPSTREAM_NOT_CONFIGURED", message: "MMS service is temporarily unavailable." } } };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const headers = new Headers({ accept: "application/json" });
    const init = { method: options.method || "GET", headers, signal: controller.signal };
    if (options.body) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(options.body);
    }
    const response = await env.MMS_WORKER.fetch(new Request(`https://mms.internal${path}`, init));
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, status: 502, payload: { ok: false, error: { code: "MMS_UPSTREAM_INVALID", message: "MMS service returned an invalid response." } } };
    }
    return { ok: response.ok && payload.ok === true, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      status: error?.name === "AbortError" ? 504 : 502,
      payload: { ok: false, error: { code: error?.name === "AbortError" ? "MMS_UPSTREAM_TIMEOUT" : "MMS_UPSTREAM_UNAVAILABLE", message: "MMS service is temporarily unavailable." } },
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function commitMmsResponse(env, auth, upstream) {
  try {
    await commitRotatedSession(env, auth);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  return forwardMmsResponse(upstream, [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)]);
}

function forwardMmsResponse(upstream, cookies = []) {
  const status = Number.isInteger(upstream?.status) && upstream.status >= 200 && upstream.status <= 599 ? upstream.status : 502;
  const payload = upstream?.payload && typeof upstream.payload === "object"
    ? upstream.payload
    : { ok: false, error: { code: "MMS_UPSTREAM_INVALID", message: "MMS service returned an invalid response." } };
  return json(payload, status, { cookies });
}

export async function handleStart(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore) return unavailable("LIFF_GATEWAY_STORAGE_NOT_CONFIGURED");
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (hasUnexpectedKeys(body, START_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();

  const idToken = singleIdToken(body);
  if (!idToken) return json({ ok: false, error: { code: "ID_TOKEN_REQUIRED", message: "id_token is required" } }, 400);

  const verified = await verifyLineIdToken(idToken, env);
  if (!verified.ok) return json({ ok: false, error: { code: verified.code, message: verified.message } }, verified.status);

  const identityKey = await keyedDigest(env, `identity:${verified.sub}`);
  const existing = await resolveExistingMember(env, verified.sub);
  if (!existing.ok) return json({ ok: false, error: { code: "MEMBER_RESOLUTION_FAILED", message: "Member identity could not be resolved safely." } }, 503);
  const memberProfile = existing.exists ? await resolveMemberProfile(env, verified.sub) : null;
  if (existing.exists && !memberProfile?.ok) {
    return json({ ok: false, error: { code: "MEMBER_PROFILE_RESOLUTION_FAILED", message: "Member profile could not be resolved safely." } }, 503);
  }

  const pending = existing.exists ? null : await getOrCreatePendingIdentity(env, identityKey);
  const intent = normalizeIntent(body.intent);
  const liffIntent = normalizeLiffIntent(body.liff_intent ?? body.intent);
  const continuity = cleanContinuity(new URL(request.url).searchParams.get("t"));
  const session = await issueSession(env, {
    identity_key: identityKey,
    member_exists: existing.exists,
    member_id: memberProfile?.member_id || null,
    member_profile: memberProfile?.profile || null,
    pending_identity_id: pending?.pending_identity_id || null,
    intent,
    liff_intent: liffIntent,
    source_channel: "line_liff",
    language: "th",
    hype_decision_status: liffIntent === "unknown" ? "asking_intent" : "not_started",
    hall_audience_context: "unknown",
    model_visibility_mode: "hold_until_selected",
    pricing_lane: "unknown",
    promo_code: normalizePromoCode(body.promo_code),
    promotion_campaign: normalizeCampaign(body.campaign),
    route_after_liff: null,
    next_screen_key: liffIntent === "unknown" ? "start_intent" : nextScreenForIntent(liffIntent, existing.exists),
    continuity,
  });
  try {
    await persistGatewayStart(env, gatewayStore, session.session);
    await saveSession(env, session.hash, session.session, SESSION_TTL_SECONDS);
  } catch (error) {
    await env.LIFF_IDENTITY_KV.delete(`liff:session:${session.hash}`);
    return gatewayStorageFailure(error);
  }

  return json({ ok: true, data: await safeSessionView(gatewayStore, session.session) }, 200, {
    cookies: [sessionCookie(session.token, SESSION_TTL_SECONDS)],
  });
}

export async function handleIntent(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore) return unavailable("LIFF_GATEWAY_STORAGE_NOT_CONFIGURED");
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (hasUnexpectedKeys(body, INTENT_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();
  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  auth.session.intent = normalizeIntent(body.intent);
  const nextLiffIntent = normalizeLiffIntent(body.liff_intent ?? body.intent);
  if (nextLiffIntent !== auth.session.liff_intent) {
    invalidatePackageSelection(auth.session);
    applyGatewayIntent(auth.session, nextLiffIntent);
  }
  try {
    await persistGatewaySession(env, gatewayStore, auth.session);
    await recordGatewayDecision(gatewayStore, auth.session);
    await commitRotatedSession(env, auth);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  return json({ ok: true, data: await safeSessionView(gatewayStore, auth.session) }, 200, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] });
}

export async function handleAudience(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore) return unavailable("LIFF_GATEWAY_STORAGE_NOT_CONFIGURED");
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (hasUnexpectedKeys(body, AUDIENCE_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();
  const audience = normalizeAudience(body.hall_audience_context);
  if (!audience) return json({ ok: false, error: { code: "INVALID_AUDIENCE_CONTEXT", message: "A valid audience selection is required." } }, 400);

  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  if (requiresMemberLookupForProtectedFlow(auth.session)) return saveMemberLookupRequired(env, gatewayStore, auth);
  if (isStatusOnlyFlow(auth.session)) return saveStatusFlowOnly(env, gatewayStore, auth);
  try {
    const previousContext = packageContextForSession(auth.session);
    if (audience === "female_view" || audience === "lgbt_view") {
      if (await gatewayStore.hasHallAudienceInventory(audience)) applyAudience(auth.session, audience);
      else applyManualReview(auth.session);
    } else if (audience === "manual_review") {
      applyManualReview(auth.session);
    } else {
      applyUnknownAudience(auth.session);
    }
    if (!samePackageContext(previousContext, packageContextForSession(auth.session))) {
      invalidatePackageSelection(auth.session);
    }
    await persistGatewaySession(env, gatewayStore, auth.session);
    await recordGatewayDecision(gatewayStore, auth.session);
    await commitRotatedSession(env, auth);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  return json({ ok: true, data: await safeSessionView(gatewayStore, auth.session) }, 200, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] });
}

export async function handlePackage(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore) return unavailable("LIFF_GATEWAY_STORAGE_NOT_CONFIGURED");
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (hasUnexpectedKeys(body, PACKAGE_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();
  const requestedPackage = normalizePackageCode(body.requested_package_code);
  if (!requestedPackage) return json({ ok: false, error: { code: "PACKAGE_REQUIRED", message: "A package selection is required." } }, 400);

  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  if (requiresMemberLookupForProtectedFlow(auth.session)) return saveMemberLookupRequired(env, gatewayStore, auth);
  if (isStatusOnlyFlow(auth.session)) return saveStatusFlowOnly(env, gatewayStore, auth);
  if (Object.prototype.hasOwnProperty.call(body, "promo_code")) {
    const promoCode = normalizePromoCode(body.promo_code);
    if (promoCode !== auth.session.promo_code) {
      auth.session.promo_code = promoCode;
      invalidatePackageSelection(auth.session);
    }
  }
  if (auth.session.hype_decision_status === "manual_review" || (requiresAudience(auth.session.liff_intent) && auth.session.hall_audience_context === "unknown")) {
    return saveRotatedError(env, auth, "PACKAGE_NOT_READY", "Choose the appropriate route first.", 409);
  }
  let packageRule;
  try {
    packageRule = await gatewayStore.resolvePackage(requestedPackage);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  if (!packageRule || !isPackageAllowedForSession(packageRule, auth.session)) {
    return saveRotatedError(env, auth, "PACKAGE_NOT_AVAILABLE", "This package is not available for the current route.", 409);
  }
  if (packageRule.requires_manual_review) {
    invalidatePackageSelection(auth.session);
    applyManualReview(auth.session);
  } else {
    auth.session.pricing_lane = packageRule.pricing_lane;
    auth.session.selected_package = selectedPackageForSession(packageRule, auth.session);
    auth.session.payment_intent_session_id = null;
    auth.session.payment_binding_status = null;
    auth.session.hype_decision_status = "decided";
    auth.session.route_after_liff = "/member/payments";
    auth.session.next_screen_key = "payment_start";
  }
  try {
    await persistGatewaySession(env, gatewayStore, auth.session);
    await recordGatewayDecision(gatewayStore, auth.session);
    await commitRotatedSession(env, auth);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  const data = await safeSessionView(gatewayStore, auth.session);
  if (!packageRule.requires_manual_review) data.payment_summary = safePaymentSummary(packageRule);
  return json({ ok: true, data }, 200, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] });
}

export async function handlePaymentIntent(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore) return unavailable("LIFF_GATEWAY_STORAGE_NOT_CONFIGURED");
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (hasUnexpectedKeys(body, PAYMENT_INTENT_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();
  const packageCode = normalizePackageCode(body.package_code);
  if (!packageCode || !normalizePaymentStage(body.payment_stage)) return json({ ok: false, error: { code: "PAYMENT_INTENT_INVALID", message: "A selected package and payment stage are required." } }, 400);

  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  if (requiresMemberLookupForProtectedFlow(auth.session)) return saveMemberLookupRequired(env, gatewayStore, auth);
  if (isStatusOnlyFlow(auth.session)) return saveStatusFlowOnly(env, gatewayStore, auth);
  const selected = auth.session.selected_package;
  if (!selected || selected.package_code !== packageCode || auth.session.hype_decision_status === "manual_review") {
    return saveRotatedError(env, auth, "PAYMENT_INTENT_NOT_READY", "Select an eligible package first.", 409);
  }
  try {
    const currentPackage = await gatewayStore.resolvePackage(selected.package_code);
    if (!currentPackage || !isPackageAllowedForSession(currentPackage, auth.session) || !isSelectedPackageCurrent(selected, currentPackage, auth.session)) {
      return saveRotatedError(env, auth, "PAYMENT_INTENT_STALE_PACKAGE", "Select an eligible package first.", 409);
    }
  } catch (error) {
    return gatewayStorageFailure(error);
  }

  // TODO(live enablement): bind an explicitly approved, non-granting
  // PAYMENTS_WORKER token contract before this foundation makes any payment call.
  auth.session.payment_intent_session_id = null;
  auth.session.payment_binding_status = PAYMENT_BINDING_STATUS;
  auth.session.route_after_liff = null;
  auth.session.next_screen_key = "payment_unavailable";
  return saveGatewayStateError(
    env,
    gatewayStore,
    auth,
    "PAYMENT_TOKEN_CONTRACT_UNAVAILABLE",
    "Payment setup is not available yet.",
    503,
  );
}

export async function handleStatus(request, env = {}) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const originFailure = rejectUnapprovedOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore) return unavailable("LIFF_GATEWAY_STORAGE_NOT_CONFIGURED");
  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  auth.session.next_screen_key = "status_result";
  auth.session.route_after_liff = null;
  try {
    await persistGatewaySession(env, gatewayStore, auth.session);
    await recordGatewayDecision(gatewayStore, auth.session);
    await commitRotatedSession(env, auth);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  return json({ ok: true, data: await safeSessionView(gatewayStore, auth.session) }, 200, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] });
}

export async function handleMemberProfile(request, env = {}) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const originFailure = rejectUnapprovedOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.session.member_exists || !auth.session.member_id || !auth.session.member_profile) {
    return saveRotatedError(env, auth, "MEMBER_PROFILE_NOT_FOUND", "No verified member profile is available for this LINE account.", 404);
  }
  try {
    await commitRotatedSession(env, auth);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  return json({ ok: true, data: safeMemberProfile(auth.session.member_profile) }, 200, {
    cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)],
  });
}

export async function handleMemberDashboard(request, env = {}) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const originFailure = rejectUnapprovedOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return dashboardError("checking", 503);

  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return dashboardError("checking", 401);
  if (!auth.session.member_exists || !auth.session.member_id || !auth.session.member_profile) {
    try {
      await commitRotatedSession(env, auth);
    } catch {
      return dashboardError("checking", 503);
    }
    return json(buildCheckingDashboard(request, "member_checking"), 200, {
      cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)],
    });
  }

  try {
    await commitRotatedSession(env, auth);
  } catch {
    return dashboardError("checking", 503);
  }

  return json({ ok: true, data: buildMemberDashboardData(auth.session.member_profile, request) }, 200, {
    cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)],
  });
}

function dashboardError(state, status) {
  return json({
    ok: false,
    state,
    message: "กำลังตรวจสอบข้อมูล",
    error: "checking",
  }, status);
}

function buildCheckingDashboard(request, code = "checking") {
  return {
    ok: true,
    data: {
      dashboard_state: "checking",
      data_status: "checking",
      member: {
        display_name: "สมาชิก MMD",
        tier: checkingField("member_profile"),
        membership_status: checkingField("member_profile"),
      },
      points: {
        value: null,
        status: "checking",
        source: "points_ledger",
        records_count: null,
      },
      history: {
        status: "checking",
        range_days: 365,
        events: [],
        payment_history_status: "checking",
      },
      payment_history: {
        status: "checking",
        records: [],
        note: "Payment records are historical only and do not represent current payment status.",
      },
      actions: dashboardActions(request),
      messages: [{ code, text: "กำลังตรวจสอบข้อมูล" }],
    },
  };
}

function buildMemberDashboardData(profile = {}, request) {
  const tier = dashboardTier(profile);
  const membershipStatus = dashboardMembershipStatus(profile);
  const points = dashboardPoints(profile);
  const history = dashboardHistory(profile);
  const paymentHistory = dashboardPaymentHistory(profile);
  const fieldStatuses = [
    tier.status,
    membershipStatus.status,
    points.status,
    history.status,
    paymentHistory.status === "verified_history" || paymentHistory.status === "empty" ? "verified" : "checking",
  ];
  const dataStatus = fieldStatuses.every((status) => status === "verified" || status === "empty") ? "complete" : "partial";

  return {
    dashboard_state: dataStatus === "complete" ? "ready" : "partial",
    data_status: dataStatus,
    member: {
      display_name: dashboardDisplayName(profile.display_name),
      tier,
      membership_status: membershipStatus,
    },
    points,
    history,
    payment_history: paymentHistory,
    actions: dashboardActions(request),
    messages: dataStatus === "complete" ? [] : [{ code: "partial_data", text: "กำลังตรวจสอบข้อมูล" }],
  };
}

function checkingField(source) {
  return { value: null, status: "checking", source };
}

function verifiedField(value, source) {
  return { value, status: "verified", source };
}

function dashboardDisplayName(value) {
  return normalizeCustomerText(value, 120) || "สมาชิก MMD";
}

function dashboardTier(profile = {}) {
  const value = String(profile.tier || "").trim();
  if (!value || /^svip$/i.test(value)) return checkingField("member_profile");
  if (!["Member", "Standard", "Premium", "VIP", "Black Card"].includes(value)) return checkingField("member_profile");
  return verifiedField(value, "member_profile_resolver");
}

function dashboardMembershipStatus(profile = {}) {
  const status = String(profile.membership_status || "").trim().toLowerCase();
  if (status === "active" || status === "grace") return verifiedField("active", "member_profile_resolver");
  if (status === "expired") return verifiedField("expired", "member_profile_resolver");
  if (status === "under_review") return verifiedField("pending", "member_profile_resolver");
  return checkingField("member_profile_resolver");
}

function dashboardPoints(profile = {}) {
  const value = Number(profile.points);
  const recordsCount = profile.points_records_count === null || profile.points_records_count === undefined
    ? NaN
    : Number(profile.points_records_count);
  const hasVerifiedCount = Number.isInteger(recordsCount) && recordsCount >= 0;
  if (!Number.isFinite(value) || value < 0 || !hasVerifiedCount) {
    return { value: null, status: "checking", source: "points_ledger", records_count: null };
  }
  return {
    value: Math.trunc(value),
    status: "verified",
    source: "points_ledger",
    records_count: recordsCount,
  };
}

function dashboardHistory(profile = {}) {
  const events = Array.isArray(profile.history)
    ? profile.history.map(dashboardHistoryEvent).filter(Boolean).slice(0, 50)
    : [];
  const status = events.length ? "verified" : "empty";
  const paymentHistoryStatus = dashboardPaymentHistory(profile).status;
  return {
    status,
    range_days: 365,
    events,
    payment_history_status: paymentHistoryStatus,
  };
}

function dashboardHistoryEvent(item = {}) {
  const type = String(item.type || "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")) ? String(item.date) : "";
  if (!["service", "membership", "points"].includes(type) || !date) return null;
  const title = normalizeCustomerText(item.title, 80) || "MMD activity";
  const event = {
    type,
    occurred_at: `${date}T00:00:00.000Z`,
    title,
    summary: "รายการนี้ยืนยันแล้ว",
  };
  if (type === "points" && Number.isFinite(Number(item.points_delta))) {
    event.points_delta = Math.trunc(Number(item.points_delta));
  }
  return event;
}

function dashboardPaymentHistory(profile = {}) {
  const records = Array.isArray(profile.payment_history)
    ? profile.payment_history.map(dashboardPaymentRecord).filter(Boolean).slice(0, 20)
    : [];
  return {
    status: records.length ? "verified_history" : "empty",
    records,
    note: "Payment records are historical only and do not represent current payment status.",
  };
}

function dashboardPaymentRecord(item = {}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")) ? String(item.date) : "";
  const status = String(item.status || "").trim().toLowerCase();
  if (!date || !["verified", "settled", "completed"].includes(status)) return null;
  return {
    occurred_at: `${date}T00:00:00.000Z`,
    title: normalizeCustomerText(item.title, 80) || "Payment history",
    summary: "รายการชำระเงินที่ยืนยันแล้ว",
  };
}

function dashboardActions(request) {
  const query = safeDashboardQuery(new URL(request.url).searchParams);
  return {
    dashboard_url: appendDashboardQuery("/member/dashboard", query),
    requests_url: appendDashboardQuery("/sigil/booking", query),
    membership_url: appendDashboardQuery(CANONICAL_MEMBER_ROUTE, query),
    payments_url: appendDashboardQuery("/member/payments", query),
  };
}

function safeDashboardQuery(searchParams) {
  const safe = new URLSearchParams();
  for (const key of ["t", "code", "promo", "source", "invite"]) {
    const value = String(searchParams.get(key) || "").trim();
    if (value && value.length <= 2048 && /^[A-Za-z0-9._~-]+$/.test(value)) safe.set(key, value);
  }
  return safe;
}

function appendDashboardQuery(path, query) {
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function handleCareBackClaim(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (hasUnexpectedKeys(body, CARE_BACK_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();
  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  if (!auth.session.member_exists || !auth.session.member_id || !auth.session.identity_key) {
    return saveRotatedError(env, auth, "CARE_BACK_MEMBER_REQUIRED", "CARE BACK is available only after a verified member match.", 409);
  }
  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore) return saveRotatedError(env, auth, "LIFF_GATEWAY_STORAGE_NOT_CONFIGURED", "CARE BACK is temporarily unavailable.", 503);
  const store = getCareBackStore(env);
  if (!store) return saveRotatedError(env, auth, "CARE_BACK_STORAGE_NOT_CONFIGURED", "CARE BACK is temporarily unavailable.", 503);
  try {
    const result = await store.openOrResume({
      identityHash: auth.session.identity_key,
      memberId: auth.session.member_id,
      memberProfile: auth.session.member_profile,
    });
    applyCareBackClaimToSession(auth.session, result);
    await persistGatewaySession(env, gatewayStore, auth.session);
    await commitRotatedSession(env, auth);
    return json({ ok: true, data: safeCareBackClaim(result) }, 200, {
      cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)],
    });
  } catch (error) {
    const code = error instanceof CareBackStoreError ? error.code : "CARE_BACK_STORAGE_UNAVAILABLE";
    const campaignClosed = code === "CARE_BACK_CAMPAIGN_CLOSED";
    const status = code.endsWith("_CONFLICT") || campaignClosed ? 409 : 503;
    const message = campaignClosed
      ? "The CARE BACK campaign period is closed."
      : "CARE BACK is temporarily unavailable.";
    return saveRotatedError(env, auth, code, message, status);
  }
}

export async function handleCareBackState(request, env = {}) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const originFailure = rejectUnapprovedOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;

  const eligibility = careBackWishEligibility(auth.session);
  if (eligibility !== "wish_available") {
    return saveCareBackState(env, auth, eligibility, null);
  }

  const store = getBirthdayWishStore(env);
  if (!store) return saveRotatedError(env, auth, "BIRTHDAY_WISH_STORAGE_NOT_CONFIGURED", "Birthday Wish is temporarily unavailable.", 503);
  try {
    const expectedOwnership = {
      claimRecordId: auth.session.campaign_claim_record_id,
      verifiedCustomerRefHash: await keyedDigest(env, `wish-customer:${auth.session.identity_key}`),
    };
    let wish = await store.getBirthdayWishByClaim({ claimId: auth.session.campaign_claim_id });
    if (wish) assertBirthdayWishOwnership(wish, expectedOwnership);
    if (wish?.wish_status === "submitted") {
      const expectedRecordId = wish.record_id;
      wish = await store.completeBirthdayWish({
        recordId: expectedRecordId,
        publicDisplayText: birthdayWishDisplay(auth.session.language),
        completedAt: new Date().toISOString(),
      });
      if (wish?.record_id !== expectedRecordId) {
        throw new BirthdayWishStorageError("BIRTHDAY_WISH_STORAGE_MALFORMED");
      }
      assertBirthdayWishOwnership(wish, expectedOwnership);
    }
    if (!wish) {
      const coordinator = await getBirthdayWishCoordinatorState(env, auth.session.campaign_claim_id);
      if (coordinator.state === "pending_recovery") {
        return saveCareBackState(env, auth, "write_pending", null);
      }
      if (coordinator.state === "reconciliation_required") {
        return saveCareBackState(env, auth, "reconciliation_required", null);
      }
    }
    const state = birthdayWishState(wish);
    return saveCareBackState(env, auth, state, wish);
  } catch (error) {
    return saveBirthdayWishError(env, auth, error);
  }
}

export async function handleCareBackWish(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (hasUnexpectedKeys(body, CARE_BACK_WISH_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();
  const input = normalizeBirthdayWishInput(body);
  if (!input.ok) return json({ ok: false, error: { code: input.code, message: input.message } }, 400);

  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  const eligibility = careBackWishEligibility(auth.session);
  if (eligibility !== "wish_available") {
    const code = eligibility === "verification_required"
      ? "CARE_BACK_MEMBER_REQUIRED"
      : eligibility === "claim_required"
        ? "CARE_BACK_CLAIM_REQUIRED"
        : eligibility === "manual_review"
          ? "CARE_BACK_REVIEW_REQUIRED"
          : "CARE_BACK_WISH_NOT_AVAILABLE";
    return saveRotatedError(env, auth, code, "Birthday Wish is not available for this verified campaign state.", 409);
  }

  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore) return saveRotatedError(env, auth, "LIFF_GATEWAY_STORAGE_NOT_CONFIGURED", "CARE BACK is temporarily unavailable.", 503);
  const careBackStore = getCareBackStore(env);
  if (!careBackStore) return saveRotatedError(env, auth, "CARE_BACK_STORAGE_NOT_CONFIGURED", "CARE BACK is temporarily unavailable.", 503);

  try {
    const wish = await createOrLoadBirthdayWishThroughCoordinator(
      env,
      auth.session.campaign_claim_id,
      {
        claimId: auth.session.campaign_claim_id,
        claimRecordId: auth.session.campaign_claim_record_id,
        idempotencyKey: input.requestId,
        verifiedCustomerRefHash: await keyedDigest(env, `wish-customer:${auth.session.identity_key}`),
        wishText: input.wishText,
        wishOption: input.wishOption,
        language: auth.session.language === "en" ? "en" : "th",
        publicDisplayText: birthdayWishDisplay(auth.session.language),
        now: new Date().toISOString(),
      },
    );
    if (wish?.wish_status === "revoked" || wish?.wish_status === "manual_review") {
      return saveRotatedError(env, auth, "CARE_BACK_REVIEW_REQUIRED", "Birthday Wish is under private review.", 409);
    }
    const claim = await careBackStore.openOrResume({
      identityHash: auth.session.identity_key,
      memberId: auth.session.member_id,
      memberProfile: auth.session.member_profile,
      wishSubmitted: true,
    });
    applyCareBackClaimToSession(auth.session, claim);
    await persistGatewaySession(env, gatewayStore, auth.session);
    await commitRotatedSession(env, auth);
    return json(careBackWishResponse(birthdayWishState(wish), wish, claim), 200, {
      cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)],
    });
  } catch (error) {
    return saveBirthdayWishError(env, auth, error);
  }
}

export async function handleHallToken(request, env = {}) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const originFailure = requireSameOrigin(request, env);
  if (originFailure) return originFailure;
  if (!hasFoundationBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore) return unavailable("LIFF_GATEWAY_STORAGE_NOT_CONFIGURED");
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (hasUnexpectedKeys(body, HALL_BODY_KEYS) || hasBrowserIdentityClaims(body)) return browserIdentityRejected();
  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  if (auth.session.liff_intent !== "hall" || !isVisibleHallMode(auth.session.model_visibility_mode)) {
    return saveRotatedError(env, auth, "HALL_AUDIENCE_REQUIRED", "Choose the appropriate route first.", 409);
  }
  if (!hasAtomicSessionReplayGuard(env)) {
    auth.session.route_after_liff = null;
    auth.session.next_screen_key = "session_guard_required";
    return saveGatewayStateError(
      env,
      gatewayStore,
      auth,
      "LIFF_ATOMIC_SESSION_GUARD_REQUIRED",
      "This protected step is not available yet.",
      503,
    );
  }
  try {
    if (!await gatewayStore.hasHallAudienceInventory(auth.session.hall_audience_context)) {
      return saveRotatedError(env, auth, "HALL_REVIEW_REQUIRED", "This route needs private review first.", 409);
    }
    const { token, payload } = await createHallRouteToken(env);
    const tokenHash = await keyedDigest(env, `hall:${token}`);
    const jtiHash = await keyedDigest(env, `hall-jti:${payload.jti}`);
    auth.session.signed_route_token_hash = tokenHash;
    auth.session.route_after_liff = "/hall";
    auth.session.next_screen_key = "hall_route";
    await env.LIFF_IDENTITY_KV.put(`liff:hall:${jtiHash}`, JSON.stringify({
      session_id: auth.session.session_id,
      model_visibility_mode: auth.session.model_visibility_mode,
      token_hash: tokenHash,
      expires_at: payload.exp,
    }), { expirationTtl: HALL_TOKEN_TTL_SECONDS });
    await persistGatewaySession(env, gatewayStore, auth.session);
    await recordGatewayDecision(gatewayStore, auth.session);
    await commitRotatedSession(env, auth);
    return json({ ok: true, data: { redirect_to: `/hall?t=${encodeURIComponent(token)}`, expires_in: HALL_TOKEN_TTL_SECONDS } }, 200, {
      cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)],
    });
  } catch (error) {
    return gatewayStorageFailure(error);
  }
}

async function verifyLineIdToken(idToken, env) {
  const channelIds = approvedLineChannelIds(env);
  if (!channelIds.length) return { ok: false, status: 503, code: "LINE_CHANNEL_NOT_CONFIGURED", message: "LINE verification is not configured." };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.LIFF_VERIFY_TIMEOUT_MS || VERIFY_TIMEOUT_MS));
  try {
    const verifyUrl = env.LINE_ID_TOKEN_VERIFY_URL || LINE_VERIFY_URL;
    // Audience selection is server-owned. The browser supplies only the opaque
    // ID token; it cannot name, add, or reorder verification audiences.
    for (const channelId of channelIds) {
      const verifyInit = {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
        signal: controller.signal,
      };
      const response = env.LINE_ID_TOKEN_VERIFIER?.fetch
        ? await env.LINE_ID_TOKEN_VERIFIER.fetch(new Request(verifyUrl, verifyInit))
        : await fetch(verifyUrl, verifyInit);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object") continue;
      const sub = String(payload.sub || "").trim();
      const aud = String(payload.aud || "").trim();
      const exp = Number(payload.exp || 0);
      if (sub && aud === channelId && Number.isFinite(exp) && exp * 1000 > Date.now()) return { ok: true, sub };
    }
    return { ok: false, status: 401, code: "LINE_ID_TOKEN_INVALID", message: "LINE identity verification failed." };
  } catch (error) {
    if (error?.name === "AbortError") return { ok: false, status: 504, code: "LINE_VERIFY_TIMEOUT", message: "LINE identity verification timed out." };
    return { ok: false, status: 502, code: "LINE_VERIFY_FAILED", message: "LINE identity verification failed." };
  } finally {
    clearTimeout(timeout);
  }
}

function approvedLineChannelIds(env) {
  const values = [env.LINE_LOGIN_CHANNEL_ID, env.LINE_DASHBOARD_CHANNEL_ID]
    .map((value) => String(value || "").trim())
    .filter((value) => /^[A-Za-z0-9_-]{6,160}$/.test(value));
  return [...new Set(values)].slice(0, 2);
}

async function resolveExistingMember(env, lineUserId) {
  const resolver = env.MEMBER_STATUS_RESOLVER;
  const resolverSecret = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  if (!resolver?.fetch || resolverSecret.length < 32) return { ok: false, exists: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.LIFF_MEMBER_RESOLVER_TIMEOUT_MS || MEMBER_RESOLVER_TIMEOUT_MS));
  try {
    const response = await resolver.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_RESOLVER_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MEMBER_RESOLVER_SECRET_HEADER]: resolverSecret,
      },
      body: JSON.stringify({ line_user_id: lineUserId, purpose: MEMBER_RESOLVER_PURPOSE }),
      signal: controller.signal,
    }));
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok === false) return { ok: false, exists: false };
    const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
    if (typeof data.member_exists !== "boolean") return { ok: false, exists: false };
    return { ok: true, exists: data.member_exists };
  } catch {
    return { ok: false, exists: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveMemberProfile(env, lineUserId) {
  const resolver = env.MEMBER_STATUS_RESOLVER;
  const resolverSecret = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  if (!resolver?.fetch || resolverSecret.length < 32) return { ok: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(env.LIFF_MEMBER_RESOLVER_TIMEOUT_MS || MEMBER_RESOLVER_TIMEOUT_MS));
  try {
    const response = await resolver.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_PROFILE_RESOLVER_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MEMBER_RESOLVER_SECRET_HEADER]: resolverSecret,
      },
      body: JSON.stringify({ line_user_id: lineUserId, purpose: MEMBER_PROFILE_RESOLVER_PURPOSE }),
      signal: controller.signal,
    }));
    const payload = await response.json().catch(() => null);
    const data = payload?.data && typeof payload.data === "object" ? payload.data : null;
    if (!response.ok || payload?.ok === false || data?.member_exists !== true || !data.member_id || !data.profile) return { ok: false };
    return { ok: true, member_id: String(data.member_id).trim().slice(0, 160), profile: safeMemberProfile(data.profile) };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function getOrCreatePendingIdentity(env, identityKey) {
  const key = `liff:pending:${identityKey}`;
  const existing = await env.LIFF_IDENTITY_KV.get(key, "json");
  if (existing?.pending_identity_id) return existing;
  const record = { pending_identity_id: `pid_${identityKey.slice(0, 18)}`, state: "pending_identity", created_at: new Date().toISOString() };
  await env.LIFF_IDENTITY_KV.put(key, JSON.stringify(record));
  return record;
}

async function issueSession(env, data) {
  const token = randomToken(32);
  const hash = await keyedDigest(env, `session:${token}`);
  const now = Date.now();
  const session = { ...data, session_id: crypto.randomUUID(), issued_at: now, expires_at: now + SESSION_TTL_SECONDS * 1000, rotation: 0 };
  await saveSession(env, hash, session, SESSION_TTL_SECONDS);
  return { token, hash, session };
}

async function authenticateAndRotate(request, env) {
  // KV rotation is bounded and non-atomic. Keep the prior session until the
  // replacement state is persisted so a dependency failure cannot strand it.
  // Live-sensitive actions remain blocked until an atomic guard exists.
  const auth = await authenticateSession(request, env);
  if (!auth.ok) return auth;
  const newToken = randomToken(32);
  const newHash = await keyedDigest(env, `session:${newToken}`);
  auth.session.rotation = Number(auth.session.rotation || 0) + 1;
  auth.session.expires_at = Date.now() + SESSION_TTL_SECONDS * 1000;
  return { ok: true, session: auth.session, key: auth.key, newToken, newHash };
}

async function authenticateSession(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return authFailure("LIFF_SESSION_REQUIRED", "Authenticated LIFF session required.");
  const hash = await keyedDigest(env, `session:${token}`);
  const key = `liff:session:${hash}`;
  const session = await env.LIFF_IDENTITY_KV.get(key, "json");
  if (!session || Number(session.expires_at || 0) <= Date.now()) {
    if (session) await env.LIFF_IDENTITY_KV.delete(key);
    return authFailure("LIFF_SESSION_INVALID", "LIFF session is invalid or expired.");
  }
  return { ok: true, session, key };
}

async function saveSession(env, hash, session, ttl) {
  await env.LIFF_IDENTITY_KV.put(`liff:session:${hash}`, JSON.stringify(session), { expirationTtl: ttl });
}

async function commitRotatedSession(env, auth) {
  await saveSession(env, auth.newHash, auth.session, SESSION_TTL_SECONDS);
  await env.LIFF_IDENTITY_KV.delete(auth.key);
}

async function signHallRouteToken(env, payload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await signHmacBase64Url(env, encoded);
  return `${encoded}.${signature}`;
}

export async function createHallRouteToken(env = {}) {
  const now = Date.now();
  const payload = {
    v: 1,
    aud: "hall",
    iat: now,
    exp: now + HALL_TOKEN_TTL_SECONDS * 1000,
    jti: crypto.randomUUID(),
  };
  return { token: await signHallRouteToken(env, payload), payload };
}

export async function verifyHallRouteToken(token, env = {}) {
  const parsed = parseHallRouteToken(token);
  if (!parsed) return { ok: false, code: "HALL_TOKEN_INVALID" };
  if (!await verifyHallRouteSignature(env, parsed.encoded, parsed.signature) || !isValidHallPayload(parsed.payload)) return { ok: false, code: "HALL_TOKEN_INVALID" };
  if (parsed.payload.exp <= Date.now()) return { ok: false, code: "HALL_TOKEN_EXPIRED" };
  const tokenHash = await keyedDigest(env, `hall:${token}`);
  const jtiHash = await keyedDigest(env, `hall-jti:${parsed.payload.jti}`);
  const stored = await env.LIFF_IDENTITY_KV?.get(`liff:hall:${jtiHash}`, "json");
  if (!stored || stored.token_hash !== tokenHash || Number(stored.expires_at || 0) <= Date.now()) return { ok: false, code: "HALL_TOKEN_INVALID" };
  return { ok: true, context: { session_id: stored.session_id, model_visibility_mode: stored.model_visibility_mode } };
}

function parseHallRouteToken(token) {
  const value = String(token || "").trim();
  const parts = value.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    return payload && typeof payload === "object" ? { encoded: parts[0], signature: parts[1], payload } : null;
  } catch {
    return null;
  }
}

function isValidHallPayload(payload) {
  return payload.v === 1
    && payload.aud === "hall"
    && Number.isFinite(payload.iat)
    && Number.isFinite(payload.exp)
    && payload.exp > payload.iat
    && payload.exp - payload.iat <= HALL_TOKEN_TTL_SECONDS * 1000 + 1000
    && typeof payload.jti === "string" && /^[0-9a-f-]{36}$/i.test(payload.jti);
}

async function signHmacBase64Url(env, value) {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(value));
  return base64UrlFromBytes(new Uint8Array(signature));
}

async function verifyHallRouteSignature(env, encoded, signature) {
  try {
    return crypto.subtle.verify("HMAC", await hmacKey(env), base64UrlBytes(signature), new TextEncoder().encode(encoded));
  } catch {
    return false;
  }
}

async function persistGatewayStart(env, gatewayStore, session) {
  await persistGatewaySession(env, gatewayStore, session);
}

async function persistGatewaySession(env, gatewayStore, session) {
  const sessionId = String(session.session_id || "").trim();
  if (!sessionId) throw new LiffGatewayStorageError("LIFF_GATEWAY_SESSION_INVALID");
  const mappingHash = await keyedDigest(env, `gateway-record:${sessionId}`);
  const mappingKey = `liff:gateway-record:${mappingHash}`;
  const existing = session.gateway_record_id ? null : await env.LIFF_IDENTITY_KV.get(mappingKey, "json");
  const record = await gatewayStore.upsertSession(gatewaySessionRecord(session), session.gateway_record_id || existing?.record_id || "");
  const recordId = String(record?.record_id || "").trim();
  if (!recordId) throw new LiffGatewayStorageError("LIFF_GATEWAY_STORAGE_MALFORMED");
  session.gateway_record_id = recordId;
  await env.LIFF_IDENTITY_KV.put(mappingKey, JSON.stringify({ record_id: recordId }), { expirationTtl: 60 * 60 * 24 * 30 });
}

async function recordGatewayDecision(gatewayStore, session) {
  await gatewayStore.recordDecision({
    liff_session_id: session.session_id,
    hype_decision_status: session.hype_decision_status,
    hall_audience_context: session.hall_audience_context,
    model_visibility_mode: session.model_visibility_mode,
    pricing_lane: session.pricing_lane,
    route_after_liff: session.route_after_liff,
  });
}

function gatewaySessionRecord(session) {
  return {
    session_id: session.session_id,
    liff_intent: session.liff_intent,
    source_channel: session.source_channel,
    hype_decision_status: session.hype_decision_status,
    hall_audience_context: session.hall_audience_context,
    model_visibility_mode: session.model_visibility_mode,
    pricing_lane: session.pricing_lane,
    payment_intent_session_id: session.payment_intent_session_id,
    route_after_liff: session.route_after_liff,
    signed_route_token_hash: session.signed_route_token_hash,
    campaign_code: session.campaign_code,
    campaign_claim_id: session.campaign_claim_id,
    promo_code: session.promo_code,
    promo_status: session.promo_status,
  };
}

function fallbackScreen(key) {
  if (key === "audience_select") {
    return {
      key,
      copy: "เพื่อแสดงข้อมูลที่เหมาะกับคุณ HYPE ขอเลือกประเภทการใช้งานก่อนนะครับ",
      actions: [{ id: "choose_audience", label: "เลือกประเภทการใช้งาน", endpoint: "/member/api/liff/audience", method: "POST" }],
    };
  }
  if (key === "signup_package") {
    return {
      key,
      copy: "HYPE จะช่วยแนะนำแพ็กเกจที่เหมาะกับขั้นตอนนี้ครับ",
      actions: [{ id: "select_package", label: "เลือกแพ็กเกจ", endpoint: "/member/api/liff/package", method: "POST" }],
    };
  }
  if (key === "hall_route") {
    return {
      key,
      copy: "HYPE จะพาคุณเข้าสู่ Hall และแสดงเฉพาะข้อมูลที่เหมาะกับเส้นทางของคุณครับ",
      actions: [{ id: "open_hall", label: "เข้าสู่ Hall", endpoint: "/member/api/liff/hall-token", method: "POST" }],
    };
  }
  if (key === "manual_review") {
    return {
      key,
      copy: "ข้อมูลบางส่วนยังต้องให้ตรวจสอบก่อน เพื่อให้การดูแลเป็นส่วนตัวและเหมาะสมที่สุดครับ",
      actions: [],
    };
  }
  if (key === "renew_member_lookup") {
    return { key, copy: "HYPE จะตรวจสอบข้อมูลสมาชิกอย่างระมัดระวังก่อนพาไปต่อครับ", actions: [] };
  }
  if (key === "status_result") {
    return { key, copy: "HYPE กำลังดูแลเส้นทางตรวจสอบข้อมูลสมาชิกให้อย่างปลอดภัยครับ", actions: [] };
  }
  if (key === "payment_start") {
    return {
      key,
      copy: "HYPE จะเตรียมขั้นตอนชำระเงินให้หลังเลือกแพ็กเกจครับ",
      actions: [{ id: "start_payment", label: "ไปต่อที่การชำระเงิน", endpoint: "/member/api/liff/payment-intent", method: "POST" }],
    };
  }
  if (key === "payment_unavailable") {
    return {
      key,
      copy: "ขั้นตอนชำระเงินยังไม่พร้อมใช้งานในตอนนี้ครับ",
      actions: [],
    };
  }
  if (key === "session_guard_required") {
    return {
      key,
      copy: "ขั้นตอนนี้ยังไม่พร้อมให้ดำเนินการต่อในตอนนี้ครับ",
      actions: [],
    };
  }
  return {
    key: "start_intent",
    copy: "ยินดีต้อนรับสู่ MMD Privé\nHYPE จะช่วยพาคุณไปยังขั้นตอนที่เหมาะกับคุณที่สุดครับ",
    actions: [
      { id: "signup", label: "สมัครสมาชิกใหม่", endpoint: "/member/api/liff/intent", method: "POST" },
      { id: "renew", label: "ต่ออายุสมาชิก", endpoint: "/member/api/liff/intent", method: "POST" },
      { id: "status", label: "ตรวจสอบสถานะสมาชิก", endpoint: "/member/api/liff/intent", method: "POST" },
    ],
  };
}

function nextScreenForIntent(intent, memberExists = false) {
  if (["signup", "promo", "hall"].includes(intent)) return "audience_select";
  if (intent === "renew") return "renew_member_lookup";
  if (intent === "continue_payment") return memberExists ? "payment_start" : "renew_member_lookup";
  return "status_result";
}

function applyGatewayIntent(session, intent) {
  session.liff_intent = intent;
  session.hall_audience_context = "unknown";
  session.model_visibility_mode = "hold_until_selected";
  session.pricing_lane = "unknown";
  if (intent === "unknown") {
    session.hype_decision_status = "asking_intent";
    session.route_after_liff = null;
    session.next_screen_key = "start_intent";
    return;
  }
  if (["signup", "promo", "hall"].includes(intent) && session.hall_audience_context === "unknown") {
    session.hype_decision_status = "asking_audience";
    session.route_after_liff = null;
    session.next_screen_key = "audience_select";
    return;
  }
  session.hype_decision_status = "decided";
  session.next_screen_key = nextScreenForIntent(intent, session.member_exists === true);
  session.route_after_liff = intent === "renew" && session.member_exists === true
    ? CANONICAL_MEMBER_ROUTE
    : intent === "continue_payment" && session.member_exists === true
      ? "/member/payments"
      : null;
}

function applyAudience(session, audience) {
  session.hall_audience_context = audience;
  session.model_visibility_mode = audience === "female_view" ? "show_female_profiles" : "show_lgbt_profiles";
  session.pricing_lane = audience === "female_view" ? "believe_member_2999" : "gay_extreme_900";
  session.hype_decision_status = "decided";
  if (session.liff_intent === "hall") {
    session.route_after_liff = "/hall";
    session.next_screen_key = "hall_route";
  } else if (session.liff_intent === "promo") {
    session.route_after_liff = "/member/promotion";
    session.next_screen_key = "signup_package";
  } else {
    session.route_after_liff = CANONICAL_MEMBER_ROUTE;
    session.next_screen_key = "signup_package";
  }
}

function applyManualReview(session) {
  session.hall_audience_context = "manual_review";
  session.model_visibility_mode = "manual_review_only";
  session.pricing_lane = "special_review";
  session.hype_decision_status = "manual_review";
  session.route_after_liff = "manual_review";
  session.next_screen_key = "manual_review";
}

function applyUnknownAudience(session) {
  session.hall_audience_context = "unknown";
  session.model_visibility_mode = "hold_until_selected";
  session.pricing_lane = "unknown";
  session.hype_decision_status = "asking_audience";
  session.route_after_liff = null;
  session.next_screen_key = "audience_select";
}

function invalidatePackageSelection(session) {
  session.selected_package = null;
  session.payment_intent_session_id = null;
  session.payment_binding_status = null;
}

function packageContextForSession(session) {
  return {
    liff_intent: session.liff_intent || "unknown",
    hall_audience_context: session.hall_audience_context || "unknown",
    model_visibility_mode: session.model_visibility_mode || "hold_until_selected",
    pricing_lane: session.pricing_lane || "unknown",
    promo_code: session.promo_code || null,
    hype_decision_status: session.hype_decision_status || "not_started",
  };
}

function selectedPackageForSession(packageRule, session) {
  return {
    ...packageRule,
    context: {
      ...packageContextForSession(session),
      package_code: packageRule.package_code,
      resolved_at: new Date().toISOString(),
    },
  };
}

function samePackageContext(a, b) {
  return a.liff_intent === b.liff_intent
    && a.hall_audience_context === b.hall_audience_context
    && a.model_visibility_mode === b.model_visibility_mode
    && a.pricing_lane === b.pricing_lane
    && a.promo_code === b.promo_code
    && a.hype_decision_status === b.hype_decision_status;
}

function isSelectedPackageCurrent(selected, currentPackage, session) {
  const context = selected?.context;
  return Boolean(context)
    && context.package_code === selected.package_code
    && samePackageContext(context, packageContextForSession(session))
    && selected.package_code === currentPackage.package_code
    && selected.pricing_lane === currentPackage.pricing_lane
    && selected.amount_thb === currentPackage.amount_thb
    && selected.duration_days === currentPackage.duration_days
    && selected.points_after_verification === currentPackage.points_after_verification
    && selected.requires_manual_review === currentPackage.requires_manual_review;
}

function requiresMemberLookupForProtectedFlow(session) {
  // No approved payments-worker contract currently verifies recoverable payment
  // sessions or member status, so only the internal member resolver can
  // satisfy these protected flows.
  return ["renew", "continue_payment", "status"].includes(session.liff_intent)
    && session.member_exists !== true;
}

function isStatusOnlyFlow(session) {
  return session.liff_intent === "status";
}

function applyMemberLookupRequired(session) {
  invalidatePackageSelection(session);
  session.route_after_liff = null;
  session.next_screen_key = "renew_member_lookup";
}

async function saveMemberLookupRequired(env, gatewayStore, auth) {
  applyMemberLookupRequired(auth.session);
  return saveGatewayStateError(
    env,
    gatewayStore,
    auth,
    "MEMBER_LOOKUP_REQUIRED",
    "Member verification is required before this step.",
    409,
  );
}

function applyStatusFlowOnly(session) {
  invalidatePackageSelection(session);
  session.route_after_liff = null;
  session.next_screen_key = "status_result";
}

async function saveStatusFlowOnly(env, gatewayStore, auth) {
  applyStatusFlowOnly(auth.session);
  return saveGatewayStateError(
    env,
    gatewayStore,
    auth,
    "STATUS_FLOW_ONLY",
    "This session is limited to member status.",
    409,
  );
}

function isPackageAllowedForSession(packageRule, session) {
  if (!packageRule || typeof packageRule !== "object") return false;
  if (requiresMemberLookupForProtectedFlow(session) || isStatusOnlyFlow(session)) return false;
  if (packageRule.requires_manual_review) return true;
  if (session.hall_audience_context === "female_view") return packageRule.pricing_lane === "believe_member_2999";
  if (session.hall_audience_context === "lgbt_view") return packageRule.pricing_lane === "gay_extreme_900";
  return ["standard_1199", "premium_2999"].includes(packageRule.pricing_lane) && ["renew", "continue_payment"].includes(session.liff_intent);
}

function safePaymentSummary(packageRule) {
  return {
    package_code: packageRule.package_code,
    amount_thb: packageRule.amount_thb,
    duration_days: packageRule.duration_days,
    points_after_verification: packageRule.points_after_verification,
    payment_status: "not_paid",
  };
}

async function safeSessionView(gatewayStore, session) {
  const screen = await resolveScreen(gatewayStore, session.next_screen_key || "start_intent");
  return {
    identity_state: session.member_exists ? "existing_member" : "pending_identity",
    member_resolved: Boolean(session.member_exists),
    pending_identity: !session.member_exists,
    intent: session.intent || "member_status",
    next_screen_key: screen.key,
    screen,
    route_after_liff: session.route_after_liff || null,
    ...(session.payment_binding_status ? { payment_binding_status: session.payment_binding_status } : {}),
    expires_in: SESSION_TTL_SECONDS,
    grants: noGrants(),
  };
}

async function resolveScreen(gatewayStore, screenKey) {
  try {
    const configured = await gatewayStore.loadScreen(screenKey);
    if (configured) return configured;
  } catch {
    // A missing copy record must never weaken routing or identity decisions.
  }
  return fallbackScreen(screenKey);
}

function requireSameOrigin(request, env) {
  if (!isApprovedOrigin(request, env)) return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
  return null;
}

function rejectUnapprovedOrigin(request, env) {
  const origin = request.headers.get("origin") || "";
  if (origin && !isApprovedOrigin(request, env)) {
    return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
  }
  return null;
}

function isApprovedOrigin(request, env) {
  const origin = request.headers.get("origin") || "";
  if (APPROVED_ORIGINS.has(origin)) return true;
  if (String(env?.CARE_BACK_STAGING_MODE || "") !== "synthetic") return false;
  const url = new URL(request.url);
  return url.hostname.endsWith(".workers.dev") && origin === url.origin;
}

function withLiffCors(request, response, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin") || "";
  if (isApprovedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  else headers.delete("access-control-allow-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function sessionCookie(value, maxAge) { return hostCookie(SESSION_COOKIE, value, maxAge); }
function hostCookie(name, value, maxAge) { return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`; }
function clearCookie(name) { return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`; }
function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return exactToken(rest.join("="));
  }
  return "";
}

function hasFoundationBindings(env) { return Boolean(env.LIFF_IDENTITY_KV && env.MEMBER_STATUS_RESOLVER?.fetch && hasMemberResolverSecret(env) && env.LINE_LOGIN_CHANNEL_ID && env.LIFF_SESSION_SECRET); }
function hasMemberResolverSecret(env) { return String(env.MEMBER_STATUS_RESOLVER_SECRET || "").length >= 32; }
function hasAtomicSessionReplayGuard(_env) {
  // A Durable Object or equivalent atomic guard has not been approved for this
  // foundation. Do not enable sensitive Hall handoff by configuration alone.
  return false;
}
function isLiffPrefix(path) { return path === "/member/api/liff" || path.startsWith("/member/api/liff/"); }
function isMmsMemberPrefix(path) { return path === "/member/api/mms" || path.startsWith("/member/api/mms/") || path === "/member/api/liff/mms" || path.startsWith("/member/api/liff/mms/"); }
function hasBrowserIdentityClaims(body) { return BROWSER_IDENTITY_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(body, key)); }
function hasUnexpectedKeys(body, allowed) { return Object.keys(body || {}).some((key) => !allowed.has(key)); }
function normalizeLiffIntent(value) { const intent = String(value || "unknown").trim().toLowerCase(); return LIFF_INTENTS.has(intent) ? intent : "unknown"; }
function normalizeCampaign(value) { return String(value || "").trim().toLowerCase() === CARE_BACK_CAMPAIGN ? CARE_BACK_CAMPAIGN : ""; }
function normalizeAudience(value) { const audience = String(value || "").trim().toLowerCase(); return HALL_AUDIENCES.has(audience) ? audience : ""; }
function normalizePackageCode(value) { const code = String(value || "").trim().toLowerCase(); return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(code) ? code : ""; }
function normalizePromoCode(value) { const code = String(value || "").trim().toLowerCase(); return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(code) ? code : ""; }
function normalizePaymentStage(value) { const stage = String(value || "").trim().toLowerCase(); return stage === "membership" || stage === "renewal" ? stage : ""; }
function singleIdToken(body) { if (body.id_token && body.line_id_token) return ""; return exactToken(body.id_token || body.line_id_token); }
function requiresAudience(intent) { return intent === "signup" || intent === "promo" || intent === "hall"; }
function isVisibleHallMode(mode) { return mode === "show_female_profiles" || mode === "show_lgbt_profiles"; }
function normalizeIntent(value) { const intent = String(value || "member_status").trim().toLowerCase(); return new Set(["member_status", "dashboard", "booking_request", "public_access", "hall"]).has(intent) ? intent : "member_status"; }
function cleanContinuity(value) { const token = String(value || "").trim(); return token && token.length <= 2048 && /^[A-Za-z0-9._~-]+$/.test(token) ? token : null; }
function exactToken(value) { const token = String(value || "").trim(); return token && token.length <= 8192 && /^[A-Za-z0-9._~-]+$/.test(token) ? token : ""; }
function noGrants() { return { membership: false, points: false, payment_status: false, private_access: false }; }

function careBackNoGrants() {
  return {
    payment: false,
    membership: false,
    points: false,
    hall: false,
    black_card: false,
    svip: false,
    booking: false,
    access: false,
  };
}

function validAirtableRecordId(value) {
  const recordId = String(value || "").trim();
  return /^rec[A-Za-z0-9]{14}$/.test(recordId) ? recordId : "";
}

function applyCareBackClaimToSession(session, result = {}) {
  session.campaign_code = "6-years-care-back";
  session.campaign_claim_id = String(result.claim_reference || "");
  session.campaign_claim_record_id = validAirtableRecordId(result.claim_record_id);
  session.campaign_claim_status = String(result.claim_status || "identity_verified");
  session.campaign_review_status = String(result.review_status || "pending");
  session.promo_code = String(result.personal_code || "");
  session.promo_status = String(result.code_status || "draft");
}

function careBackWishEligibility(session = {}) {
  if (!session.member_exists || !session.member_id || !session.identity_key) return "verification_required";
  if (session.liff_intent !== "promo" || session.promotion_campaign !== CARE_BACK_CAMPAIGN) return "not_eligible";
  if (!session.campaign_claim_id || !validAirtableRecordId(session.campaign_claim_record_id)) return "claim_required";
  if (["blocked", "rejected"].includes(session.campaign_claim_status)) return "not_eligible";
  if (["manual_review", "in_review", "blocked"].includes(session.campaign_review_status)) return "manual_review";
  return "wish_available";
}

function normalizeBirthdayWishInput(body) {
  const requestId = String(body.request_id || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/.test(requestId)) {
    return { ok: false, code: "BIRTHDAY_WISH_REQUEST_ID_INVALID", message: "A bounded request_id is required." };
  }
  const wishText = normalizeCustomerText(body.wish_text, 600);
  const wishOption = normalizeCustomerText(body.wish_option, 120);
  if (wishText === null || wishOption === null) {
    return { ok: false, code: "BIRTHDAY_WISH_CONTENT_INVALID", message: "Birthday Wish content is invalid." };
  }
  if (!wishText && !wishOption) {
    return { ok: false, code: "BIRTHDAY_WISH_CONTENT_REQUIRED", message: "Birthday Wish content is required." };
  }
  return { ok: true, requestId, wishText, wishOption };
}

function normalizeCustomerText(value, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value).replace(/\r\n?/g, "\n").trim();
  if (!text || [...text].length > maxLength || /[<>]/.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  return text;
}

function birthdayWishDisplay(language) {
  return language === "en"
    ? "MMD has received your birthday wish. Your message is saved privately and will be here when you return."
    : "MMD ได้รับคำอวยพรของคุณแล้วครับ ข้อความนี้ถูกเก็บไว้อย่างเป็นส่วนตัว และจะยังอยู่เมื่อคุณกลับมาอีกครั้ง";
}

function birthdayWishState(wish) {
  if (!wish) return "wish_available";
  if (wish.wish_status === "completed") return "completed";
  if (wish.wish_status === "submitted") return "submitted";
  return "manual_review";
}

function careBackWishResponse(state, wish, claim) {
  const response = { ok: true, state, grants: careBackNoGrants() };
  if (wish) {
    response.wish = {
      text: String(wish.wish_text || ""),
      option: String(wish.wish_option || ""),
      submitted_at: String(wish.submitted_at || ""),
    };
  }
  if (state === "completed") {
    response.final_display = {
      message: String(wish?.public_display_text || birthdayWishDisplay(wish?.language)),
      next_action: "return_to_care_back",
    };
  }
  if (claim) response.claim = safeCareBackClaim(claim);
  return response;
}

function safeMemberProfile(input = {}) {
  const history = Array.isArray(input.history) ? input.history.slice(0, 50).map((item) => {
    const type = ["service", "membership", "points"].includes(item?.type) ? item.type : "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || "")) ? String(item.date) : "";
    if (!type || !date) return null;
    const safe = {
      type,
      date,
      title: String(item.title || "MMD activity").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80),
      status: String(item.status || "").replace(/[^a-z_]/g, "").slice(0, 32),
    };
    if (type === "points" && Number.isFinite(Number(item.points_delta))) safe.points_delta = Math.trunc(Number(item.points_delta));
    return safe;
  }).filter(Boolean) : [];
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(input.history_window?.from || "")) ? String(input.history_window.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(input.history_window?.to || "")) ? String(input.history_window.to) : "";
  const paymentHistory = Array.isArray(input.payment_history) ? input.payment_history.slice(0, 20).map((item) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || "")) ? String(item.date) : "";
    const status = ["verified", "settled", "completed"].includes(String(item?.status || "")) ? String(item.status) : "";
    if (!date || !status) return null;
    return {
      date,
      title: String(item.title || "Payment history").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80),
      status,
    };
  }).filter(Boolean) : [];
  const pointsRecordsCount = Number(input.points_records_count);
  const profile = {
    display_name: String(input.display_name || "สมาชิก MMD").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120),
    tier: ["Member", "Standard", "Premium", "VIP", "SVIP", "Black Card"].includes(input.tier) ? input.tier : "Member",
    membership_status: ["active", "grace", "expired", "under_review"].includes(input.membership_status) ? input.membership_status : "under_review",
    payment_status: ["verified", "pending_review", "unavailable"].includes(input.payment_status) ? input.payment_status : "unavailable",
    points: Number.isFinite(Number(input.points)) && Number(input.points) >= 0 ? Math.trunc(Number(input.points)) : 0,
    points_records_count: Number.isInteger(pointsRecordsCount) && pointsRecordsCount >= 0 ? pointsRecordsCount : null,
    payment_history: paymentHistory,
    history_window: { from, to, timezone: "Asia/Bangkok" },
    history,
  };
  const membershipExpiresAt = strictMemberCalendarDate(input.membership_expires_at);
  if (["active", "grace"].includes(profile.membership_status) && membershipExpiresAt) {
    profile.membership_expires_at = membershipExpiresAt;
  }
  return profile;
}

function strictMemberCalendarDate(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? text : "";
}

function safeCareBackClaim(input = {}) {
  const code = /^[A-HJ-NP-Z2-9]{6}$/.test(String(input.personal_code || "")) ? String(input.personal_code) : "";
  const codeStatus = ["draft", "active", "expired", "used", "revoked", "invalid"].includes(String(input.code_status))
    ? String(input.code_status)
    : "draft";
  const expiresAt = safeCustomerTimestamp(input.expires_at);
  const discountPercent = Number(input.discount_percent);
  const membershipBenefit = input.membership_benefit?.type === "membership_extension"
    && Number.isInteger(input.membership_benefit?.days)
    && input.membership_benefit.days > 0
    ? {
        type: "membership_extension",
        days: input.membership_benefit.days,
        state: ["pending_application", "renewal_required"].includes(String(input.membership_benefit.state))
          ? String(input.membership_benefit.state)
          : "pending_application",
      }
    : null;
  const pointsPolicy = Number.isInteger(input.points_policy?.rate_thb_per_point)
    && input.points_policy.rate_thb_per_point > 0
    && Number.isInteger(input.points_policy?.renewal_bonus_points)
    && input.points_policy.renewal_bonus_points >= 0
    ? {
        reconciliation_state: ["pending", "manual_review", "verified", "reconciliation_required"].includes(String(input.points_policy.reconciliation_state))
          ? String(input.points_policy.reconciliation_state)
          : "pending",
        rate_thb_per_point: input.points_policy.rate_thb_per_point,
        renewal_bonus_points: input.points_policy.renewal_bonus_points,
        renewal_bonus_state: ["not_offered", "renewal_required", "pending_application", "applied"].includes(String(input.points_policy.renewal_bonus_state))
          ? String(input.points_policy.renewal_bonus_state)
          : "not_offered",
      }
    : null;
  return {
    campaign_id: "6-years-care-back",
    claim_reference: String(input.claim_reference || "").replace(/[^A-Z0-9-]/gi, "").slice(0, 64),
    claim_status: String(input.claim_status || "identity_verified").slice(0, 32),
    review_status: String(input.review_status || "pending").slice(0, 32),
    personal_code: code,
    code_status: codeStatus,
    expires_at: expiresAt || null,
    discount_percent: Number.isFinite(discountPercent) && discountPercent > 0 && discountPercent <= 100 ? discountPercent : 0,
    coupon_state: ["ready", "wish_required", "renewal_required", "verification_required", "expired", "used", "revoked", "invalid"].includes(String(input.coupon_state))
      ? String(input.coupon_state)
      : "verification_required",
    coupon_message: normalizeCustomerText(input.coupon_message, 220) || "คูปองส่วนตัวจะพร้อมใช้หลัง MMD ยืนยันสิทธิ์เรียบร้อยแล้วครับ",
    membership_benefit: membershipBenefit,
    points_policy: pointsPolicy,
    wish_submitted: Boolean(input.wish_submitted),
    campaign_phase: ["birthday", "continuation", "legacy"].includes(String(input.campaign_phase))
      ? String(input.campaign_phase)
      : null,
    campaign_phase_ends_at: safeCustomerTimestamp(input.campaign_phase_ends_at) || null,
    resumed: Boolean(input.resumed),
    single_use: true,
    benefit_state: codeStatus === "active" ? "coupon_ready" : "benefit_pending",
    message: codeStatus === "active"
      ? "คูปองส่วนตัวพร้อมใช้กับบริการที่ร่วมรายการ 1 ครั้ง ภายในระยะเวลาที่ระบุครับ"
      : "MMD จะอัปเดตสิทธิ์ตามสถานะสมาชิกและการยืนยันที่เกี่ยวข้องครับ",
  };
}

function safeCustomerTimestamp(value) {
  const raw = String(value || "").trim();
  const parsed = Date.parse(raw);
  return raw && Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

async function keyedDigest(env, value) {
  const digest = await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hmacKey(env) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(String(env.LIFF_SESSION_SECRET)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function randomToken(bytes = 32) { const out = new Uint8Array(bytes); crypto.getRandomValues(out); return [...out].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function readJson(request) {
  const parsed = await readBoundedJsonObject(request, PUBLIC_JSON_BODY_MAX_BYTES);
  if (parsed.ok) return { ok: true, body: parsed.value };
  return {
    ok: false,
    response: json({ ok: false, error: { code: parsed.code, message: parsed.message } }, parsed.status),
  };
}
function normalizePath(pathname) { return pathname.toLowerCase().replace(/\/{2,}/g, "/"); }
function browserIdentityRejected() { return json({ ok: false, error: { code: "BROWSER_IDENTITY_REJECTED", message: "Browser-supplied identity fields are not accepted." } }, 400); }
function unavailable(code) { return json({ ok: false, error: { code, message: "LIFF identity foundation is not configured." } }, 503); }
function gatewayStorageFailure(error) {
  const code = error instanceof LiffGatewayStorageError ? error.code : "LIFF_GATEWAY_STORAGE_UNAVAILABLE";
  return json({ ok: false, error: { code, message: "LIFF session storage is temporarily unavailable." } }, 503);
}
async function saveRotatedError(env, auth, code, message, status) {
  try {
    await commitRotatedSession(env, auth);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  return json({ ok: false, error: { code, message } }, status, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] });
}
async function saveGatewayStateError(env, gatewayStore, auth, code, message, status) {
  try {
    await persistGatewaySession(env, gatewayStore, auth.session);
    await recordGatewayDecision(gatewayStore, auth.session);
    await commitRotatedSession(env, auth);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  return json({
    ok: false,
    data: await safeSessionView(gatewayStore, auth.session),
    error: { code, message },
  }, status, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] });
}
async function saveCareBackState(env, auth, state, wish) {
  try {
    await commitRotatedSession(env, auth);
  } catch (error) {
    return gatewayStorageFailure(error);
  }
  return json(careBackWishResponse(state, wish), 200, {
    cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)],
  });
}
async function saveBirthdayWishError(env, auth, error) {
  const code = error instanceof BirthdayWishStorageError
    ? error.code
    : "BIRTHDAY_WISH_STORAGE_UNAVAILABLE";
  const status = code.endsWith("_CONFLICT") ? 409 : code.endsWith("_INVALID") || code === "BIRTHDAY_WISH_CONTENT_REQUIRED" ? 400 : 503;
  return saveRotatedError(env, auth, code, "Birthday Wish is temporarily unavailable.", status);
}
function methodNotAllowed(methods) { return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `${methods} required` } }, 405, { headers: { allow: methods } }); }
function authFailure(code, message) { return { ok: false, response: json({ ok: false, error: { code, message } }, 401, { cookies: [clearCookie(SESSION_COOKIE)] }) }; }
function apiHeaders(methods = "POST,GET,OPTIONS") {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "access-control-allow-methods": methods,
    "access-control-allow-headers": "content-type",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-mmd-worker": WORKER,
    "x-mmd-version": VERSION,
  };
}
function json(body, status = 200, options = {}) {
  const headers = new Headers({ ...apiHeaders(), ...(options.headers || {}) });
  for (const cookie of options.cookies || []) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function base64UrlEncode(value) { return base64UrlFromBytes(new TextEncoder().encode(value)); }
function base64UrlFromBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlDecode(value) { return new TextDecoder().decode(base64UrlBytes(value)); }
function base64UrlBytes(value) {
  const input = String(value || "");
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new Error("invalid_base64url");
  const padded = `${input.replace(/-/g, "+").replace(/_/g, "/")}${"=".repeat((4 - input.length % 4) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
