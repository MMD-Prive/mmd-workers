import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePaymentNotificationTick } from '../src/payment-notification-schedule.mjs';

test('five-minute tick retries only persisted notifications; hourly tick stays with existing maintenance', async () => {
  const env = { marker: true }; let drains = 0;
  const drain = async value => { assert.equal(value, env); drains++; };
  assert.equal(await handlePaymentNotificationTick({ cron: '*/5 * * * *' }, env, drain), true);
  assert.equal(await handlePaymentNotificationTick({ cron: '0 * * * *' }, env, drain), false);
  assert.equal(drains, 1);
});

test('outbox failure propagates to Cron instead of being silently acknowledged', async () => {
  await assert.rejects(handlePaymentNotificationTick({ cron: '*/5 * * * *' }, {}, async () => { throw Error('outage'); }), /outage/);
});
