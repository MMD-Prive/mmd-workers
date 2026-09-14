import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, normalizeCalEvent } from './src/index.js';

async function sign(body, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256=${hex}`;
}

test('normalizes standard booking payload', () => {
  const event = normalizeCalEvent({
    triggerEvent: 'BOOKING_CREATED',
    createdAt: '2026-09-14T04:00:00.000Z',
    payload: {
      uid: 'abc',
      bookingId: 42,
      eventTypeId: 7,
      startTime: '2026-09-17T09:30:00.000Z',
      endTime: '2026-09-17T11:00:00.000Z',
      attendees: [{ email: 'guest@example.com', name: 'Guest' }],
    },
  });
  assert.equal(event.trigger_event, 'BOOKING_CREATED');
  assert.equal(event.booking_uid, 'abc');
  assert.equal(event.booking_id, 42);
  assert.equal(event.idempotency_key, 'cal:BOOKING_CREATED:abc:2026-09-14T04:00:00.000Z');
});

test('normalizes location and reassignment context without changing MMD truth', () => {
  const event = normalizeCalEvent({
    triggerEvent: 'BOOKING_REASSIGNED',
    createdAt: '2026-09-14T05:00:00.000Z',
    payload: {
      uid: 'booking-1',
      previousLocation: { type: 'address', address: 'Old place' },
      location: { type: 'address', address: 'New place' },
      previousHost: { id: 10, name: 'Old Model' },
      newHost: { id: 20, name: 'New Model' },
    },
  });
  assert.equal(event.location_change.previous.type, 'address');
  assert.equal(event.location_change.current.value, 'New place');
  assert.equal(event.reassignment.previous_host.id, 10);
  assert.equal(event.reassignment.new_host.id, 20);
});

test('normalizes Cal payment and no-show as signals only', () => {
  const paymentEvent = normalizeCalEvent({
    triggerEvent: 'BOOKING_PAID',
    payload: { uid: 'paid-1', payment: { id: 9, status: 'succeeded', amount: 2500, currency: 'THB' } },
  });
  assert.deepEqual(paymentEvent.payment_signal, { id: 9, status: 'succeeded', amount: 2500, currency: 'THB' });

  const noShowEvent = normalizeCalEvent({
    triggerEvent: 'BOOKING_NO_SHOW_UPDATED',
    payload: { uid: 'ns-1', noShow: { host: false, attendees: [{ id: 1 }], status: 'absent' } },
  });
  assert.equal(noShowEvent.no_show.attendee_count, 1);
  assert.equal(noShowEvent.no_show.status, 'absent');
});

test('captures reschedule reason and payload keys for schema observation', () => {
  const event = normalizeCalEvent({
    triggerEvent: 'BOOKING_RESCHEDULED',
    payload: {
      uid: 'new-1',
      rescheduleUid: 'old-1',
      reschedulingReason: 'Flight changed',
      customFutureField: true,
    },
  });
  assert.equal(event.reschedule_uid, 'old-1');
  assert.equal(event.reschedule_reason, 'Flight changed');
  assert.ok(event.payload_keys.includes('customFutureField'));
});

test('accepts a valid Cal webhook signature with sha256 prefix', async () => {
  const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'abc' } });
  const secret = 'test-secret';
  const signature = await sign(body, secret);
  const response = await handleRequest(new Request('https://example.test/webhooks/cal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cal-signature-256': signature },
    body,
  }), { CAL_WEBHOOK_SECRET: secret, CAL_SHADOW_MODE: 'true' });
  assert.equal(response.status, 204);
});

test('continues to accept raw hex signatures for compatibility', async () => {
  const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'abc' } });
  const secret = 'test-secret';
  const signature = (await sign(body, secret)).replace(/^sha256=/, '');
  const response = await handleRequest(new Request('https://example.test/webhooks/cal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cal-signature-256': signature },
    body,
  }), { CAL_WEBHOOK_SECRET: secret, CAL_SHADOW_MODE: 'true' });
  assert.equal(response.status, 204);
});

test('rejects an invalid Cal webhook signature', async () => {
  const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'abc' } });
  const response = await handleRequest(new Request('https://example.test/webhooks/cal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cal-signature-256': 'sha256=deadbeef' },
    body,
  }), { CAL_WEBHOOK_SECRET: 'test-secret' });
  assert.equal(response.status, 401);
});

test('fails closed when webhook secret is missing', async () => {
  const response = await handleRequest(new Request('https://example.test/webhooks/cal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }), {});
  assert.equal(response.status, 503);
});
