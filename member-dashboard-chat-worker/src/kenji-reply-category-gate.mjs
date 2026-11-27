import {entryTopicCommand} from './kenji-entry-topics.mjs';
// Explicit opt-in; this module cannot change runtime controls or perform I/O.
export function restrictedReplyCategories(env = {}) {
  return env.KENJI_LINE_REPLY_CATEGORY_MODE === 'approved_qa_promo';
}
// Routing only: category-turn still owns intake, identity and runtime guards.
export function isExplicitCategoryCommand(event = {}, env = {}) {
  if (!restrictedReplyCategories(env) || event.type !== 'message' ||
      event.message?.type !== 'text' || event.source?.type !== 'user') return false;
  const command = String(event.message.text || '').normalize('NFKC').trim().toLowerCase();
  return /^(package|regis|apply)$/.test(command) || Boolean(entryTopicCommand(event));
}
export const CATEGORY_REPLY_GRANT = Symbol('kenji-approved-reply');
const phase2StatusUrl = 'https://www.mmdbkk.com/member/liff?intent=status&world=public';
const phase2Label = 'เช็กสิทธิ์และต่ออายุ';
const phase2Start = Date.parse('2026-11-27T00:00:00+07:00');
const phase2End = Date.parse('2026-12-01T00:00:00+07:00');
const phase2Replies = new Map([
  ['care back', 'CARE BACK Phase 2 เปิดวันที่ 27–30 พฤศจิกายน 2569 ครับ กดปุ่มด้านล่างเพื่อเปิด MY MMD แล้วดูสิทธิ์ของบัญชีคุณก่อนสมัครหรือต่ออายุ'],
  ['โปรเดือนนี้', 'โปรเดือนนี้คือ CARE BACK Phase 2 วันที่ 27–30 พฤศจิกายน 2569 ครับ ข้อเสนอขึ้นอยู่กับสถานะสมาชิก กดปุ่มด้านล่างเพื่อเช็กสิทธิ์ของคุณใน MY MMD'],
  ['โปรสมาชิก', 'สมาชิกปัจจุบันเช็กสิทธิ์ต่ออายุล่วงหน้าได้ครับ ถ้าเคยเป็นสมาชิกแต่ตรวจไม่พบข้อมูล ยังไม่ต้องสมัครหรือชำระซ้ำ กดปุ่มด้านล่างเพื่อตรวจสถานะใน MY MMD ก่อนครับ'],
]);

export function phase2MyStatusReply(event, env, now) {
  if (!restrictedReplyCategories(env) || ![true, 'true'].includes(env.KENJI_LINE_APPROVED_PROMO_ENABLED) ||
      event?.type !== 'message' || event?.message?.type !== 'text' || event?.source?.type !== 'user' ||
      !Number.isFinite(now) || now < phase2Start || now >= phase2End) return null;
  const command = String(event.message.text || '').normalize('NFKC').trim().toLowerCase();
  const copy = phase2Replies.get(command);
  return copy ? {
    text: copy + '\n\n' + phase2StatusUrl,
    intent: 'approved_promotion',
    reply_source: 'care_back_canonical_public',
    cta_route: phase2StatusUrl,
  } : null;
}

export function membershipUriButton(decision) {
  if (decision?.reply_source === 'care_back_canonical_public' && decision.intent === 'approved_promotion' &&
      decision.cta_route === phase2StatusUrl && decision.text?.split('\n').at(-1) === phase2StatusUrl) {
    return {label:phase2Label,uri:phase2StatusUrl};
  }
  const routes = [
    'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview',
    'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=renew&view=package',
  ];
  return decision?.reply_source === 'category_checkpts' && decision.intent === 'approved_command' &&
    routes.includes(decision.cta_route) && decision.text?.endsWith(`เปิด My MMD → ${decision.cta_route}`)
    ? {label:'เปิด My MMD',uri:decision.cta_route} : null;
}
export function categoryReplyTransportAllowed(env, token, text, button = null, extras = []) {
  if (env?.KENJI_LINE_REPLY_CATEGORY_MODE !== 'approved_qa_promo') return true;
  const grant = env[CATEGORY_REPLY_GRANT];
  const buttonMatches = grant?.button
    ? button?.label === grant.button.label && button?.uri === grant.button.uri && Object.keys(button).length === 2
    : !button;
  return Boolean(grant && grant.token === token && grant.text === text && buttonMatches &&
    Array.isArray(extras) && extras.length === 0);
}
export function withCategoryReplyGrant(env, token, decision) {
  if (env?.KENJI_LINE_REPLY_CATEGORY_MODE !== 'approved_qa_promo') return env;
  if (!decision?.text || !(decision.intent === 'approved_promotion' ||
      (decision.intent === 'approved_command' && /^category_(checkpts|my_status|package|regis|apply|membership_intro|models|jobs|profile_link|model_request_clarify|model_request_external|model_request_booking)$/.test(decision.reply_source)))) return env;
  const button = membershipUriButton(decision);
  return {...env, [CATEGORY_REPLY_GRANT]: Object.freeze({token, text:decision.text, button:button ? Object.freeze(button) : null})};
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
  // Q&A belongs exclusively to native LINE OA, even if an old FAQ flag is on.
  const now = adapters.now ?? Date.now();
  const start = Date.parse('2026-10-31T00:00:00+07:00');
  if (enabled(env.KENJI_LINE_APPROVED_PROMO_ENABLED) && Number.isFinite(now) && now >= start &&
      /^(?:มีโปรอะไร|มีโปรอะไรบ้าง|โปร(?:โมชั่น)?|care[\s_-]*back|แคร์แบค)[?？!\s]*(?:ครับ|ค่ะ)?$/i.test(raw)) {
    // Canonical campaign copy owns the public wave and its expiry, not this gate.
    // This is an overview of three cohorts, never a classification of this user.
    const reply = adapters.careBackOctoberReply?.('care_back_overview', raw, now);
    const routes = new Set([
      'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup&world=private',
      'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview',
    ]);
    if (typeof reply?.text === 'string' && reply.text.trim() && reply.text.length <= 4500 &&
        routes.has(reply.route) && typeof reply.label === 'string' && reply.label.length <= 30) {
      // A single bounded text message retains the exact canonical URI/query.
      return {text: `${reply.text}\n${reply.label} → ${reply.route}`, intent: 'approved_promotion', reply_source: 'care_back_canonical_public'};
    }
  }
  // No currently verified replacement campaign: silence, never a stale CTA.
  return null;
  } catch {
    return null;
  }
}
