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
test('all public CARE BACK groups receive one short signup CTA without eligibility promises', () => {
  const replies = ['care_back_overview','care_back_new_member','care_back_current_member','care_back_expired_member','promotion_overview'].map(intent => careBackOctoberReply(intent, '', start));
  for(const answer of replies) {
    assert.deepEqual(answer,replies[0]); assert.ok(answer.text.length < 260);
    assert.match(answer.text,/วันนี้วันสุดท้าย/);assert.match(answer.text,/66 คะแนน/);
    assert.match(answer.route,/intent=signup.*world=private/);assert.ok(answer.label);
    assert.doesNotMatch(answer.text,/ได้รับสิทธิ์แล้ว|แถม 180 วัน|แถม 1 ปี/);
  }
});
test('generic copy does not ask membership group; personal/payment questions remain protected',()=>{
 for(const message of ['promo','โปรโมชั่น','มีโปรอะไรบ้าง']) assert.equal(refineKenjiSalesIntent(message,'pricing_review'),'promotion_overview');
 assert.doesNotMatch(careBackOctoberReply('care_back_overview','',start).text,/เป็นสมาชิก.*ไหม|พิมพ์.*ใหม่/);
 for(const intent of ['care_back_personal_status','care_back_payment_points','care_back_black_card','care_back_historical_points','privacy_request']) assert.equal(careBackOctoberReply(intent,'CARE BACK',start),null);
 for(const text of ['CARE BACK ของผมได้ไหม','CARE BACK โอนแล้ว','CARE BACK SVIP','CARE BACK คืนเงิน']) assert.equal(careBackOctoberReply('care_back_overview',text,start),null);
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
test('stale effective intent cannot turn a bare choice into an advertised group offer', async () => {
  for (const text of ['ใหม่', 'ปัจจุบัน', 'หมดอายุ']) {
    const reply = await resolveKenjiSeedDecision(event(text), {}, { now: start, continuity: { effective_intent: 'care_back_overview', available: false, decision: 'stale_refresh' } });
    assert.doesNotMatch(reply.text || '', /1,199|1,000|แถม 180 วัน|Premium แถม 1 ปี/);
  }
});
