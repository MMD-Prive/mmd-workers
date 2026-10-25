// Server-owned purchase terms. Payment never grants the protected entitlement.
export const BLACKCARD_POLICY = Object.freeze({
  package_code: 'black_card', amount_thb: 35000, duration_years: 3,
  official_verification_required: true, entitlement_granted: false,
});
export const BLACKCARD_MEMBER_PATH = '/my-mmd/payments/blackcard';
export const BLACKCARD_API_ROOT = '/member/api/liff/blackcard';
export const BLACKCARD_INTERNAL_PATH = '/v1/internal/blackcard/member';
// Owner-supplied PayPal checkout CTA. This is display-only; payment truth still
// comes from the verified payment/evidence flow and never from this URL.
export const BLACKCARD_PAYPAL_URL = 'https://www.paypal.com/ncp/payment/M697T7AW2QZZJ';
