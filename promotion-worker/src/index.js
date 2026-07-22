const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const CAMPAIGN_ID = "mmd_6th_anniversary_2026";
const SPECIAL_TIERS = new Set(["vip", "svip", "blackcard", "black_card"]);

export function classifyEligibility({ referenceDate, membershipEndAt, membershipTier }) {
  const reference = parseDate(referenceDate, "referenceDate");
  const end = parseDate(membershipEndAt, "membershipEndAt");
  const tier = String(membershipTier || "").trim().toLowerCase();

  if (SPECIAL_TIERS.has(tier)) {
    return result("special_tier", 0, null, true, "special_tier");
  }

  if (end.getTime() >= reference.getTime()) {
    return result("active_member", 4, 0, false, "membership_active_at_claim");
  }

  const daysExpired = calendarDaysBetween(end, reference);
  if (daysExpired <= 90) {
    return result("recently_expired", 2, daysExpired, false, "expired_within_90_days");
  }

  return result("long_expired", 3, daysExpired, false, "expired_over_90_days");
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
    benefit_applied: ["reversed"],
    blocked: ["manual_review"],
    reversed: [],
  };
  return Boolean(allowed[from] && allowed[from].includes(to));
}

export function makeIdempotencyKey(campaignId, claimId, benefitType) {
  return [campaignId, claimId, benefitType].map(requiredToken).join(":");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request, env) });
    if (method === "GET" && path === "/health") {
      return json({ ok: true, worker: "promotion-worker", campaignId: CAMPAIGN_ID }, 200, request, env);
    }
    if (method === "POST" && path === "/v1/promotions/eligibility/preview") {
      const body = await readJson(request);
      const eligibility = classifyEligibility({
        referenceDate: body.campaignReferenceDate,
        membershipEndAt: body.membershipEndAt,
        membershipTier: body.membershipTier,
      });
      return json({ campaignId: CAMPAIGN_ID, eligibility, previewOnly: true }, 200, request, env);
    }
    if (method === "POST" && path === "/v1/internal/promotions/apply") {
      if (!isInternalRequest(request, env)) return json({ error: "forbidden" }, 403, request, env);
      const body = await readJson(request);
      const claimId = requiredToken(body.claimId);
      const benefitType = requiredBenefitType(body.benefitType);
      const idempotencyKey = makeIdempotencyKey(body.campaignId || CAMPAIGN_ID, claimId, benefitType);
      if (!env.PAYMENTS_WORKER || typeof env.PAYMENTS_WORKER.fetch !== "function") {
        return json({ error: "payments_worker_binding_missing", claimId, idempotencyKey }, 503, request, env);
      }
      const upstream = new Request("https://payments-worker.internal/v1/internal/campaign-benefits/apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mmd-internal-secret": env.INTERNAL_SERVICE_SECRET || "",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ ...body, campaignId: body.campaignId || CAMPAIGN_ID, idempotencyKey }),
      });
      return env.PAYMENTS_WORKER.fetch(upstream);
    }
    return json({ error: "not_found" }, 404, request, env);
  },
};

function result(classificationGroup, defaultMonths, daysExpiredAtClaim, manualReview, classificationReason) {
  return {
    classificationGroup,
    defaultMonths,
    approvedMonths: manualReview ? null : defaultMonths,
    pointsBonus: manualReview ? null : 66,
    daysExpiredAtClaim,
    manualReview,
    classificationReason,
  };
}

function parseDate(value, field) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new HttpError(400, "invalid_" + field);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function calendarDaysBetween(start, end) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function requiredToken(value) {
  const token = String(value || "").trim();
  if (!token || token.length > 160) throw new HttpError(400, "invalid_token");
  return token;
}

function requiredBenefitType(value) {
  const type = requiredToken(value);
  if (!["membership_extension", "anniversary_points_66"].includes(type)) {
    throw new HttpError(400, "invalid_benefit_type");
  }
  return type;
}

function isInternalRequest(request, env) {
  const expected = String(env.INTERNAL_SERVICE_SECRET || "");
  const received = String(request.headers.get("x-mmd-internal-secret") || "");
  return expected.length >= 24 && timingSafeEqual(expected, received);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function readJson(request) {
  try { return await request.json(); }
  catch { throw new HttpError(400, "invalid_json"); }
}

function normalizePath(path) {
  const cleaned = String(path || "/").replace(/\/{2,}/g, "/");
  return cleaned.length > 1 ? cleaned.replace(/\/$/, "") : cleaned;
}

function cors(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com")
    .split(",").map((item) => item.trim());
  return {
    "access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0],
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,idempotency-key",
    "vary": "origin",
  };
}

function json(payload, status, request, env) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...cors(request, env), "cache-control": "no-store" },
  });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
