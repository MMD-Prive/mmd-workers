// Package payments and independent shop extras must never share a settlement.
export const MMS_SPA_PAYMENT_POLICY = Object.freeze({
  version: 'mms-package-shop-extras-v1',
  package_collector: 'mms',
  shop_package_entitlement: 'agreed_room_course_only',
  shop_collects_package_again: false,
  extras_collector: 'shop',
  extras_agreement: 'customer_shop_direct',
  extras_in_mms_settlement: false,
  extras_mms_share_bps: 0,
});

export function assertMmsPackagePaymentInput(body) {
  const reject = code => { throw Object.assign(new Error(code), { status: 409, code }); };
  if (body.charge_scope != null && body.charge_scope !== 'mms_package') reject('SHOP_EXTRAS_OUTSIDE_MMS');
  if (body.collection_party != null && body.collection_party !== 'mms') reject('MMS_PACKAGE_COLLECTOR_REQUIRED');
  for (const key of ['extras', 'add_ons', 'extras_amount', 'extras_mms_share_bps']) {
    if (Object.hasOwn(body, key)) reject('SHOP_EXTRAS_OUTSIDE_MMS');
  }
  if (body.payment_policy != null) {
    const policy = body.payment_policy;
    if (typeof policy !== 'object' || Array.isArray(policy) ||
        Object.keys(policy).length !== Object.keys(MMS_SPA_PAYMENT_POLICY).length ||
        Object.entries(MMS_SPA_PAYMENT_POLICY).some(([key, value]) => policy[key] !== value)) reject('PAYMENT_POLICY_MISMATCH');
  }
}
