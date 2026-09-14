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
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
});

test('accepts a valid Cal webhook signature', async () => {
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

test('rejects an invalid Cal webhook signature', async () => {
  const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'abc' } });
  const response = await handleRequest(new Request('https://example.test/webhooks/cal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cal-signature-256': 'deadbeef' },
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
