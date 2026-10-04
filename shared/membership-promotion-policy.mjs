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
  if (oneYearAfterExpiry) addBangkokCalendarYears(oneYearAfterExpiry, 1);
  return {expiry_known:knownExpiry, active, expired_less_than_one_year:knownExpiry && !active && renewalAt < oneYearAfterExpiry, expired_one_year_or_more:knownExpiry && !active && renewalAt >= oneYearAfterExpiry, start_at:(active ? expiry : renewalAt).toISOString(), expired_over_one_year:!!oneYearAfterExpiry && oneYearAfterExpiry < renewalAt};
}

// Payment time is canonical evidence; verification processing time is not eligibility.
export function currentPrivateMembershipPromotion({ package_code = "", paid_at = "", action = "", existing_member = false, prior_expire_at = "" } = {}) {
  const packageCode = token(package_code);
  const paidMs = Date.parse(String(paid_at || ""));
  if (!Number.isFinite(paidMs) || paidMs < CARE_BACK_START_MS) return null;
  if (token(action) === "signup" && existing_member === false) {
    return packageCode === "premium" ? { code:"private_premium_signup_total_two_years_2026", total_years:2, bonus_days:0, bonus_years:0, label:"Premium signup total 2 years", starts_at:CARE_BACK_START_AT } : null;
  }
  if (token(action) !== "renewal" || existing_member !== true || paidMs >= Date.parse("2026-11-01T00:00:00+07:00")) return null;
  const timing = privateRenewalTiming(prior_expire_at, paid_at);
  if (!timing?.expiry_known || timing.expired_one_year_or_more) return null;
  const policy = PRIVATE_CARE_BACK[packageCode];
  return policy ? {...policy, code:`october_prepaid_${packageCode}_2026`, starts_at:CARE_BACK_START_AT, ends_before:"2026-11-01T00:00:00+07:00"} : null;
}

export function applyMembershipPromotion(expireAtValue, promotion, { start_at = "" } = {}) {
  const expireAt = new Date(expireAtValue);
  if (Number.isNaN(expireAt.getTime()) || !promotion) return null;
  if (promotion.total_years === 2) {
    const start = new Date(start_at);
    if (!Number.isFinite(start.getTime())) return null;
    addBangkokCalendarYears(start, 2);
    return start;
  }

  const bonusYears = Number(promotion.bonus_years || 0);
  if (Number.isInteger(bonusYears) && bonusYears > 0) addBangkokCalendarYears(expireAt, bonusYears);

  const bonusDays = Number(promotion.bonus_days || 0);
  if (Number.isInteger(bonusDays) && bonusDays > 0) expireAt.setUTCDate(expireAt.getUTCDate() + bonusDays);
  return expireAt;
}

export function addBangkokCalendarYears(date, years) {
  // Thailand has no DST; shift to local calendar before leap-day clamping.
  date.setTime(date.getTime() + 7 * 60 * 60 * 1000);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  date.setTime(date.getTime() - 7 * 60 * 60 * 1000);
  return date;
}

function token(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
