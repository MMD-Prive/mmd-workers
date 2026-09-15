import test from 'node:test';
import assert from 'node:assert/strict';
import { TELEGRAM_ALERT_MATRIX, telegramAlertDiagnostic } from './src/telegram-alert-matrix.js';

test('alert matrix contains required owner operations events', () => {
  for (const event of ['payment_match_uncertain','membership_review_required','model_confirmation_overdue','job_start_missing_confirmations','complaint_dispute_opened','payout_ready','auth_system_degraded']) {
    assert.ok(TELEGRAM_ALERT_MATRIX[event], event);
  }
});

test('diagnostic never exposes secrets and degrades when routing is absent', () => {
  const out = telegramAlertDiagnostic({});
  assert.equal(out.configured, false);
  assert.equal(out.state, 'degraded');
  assert.ok(out.missing.includes('service_credential'));
  assert.equal(JSON.stringify(out).includes('token'), false);
});

test('diagnostic reports configured when endpoint credential and route are present', () => {
  const out = telegramAlertDiagnostic({ TELEGRAM_WORKER_BASE: 'https://telegram-worker.example', AUTH_SERVICE_ADMIN_TO_TELEGRAM: 'secret', HYPE_CHAT_ID: '-1001', HYPE_THREAD_ID: '21' });
  assert.equal(out.configured, true);
  assert.equal(out.state, 'configured');
});
