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

export function currentPrivateMembershipPromotion({ package_code = "", verified_at = "", action = "" } = {}) {
  const packageCode = token(package_code);
  const normalizedAction = token(action);
  const verifiedAtMs = Date.parse(String(verified_at || ""));
  if (!Number.isFinite(verifiedAtMs) || verifiedAtMs < CARE_BACK_START_MS) return null;
  if (normalizedAction && !new Set(["signup", "renewal"]).has(normalizedAction)) return null;
  const policy = PRIVATE_CARE_BACK[packageCode];
  return policy ? { ...policy, starts_at: CARE_BACK_START_AT } : null;
}

export function applyMembershipPromotion(expireAtValue, promotion) {
  const expireAt = new Date(expireAtValue);
  if (Number.isNaN(expireAt.getTime()) || !promotion) return null;

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
