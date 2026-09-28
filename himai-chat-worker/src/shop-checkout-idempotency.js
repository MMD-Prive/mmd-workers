import { checkoutConfigForPath, handleMmdShopCheckout, normalizeCart, normalizeCustomer, resolveServerMemberContext } from './mmd-shop-checkout.js';
import { normalizeMmdShopShipping } from '../../shared/mmd-shop-fulfillment.mjs';
import { digestCheckout, runCheckoutOnce } from '../../shared/shop-checkout-once.mjs';

const KEY_RE = /^sc1_[a-f0-9]{32}$/;
function reply(error, status, extra = {}) {
  return Response.json({ ok: false, error, ...extra }, { status, headers: { 'cache-control': 'no-store, private' } });
}
async function boundedBody(request) {
  if (!/application\/json/i.test(request.headers.get('content-type') || '')) throw Object.assign(new Error('json_content_type_required'), { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('invalid_json_body'), { status: 400 });
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 16384) { await reader.cancel(); throw Object.assign(new Error('checkout_body_too_large'), { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body = JSON.parse(new TextDecoder().decode(joined));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw Object.assign(new Error('invalid_json_body'), { status: 400 }); }
}
export async function handleReplaySafeShopCheckout(request, env, ctx = null) {
  const shop = checkoutConfigForPath(new URL(request.url).pathname);
  if (!shop) return null;
  if (request.method !== 'POST') return handleMmdShopCheckout(request, env, ctx);
  try {
    const body = await boundedBody(request);
    const key = String(request.headers.get('idempotency-key') || body.checkout_key || '');
    if (!key) return reply('checkout_key_required', 428, { refresh_required: true, new_attempt_allowed: true });
    if (!KEY_RE.test(key) || (body.checkout_key && body.checkout_key !== key)) return reply('invalid_checkout_key', 400);
    const customer = normalizeCustomer(body.customer || body);
    const shipping = normalizeMmdShopShipping(body.shipping || {}, customer);
    const items = normalizeCart(body.items).sort((a, b) => a.product_id.localeCompare(b.product_id));
    const ns = env.MMD_SHOP_STOCK_COORDINATOR;
    if (!ns?.idFromName || !ns?.get) return reply('checkout_durability_unavailable', 503);
    const id = ns.idFromName('checkout:v1:' + await digestCheckout(key));
    const headers = { 'content-type': 'application/json', 'idempotency-key': key };
    if (request.headers.get('cookie')) headers.cookie = request.headers.get('cookie');
    // Same binding, separate object IDs: never hold the global stock queue while checking out.
    return await ns.get(id).fetch(new Request('https://shop-checkout.internal' + shop.path, {
      method: 'POST', headers, body: JSON.stringify({ customer, shipping, items, source_path: shop.sourcePath, checkout_key: key }),
    }));
  } catch (e) { return reply(e.status ? e.message : 'checkout_outcome_unknown', Number(e.status || 503), { new_attempt_allowed: Boolean(e.status && e.status < 500) }); }
}
export async function handleShopCheckoutSession(request, state, env) {
  const shop = checkoutConfigForPath(new URL(request.url).pathname);
  if (!shop || request.method !== 'POST' || !KEY_RE.test(request.headers.get('idempotency-key') || '')) return reply('invalid_checkout_session', 400);
  const body = await boundedBody(request);
  const memberContext = await resolveServerMemberContext(request, env);
  const identity = memberContext ? { member_id: memberContext.member_id, line_user_id: memberContext.line_user_id || null } : null;
  const { checkout_key, ...normalized } = body;
  const fingerprint = await digestCheckout(JSON.stringify({ shop: shop.key, body: normalized, identity }));
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const stamp = date.year + date.month + date.day;
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  return runCheckoutOnce({ storage: state.storage, fingerprint, shop: shop.key, orderId: `${shop.orderPrefix}-${stamp}-${suffix}`, execute: async options => {
    const core = new Request('https://shop-checkout.internal' + shop.path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(normalized) });
    return handleMmdShopCheckout(core, env, state, { ...options, memberContext });
  } });
}
