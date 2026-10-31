import test from 'node:test';
import assert from 'node:assert/strict';
import { careBackOctoberReply, careBackOctoberFollowup, CARE_BACK_OCTOBER_START as start, CARE_BACK_OCTOBER_END as end } from '../src/kenji-care-back-october.mjs';
import { resolveKenjiSalesReply } from '../src/kenji-sales-reply-v2-runtime.mjs';
import { refineKenjiSalesIntent } from '../src/kenji-sales-reply-v2-policy.mjs';
import { resolveKenjiSeedDecision } from '../src/kenji-seed-line-runtime.mjs';
const event = text => ({ type: 'message', mode: 'active', source: { type: 'user' }, message: { type: 'text', text } });

test('Bangkok date boundaries never advertise the offer after October 31', () => {
  assert.equal(careBackOctoberReply('care_back_new_member', '', start - 1), null);
  for (const now of [start, end - 1]) assert.match(careBackOctoberReply('care_back_new_member', '', now).text, /วันนี้วันสุดท้าย/);
  for (const now of [end, end + 86400000]) {
    const answer = careBackOctoberReply('care_back_new_member', '', now);
    assert.match(answer.text, /สิ้นสุด/);
    assert.doesNotMatch(answer.text, /วันนี้วันสุดท้าย|1,199|66 คะแนน|แถม/);
    assert.ok(answer.route);
  }
});
test('new, current and expired advertising have distinct short private CTAs', () => {
  const fresh = careBackOctoberReply('care_back_new_member', '', start);
  assert.match(fresh.text, /Standard 1,199 บาท\/1 ปี.*Premium 2,999 บาท\/2 ปี.*66 คะแนน/s);
  assert.match(fresh.route, /world=private/);
  const current = careBackOctoberReply('care_back_current_member', '', start);
  assert.match(current.text, /ต่ออายุหรือชำระล่วงหน้า.*Standard แถม 180 วัน.*Premium แถม 1 ปี/s);
  const expired = careBackOctoberReply('care_back_expired_member', '', start);
  assert.match(expired.text, /หมดอายุไม่เกิน 90 วัน.*1,000 บาท.*180 วัน.*2,500 บาท.*1 ปี/s);
  for (const answer of [fresh, current, expired]) {
    assert.ok(answer.text.length < 320);
    assert.ok(answer.label);
    assert.doesNotMatch(answer.text, /150|250 Welcome|365 วัน|3 ปี|ได้รับสิทธิ์แล้ว/);
  }
});
test('unknown group asks one question and bounded bare answers select the group', async () => {
  for (const message of ['promo', 'โปรโมชั่น', 'มีโปรอะไรบ้าง']) assert.equal(refineKenjiSalesIntent(message, 'pricing_review'), 'promotion_overview');
  assert.match(careBackOctoberReply('care_back_overview', '', start).text, /ใหม่.*ปัจจุบัน.*หมดอายุ/s);
  for (const [text, expected] of [['ใหม่', /1,199/], ['ปัจจุบัน', /Standard แถม 180 วัน/], ['หมดอายุ', /ไม่เกิน 90 วัน/]]) {
    const answer = await resolveKenjiSeedDecision(event(text), {}, { now: start, continuity: { available: true, decision: 'continuation', effective_intent: 'care_back_overview', matrix: { matrix_status: 'active', last_customer_intent: 'care_back_overview', state_expires_at: new Date(start + 60000).toISOString() } } });
    assert.match(answer.text, expected);
  }
});
test('over 90 days and protected questions never receive an eligibility promise', () => {
  const beyond = careBackOctoberReply('care_back_expired_member', 'หมดอายุเกิน 90 วัน', start);
  assert.match(beyond.text, /เปอร์ตรวจ/);
  assert.doesNotMatch(beyond.text, /1,000|แถม/);
  for (const intent of ['care_back_personal_status', 'care_back_payment_points', 'care_back_black_card', 'care_back_historical_points', 'privacy_request']) assert.equal(careBackOctoberReply(intent, 'CARE BACK', start), null);
  for (const text of ['CARE BACK ของผมได้ไหม', 'CARE BACK โอนแล้ว', 'CARE BACK SVIP', 'CARE BACK คืนเงิน']) assert.equal(careBackOctoberReply('care_back_overview', text, start), null);
});
test('approved copy needs no stale card or personal record, while handoff and pending proof remain authoritative', async () => {
  const options = { intent: 'care_back_new_member', now: start, readCard: () => { throw new Error('retired card must not be read'); }, readTruth: () => { throw new Error('advertising must not read personal truth'); } };
  const reply = await resolveKenjiSalesReply(event('สมัคร CARE BACK'), {}, options);
  assert.match(reply.text, /66 คะแนน/);
  assert.equal(reply.live_truth_verified, false);
  assert.equal(reply.model_attempted, false);
  const handoff = await resolveKenjiSalesReply(event('สมัคร CARE BACK'), {}, { ...options, continuity: { handoff_required: true } });
  assert.equal(handoff.text, '');
  const pending = await resolveKenjiSalesReply(event('สมัคร CARE BACK'), {}, { ...options, continuity: { conversation_stage: 'awaiting_payment_verification' } });
  assert.match(pending.text, /ไม่ต้องโอนหรือส่งสลิปซ้ำ/);
  assert.doesNotMatch(pending.text, /1,199|แถม/);
});

test('bare group cannot reuse missing, expired or handed-off campaign context', () => {
  const context = { available: true, decision: 'continuation', matrix: { matrix_status: 'active', last_customer_intent: 'care_back_overview', state_expires_at: new Date(start + 60000).toISOString() } };
  assert.equal(careBackOctoberFollowup('ใหม่', context, start), 'care_back_new_member');
  for (const bad of [{}, { ...context, handoff_required: true }, { ...context, decision: 'stale_refresh' }, { ...context, matrix: { ...context.matrix, state_expires_at: new Date(start).toISOString() } }]) assert.equal(careBackOctoberFollowup('ใหม่', bad, start), '');
});
