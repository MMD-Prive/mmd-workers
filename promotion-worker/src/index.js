import { CAMPAIGN_ID, REFERENCE_DATE, assertCampaignActive, buildBenefitPlan, classifyEligibility,
  internalConsiderations, resolveMembershipPrice, resolveUpgradePrice, validateApprovedMonths, PolicyError } from "./policy.js";
import { buildAuditEvent, customerSafeResult, validateTransition } from "./benefit-coordinator.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export default { async fetch(request, env = {}) {
  try { return await route(request, env); }
  catch (error) {
    const status = error instanceof HttpError ? error.status : error instanceof PolicyError ? 409 : 500;
    return json({ ok: false, error: status === 500 ? "internal_error" : error.code || error.message }, status);
  }
} };

async function route(request, env) {
  const url = new URL(request.url); const path = cleanPath(url.pathname); const method = request.method.toUpperCase();
  if (method === "GET" && path === "/health") return json({ ok: true, worker: "promotion-worker", campaignId: CAMPAIGN_ID });
  if (!path.startsWith("/v1/internal/") || !(await internal(request, env))) throw new HttpError(403, "forbidden");
  if (method === "POST" && path === "/v1/internal/promotions/claims/open") return openClaim(request, env);
  if (method === "POST" && path === "/v1/internal/promotions/pricing/resolve") return pricing(request);
  const claim = path.match(/^\/v1\/internal\/promotions\/claims\/([^/]+)$/);
  if (method === "GET" && claim) return readClaim(env, decodeURIComponent(claim[1]));
  const transition = path.match(/^\/v1\/internal\/promotions\/claims\/([^/]+)\/transition$/);
  if (method === "POST" && transition) return transitionClaim(request, env, decodeURIComponent(transition[1]));
  if (method === "POST" && path === "/v1/internal/promotions/apply") return applyClaim(request, env);
  throw new HttpError(404, "not_found");
}

