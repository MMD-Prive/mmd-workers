import { KALIMA_MENU, RELAX_SPA_STAGE_MENU } from '../../shared/mms-shop-catalog-stage.mjs';
import { MMS_SHOP_COURSE_STAGE_AGREEMENTS } from '../../shared/mms-shop-course-terms-stage.mjs';
import { MMS_SPA_PAYMENT_POLICY, assertMmsPackagePaymentInput } from '../../shared/mms-spa-payment-policy.mjs';
import { roomPlan } from './relax-spa-agreement.mjs';

const fail = code => { throw Object.assign(new Error(code), { code, status: 409 }); };
const clone = value => structuredClone(value);
const MENUS = { kalima: KALIMA_MENU, relax: RELAX_SPA_STAGE_MENU };
export function stageShopCatalog(shop) {
  const menu = MENUS[shop];
  if (!menu) fail('STAGE_SHOP_NOT_FOUND');
  return { stage_only: true, shop_key: shop, ledger_key: `mms:stage:shop:${shop}:v1`,
    agreement: clone(MMS_SHOP_COURSE_STAGE_AGREEMENTS[shop]), payment_policy: clone(MMS_SPA_PAYMENT_POLICY),
    courses: menu.map((c, i) => ({ course_id: `${shop}:course:${i + 1}`, name: c.name,
      subtitle: c.english || c.thai, note: c.note || null,
      rates: (c.prices || [[c.minutes, c.baht]]).map(([minutes, baht]) => ({ minutes, room_course_amount: baht * 100, currency: 'THB', unit: 'satang' })) })) };
}

// Inject local/test storage only. Deliberately not exported as a Worker or production route.
export class StageShopLedger {
  constructor(storage) { this.storage = storage; }
  authorize(actor, shop, write = false) {
    stageShopCatalog(shop);
    if (!actor?.id || !['owner', 'partner'].includes(actor.role) || !actor.shop_keys?.includes(shop)) fail('STAGE_SHOP_ACCESS_DENIED');
    if (write && actor.role !== 'owner') fail('OWNER_REQUIRED');
  }
  key(shop) { return stageShopCatalog(shop).ledger_key; }
  async state(shop) {
    return clone(await this.storage.get(this.key(shop)) || { shop_key: shop, quotes: [], receipts: [], events: [], requests: {} });
  }
  async snapshot(actor, shop) {
    this.authorize(actor, shop);
    const state = await this.state(shop);
    if (actor.role === 'owner') return { ...stageShopCatalog(shop), ledger: state };
    return { ...stageShopCatalog(shop), ledger: { shop_key: shop,
      quotes: state.quotes.map(q => ({ id: q.id, course_id: q.course_id, minutes: q.minutes,
        room_course_amount: q.plan.room_amount, status: q.status })) } };
  }
  async quote(actor, shop, body) {
    this.authorize(actor, shop, true);
    assertMmsPackagePaymentInput(body);
    if (body.shop_key != null && body.shop_key !== shop) fail('STAGE_SHOP_SCOPE_MISMATCH');
    if (Object.hasOwn(body, 'room_amount')) fail('SHOP_RATE_OVERRIDE_FORBIDDEN');
    if (typeof body.request_key !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(body.request_key)) fail('REQUEST_KEY_INVALID');
    const catalog = stageShopCatalog(shop), course = catalog.courses.find(c => c.course_id === body.course_id);
    if (!course) fail('STAGE_COURSE_SCOPE_MISMATCH');
    const rate = course.rates.find(r => r.minutes === body.minutes);
    if (!rate) fail('STAGE_COURSE_DURATION_INVALID');
    // Therapist's explicitly agreed inclusive amount is required; no suggested fee/travel rate is inferred.
    const plan = roomPlan({ schema_version: 3, therapist_amount: body.therapist_amount,
      room: { amount: rate.room_course_amount }, partner_amount: 0, referrer_id: null,
      customer_amount: body.customer_amount, mms_mode: 'residual', adjustments: [] });
    return this.storage.transaction(async tx => {
      const key = this.key(shop), state = clone(await tx.get(key) || { shop_key: shop, quotes: [], receipts: [], events: [], requests: {} });
      const fingerprint = JSON.stringify(body), existing = state.requests[body.request_key];
      if (existing) { if (existing.fingerprint !== fingerprint) fail('REQUEST_KEY_REUSED'); return clone(state.quotes.find(q => q.id === existing.id)); }
      const q = { id: `stage:${shop}:quote:${body.request_key}`, shop_key: shop, course_id: course.course_id,
        course_name: course.name, minutes: rate.minutes, price_basis: 'mms_payable_room_course',
        therapist_included_in_shop_price: false, status: 'stage_quote', plan,
        payment_policy: clone(catalog.payment_policy), created_by: actor.id };
      state.quotes.push(q); state.requests[body.request_key] = { id: q.id, fingerprint };
      state.events.push({ action: 'stage_quote', shop_key: shop, quote_id: q.id, actor_id: actor.id });
      await tx.put(key, state); return clone(q);
    });
  }
}
