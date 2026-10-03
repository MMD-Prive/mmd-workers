import { couponCoordinator, couponTotals, normalizeCouponCode } from './mmd-shop-coupons.js';
import { priceMmdCouponCart } from './mmd-shop-checkout.js';

export async function handleShopCouponRoute(request, env) {
  const path = new URL(request.url).pathname;
  if (!['/mmd-shop/api/coupons/quote', '/mmd-shop/api/coupons/issue'].includes(path)) return null;
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store, private', 'x-robots-tag': 'noindex, nofollow' } });
  if (request.method !== 'POST') return reply({ ok: false, error: 'method_not_allowed' }, 405);
  try {
    if (path.endsWith('/issue')) {
      const expected = String(env.MMD_SHOP_COUPON_ISSUER_TOKEN || '').trim();
      const supplied = String(request.headers.get('x-coupon-issuer-token') || '').trim();
      const digest = async value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      const a = new Uint8Array(await digest(expected)), b = new Uint8Array(await digest(supplied));
      let mismatch = 0;
      for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
      if (!expected || !supplied || mismatch) return reply({ ok: false, error: 'internal_auth_required' }, 401);
    }
    if (!/application\/json/i.test(request.headers.get('content-type') || '')) return reply({ ok: false, error: 'json_content_type_required' }, 415);
    const reader = request.body?.getReader();
    if (!reader) return reply({ ok: false, error: 'invalid_json_body' }, 400);
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); return reply({ ok: false, error: 'coupon_body_too_large' }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ ok: false, error: 'invalid_json_body' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ ok: false, error: 'invalid_json_body' }, 400);
    if (path.endsWith('/issue')) return reply(await couponCoordinator(env, 'issue', { issuance_key: body.issuance_key }));
    const coupon_code = normalizeCouponCode(body.coupon_code);
    const result = await couponCoordinator(env, 'inspect', { coupon_code });
    const items = await priceMmdCouponCart(env, body.items);
    return reply({ ok: true, shop: 'mmd-shop', ...couponTotals(items), coupon: result.coupon, currency: 'THB' });
  } catch (error) {
    // Never return raw upstream errors, credentials, or coupon codes.
    const known = /^(coupon_[a-z_]+|cart_[a-z_]+|invalid_[a-z_]+|product_[a-z_]+|stock_untracked|insufficient_stock|quantity_limit_exceeded|on_demand_supplier_unavailable)$/;
    return reply({ ok: false, error: known.test(error.message) ? error.message : 'coupon_service_unavailable' }, Number(error.status || 503));
  }
}
