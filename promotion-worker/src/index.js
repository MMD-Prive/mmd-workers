const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const CAMPAIGN_ID = "mmd_6th_anniversary_2026";
const CLAIMS_TABLE = "tblTH1LGJikBI0rly";
const SPECIAL_TIERS = new Set(["vip", "svip", "blackcard", "black_card"]);

const F = {
  claimId: "flddYlHkG37pL7ARs", campaignId: "fldRePvxEF5crDKC0",
  lineHash: "fldLeWEhHgnFWSQdp", referenceAt: "fldNMO2IBmwAuACD8",
  memberId: "fldXfI6gzSK5Nbpab", clientId: "fld7CIL5wY6iDUTel",
  matchStatus: "fldp46q2iaUrSgnpd", group: "fldttJ2jWpHlTeWze",
  daysExpired: "fldpykEygLNtUiKFD", defaultMonths: "fldl8iJKQBzYaObcM",
  approvedMonths: "fldd2RhbrBdVIj8Iy", tierSnapshot: "fldUqErYUXmTSFS5s",
  startSnapshot: "fldThSDTcelwqQbxp", endSnapshot: "fldZwSabq13g8jntT",
  reason: "fldnNlEvT5ALItjbl", points: "fldM5tpNVhiINq1ps",
  reviewStatus: "fldTQgo4qZeXOTpUw", claimStatus: "fldDthGzJRmHW13nW",
  payload: "fldy9BcPlwHIL9enJ", createdAt: "fldgtH2QUnskdovAl",
  updatedAt: "fldAZ2uR2j2VP4Gyd",
};

export function classifyEligibility({ referenceDate, membershipEndAt, membershipTier }) {
  const reference = parseDate(referenceDate, "referenceDate");
  const end = parseDate(membershipEndAt, "membershipEndAt");
  const tier = String(membershipTier || "").trim().toLowerCase();
  if (SPECIAL_TIERS.has(tier)) return eligibility("special_tier", 0, null, true, "special_tier");
  if (end.getTime() >= reference.getTime()) return eligibility("active_member", 4, 0, false, "membership_active_at_claim");
  const days = calendarDaysBetween(end, reference);
  return days <= 90
    ? eligibility("recently_expired", 2, days, false, "expired_within_90_days")
    : eligibility("long_expired", 3, days, false, "expired_over_90_days");
}

export function validateTransition(from, to) {
  const allowed = {
    created: ["identity_verified", "manual_review", "blocked"],
    identity_verified: ["matched", "manual_review", "blocked"],
    matched: ["payment_pending", "benefit_approved", "manual_review", "blocked"],
    manual_review: ["payment_pending", "benefit_approved", "blocked"],
    payment_pending: ["benefit_approved", "manual_review", "blocked"],
    benefit_approved: ["applying", "reversed"],
    applying: ["benefit_applied", "apply_partially_failed"],
    apply_partially_failed: ["applying", "reversed"],
    benefit_applied: ["reversed"], blocked: ["manual_review"], reversed: [],
  };
  return Boolean(allowed[from]?.includes(to));
}

export function makeIdempotencyKey(campaignId, claimId, benefitType) {
  return [campaignId, claimId, benefitType].map(requiredToken).join(":");
}

export function makeClaimId(now = new Date(), random = crypto.randomUUID()) {
  const year = now.getUTCFullYear();
  const suffix = random.replace(/-/g, "").slice(0, 10).toUpperCase();
  return `MMD6-${year}-${suffix}`;
}

export default {
  async fetch(request, env) {
    try { return await route(request, env); }
    catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: status === 500 ? "internal_error" : error.message }, status, request, env);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
  if (method === "GET" && path === "/health") return json({ ok: true, worker: "promotion-worker", campaignId: CAMPAIGN_ID }, 200, request, env);
  if (method === "POST" && path === "/v1/promotions/eligibility/preview") {
    const body = await readJson(request);
    return json({ campaignId: CAMPAIGN_ID, eligibility: classifyEligibility({ referenceDate: body.campaignReferenceDate, membershipEndAt: body.membershipEndAt, membershipTier: body.membershipTier }), previewOnly: true }, 200, request, env);
  }
  if (path.startsWith("/v1/internal/") && !isInternalRequest(request, env)) return json({ error: "forbidden" }, 403, request, env);
  if (method === "POST" && path === "/v1/internal/promotions/claims/open") return openClaim(request, env);
  const claimMatch = path.match(/^\/v1\/internal\/promotions\/claims\/([^/]+)$/);
  if (method === "GET" && claimMatch) return getClaim(request, env, decodeURIComponent(claimMatch[1]));
  const transitionMatch = path.match(/^\/v1\/internal\/promotions\/claims\/([^/]+)\/transition$/);
  if (method === "POST" && transitionMatch) return transitionClaim(request, env, decodeURIComponent(transitionMatch[1]));
  if (method === "POST" && path === "/v1/internal/promotions/apply") return proxyApply(request, env);
  return json({ error: "not_found" }, 404, request, env);
}

