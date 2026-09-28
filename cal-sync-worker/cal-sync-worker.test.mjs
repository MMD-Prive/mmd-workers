import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, normalizeCalEvent, persistCalBookingLink } from './src/index.js';
import { ensureInternalHoldDirect, handleInternalHoldRequest, internalHoldHealth } from './src/internal-hold-writer.js';

async function sign(body, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `sha256=${hex}`;
}

test('normalizes standard booking payload', () => {
  const event = normalizeCalEvent({ triggerEvent:'BOOKING_CREATED', createdAt:'2026-09-14T04:00:00.000Z', payload:{ uid:'abc', bookingId:42, eventTypeId:7, startTime:'2026-09-17T09:30:00.000Z', endTime:'2026-09-17T11:00:00.000Z', attendees:[{email:'guest@example.com',name:'Guest'}] } });
  assert.equal(event.trigger_event,'BOOKING_CREATED');
  assert.equal(event.booking_uid,'abc');
  assert.equal(event.booking_id,42);
  assert.equal(event.idempotency_key,'cal:BOOKING_CREATED:abc:2026-09-14T04:00:00.000Z');
});

test('normalizes MMD session and job identity from Cal metadata', () => {
  const event = normalizeCalEvent({ triggerEvent:'BOOKING_CREATED', payload:{ uid:'mmd-1', metadata:{ session_id:'SES-1', job_id:'JOB-1' } } });
  assert.equal(event.canonical.session_id,'SES-1');
  assert.equal(event.canonical.job_id,'JOB-1');
});

test('normalizes location and reassignment context without changing MMD truth', () => {
  const event = normalizeCalEvent({ triggerEvent:'BOOKING_REASSIGNED', createdAt:'2026-09-14T05:00:00.000Z', payload:{ uid:'booking-1', previousLocation:{type:'address',address:'Old place'}, location:{type:'address',address:'New place'}, previousHost:{id:10,name:'Old Model'}, newHost:{id:20,name:'New Model'} } });
  assert.equal(event.location_change.previous.type,'address');
  assert.equal(event.location_change.current.value,'New place');
  assert.equal(event.reassignment.previous_host.id,10);
  assert.equal(event.reassignment.new_host.id,20);
});

test('normalizes Cal payment and no-show as signals only', () => {
  const paymentEvent = normalizeCalEvent({ triggerEvent:'BOOKING_PAID', payload:{uid:'paid-1',payment:{id:9,status:'succeeded',amount:2500,currency:'THB'}} });
  assert.deepEqual(paymentEvent.payment_signal,{id:9,status:'succeeded',amount:2500,currency:'THB'});
  const noShowEvent = normalizeCalEvent({ triggerEvent:'BOOKING_NO_SHOW_UPDATED', payload:{uid:'ns-1',noShow:{host:false,attendees:[{id:1}],status:'absent'}} });
  assert.equal(noShowEvent.no_show.attendee_count,1);
  assert.equal(noShowEvent.no_show.status,'absent');
});

test('captures reschedule reason and payload keys for schema observation', () => {
  const event = normalizeCalEvent({ triggerEvent:'BOOKING_RESCHEDULED', payload:{uid:'new-1',rescheduleUid:'old-1',reschedulingReason:'Flight changed',customFutureField:true} });
  assert.equal(event.reschedule_uid,'old-1');
  assert.equal(event.reschedule_reason,'Flight changed');
  assert.ok(event.payload_keys.includes('customFutureField'));
});

test('persists Cal UID to external identity ledger with MMD linkage', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init={}) => {
    calls.push({url:String(input),method:init.method||'GET',body:init.body||null});
    if ((init.method||'GET') === 'GET') return Response.json({records:[]});
    return Response.json({id:'recCalLink'});
  };
  try {
    const event = normalizeCalEvent({ triggerEvent:'BOOKING_CREATED', createdAt:'2026-09-14T06:00:00Z', payload:{uid:'uid-real',bookingId:77,eventTypeId:9,startTime:'2026-09-17T09:00:00Z',endTime:'2026-09-17T12:00:00Z',metadata:{session_id:'SES-77',job_id:'JOB-77'}} });
    const result = await persistCalBookingLink(event,{AIRTABLE_API_KEY:'test'});
    assert.equal(result.written,true);
    assert.equal(result.mapping_status,'linked');
    const write = calls.find(x => x.method === 'POST');
    const payload = JSON.parse(write.body);
    assert.equal(payload.fields['Cal Booking UID'],'uid-real');
    assert.equal(payload.fields['Session ID'],'SES-77');
    assert.equal(payload.fields['Job ID'],'JOB-77');
    assert.equal(payload.fields['Mapping Status'],'linked');
  } finally { globalThis.fetch = originalFetch; }
});