async function openClaim(request, env) {
  const body = await bodyJson(request); const now = serverNow(env);
  assertCampaignActive(now);
  if (body.campaignId && body.campaignId !== CAMPAIGN_ID) throw new HttpError(400, "invalid_campaign");
  const identityHash = requiredHash(body.identityHash);
  const store = claimStore(env); const existing = await store.findByIdentity(identityHash);
  if (existing) return json({ ok: true, resumed: true, data: customerSafeResult(existing), claim: existing });
  const eligibility = classifyEligibility(body.snapshot || {});
  const claim = {
    claimId: `MMD6-${now.getUTCFullYear()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
    campaignId: CAMPAIGN_ID, identityHash, claimCreatedAt: now.toISOString(), eligibilityReferenceDate: REFERENCE_DATE,
    memberId: safeId(body.memberId), clientId: safeId(body.clientId), status: eligibility.status,
    membershipTier: String(body.snapshot?.membershipTier || ""), membershipStartSnapshot: body.snapshot?.membershipStartAt || null,
    membershipEndSnapshot: body.snapshot?.membershipEndAt || null, membershipHistorySnapshot: body.snapshot?.membershipHistory || [],
    eligibility, paymentRequired: eligibility.paymentRequired, pointsAward: eligibility.pointsAward,
    approvedMonths: eligibility.status === "current_member" ? 6 : eligibility.status === "new_member" ? 0 : null,
    considerations: internalConsiderations(body.snapshot || {}), claimStatus: eligibility.manualReview ? "manual_review" : "matched",
    reviewStatus: eligibility.manualReview ? "manual_review" : "pending", paymentVerified: false, upgradePaymentVerified: false,
    createdAt: now.toISOString(), updatedAt: now.toISOString(), audits: [], applications: [],
  };
  await store.create(claim);
  return json({ ok: true, resumed: false, data: customerSafeResult(claim), claim }, 201);
}

async function readClaim(env, claimId) {
  const claim = await claimStore(env).findById(required(claimId));
  if (!claim) throw new HttpError(404, "claim_not_found");
  return json({ ok: true, claim, data: customerSafeResult(claim) });
}

async function transitionClaim(request, env, claimId) {
  const store = claimStore(env); const before = await store.findById(required(claimId));
  if (!before) throw new HttpError(404, "claim_not_found");
  const body = await bodyJson(request); const to = required(body.toStatus);
  if (!validateTransition(before.claimStatus, to)) throw new HttpError(409, "invalid_status_transition");
  const next = structuredClone(before);
  if (to === "benefit_approved") {
    next.approvedMonths = validateApprovedMonths(before.eligibility, body.approvedMonths);
    if (before.paymentRequired && body.paymentVerified !== true) throw new HttpError(409, "verified_payment_required");
    next.paymentVerified = Boolean(body.paymentVerified);
    next.upgradeRequired = Boolean(body.upgradeRequired);
    next.upgradePaymentVerified = Boolean(body.upgradePaymentVerified);
    next.upgradeApplied = Boolean(body.upgradeApplied);
    next.effectiveAt = required(body.effectiveAt);
  }
  next.claimStatus = to; next.reviewStatus = to; next.updatedAt = serverNow(env).toISOString();
  const audit = auditFrom(request, body, before, next);
  next.audits = [...(before.audits || []), audit];
  await store.update(next, before.updatedAt);
  return json({ ok: true, claim: next, transition: { from: before.claimStatus, to }, audit });
}

async function applyClaim(request, env) {
  const body = await bodyJson(request); const store = claimStore(env); const before = await store.findById(required(body.claimId));
  if (!before) throw new HttpError(404, "claim_not_found");
  const plan = buildBenefitPlan(before);
  if (!env.PAYMENTS_WORKER?.fetch) throw new HttpError(503, "payments_worker_binding_missing");
  const results = [];
  for (const item of plan) {
    const response = await env.PAYMENTS_WORKER.fetch(new Request("https://payments-worker.local/v1/internal/campaign-benefits/apply", {
      method: "POST", headers: { "content-type": "application/json", "x-mmd-service-binding": "promotion-worker",
        "x-mmd-internal-secret": String(env.INTERNAL_SERVICE_SECRET || ""), "idempotency-key": item.idempotencyKey },
      body: JSON.stringify({ ...item, actor: body.actor, requestId: body.requestId }) }));
    const result = await response.json().catch(() => ({ ok: false, status: "failed" }));
    results.push({ benefitType: item.benefitType, ...result });
    if (!response.ok) break;
  }
  const complete = results.length === plan.length && results.every(x => ["applied", "already_applied"].includes(x.status));
  const next = { ...before, claimStatus: complete ? "benefit_applied" : "apply_partially_failed", applications: results,
    appliedAt: complete ? serverNow(env).toISOString() : null, updatedAt: serverNow(env).toISOString() };
  const audit = auditFrom(request, { ...body, eventType: complete ? "benefit_applied" : "apply_partially_failed",
    idempotencyKey: plan.map(x => x.idempotencyKey).join(",") }, before, next);
  next.audits = [...(before.audits || []), audit]; await store.update(next, before.updatedAt);
  return json({ ok: complete, status: next.claimStatus, results, data: customerSafeResult(next) }, complete ? 200 : 409);
}

async function pricing(request) { const body = await bodyJson(request); return json({ ok: true,
  membership: resolveMembershipPrice(body.membership || {}), upgrade: body.upgrade ? resolveUpgradePrice(body.upgrade) : null }); }

function auditFrom(request, body, before, after) { const actor = body.actor || {}; return buildAuditEvent({
  requestId: body.requestId || request.headers.get("x-request-id"), actorId: actor.id, adminSessionId: actor.sessionId,
  eventType: body.eventType || after.claimStatus, claimId: before.claimId, campaignId: CAMPAIGN_ID,
  before, after, reason: body.reason, idempotencyKey: body.idempotencyKey }); }

function claimStore(env) {
  if (env.CAMPAIGN_CLAIM_STORE) return env.CAMPAIGN_CLAIM_STORE;
  throw new HttpError(503, "campaign_claim_store_binding_missing");
}
async function internal(request, env) { const a = String(env.INTERNAL_SERVICE_SECRET || ""); const b = String(request.headers.get("x-mmd-internal-secret") || "");
  if (request.headers.get("x-mmd-service-binding") && a.length >= 24) return safeEqual(a, b); return false; }
async function safeEqual(a, b) { const e = new TextEncoder(); const [x,y] = await Promise.all([crypto.subtle.digest("SHA-256",e.encode(a)),crypto.subtle.digest("SHA-256",e.encode(b))]);
  const xx=new Uint8Array(x), yy=new Uint8Array(y); let difference=0; for(let i=0;i<xx.length;i+=1) difference|=xx[i]^yy[i]; return difference===0; }
function serverNow(env) { return env.TEST_NOW ? new Date(env.TEST_NOW) : new Date(); }
async function bodyJson(request) { try { const x = await request.json(); if (!x || typeof x !== "object" || Array.isArray(x)) throw new Error(); return x; } catch { throw new HttpError(400, "invalid_json"); } }
function required(value) { const x = String(value || "").trim(); if (!x || x.length > 180) throw new HttpError(400, "invalid_required_value"); return x; }
function requiredHash(value) { const x = required(value); if (!/^[a-f0-9]{64}$/i.test(x)) throw new HttpError(400, "invalid_identity_hash"); return x.toLowerCase(); }
function safeId(value) { const x = String(value || "").trim(); return x && /^[a-zA-Z0-9_-]{1,120}$/.test(x) ? x : null; }
function cleanPath(value) { const x = String(value || "/").replace(/\/{2,}/g,"/"); return x.length > 1 ? x.replace(/\/$/,"") : x; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS }); }
class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }

export { classifyEligibility, resolveMembershipPrice, resolveUpgradePrice };