async function openClaim(request, env) {
  const body = await readJson(request);
  const lineHash = requiredHash(body.lineUserIdHash);
  const existing = await findClaimByLineHash(env, lineHash);
  if (existing) return json({ claim: publicClaim(existing), resumed: true }, 200, request, env);
  const now = new Date();
  const referenceAt = normalizeIso(body.campaignReferenceDate || now.toISOString(), "campaignReferenceDate");
  const calc = classifyEligibility({ referenceDate: referenceAt, membershipEndAt: body.membershipEndAt, membershipTier: body.membershipTier });
  const claimId = makeClaimId(now);
  const status = calc.manualReview ? "manual_review" : "matched";
  const fields = {
    [F.claimId]: claimId, [F.campaignId]: CAMPAIGN_ID, [F.lineHash]: lineHash,
    [F.referenceAt]: referenceAt, [F.memberId]: optionalToken(body.matchedMemberId),
    [F.clientId]: optionalToken(body.matchedClientId), [F.matchStatus]: body.matchStatus || "matched",
    [F.group]: calc.classificationGroup, [F.daysExpired]: calc.daysExpiredAtClaim,
    [F.defaultMonths]: calc.defaultMonths, [F.approvedMonths]: calc.approvedMonths,
    [F.tierSnapshot]: String(body.membershipTier || ""), [F.endSnapshot]: normalizeIso(body.membershipEndAt, "membershipEndAt"),
    [F.reason]: calc.classificationReason, [F.points]: calc.pointsBonus,
    [F.reviewStatus]: calc.manualReview ? "manual_review" : "not_required",
    [F.claimStatus]: status, [F.payload]: JSON.stringify({ schemaVersion: 1, source: optionalToken(body.source) || "liff" }),
    [F.createdAt]: now.toISOString(), [F.updatedAt]: now.toISOString(),
  };
  if (body.membershipStartAt) fields[F.startSnapshot] = normalizeIso(body.membershipStartAt, "membershipStartAt");
  const record = await airtable(env, CLAIMS_TABLE, "", { method: "POST", body: JSON.stringify({ records: [{ fields }], typecast: false }) });
  return json({ claim: publicClaim(record.records[0]), resumed: false }, 201, request, env);
}

async function getClaim(request, env, claimId) {
  const record = await findClaim(env, requiredToken(claimId));
  if (!record) throw new HttpError(404, "claim_not_found");
  return json({ claim: publicClaim(record) }, 200, request, env);
}

async function transitionClaim(request, env, claimId) {
  const record = await findClaim(env, requiredToken(claimId));
  if (!record) throw new HttpError(404, "claim_not_found");
  const body = await readJson(request);
  const from = String(record.fields[F.claimStatus] || "");
  const to = requiredToken(body.toStatus);
  if (!validateTransition(from, to)) throw new HttpError(409, "invalid_status_transition");
  const updated = await airtable(env, CLAIMS_TABLE, `/${record.id}`, { method: "PATCH", body: JSON.stringify({ fields: { [F.claimStatus]: to, [F.updatedAt]: new Date().toISOString() }, typecast: false }) });
  return json({ claim: publicClaim(updated), transition: { from, to } }, 200, request, env);
}

