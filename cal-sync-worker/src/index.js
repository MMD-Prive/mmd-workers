const encoder = new TextEncoder();

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function clean(value) {
  return String(value ?? '').trim();
}

function timingSafeEqualHex(a, b) {
  const left = clean(a).toLowerCase();
  const right = clean(b).toLowerCase();
  if (!/^[0-9a-f]+$/.test(left) || !/^[0-9a-f]+$/.test(right) || left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyWebhookSignature(rawBody, secret, signature) {
  const keyText = clean(secret);
  const supplied = clean(signature);
  if (!keyText || !supplied) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(keyText),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(expected, supplied);
}

export function normalizeCalEvent(input) {
  const triggerEvent = clean(input?.triggerEvent);
  const payload = input && typeof input.payload === 'object' && input.payload !== null ? input.payload : input || {};
  const attendee = Array.isArray(payload.attendees) ? payload.attendees[0] || null : null;
  const organizer = payload.organizer && typeof payload.organizer === 'object' ? payload.organizer : null;

  return {
    source: 'cal.com',
    trigger_event: triggerEvent || null,
    created_at: clean(input?.createdAt) || null,
    webhook_version: null,
    booking_uid: clean(payload.uid || payload.bookingUid) || null,
    booking_id: payload.bookingId ?? payload.id ?? null,
    event_type_id: payload.eventTypeId ?? null,
    event_type_slug: clean(payload.type) || null,
    start_time: clean(payload.startTime) || null,
    end_time: clean(payload.endTime) || null,
    reschedule_uid: clean(payload.rescheduleUid) || null,
    cancellation_reason: clean(payload.cancellationReason) || null,
    organizer: organizer
      ? { id: organizer.id ?? null, email: clean(organizer.email) || null, name: clean(organizer.name) || null }
      : null,
    attendee: attendee
      ? { id: attendee.id ?? null, email: clean(attendee.email) || null, name: clean(attendee.name) || null }
      : null,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
  };
}

function safeLogEvent(event, shadowMode) {
  console.log(JSON.stringify({
    type: 'cal_webhook',
    mode: shadowMode ? 'shadow' : 'active',
    trigger_event: event.trigger_event,
    booking_uid: event.booking_uid,
    booking_id: event.booking_id,
    event_type_id: event.event_type_id,
    start_time: event.start_time,
    end_time: event.end_time,
  }));
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/health') {
    return json({
      ok: true,
      service: 'cal-sync-worker',
      mode: clean(env.CAL_SHADOW_MODE).toLowerCase() === 'false' ? 'active' : 'shadow',
      webhook_secret_configured: Boolean(clean(env.CAL_WEBHOOK_SECRET)),
      api_key_configured: Boolean(clean(env.CAL_API_KEY)),
      timezone: clean(env.MMD_TIMEZONE) || 'Asia/Bangkok',
    });
  }

  if (request.method === 'POST' && url.pathname === '/webhooks/cal') {
    const secret = clean(env.CAL_WEBHOOK_SECRET);
    if (!secret) {
      return json({ ok: false, error: 'webhook_secret_not_configured' }, 503);
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-cal-signature-256');
    const valid = await verifyWebhookSignature(rawBody, secret, signature);
    if (!valid) {
      return json({ ok: false, error: 'invalid_signature' }, 401);
    }

    let input;
    try {
      input = JSON.parse(rawBody);
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const event = normalizeCalEvent(input);
    event.webhook_version = clean(request.headers.get('x-cal-webhook-version')) || null;
    const shadowMode = clean(env.CAL_SHADOW_MODE).toLowerCase() !== 'false';

    safeLogEvent(event, shadowMode);

    // V1 intentionally stops here. The bridge is shadow-only until the
    // booking-to-canonical Session mapping contract is explicitly approved.
    return new Response(null, { status: 204 });
  }

  return json({ ok: false, error: 'not_found' }, 404);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
