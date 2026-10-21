import assert from 'node:assert/strict';
import test from 'node:test';
import { maybeHandleMmsChat } from '../src/mms-chat-runtime.mjs';
import { handleMyMmsCustomerApi, handleMyMmsCustomerUi } from '../../member-dashboard-chat-worker/src/my-mms-customer-app-front-gate.js';
import { maybeHandleTherapistWorkspace } from '../../member-dashboard-chat-worker/src/mms-therapist-workspace.js';
import { MMS_CHAT_POLICY } from '../../shared/mms-chat-policy.mjs';
import { fixture, cookie, CUSTOMER, OTHER_CUSTOMER, THERAPIST, ORIGIN } from './helpers/mms-chat-fixture.mjs';

function request(env, path, body, { actor = CUSTOMER, origin = ORIGIN, host = 'mms.internal' } = {}) {
  const therapist = actor.role === 'therapist';
  return new Request((therapist ? ORIGIN : `https://${host}`) + (therapist ? '/male-massage/therapists/api/app/chat' : '/internal/mms/chat/customer') + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin, ...(therapist ? { cookie: cookie(env) } : { 'x-mms-chat-member-ref': actor.id }), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const call = (env, path, body, options) => maybeHandleMmsChat(request(env, path, body, options), env);
async function accept(env, actor = CUSTOMER) {
  const response = await call(env, '/consent', { version: MMS_CHAT_POLICY.version }, { actor });
  assert.equal(response.status, 200);
}
async function create(env) {
  await accept(env);
  const response = await call(env, '/threads', { therapist_id: THERAPIST.id });
  assert.equal(response.status, 200);
  return (await response.json()).data.thread_id;
}

test('customer opens a room from public local profiles, Therapist accepts policy and replies; no booking or payment is created', async () => {
  const f = fixture();
  try {
    const policy = await call(f.env, '/policy'); assert.equal((await policy.json()).data.consent, null);
    assert.equal((await call(f.env, '/threads')).status, 409);
    assert.equal((await call(f.env, '/consent', { version: 'old' })).status, 409);
    const id = await create(f.env);
    assert.equal((await call(f.env, `/threads/${id}`, undefined, { actor: THERAPIST })).status, 409);
    await accept(f.env, THERAPIST);
    const first = await call(f.env, `/threads/${id}/messages`, { text: 'คอร์ส 60 นาทีราคาเท่าไรครับ', request_key: 'customer_request_0001' });
    assert.equal(first.status, 200);
    const reply = await call(f.env, `/threads/${id}/messages`, { text: '1500 บาทครับ', request_key: 'therapist_request_001' }, { actor: THERAPIST });
    assert.equal(reply.status, 200);
    const data = (await (await call(f.env, `/threads/${id}`)).json()).data;
    assert.equal(data.messages.length, 2); assert.equal(data.messages[1].role, 'therapist');
    assert.doesNotMatch(JSON.stringify(data), /private-subject|mmsmem_|recTherapist|fixture-token/);
    assert.ok(f.calls.every(call => !call.init?.method || call.init.method === 'GET'));
    const again = await call(f.env, '/threads', { therapist_id: THERAPIST.id }); assert.equal((await again.json()).data.thread_id, id);
  } finally { f.restore(); }
});

test('holds both directions before delivery and stores a replayable review request', async () => {
  const f = fixture();
  try {
    const id = await create(f.env); await accept(f.env, THERAPIST);
    for (const actor of [CUSTOMER, THERAPIST]) {
      const result = await call(f.env, `/threads/${id}/messages`, { text: 'ขอไลน์หน่อยครับ', request_key: 'blocked_request_0001' }, { actor });
      assert.equal(result.status, 422); const held = await result.json();
      assert.doesNotMatch(JSON.stringify(held), /ขอไลน์/);
      for (let n = 0; n < 2; n++) {
        const review = await call(f.env, `/threads/${id}/reviews`, { hold_id: held.error.hold_id }, { actor });
        assert.equal(review.status, 200); assert.equal((await review.json()).data.delivered, false);
      }
    }
    const received = (await (await call(f.env, `/threads/${id}`, undefined, { actor: THERAPIST })).json()).data.messages;
    assert.equal(received.length, 0);
    const queue = await maybeHandleMmsChat(new Request('https://mms.internal/internal/mms/admin/chat/reviews'), f.env);
    assert.equal((await queue.json()).data.reviews.length, 2);
    const publicQueue = await maybeHandleMmsChat(new Request(ORIGIN + '/internal/mms/admin/chat/reviews'), f.env);
    assert.equal(publicQueue.status, 404);
  } finally { f.restore(); }
});

test('rejects attachment payloads, spoofed identities, untrusted origins, unknown query keys and another customer room', async () => {
  const f = fixture();
  try {
    const id = await create(f.env); await accept(f.env, OTHER_CUSTOMER);
    assert.equal((await call(f.env, `/threads/${id}`, undefined, { actor: OTHER_CUSTOMER })).status, 404);
    assert.equal((await call(f.env, `/threads/${id}/messages`, { text: 'hello', request_key: 'request_key_0000001', sender_id: CUSTOMER.id })).status, 400);
    for (const body of [{ text: 'hello', attachments: ['qr.png'] }, { text: 'hello', member_ref: OTHER_CUSTOMER.id }, { image: 'data:image/png;base64,123' }]) assert.equal((await call(f.env, `/threads/${id}/messages`, body)).status, 400);
    assert.equal((await call(f.env, '/threads?member_ref=' + OTHER_CUSTOMER.id)).status, 400);
    assert.equal((await call(f.env, '/threads?after=bad')).status, 400);
    assert.equal((await call(f.env, '/threads?after=&after=')).status, 400);
    assert.equal((await call(f.env, '/therapists?zone=BKK-UNKNOWN')).status, 400);
    assert.equal((await call(f.env, `/threads/${id}/messages`, { text: 'hello', request_key: 'request_key_0000001' }, { origin: 'https://evil.test' })).status, 403);
    assert.equal((await call(f.env, '/policy', undefined, { host: 'mms-worker.workers.dev' })).status, 404);
    assert.equal((await call(f.env, `/threads/${id}/messages`, { text: 'x'.repeat(9000) })).status, 413);
    assert.equal((await call(f.env, `/threads/${id}`)).status, 200);
    assert.equal((await call(f.env, `/threads/${id}/messages`, { text: 'hello', request_key: 'request_key_0000001' })).status, 200);
  } finally { f.restore(); }
});

test('does not expose hidden, inactive, unapproved, unlinked or geographically unmatched Therapist profiles', async () => {
  const f = fixture();
  try {
    await accept(f.env);
    const list = () => call(f.env, '/therapists?zone=BKK-SILOM');
    assert.equal((await (await list()).json()).data.therapists.length, 1);
    for (const [field, value] of [['MY MMS Access', 'Revoked'], ['Status', 'Inactive'], ['Therapist Auth Status', 'Suspended'], ['LINE Subject Hash', ''], ['Matching Enabled', false], ['Coverage Service Zones', []]]) {
      const original = f.record.fields[field]; f.record.fields[field] = value;
      assert.equal((await (await list()).json()).data.therapists.length, 0, field); f.record.fields[field] = original;
    }
    f.manifest.profile_visibility = 'hidden';
    assert.equal((await (await list()).json()).data.therapists.length, 0);
    assert.equal((await call(f.env, '/threads', { therapist_id: THERAPIST.id })).status, 409);
    f.manifest.profile_visibility = 'public'; f.record.fields['Availability Status'] = 'Unavailable';
    assert.equal((await call(f.env, '/threads', { therapist_id: THERAPIST.id })).status, 409);
    f.record.fields['Display Name'] = '0891234567'; f.manifest.intro = 'แอดไลน์หน่อย'; f.manifest.courses[0].name = 'line id: test';
    const safe = JSON.stringify((await (await list()).json()).data);
    assert.doesNotMatch(safe, /0891234567|แอดไลน์|line id|recZone|private-subject/);
  } finally { f.restore(); }
});

test('revocation closes messaging in both directions, while an approved offline Therapist can still reply to an existing conversation', async () => {
  const f = fixture();
  try {
    const id = await create(f.env); await accept(f.env, THERAPIST);
    f.record.fields['Availability Status'] = 'Unavailable';
    assert.equal((await call(f.env, `/threads/${id}/messages`, { text: 'สอบถามคอร์สครับ', request_key: 'offline_request_0001' })).status, 200);
    f.record.fields['MY MMS Access'] = 'Revoked';
    assert.equal((await call(f.env, `/threads/${id}/messages`, { text: 'สวัสดีครับ', request_key: 'revoked_request_0001' })).status, 409);
    assert.equal((await call(f.env, `/threads/${id}`, undefined, { actor: THERAPIST })).status, 403);
    f.record.fields['MY MMS Access'] = 'Approved';
    assert.equal((await (await call(f.env, `/threads/${id}`)).json()).data.messages.length, 1);
  } finally { f.restore(); }
});

test('customer BFF resolves MMS identity from the session and strips all client-supplied identity and credential headers', async () => {
  let received;
  const env = {
    MMS_MEMBER_WORKER: { async fetch(req) { assert.equal(new URL(req.url).pathname, '/api/mms/app/membership/me'); return Response.json({ ok: true, data: { registered: true, profile: { member_id: CUSTOMER.id } } }); } },
    MMS_WORKER: { async fetch(req) { received = req; return Response.json({ ok: true, data: {} }); } },
  };
  const req = new Request(ORIGIN + '/api/mms/app/chat/threads', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-mms-chat-member-ref': OTHER_CUSTOMER.id, authorization: 'private-fixture', cookie: 'test-customer-cookie' }, body: JSON.stringify({ therapist_id: THERAPIST.id }) });
  assert.equal((await handleMyMmsCustomerApi(req, env)).status, 200);
  assert.equal(received.url, 'https://mms.internal/internal/mms/chat/customer/threads');
  assert.equal(received.headers.get('x-mms-chat-member-ref'), CUSTOMER.id);
  assert.equal(received.headers.get('cookie'), null); assert.equal(received.headers.get('authorization'), null);
  assert.deepEqual(await received.json(), { therapist_id: THERAPIST.id });
  for (const member of [{ status: 401 }, { ok: true, data: { registered: false } }, { ok: true, data: { registered: true, profile: { member_id: OTHER_CUSTOMER.id.slice(0, -1) } } }]) {
    env.MMS_MEMBER_WORKER.fetch = async () => member.status ? Response.json({}, { status: member.status }) : Response.json(member);
    received = null; assert.notEqual((await handleMyMmsCustomerApi(new Request(ORIGIN + '/api/mms/app/chat/policy'), env)).status, 200); assert.equal(received, null);
  }
});

test('native chat pages stay on already-owned support and Therapist app paths; private APIs are uncached', async () => {
  const customer = await handleMyMmsCustomerUi(new Request(ORIGIN + '/male-massage/support/chat'));
  assert.equal(customer.status, 200); assert.match(await customer.text(), /data-mms-chat="customer"/);
  const env = { MMS_THERAPIST_UI_SOURCE: 'native', MMS_WORKER: { async fetch() { return Response.json({ ok: true, data: { access: 'approved', can_open: true } }); } } };
  const therapist = await maybeHandleTherapistWorkspace(new Request(ORIGIN + '/male-massage/therapists/app/chat'), env);
  assert.equal(therapist.status, 200); assert.match(await therapist.text(), /data-mms-chat="therapist"/);
  env.MMS_WORKER.fetch = async () => Response.json({}, { status: 401 });
  assert.equal((await maybeHandleTherapistWorkspace(new Request(ORIGIN + '/male-massage/therapists/app/chat'), env)).status, 302);
  const f = fixture(); try { assert.match((await call(f.env, '/policy')).headers.get('cache-control'), /private, no-store/); } finally { f.restore(); }
});
