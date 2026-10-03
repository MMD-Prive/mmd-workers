// Coupon state lives in the existing global stock coordinator, never in the browser.
export const GG_COUPON = Object.freeze({ product_id: 'recSod352ioZ17aMr', sku: 'WGG-50', discount_thb: 500 });
const PREFIX = 'gg_coupon_v1:';
function fail(code, status = 409) { throw Object.assign(new Error(code), { status }); }
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function normalizeCouponCode(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') fail('coupon_invalid', 400);
  const code = value.trim().toUpperCase();
  if (!/^MMD-GG-[A-F0-9]{32}$/.test(code)) fail('coupon_invalid', 400);
  return code;
}
// Two calendar months at the same Bangkok time, clamped to the final day of the month.
export function couponExpiry(issuedAt) {
  const issued = new Date(issuedAt);
  if (!Number.isFinite(issued.getTime())) fail('coupon_invalid_date', 400);
  const local = new Date(issued.getTime() + 7 * 3600000);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + 2);
  const last = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, last));
  return new Date(local.getTime() - 7 * 3600000).toISOString();
}
function publicCoupon(row) {
  return { ...GG_COUPON, state: row.state, issued_at: row.issued_at, expires_at: row.expires_at, max_uses: 1 };
}
export async function issueGgCoupon(storage, issuanceKey, now = Date.now()) {
  if (typeof issuanceKey !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(issuanceKey)) fail('coupon_issuance_key_required', 400);
  const receiptKey = PREFIX + 'issue:' + await hash(issuanceKey);
  const code = 'MMD-GG-' + [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  const couponKey = PREFIX + await hash(code);
  return storage.transaction(async txn => {
    const old = await txn.get(receiptKey);
    if (old) return { ...old, idempotent: true };
    const issued_at = new Date(now).toISOString();
    const row = { ...GG_COUPON, state: 'active', issued_at, expires_at: couponExpiry(issued_at) };
    const receipt = { ok: true, code, coupon: publicCoupon(row), idempotent: false };
    await txn.put(couponKey, row);
    // Authenticated issuance retries return the same code and never extend its life.
    await txn.put(receiptKey, receipt);
    return receipt;
  });
}
function check(row, now, orderId = '') {
  if (!row) fail('coupon_invalid', 404);
  if (row.state === 'used') fail('coupon_used');
  if (Date.parse(row.expires_at) <= now) fail('coupon_expired');
  if (row.state === 'held' && row.order_id !== orderId) fail('coupon_in_use');
}
export async function inspectGgCoupon(storage, code, now = Date.now()) {
  code = normalizeCouponCode(code);
  if (!code) fail('coupon_required', 400);
  const row = await storage.get(PREFIX + await hash(code));
  check(row, now);
  return { ok: true, coupon: publicCoupon(row) };
}
export function couponTotals(items) {
  const eligible = items.find(item => item.product_id === GG_COUPON.product_id && item.sku === GG_COUPON.sku);
  if (!eligible) fail('coupon_product_required');
  // Fixed 500 THB per order, never per bottle or against another product.
  if (eligible.line_total_thb < GG_COUPON.discount_thb) fail('coupon_product_price_too_low');
  const subtotal_thb = Math.round(items.reduce((sum, item) => sum + item.line_total_thb, 0) * 100) / 100;
  const total_thb = Math.round((subtotal_thb - GG_COUPON.discount_thb) * 100) / 100;
  if (total_thb <= 0) fail('coupon_payable_amount_required');
  return { subtotal_thb, discount_thb: GG_COUPON.discount_thb, total_thb };
}
export async function holdGgCoupon(storage, code, orderId, now = Date.now()) {
  code = normalizeCouponCode(code);
  if (!code || !/^MMD-[A-Z0-9-]{8,100}$/.test(orderId || '')) fail('coupon_invalid_order', 400);
  const key = PREFIX + await hash(code), orderKey = PREFIX + 'order:' + orderId;
  return storage.transaction(async txn => {
    const row = await txn.get(key);
    check(row, now, orderId);
    const previous = await txn.get(orderKey);
    if (previous && previous !== key) fail('coupon_order_conflict');
    await txn.put(key, { ...row, state: 'held', order_id: orderId, held_at: new Date(now).toISOString() });
    await txn.put(orderKey, key);
    return { ok: true, coupon: publicCoupon({ ...row, state: 'held' }) };
  });
}
export async function settleGgCoupon(storage, orderId, action, now = Date.now()) {
  if (!orderId) return { ok: true, skipped: true };
  return storage.transaction(async txn => {
    const orderKey = PREFIX + 'order:' + orderId, key = await txn.get(orderKey);
    if (!key) return { ok: true, skipped: true };
    const row = await txn.get(key);
    if (!row || row.order_id !== orderId) fail('coupon_order_conflict');
    if (row.state === 'used') {
      if (action === 'release') fail('coupon_used');
      return { ok: true, idempotent: true };
    }
    if (row.state !== 'held') fail('coupon_order_conflict');
    if (action === 'commit') {
      // A payment accepted within the order's reservation may finish after coupon expiry.
      await txn.put(key, { ...row, state: 'used', used_at: new Date(now).toISOString() });
    } else if (action === 'release') {
      const { order_id, held_at, ...rest } = row;
      await txn.put(key, { ...rest, state: 'active' });
      await txn.delete(orderKey);
    } else fail('coupon_invalid_action', 400);
    return { ok: true };
  });
}
export async function couponCoordinator(env, action, payload) {
  const ns = env.MMD_SHOP_STOCK_COORDINATOR;
  if (!ns?.idFromName || !ns?.get) fail('coupon_service_unavailable', 503);
  const response = await ns.get(ns.idFromName('global')).fetch('https://mmd-shop-stock.internal/coupons/' + action, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true) fail(data.error || 'coupon_service_unavailable', response.status);
  return data;
}
