// Customer-safe presentation only. Never alters pricing, payments or entitlements.
const amount = v => v == null || v === '' ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
const equal = (a, b) => a != null && b != null && Math.abs(a - b) < 0.01;
export function confirmationWorkLane(fields, jobType, env = {}) {
  const lane = String(fields[env.AT_SESSIONS__MODEL_WORK_LANE || 'fldzYGziqLqTQaoaK'] || fields.model_work_lane || '').toLowerCase().trim();
  if (['private_model', 'public_model'].includes(lane)) return lane;
  const parts = String(jobType || '').toLowerCase().split(/[:+,|\s]+/);
  if (parts.includes('private') && !parts.includes('public')) return 'private_model';
  if (parts.includes('public') && !parts.includes('private')) return 'public_model';
  return null;
}
export function customerBillingBreakdown(pricing, totalValue, travelValue, service, jobType) {
  const total = amount(totalValue), full = amount(pricing?.full_price_thb), discount = amount(pricing?.discount_thb);
  const travel = amount(travelValue), net = full != null && discount != null ? full - discount : null;
  const included = travel > 0 && equal(net, total) && travel <= total;
  const added = travel > 0 && net != null && net >= 0 && equal(net + travel, total);
  const priceValid = net != null && net >= 0 && (equal(net, total) || added);
  const billing = {
    schema: 'customer_billing_breakdown_v1', total_thb: total,
    original_price_thb: priceValid ? full : null,
    discount_thb: priceValid ? discount : null,
    discount_percent: priceValid && amount(pricing?.discount_percent) > 0 && amount(pricing?.discount_percent) <= 100
      && Math.abs(full * amount(pricing.discount_percent) / 100 - discount) <= 1 ? amount(pricing.discount_percent) : null,
    travel_fee_thb: travel,
    travel_treatment: included ? 'included' : added ? 'added' : travel > 0 ? 'review_required' : 'none',
    breakdown_status: priceValid && !(travel > 0 && !included && !added) ? 'complete' : 'review_required',
    service_items: [],
  };
  const base = amount(service?.client_base_amount_thb);
  if (base == null || !Array.isArray(service?.addons)) return billing;
  const allowed = new Set(['mk', 'burn', 'kiss', 'live', 'group']);
  const addons = service.addons.map(a => ({ label: String(a.option || '').toUpperCase(), amount_thb: amount(a.client_amount_thb) }));
  if (addons.some(a => !allowed.has(a.label.toLowerCase()) || a.amount_thb == null)) return billing;
  const gross = base + addons.reduce((n, a) => n + a.amount_thb, 0);
  if (!priceValid || !equal(gross, full)) return billing;
  const label = String(jobType || '').toUpperCase().split(/[:+,|\s]+/).find(x => ['PN', 'VIP'].includes(x)) || 'ค่าบริการ';
  billing.service_items = [{ label, amount_thb: base }, ...addons];
  return billing;
}
