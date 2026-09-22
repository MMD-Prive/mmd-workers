import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePaymentReviewRequest } from './src/payment-review-runtime.js';
import { enrichPaymentReviewContext } from './src/payment-review-display-context.js';

const actor = { id: 'owner-test', role: 'owner' };
const proofId = 'webproof_0123456789abcdef01234567';
const key = `web-payment-proofs/2026/09/${proofId}/original.png`;
function envFor(note, contentType = 'image/png') {
  const calls = [];
  const proof = { id: 'rec-proof', fields: { proof_id: proofId, status: 'pending', amount_thb: 30000, payment_ref: 'pay-test', payment: ['rec-pay'], session: ['rec-session'], note } };
  return { calls, env: {
    AIRTABLE_BASE_ID: 'app-test', AIRTABLE_API_KEY: 'test',
    AIRTABLE_HTTP: { fetch: async () => Response.json({ records: [proof] }) },
    LINE_SLIP_EVIDENCE: { get: async k => { calls.push(k); return { body: new Uint8Array([1, 2, 3]), httpMetadata: { contentType } }; } },
  } };
}
const evidenceRequest = () => new Request(`https://www.mmdbkk.com/v1/admin/payments/evidence?proof_id=${proofId}`);

test('web intake semicolon notes produce a private review preview without marking paid', async () => {
  const { env, calls } = envFor(`schema=mmd_web_payment_proof_v1; evidence_only=true; r2_key=${key}; telegram_delivered=true`);
  const r = await handlePaymentReviewRequest(new Request('https://www.mmdbkk.com/v1/admin/payments/review-queue'), env, actor);
  const item = (await r.json()).items[0];
  assert.equal(item.can_approve, true);
  assert.equal(item.status, 'pending');
  assert.equal(item.evidence_preview_url, `/v1/admin/payments/evidence?proof_id=${proofId}`);
  assert.equal(item.evidence_type, 'image');
  assert.equal(calls.length, 0);
  const image = await handlePaymentReviewRequest(evidenceRequest(), env, actor);
  assert.equal(image.status, 200);
  assert.deepEqual(calls, [key]);
  assert.equal(image.headers.get('cache-control'), 'no-store, private');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
});

test('private evidence requires an authenticated actor before reading storage', async () => {
  const { env, calls } = envFor(`schema=mmd_web_payment_proof_v1; r2_key=${key}`);
  const r = await handlePaymentReviewRequest(evidenceRequest(), env, null);
  assert.equal(r.status, 401);
  assert.deepEqual(calls, []);
});

test('PDF web evidence uses a sandboxed response and reports the correct preview type', async () => {
  const pdfKey = key.replace('.png', '.pdf');
  const { env } = envFor(`schema=mmd_web_payment_proof_v1; r2_key=${pdfKey}`, 'application/pdf');
  const r = await handlePaymentReviewRequest(evidenceRequest(), env, actor);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-security-policy'), /sandbox/);
  const queue = await handlePaymentReviewRequest(new Request('https://www.mmdbkk.com/v1/admin/payments/review-queue'), env, actor);
  assert.equal((await queue.json()).items[0].evidence_type, 'pdf');
});

test('arbitrary notes, unknown prefixes, traversal and unsupported MIME never expose R2 objects', async () => {
  for (const note of [
    `customer says r2_key=${key}`,
    'schema=mmd_web_payment_proof_v1; r2_key=other-private-bucket/key.png',
    `schema=mmd_web_payment_proof_v1; r2_key=web-payment-proofs/2026/09/../../secret/original.png`,
    `schema=mmd_web_payment_proof_v1; r2_key=web-payment-proofs/2026/09/not-a-web-proof/original.png`,
  ]) {
    const { env, calls } = envFor(note);
    assert.equal((await handlePaymentReviewRequest(evidenceRequest(), env, actor)).status, 404);
    assert.deepEqual(calls, []);
  }
  const { env } = envFor(`schema=mmd_web_payment_proof_v1; r2_key=${key}`, 'text/html');
  assert.equal((await handlePaymentReviewRequest(evidenceRequest(), env, actor)).status, 415);
});

test('existing LINE JSON notes still resolve and historical notes stay out of the queue', async () => {
  const lineKey = 'line-ofc/payment-proofs/2026/09/line-proof/original.jpg';
  const { env, calls } = envFor(JSON.stringify({ schema: 'line_payment_evidence_v3', r2_key: lineKey }), 'image/jpeg');
  assert.equal((await handlePaymentReviewRequest(evidenceRequest(), env, actor)).status, 200);
  assert.deepEqual(calls, [lineKey]);
  const historical = envFor(JSON.stringify({ schema: 'mmd_historical_slip_backfill_v1', r2_key: lineKey }));
  const r = await handlePaymentReviewRequest(new Request('https://www.mmdbkk.com/v1/admin/payments/review-queue'), historical.env, actor);
  assert.deepEqual((await r.json()).items, []);
});

const item = { proof_id: proofId, proof_record_id: 'rec-proof', payment_ref: 'pay-test', evidence_amount_thb: 30000, can_approve: true, reviewable: true, context_issues: [] };
const proofs = [{ id: 'rec-proof', fields: { payment: ['rec-pay'], session: ['rec-session'] } }];
const payment = { id: 'rec-pay', fields: { 'Payment Reference': 'pay-test', Amount: 30000, payment_stage: 'full', session_id: 'sess-test', 'Payment Status': 'Pending' } };
const session = { id: 'rec-session', fields: { session_id: 'sess-test', client_name: 'ลูกค้าทดสอบ', model_name: 'โมเดลทดสอบ', job_date: '2026-10-04', start_time: '16:00', customer_confirmation_url: 'private-token', model_confirmation_url: 'private-token', pay_model_thb: 22500 } };
async function project(payments = [payment], sessions = [session], rows = proofs) {
  return (await enrichPaymentReviewContext([item], rows, { paymentsTable: 'payments', sessionsTable: 'sessions', list: async table => table === 'payments' ? payments : sessions }))[0];
}
test('review context displays exact job and amount without confirmation tokens or payout data', async () => {
  const result = await project();
  assert.equal(result.model_name, 'โมเดลทดสอบ');
  assert.equal(result.expected_amount_thb, 30000);
  assert.equal(result.payment_stage, 'full');
  assert.equal(result.session_id, 'sess-test');
  assert.equal(result.can_approve, true);
  assert.equal(result.context_loaded, true);
  assert.doesNotMatch(JSON.stringify(result), /private-token|22500|confirmation_url|pay_model_thb/);
});
test('missing, ambiguous, mismatched or cancelled contexts fail closed in the simple queue', async () => {
  for (const result of [
    await project([]), await project([payment, { ...payment, id: 'duplicate' }]),
    await project([{ ...payment, fields: { ...payment.fields, Amount: 5000 } }]),
    await project([{ ...payment, fields: { ...payment.fields, 'Payment Status': 'Paid' } }]),
    await project([payment], []),
    await project([payment], [session], [{ id: 'rec-proof', fields: { payment: ['wrong-payment'] } }]),
  ]) {
    assert.equal(result.can_approve, false);
    assert.equal(result.review_lane, 'needs_enrichment');
    assert.ok(result.context_issues.length);
  }
});
test('unavailable canonical data remains an error, never a ready item', async () => {
  const [result] = await enrichPaymentReviewContext([item], proofs, { paymentsTable: 'payments', sessionsTable: 'sessions', list: async () => { throw Error('rate limited'); } });
  assert.equal(result.can_approve, false);
  assert.ok(result.context_issues.includes('review_context_unavailable'));
});
