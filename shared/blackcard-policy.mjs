// Server-owned purchase terms. Payment never grants the protected entitlement.
export const BLACKCARD_POLICY = Object.freeze({
  package_code: 'black_card', amount_thb: 35000, duration_years: 3,
  official_verification_required: true, entitlement_granted: false,
});
export const BLACKCARD_MEMBER_PATH = '/my-mmd/payments/blackcard';
export const BLACKCARD_API_ROOT = '/member/api/liff/blackcard';
export const BLACKCARD_INTERNAL_PATH = '/v1/internal/blackcard/member';
