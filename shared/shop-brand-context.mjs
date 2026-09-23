/** Brand is resolved from persisted order/payment evidence, never browser labels or amounts. */
export const SHOP_BRANDS = Object.freeze({
  shop: Object.freeze({ key: 'shop', publicName: 'Himai Shop', title: 'HIMAI SHOP', root: '/shop', prefix: 'HIMAI', paymentFlow: 'himai_payments', paymentThread: 158, alertThread: 159 }),
  'mmd-shop': Object.freeze({ key: 'mmd-shop', publicName: 'MMD Shop', title: 'MMD SHOP', root: '/mmd-shop', prefix: 'MMD', paymentFlow: 'mmd_shop_payments', paymentThread: 161, alertThread: 162 }),
});
function value(v) { return String(v && typeof v === 'object' ? v.name || '' : v || '').trim(); }
export function normalizeShopBrand(v) {
  const key = value(v).toLowerCase().replace(/\s+/g, ' ');
  if (['shop', 'himai', 'himai shop'].includes(key)) return 'shop';
  if (['mmd', 'mmd-shop', 'mmd shop'].includes(key)) return 'mmd-shop';
  return null;
}
function conflict(message) { return Object.assign(new Error(message), { status: 409 }); }
export function resolvePersistedShopBrand(record = {}) {
  const f = record.fields || record;
  const evidence = [];
  for (const key of ['fld97aHqq3IbPam84', 'Shop Brand', 'shop_brand']) {
    if (!value(f[key])) continue;
    const brand = normalizeShopBrand(f[key]);
    if (!brand) throw conflict('shop_brand_unknown');
    evidence.push(brand);
  }
  const notes = [f.fldWG0u77XQ5W0wpT, f.fldjsZIKoJPawlb2u, f.Notes, f.notes].map(value).join('\n');
  for (const match of notes.matchAll(/(?:^|[;\n])\s*shop_brand=([^;\n]+)/g)) {
    const brand = normalizeShopBrand(match[1]);
    if (!brand) throw conflict('shop_brand_unknown');
    evidence.push(brand);
  }
  const ids = [f.flde515MCoEq08YzU, f['Order ID'], f.order_id, f.fld2wdhBvc8xrV6y5, f['Session ID'], f.session_id].map(value).filter(Boolean);
  for (const id of ids) {
    if (/^HIMAI-/i.test(id)) evidence.push('shop');
    else if (/^MMD-/i.test(id)) evidence.push('mmd-shop');
  }
  if (new Set(evidence).size > 1) throw conflict('shop_brand_conflict');
  // Records predating the multi-brand rollout were MMD orders. Preserve their links/refs.
  return SHOP_BRANDS[evidence[0] || 'mmd-shop'];
}
export function shopPaymentThreads(env, brand) {
  const read = (name, fallback) => {
    const n = Number(env[name]);
    return Number.isSafeInteger(n) && n > 0 ? n : fallback;
  };
  const prefix = brand.key === 'shop' ? 'TG_THREAD_HIMAI' : 'TG_THREAD_MMD_SHOP';
  return { thread_id: read(prefix + '_PAYMENTS', brand.paymentThread), alerts_thread_id: read(prefix + '_ALERTS', brand.alertThread) };
}
