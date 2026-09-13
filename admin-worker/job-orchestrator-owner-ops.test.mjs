import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_OPS_FIELDS, augmentDashboardPayload, projectOwnerAction, verifiedPaymentForSession } from './src/job-orchestrator-owner-ops-runtime.js';
import { lifecycleEnv } from './src/job-orchestrator-owner-ops-wrapper.js';

const F = OWNER_OPS_FIELDS;

test('model lifecycle routes use canonical state field without changing unrelated env', () => {
  const env = { AT_SESSIONS__STATE: 'session_state' };
  const scoped = lifecycleEnv(env, '/v1/model/session/action');
  assert.equal(scoped.AT_SESSIONS__STATE, 'model_session_state');
  assert.equal(scoped.AT_SESSIONS__STATE_UPDATED_AT, 'model_session_state_updated_at');
  assert.equal(env.AT_SESSIONS__STATE, 'session_state');
  assert.equal(lifecycleEnv(env, '/v1/admin/dashboard'), env);
});

test('verified payment prefers final or full stage', () => {
  const rows = [
    { id: 'a', fields: { [F.payment.sessionId]: 'SES-1', [F.payment.verification]: 'verified', [F.payment.stage]: 'deposit' } },
    { id: 'b', fields: { [F.payment.sessionId]: 'SES-1', [F.payment.verification]: 'verified', [F.payment.stage]: 'final' } },
  ];
  assert.equal(verifiedPaymentForSession(rows, 'SES-1')?.id, 'b');
});

test('owner projection fail-closes payout when care or completion review is open', () => {
  const session = { fields: { [F.session.sessionId]: 'SES-1', [F.session.state]: 'under_review', [F.session.modelPayout]: 5000, [F.session.completion]: 'pending_review' } };
  const out = projectOwnerAction(session, { payment: { id: 'pay' }, payout: null, openCare: [{ id: 'case' }] });
  assert.equal(out.actions.can_mark_payout_ready, false);
  assert.match(out.payout_hold_reason, /open_private_care_case/);
  assert.match(out.payout_hold_reason, /completion_not_reviewed/);
});

test('owner projection exposes ready-to-pay only after review clear, verified money and no care case', () => {
  const session = { fields: { [F.session.sessionId]: 'SES-2', [F.session.state]: 'under_review', [F.session.modelPayout]: 7500, [F.session.completion]: 'clear', [F.session.customerAckAt]: '2026-09-13', [F.session.modelAckAt]: '2026-09-13' } };
  const out = projectOwnerAction(session, { payment: { id: 'pay' }, payout: null, openCare: [] });
  assert.equal(out.confirmation_complete, true);
  assert.equal(out.actions.can_mark_payout_ready, true);
});

test('dashboard augmentation preserves existing queues and adds owner queues', () => {
  const base = { ok: true, counts: { payment_review: 2 }, queues: { payment_review: { count: 2, href: '/internal/admin/payments' } } };
  const ops = { ok: true, counts: { completion_review: 3, payout_ready: 1, confirmation_incomplete: 4 }, items: [], telegram: { state: 'configured' } };
  const out = augmentDashboardPayload(base, ops);
  assert.equal(out.counts.payment_review, 2);
  assert.equal(out.counts.completion_review, 3);
  assert.equal(out.queues.payout_ready.href, '/internal/admin/jobs/all?ops=payout');
});