test('accepts a valid Cal webhook signature with sha256 prefix', async () => {
  const body=JSON.stringify({triggerEvent:'BOOKING_CREATED',payload:{uid:'abc'}}), secret='test-secret', signature=await sign(body,secret);
  const response=await handleRequest(new Request('https://example.test/webhooks/cal',{method:'POST',headers:{'content-type':'application/json','x-cal-signature-256':signature},body}),{CAL_WEBHOOK_SECRET:secret,CAL_SHADOW_MODE:'true'});
  assert.equal(response.status,204);
});

test('continues to accept raw hex signatures for compatibility', async () => {
  const body=JSON.stringify({triggerEvent:'BOOKING_CREATED',payload:{uid:'abc'}}), secret='test-secret', signature=(await sign(body,secret)).replace(/^sha256=/,'');
  const response=await handleRequest(new Request('https://example.test/webhooks/cal',{method:'POST',headers:{'content-type':'application/json','x-cal-signature-256':signature},body}),{CAL_WEBHOOK_SECRET:secret,CAL_SHADOW_MODE:'true'});
  assert.equal(response.status,204);
});

test('rejects an invalid Cal webhook signature', async () => {
  const body=JSON.stringify({triggerEvent:'BOOKING_CREATED',payload:{uid:'abc'}});
  const response=await handleRequest(new Request('https://example.test/webhooks/cal',{method:'POST',headers:{'content-type':'application/json','x-cal-signature-256':'sha256=deadbeef'},body}),{CAL_WEBHOOK_SECRET:'test-secret'});
  assert.equal(response.status,401);
});

test('fails closed when webhook secret is missing', async () => {
  const response=await handleRequest(new Request('https://example.test/webhooks/cal',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),{});
  assert.equal(response.status,503);
});


test('internal hold writer creates one real Cal projection from confirmed unpaid Session', async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || 'GET').toUpperCase();
    calls.push({ url, method, init });
    if (url.includes('tbl6saWYEQrEdnMIK') && method === 'GET') return Response.json({ records: [] });
    if (url.includes('tblC98mKWbzmPuNzX') && method === 'GET') {
      return Response.json({ records: [{ id:'recSession', fields:{
        fldLTq2kZbyRv22IA:'SES-LIVE-1',
        fldHw5HdDDdkHXMhG:'JOB-LIVE-1',
        flddVz6eoWRHrzIQr:'Model Live',
        fldBeG0FkWwa8kgnp:'2026-10-02T12:00:00.000Z',
        fldiDSz0wW9Ct9I3P:'2026-10-02T13:30:00.000Z',
        fldP7Xx99uf5BvJpF:1.5,
        fld57fhdWqIcOy4Jp:'model_confirmed',
        fldojgjSQLaO0uQLX:'PAY-LIVE-1',
      }}] });
    }
    if (url.includes('tblWGGJJOx5eBvBZJ') && method === 'GET') {
      return Response.json({ records: [{ id:'recPayment', fields:{
        fld2wdhBvc8xrV6y5:'SES-LIVE-1',
        fldOO6SY49iDw8VBZ:'PAY-LIVE-1',
        fldrr9g8ZZjqAbdKQ:'deposit',
        fldJ7a0Ube9F0bmRy:'pending_review',
        fldEJ1hmm7KwWuI6q:'pending',
      }}] });
    }
    if (url === 'https://api.cal.com/v2/bookings' && method === 'POST') {
      const body = JSON.parse(init.body);
      assert.equal(init.headers['cal-api-version'],'2026-02-25');
      assert.equal(body.eventTypeId,7057823);
      assert.equal(body.start,'2026-10-02T12:00:00.000Z');
      assert.equal(body.lengthInMinutes,90);
      assert.equal(body.attendee.email,'malemodel.bkk@gmail.com');
      assert.equal(body.location.type,'attendeeDefined');
      assert.equal(body.location.location,'MMD Internal Hold');
      assert.equal(body.metadata.session_id,'SES-LIVE-1');
      assert.equal(body.metadata.job_id,'JOB-LIVE-1');
      assert.equal(body.metadata.hold_kind,'internal_hold');
      assert.equal(body.allowConflicts,true);
      assert.equal(body.allowBookingOutOfBounds,true);
      return Response.json({ status:'success', data:{
        id:991,
        uid:'cal-live-uid-1',
        start:'2026-10-02T12:00:00.000Z',
        end:'2026-10-02T13:30:00.000Z',
      } }, { status:201 });
    }
    if (url.includes('tbl6saWYEQrEdnMIK') && method === 'POST') {
      const body = JSON.parse(init.body);
      assert.equal(body.fields['Cal Booking UID'],'cal-live-uid-1');
      assert.equal(body.fields['Session ID'],'SES-LIVE-1');
      assert.equal(body.fields.Source,'cal_sync_writer');
      return Response.json({ id:'recCalLive1' });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  const result = await ensureInternalHoldDirect({
    AIRTABLE_API_KEY:'airtable-test',
    CAL_API_KEY:'cal-test',
    AIRTABLE_BASE_ID:'appsV1ILPRfIjkaYg',
    CAL_INTERNAL_HOLD_EVENT_TYPE_ID:'7057823',
    CAL_INTERNAL_ATTENDEE_EMAIL:'malemodel.bkk@gmail.com',
    MMD_TIMEZONE:'Asia/Bangkok',
  }, 'SES-LIVE-1', { fetchImpl, now:Date.parse('2026-09-20T00:00:00Z') });

  assert.equal(result.ok,true);
  assert.equal(result.state,'created');
  assert.equal(result.booking_uid,'cal-live-uid-1');
  assert.equal(calls.filter(x=>x.url==='https://api.cal.com/v2/bookings').length,1);
});

