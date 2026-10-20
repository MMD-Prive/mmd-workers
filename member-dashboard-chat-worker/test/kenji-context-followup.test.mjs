import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveKenjiSeedDecision, handleKenjiSeedLineRequest } from '../src/kenji-seed-line-runtime.mjs';
import { createLineSignature } from '../src/index.js';
import { buildKenjiPostTurnMatrix } from '../src/kenji-line-continuity-runtime.mjs';
import { KENJI_BOOKING_ACCUMULATOR_INTERNALS, parseKenjiBookingFragment } from '../src/kenji-line-booking-accumulator.mjs';
const env = { LINE_KENJI_MODEL_ENABLED: 'false', LINE_KENJI_DETERMINISTIC_CONVERSATION_ENABLED: 'true' };
const event = value => ({ type: 'message', source: { type: 'user', userId: 'UfixtureContext' }, message: { type: 'text', text: value } });
const fresh = () => ({ available: true, storage_status: 'ready', decision: 'ambiguous', effective_intent: 'note_only', matrix: {
  topic: 'booking', conversation_stage: 'awaiting_per', matrix_status: 'active',
  state_expires_at: '2099-01-01T00:00:00Z', handoff_required: true,
  handoff_reason: 'photo_accuracy:per_review', payload_json: {},
} });
const cases = [
  ['ถ้างั้น คนนี้ก่อนละกัน', /ชื่อหรือรหัส.*รูป/],
  ['เสาร์ที่ 24 ตค เวลา 2 ทุ่ม ได้ไหมครับ รัชดาซอย 5', /วัน.*เวลา.*สถานที่/],
  ['ถ้า PN มองไว้ประมาณ 12-15k ครับ แต่ต่ำกว่านั้นก็ไม่ติดนะครับ 555', /งบประมาณ/],
  ['บวกลบได้อยู่ครับ', /งบ.*ยืดหยุ่น/],
  // Real chat wording; replace the customer's map URL with a synthetic URL.
  ['สถานที่ เป็นที่นี่ครับ https://maps.app.goo.gl/fixture', /สถานที่.*ลิงก์/],
];
test('acknowledgement is not a model name and questions cannot overwrite draft location', () => {
  for (const message of ['ใช่ครับ', 'yes', 'บวกลบได้อยู่ครับ', 'ตัวจริง ตรงปกใช่ไหมครับ', 'ถ้างั้น คนนี้ก่อนละกัน']) {
    assert.equal(KENJI_BOOKING_ACCUMULATOR_INTERNALS.guidedModelCandidate(message), '');
    assert.equal(parseKenjiBookingFragment(event(message), 'note_only', { priorActive: true }).location, '');
  }
  assert.equal(KENJI_BOOKING_ACCUMULATOR_INTERNALS.guidedModelCandidate('Rossi'), 'Rossi');
  assert.equal(KENJI_BOOKING_ACCUMULATOR_INTERNALS.guidedModelCandidate('เอ็ม'), 'เอ็ม');
});
for (const [message, expected] of cases) test(`chat regression: ${message}`, async () => {
  const decision = await resolveKenjiSeedDecision(event(message), env, { modelAccessAllowed: false, continuity: fresh() });
  assert.equal(decision.reply_source, 'bounded_context_followup');
  assert.match(decision.text, expected);
  assert.doesNotMatch(decision.text, /สนใจสอบถามเรื่องสมาชิก ราคา|ต้องการวันไหน|ส่งต่อสำเร็จ|ยืนยันการจองแล้ว/);
  assert.equal(decision.handoff_required, true);
  assert.equal(decision.model_attempted, false);
  assert.equal(decision.live_truth_verified, false);
});
test('unrecognized turn in a current open case asks targeted clarification, not generic sales reset', async () => {
  const result = await resolveKenjiSeedDecision(event('อันนี้ยังไงครับ'), env, { continuity: fresh(), modelAccessAllowed: false });
  assert.equal(result.reply_source, 'bounded_context_followup');
  assert.match(result.text, /รูปกับตัวจริง/);
});
test('stale or unavailable context cannot imply knowledge of the previous case', async () => {
  for (const continuity of [{ ...fresh(), available: false }, { ...fresh(), decision: 'stale_refresh' }, { ...fresh(), matrix: { ...fresh().matrix, state_expires_at: '2000-01-01T00:00:00Z' } }]) {
    const result = await resolveKenjiSeedDecision(event('อันนี้ยังไงครับ'), env, { continuity, modelAccessAllowed: false });
    assert.notEqual(result.reply_source, 'bounded_context_followup');
  }
});
test('explicit rights command retains canonical truth lane', async () => {
  const result = await resolveKenjiSeedDecision(event('เช็กสิทธิ์'), env, { continuity: fresh(), liveTruth: { ok: false, status: 'unavailable' } });
  assert.equal(result.intent, 'membership_status');
  assert.equal(result.reply_source, 'live_truth_unavailable');
});
test('customer topic switch cannot inherit old photo question', async () => {
  const result = await resolveKenjiSeedDecision(event('เปลี่ยนเรื่อง อันนี้ยังไงครับ'), env, { continuity: { ...fresh(), decision: 'new_topic', reason: 'explicit_new_topic_signal' }, modelAccessAllowed: false });
  assert.notEqual(result.reply_source, 'bounded_context_followup');
});
test('successive turns reuse post-turn matrix without inventing the photo identity or repeating date request', async () => {
  let continuity = fresh();
  for (const [message] of cases) {
    const result = await resolveKenjiSeedDecision(event(message), env, { continuity, modelAccessAllowed: false });
    assert.equal(result.reply_source, 'bounded_context_followup');
    assert.doesNotMatch(result.text, /ต้องการวันไหน|รับ ใช่|สนใจสอบถามเรื่องสมาชิก/);
    const matrix = buildKenjiPostTurnMatrix({ continuity, decision: result, delivered: true, attempted: true });
    continuity = { ...continuity, matrix, effective_intent: 'human_handoff' };
  }
});
test('unresolved clarification is not repeated after confirmed delivery', async () => {
  const continuity = fresh();
  continuity.matrix.handoff_reason = 'clarify_open_case:per_review';
  continuity.matrix.payload_json = { line_delivery_succeeded: true };
  const result = await resolveKenjiSeedDecision(event('อันนี้ยังไงครับ'), env, { continuity, modelAccessAllowed: false });
  assert.equal(result.reply_source, 'bounded_context_waiting_per');
  assert.equal(result.text, '');
  assert.equal(result.handoff_required, true);
});
test('protected status continuity is never converted into a booking follow-up', async () => {
  const continuity = { ...fresh(), effective_intent: 'payment_status' };
  const result = await resolveKenjiSeedDecision(event('บวกลบได้อยู่ครับ'), env, { continuity, modelAccessAllowed: false });
  assert.notEqual(result.reply_source, 'bounded_context_followup');
});
test('same screenshot sequence runs offline without any external model or data request', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('Unexpected outbound request');
  try {
    const continuity = fresh();
    for (const [message] of cases) {
      const result = await resolveKenjiSeedDecision(event(message), env, { continuity, modelAccessAllowed: false });
      assert.equal(result.reply_source, 'bounded_context_followup');
    }
  } finally { globalThis.fetch = original; }
});
test('auto reply OFF never sends a reply for screenshot follow-ups with model kill active', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('No network allowed while paused in this fixture');
  try {
    const runtimeEnv = { ...env, INTERNAL_TOKEN: 'fixture-internal', LINE_AUTO_REPLY_ENABLED: 'false', LINE_KENJI_AI_ENABLED: 'true', LINE_CHANNEL_SECRET: 'fixture-secret',
      ADMIN_WORKER: { async fetch() { return Response.json({ ok: true, controls: { line_oa_auto_reply: false, model_keyword_auto_reply: true, all_kenji_mutations: false } }); } } };
    for (const [message] of cases) {
      const raw = JSON.stringify({ events: [{ ...event(message), mode: 'active', replyToken: 'fixture-reply' }] });
      const req = new Request('https://fixture.invalid/webhooks/line', { method: 'POST', headers: { 'x-line-signature': await createLineSignature(raw, runtimeEnv.LINE_CHANNEL_SECRET) }, body: raw });
      const response = await handleKenjiSeedLineRequest(req, runtimeEnv, null, { async fetch() { return Response.json({ saved: [{}] }); } });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.saved[0].replied, false);
    }
  } finally { globalThis.fetch = original; }
});
