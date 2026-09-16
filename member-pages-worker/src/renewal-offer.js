import { readClientBackedHistoryResult } from "./member-app-client-history.js";

const WINDOW_DAYS = 365;
const PACKAGE_POLICY = Object.freeze({
  standard: Object.freeze({
    label: "Standard",
    years: 1,
    base_amount_thb: 1000,
    thresholds: Object.freeze([
      Object.freeze({ spend_thb: 50000, amount_thb: 499, price_rule: "private_standard_spend_50000" }),
      Object.freeze({ spend_thb: 10000, amount_thb: 799, price_rule: "private_standard_spend_10000" }),
    ]),
    base_price_rule: "private_standard_renewal",
  }),
  premium: Object.freeze({
    label: "Premium",
    years: 2,
    base_amount_thb: 2500,
    thresholds: Object.freeze([
      Object.freeze({ spend_thb: 100000, amount_thb: 999, price_rule: "private_premium_spend_100000" }),
      Object.freeze({ spend_thb: 20000, amount_thb: 1999, price_rule: "private_premium_spend_20000" }),
    ]),
    base_price_rule: "private_premium_renewal",
  }),
});

export function canonicalRenewalPackageFromTier(value) {
  const tier = String(value || "").trim().toLowerCase();
  if (tier === "standard") return "standard";
  if (tier === "premium") return "premium";
  return "";
}

export function renewalPriceForSpend(packageCode, spendThb) {
  const code = String(packageCode || "").trim().toLowerCase();
  const policy = PACKAGE_POLICY[code];
  if (!policy) return null;
  const spend = Number(spendThb);
  const verifiedSpend = Number.isFinite(spend) && spend > 0 ? Math.round((spend + Number.EPSILON) * 100) / 100 : 0;
  const discount = policy.thresholds.find((item) => verifiedSpend >= item.spend_thb);
  return {
    package_code: code,
    package_label: policy.label,
    amount_thb: discount?.amount_thb ?? policy.base_amount_thb,
    service_spend_365_thb: verifiedSpend,
    price_rule: discount?.price_rule ?? policy.base_price_rule,
    membership_years: policy.years,
  };
}

export async function resolveCanonicalRenewalOffer(env = {}, session = {}, now = new Date()) {
  if (String(session?.liff_intent || "").trim().toLowerCase() !== "renew" || session?.member_exists !== true) {
    return { status: "not_applicable", reason: "renewal_member_session_required" };
  }

  const packageCode = canonicalRenewalPackageFromTier(session?.member_profile?.tier);
  if (!packageCode) return { status: "review_required", reason: "renewal_current_package_not_supported" };

  const lineUserId = canonicalLineId(session?.line_user_id);
  if (!lineUserId) return { status: "review_required", reason: "renewal_line_identity_required" };

  const injected = env.RENEWAL_OFFER_RESOLVER;
  if (injected && typeof injected.resolve === "function") {
    return sanitizeInjectedOffer(await injected.resolve({ line_user_id: lineUserId, package_code: packageCode, now }), packageCode);
  }

  const base = renewalPriceForSpend(packageCode, 0);
  const history = await readClientBackedHistoryResult(env, lineUserId, now);
  if (history?.state !== "resolved") {
    return {
      status: "ready",
      ...base,
      history_status: "checking",
      discount_verified: false,
      price_rule: `${base.price_rule}_history_unavailable`,
    };
  }

  const cutoff = cutoffDate(now, WINDOW_DAYS);
  const spend = (Array.isArray(history.items) ? history.items : []).reduce((total, item) => {
    if (item?.kind !== "booking") return total;
    const occurredAt = String(item.occurredAt || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt) || occurredAt < cutoff) return total;
    const amount = Number(item.totalAmountThb);
    return Number.isFinite(amount) && amount > 0 ? total + amount : total;
  }, 0);
  return {
    status: "ready",
    ...renewalPriceForSpend(packageCode, spend),
    history_status: "verified",
    discount_verified: true,
  };
}

function sanitizeInjectedOffer(value, expectedPackage) {
  if (!value || typeof value !== "object" || value.status !== "ready") {
    return { status: "review_required", reason: "renewal_offer_resolver_unavailable" };
  }
  const packageCode = String(value.package_code || "").trim().toLowerCase();
  const amount = Number(value.amount_thb);
  const inferred = renewalPriceForSpend(expectedPackage, Number(value.service_spend_365_thb || 0));
  if (packageCode !== expectedPackage || !Number.isFinite(amount) || amount <= 0) {
    return { status: "review_required", reason: "renewal_offer_resolver_invalid" };
  }
  return {
    status: "ready",
    ...inferred,
    ...value,
    package_code: expectedPackage,
    amount_thb: Math.round((amount + Number.EPSILON) * 100) / 100,
  };
}

function cutoffDate(now, days) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(date.getTime())) return "0000-00-00";
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function canonicalLineId(value) {
  const lineId = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(lineId) ? lineId : "";
}
