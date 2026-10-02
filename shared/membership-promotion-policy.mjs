const CARE_BACK_START_AT = "2026-08-01T00:00:00+07:00";
const CARE_BACK_START_MS = Date.parse(CARE_BACK_START_AT);

const PRIVATE_CARE_BACK = Object.freeze({
  standard: Object.freeze({
    code: "care_back_private_standard_2026",
    bonus_days: 180,
    bonus_years: 0,
    label: "CARE BACK +180 days",
  }),
  premium: Object.freeze({
    code: "care_back_private_premium_2026",
    bonus_days: 0,
    bonus_years: 1,
    label: "CARE BACK +1 year",
  }),
});

export function isProtectedPrivateMembership(value) {
  return new Set(["vip", "svip", "blackcard", "black_card"]).has(token(value));
}

export function privateRenewalTiming(expireAtValue, renewalAtValue) {
  const renewalAt = new Date(renewalAtValue);
  const expiry = new Date(expireAtValue || "invalid");
  if (!Number.isFinite(renewalAt.getTime())) return null;
  const knownExpiry = Number.isFinite(expiry.getTime());
  const active = knownExpiry && expiry > renewalAt;
  const oneYearAfterExpiry = knownExpiry ? new Date(expiry) : null;
  if (oneYearAfterExpiry) addUtcCalendarYears(oneYearAfterExpiry, 1);
  return {start_at:(active ? expiry : renewalAt).toISOString(), expired_over_one_year:!!oneYearAfterExpiry && oneYearAfterExpiry < renewalAt};
}

export function currentPrivateMembershipPromotion({ package_code = "", verified_at = "", action = "", existing_member = false } = {}) {
  const packageCode = token(package_code);
  const normalizedAction = token(action);
  const verifiedAtMs = Date.parse(String(verified_at || ""));
  if (!Number.isFinite(verifiedAtMs) || verifiedAtMs < CARE_BACK_START_MS) return null;
  if (normalizedAction && !new Set(["signup", "renewal"]).has(normalizedAction)) return null;
  const policy = PRIVATE_CARE_BACK[packageCode];
  if (policy && existing_member === true) return {
    code:`private_${packageCode}_two_year_term_2026`, total_years:2,
    bonus_days:0, bonus_years:0, label:"Private renewal · 2 years", starts_at:CARE_BACK_START_AT,
  };
  return policy ? { ...policy, starts_at: CARE_BACK_START_AT } : null;
}

export function applyMembershipPromotion(expireAtValue, promotion, { start_at = "" } = {}) {
  const expireAt = new Date(expireAtValue);
  if (Number.isNaN(expireAt.getTime()) || !promotion) return null;
  if (promotion.total_years === 2) {
    const start = new Date(start_at);
    if (!Number.isFinite(start.getTime())) return null;
    addUtcCalendarYears(start, 2);
    return start;
  }

  const bonusYears = Number(promotion.bonus_years || 0);
  if (Number.isInteger(bonusYears) && bonusYears > 0) addUtcCalendarYears(expireAt, bonusYears);

  const bonusDays = Number(promotion.bonus_days || 0);
  if (Number.isInteger(bonusDays) && bonusDays > 0) expireAt.setUTCDate(expireAt.getUTCDate() + bonusDays);
  return expireAt;
}

function addUtcCalendarYears(date, years) {
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
}

function token(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