async function proxyApply(request, env) {
  const body = await readJson(request);
  const claimId = requiredToken(body.claimId);
  const claim = await findClaim(env, claimId);
  if (!claim) throw new HttpError(404, "claim_not_found");
  if (claim.fields[F.claimStatus] !== "benefit_approved" && claim.fields[F.claimStatus] !== "apply_partially_failed") throw new HttpError(409, "claim_not_approved");
  const benefitType = requiredBenefitType(body.benefitType);
  const idempotencyKey = makeIdempotencyKey(body.campaignId || CAMPAIGN_ID, claimId, benefitType);
  if (!env.PAYMENTS_WORKER?.fetch) throw new HttpError(503, "payments_worker_binding_missing");
  return env.PAYMENTS_WORKER.fetch(new Request("https://payments-worker.internal/v1/internal/campaign-benefits/apply", {
    method: "POST", headers: { "content-type": "application/json", "x-mmd-internal-secret": env.INTERNAL_SERVICE_SECRET || "", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ ...body, campaignId: CAMPAIGN_ID, idempotencyKey }),
  }));
}

async function findClaimByLineHash(env, hash) { return first(await listClaims(env, `{${F.lineHash}}='${escapeFormula(hash)}'`)); }
async function findClaim(env, id) { return first(await listClaims(env, `{${F.claimId}}='${escapeFormula(id)}'`)); }
async function listClaims(env, formula) {
  const query = `?maxRecords=1&filterByFormula=${encodeURIComponent(`AND({${F.campaignId}}='${CAMPAIGN_ID}',${formula})`)}`;
  return airtable(env, CLAIMS_TABLE, query);
}
function first(result) { return result.records?.[0] || null; }

async function airtable(env, table, suffix = "", init = {}) {
  if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID) throw new HttpError(503, "airtable_not_configured");
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}${suffix}`, { ...init, headers: { authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "content-type": "application/json", ...(init.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status >= 500 ? 502 : 400, "airtable_request_failed");
  return data;
}

function publicClaim(record) {
  const x = record.fields || {};
  return { claimId: x[F.claimId], campaignId: x[F.campaignId], campaignReferenceDate: x[F.referenceAt], classificationGroup: x[F.group], defaultMonths: x[F.defaultMonths], approvedMonths: x[F.approvedMonths] ?? null, pointsBonus: x[F.points] ?? null, claimStatus: x[F.claimStatus], reviewStatus: x[F.reviewStatus], createdAt: x[F.createdAt], updatedAt: x[F.updatedAt] };
}
function eligibility(classificationGroup, defaultMonths, daysExpiredAtClaim, manualReview, classificationReason) { return { classificationGroup, defaultMonths, approvedMonths: manualReview ? null : defaultMonths, pointsBonus: manualReview ? null : 66, daysExpiredAtClaim, manualReview, classificationReason }; }
function parseDate(value, field) { const date = new Date(value); if (!value || Number.isNaN(date.getTime())) throw new HttpError(400, "invalid_" + field); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); }
function normalizeIso(value, field) { return parseDate(value, field).toISOString(); }
function calendarDaysBetween(start, end) { return Math.max(0, Math.floor((end - start) / 86400000)); }
function requiredToken(value) { const token = String(value || "").trim(); if (!token || token.length > 160) throw new HttpError(400, "invalid_token"); return token; }
function optionalToken(value) { const token = String(value || "").trim(); return token ? requiredToken(token) : ""; }
function requiredHash(value) { const hash = requiredToken(value); if (!/^[a-f0-9]{32,128}$/i.test(hash)) throw new HttpError(400, "invalid_line_user_id_hash"); return hash.toLowerCase(); }
function requiredBenefitType(value) { const type = requiredToken(value); if (!["membership_extension", "anniversary_points_66"].includes(type)) throw new HttpError(400, "invalid_benefit_type"); return type; }
function escapeFormula(value) { return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function isInternalRequest(request, env) { const a = String(env.INTERNAL_SERVICE_SECRET || ""); const b = String(request.headers.get("x-mmd-internal-secret") || ""); return a.length >= 24 && timingSafeEqual(a, b); }
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let mismatch = 0; for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i); return mismatch === 0; }
async function readJson(request) { try { return await request.json(); } catch { throw new HttpError(400, "invalid_json"); } }
function normalizePath(path) { const x = String(path || "/").replace(/\/{2,}/g, "/"); return x.length > 1 ? x.replace(/\/$/, "") : x; }
function cors(request, env) { const origin = request.headers.get("origin") || ""; const allowed = String(env.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com").split(",").map(x => x.trim()); return { "access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0], "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization,idempotency-key,x-mmd-internal-secret", vary: "origin" }; }
function json(payload, status, request, env) { return new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...cors(request, env), "cache-control": "no-store" } }); }
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
