// Read-only wallet projection. Redemption and final price remain with CARE BACK / Payments.
export function projectCouponPresentation(coupon, now = Date.now()) {
  const result = { ...coupon };
  const expiry = Date.parse(coupon.expiresAt || '');
  if (coupon.state === 'issued' && Number.isFinite(expiry) && expiry <= now) result.state = 'expired';
  delete result.redeemUrl;
  delete result.actionUrl;
  // This is a coupon information page, not an endpoint that consumes a benefit.
  if (result.state === 'issued') result.actionUrl = '/member/liff?intent=status&view=coupons';
  if (result.wishRequired === true && ['checking', 'eligible'].includes(result.state)) result.actionUrl = '/promotion/6-years-care-back/wish';
  return result;
}