test('internal hold writer uses Payments truth and skips verified deposit', async () => {
  let calCalls = 0;
  const fetchImpl = async (input, init = {}) => {
    const url = String(input), method=String(init.method||'GET').toUpperCase();
    if (url.includes('tbl6saWYEQrEdnMIK') && method === 'GET') return Response.json({ records: [] });
    if (url.includes('tblC98mKWbzmPuNzX') && method === 'GET') {
      return Response.json({ records: [{ id:'recSession', fields:{
        fldLTq2kZbyRv22IA:'SES-PAID-1',
        fldHw5HdDDdkHXMhG:'JOB-PAID-1',
        fldBeG0FkWwa8kgnp:'2026-10-02T12:00:00.000Z',
        fldiDSz0wW9Ct9I3P:'2026-10-02T13:30:00.000Z',
        fld57fhdWqIcOy4Jp:'confirmed',
        fldojgjSQLaO0uQLX:'PAY-PAID-1',
      }}] });
    }
    if (url.includes('tblWGGJJOx5eBvBZJ') && method === 'GET') {
      return Response.json({ records: [{ id:'recPayment', fields:{
        fld2wdhBvc8xrV6y5:'SES-PAID-1',
        fldOO6SY49iDw8VBZ:'PAY-PAID-1',
        fldrr9g8ZZjqAbdKQ:'deposit',
        fldJ7a0Ube9F0bmRy:'official_verified',
        fldEJ1hmm7KwWuI6q:'paid',
      }}] });
    }
    if (url.startsWith('https://api.cal.com/')) calCalls += 1;
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  const result=await ensureInternalHoldDirect({AIRTABLE_API_KEY:'test',CAL_API_KEY:'test'},'SES-PAID-1',{
    fetchImpl,now:Date.parse('2026-09-20T00:00:00Z'),
  });
  assert.deepEqual(result,{ok:true,state:'skipped',reason:'deposit_already_verified'});
  assert.equal(calCalls,0);
});

test('internal hold mutation route is private service-binding only', async () => {
  const publicResponse = await handleInternalHoldRequest(new Request('https://cal-sync-worker.malemodel-bkk.workers.dev/internal/holds/ensure',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:'SES-1'}),
  }),{CAL_INTERNAL_HOLD_WRITE_ENABLED:'true'});
  assert.equal(publicResponse,null);

  const disabled = await handleInternalHoldRequest(new Request('https://cal-sync.internal/internal/holds/ensure',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:'SES-1'}),
  }),{CAL_INTERNAL_HOLD_WRITE_ENABLED:'false'});
  assert.equal(disabled.status,503);
  assert.equal((await disabled.json()).error,'internal_hold_write_disabled');
});

test('internal hold health keeps webhook bridge shadow while exposing narrow writer readiness', () => {
  const namespace={idFromName(){return 'id'}};
  const health=internalHoldHealth({
    CAL_INTERNAL_HOLD_WRITE_ENABLED:'true',
    CAL_HOLD_COORDINATOR:namespace,
    CAL_INTERNAL_HOLD_EVENT_TYPE_ID:'7057823',
  });
  assert.equal(health.write_enabled,true);
  assert.equal(health.coordinator_configured,true);
  assert.equal(health.event_type_id,7057823);
  assert.equal(health.writer,'cal-sync-worker');
});
