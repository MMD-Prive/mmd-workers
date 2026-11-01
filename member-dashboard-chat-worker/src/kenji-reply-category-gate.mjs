// Explicit opt-in; this module cannot change runtime controls or perform I/O.
export function restrictedReplyCategories(env = {}) {
  return env.KENJI_LINE_REPLY_CATEGORY_MODE === 'approved_qa_promo';
}
export const CATEGORY_REPLY_GRANT = Symbol('kenji-approved-reply');
export function categoryReplyTransportAllowed(env, token, text, button = null, extras = []) {
  if (env?.KENJI_LINE_REPLY_CATEGORY_MODE !== 'approved_qa_promo') return true;
  const grant = env[CATEGORY_REPLY_GRANT];
  return Boolean(grant && grant.token === token && grant.text === text && !button &&
    Array.isArray(extras) && extras.length === 0);
}
export function withCategoryReplyGrant(env, token, decision) {
  if (env?.KENJI_LINE_REPLY_CATEGORY_MODE !== 'approved_qa_promo') return env;
  if (!['approved_qa','approved_promotion'].includes(decision?.intent) || !decision?.text) return env;
  return {...env, [CATEGORY_REPLY_GRANT]: Object.freeze({token, text:decision.text})};
}

export function approvedCategoryReply(event, env = {}, adapters = {}) {
  const enabled = value => value === true || value === 'true';
  if (env.KENJI_LINE_REPLY_CATEGORY_MODE !== 'approved_qa_promo') return null;
  if (event?.source?.type !== 'user' || event?.type !== 'message' || event.message?.type !== 'text') return null;
  const raw = String(event.message.text || '').trim();
  if (!raw || raw.length > 1200) return null;
  try {
  // No identity, payment proof, eligibility, or conversational state is an
  // authority for public Q&A or advertising copy.
  if (/สลิป|โอนแล้ว|ชำระแล้ว|จ่ายแล้ว|คืนเงิน|ของผม|ของฉัน|ของหนู|ได้สิทธิ์แล้ว|ได้สิทธิ์ไหม|เข้าเกณฑ์/i.test(raw)) return null;
  if (enabled(env.KENJI_LINE_APPROVED_QA_ENABLED)) {
    const reply = adapters.ownerFaq?.(raw);
    if (reply?.intent === 'approved_qa' && reply.reply_source === 'per_line_20261031_v2' &&
        typeof reply.text === 'string' && reply.text.trim() && reply.text.length <= 1600 &&
        !/points|คะแนน|แต้ม|ได้สิทธิ์|(?:ครบ|สะสม).*(?:บาท|สิทธิ์)|(?:ชำระ|ต่ออายุ).*(?:สำเร็จ|เรียบร้อย)/i.test(reply.text)) {
      // Do not forward model cards, booking drafts, routes, or extra messages.
      return {text: reply.text, intent: 'approved_qa', reply_source: reply.reply_source};
    }
  }
  const now = adapters.now ?? Date.now();
  const start = Date.parse('2026-10-31T00:00:00+07:00');
  const end = Date.parse('2026-11-01T00:00:00+07:00');
  if (enabled(env.KENJI_LINE_APPROVED_PROMO_ENABLED) && Number.isFinite(now) && now >= start && now < end &&
      /^(?:มีโปรอะไร|มีโปรอะไรบ้าง|โปร(?:โมชั่น)?|care[\s_-]*back|แคร์แบค)[?？!\s]*(?:ครับ|ค่ะ)?$/i.test(raw)) {
    const reply = adapters.careBackOctoberReply?.('care_back_overview', raw, now);
    if (typeof reply?.text === 'string' && reply.text.trim() && reply.text.length <= 4500) {
      return {text: reply.text, intent: 'approved_promotion', reply_source: 'care_back_20261031'};
    }
  }
  // No currently verified replacement campaign: silence, never a stale CTA.
  return null;
  } catch {
    return null;
  }
}
