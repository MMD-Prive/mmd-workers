import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMemberAttention, projectAttention } from '../src/member-attention.js';
const url = 'https://mmdbkk.com/api/member/app/attention';
const member = { lifecycle: 'expired', nextAction: { kind: 'renew', url: '/sigil/member/membership?source=line&intent=renew' } };
const payment = { id: 'pay', official_status: 'awaiting_payment', customer_payment_url: 'https://mmdbkk.com/pay/checkout?t=signed' };
test('payment takes priority over duplicate renewal and only backend acknowledgement enables booking', () => {
  const rows = projectAttention(member, { records: [payment, payment] }, { sessionId: 'sess_1', acknowledgement: { customerAckAllowed: true } });
  assert.deepEqual(rows.map(row => row.kind), ['payment', 'booking']);
  assert.match(rows[1].url, /session_id=sess_1/);
  assert.equal(projectAttention(member, { records: [] }, null)[0].kind, 'renewal');
  assert.equal(projectAttention({ ...member, lifecycle: 'active' }, {}, { sessionId: 'other', acknowledgement: { customerAckAllowed: false } }).length, 0);
});
test('unsafe payment links and forged renewal URLs cannot become actions', () => {
  for (const value of ['https://evil.example/pay/checkout?t=x', 'https://mmdbkk.com/pay/checkout?t=x&member_id=other', 'https://mmdbkk.com/pay/checkout?t=x#oops']) {
    assert.equal(projectAttention(null, { records: [{ ...payment, customer_payment_url: value }] }, null).length, 0);
  }
  assert.equal(projectAttention({ ...member, nextAction: { kind: 'renew', url: 'https://evil.example' } }, {}, null).length, 0);
});
test('authentication and query rejection happen before reading private sources', async () => {
  let calls = 0; const readers = Object.fromEntries(['membership','payments','booking'].map(key => [key, async () => { calls++; throw Error(); }]));
  assert.equal((await handleMemberAttention(new Request(url), {}, { readSession: async () => null, readers })).status, 401);
  assert.equal((await handleMemberAttention(new Request(url + '?member_id=B'), {}, { readSession: async () => ({ lineUserId: 'A' }), readers })).status, 400);
  assert.equal(calls, 0);
});
test('failed sources remain partial, expired session fails closed, and no request identity is injected', async () => {
  const reader = async request => { assert.equal(request.headers.get('cookie'), 'session=A'); assert.equal(new URL(request.url).search, ''); return Response.json(member); };
  const deps = { readSession: async () => ({ lineUserId: 'A' }), readers: { membership: reader, payments: async () => { throw Error(); }, booking: async () => new Response(null, { status: 204 }) } };
  const response = await handleMemberAttention(new Request(url, { headers: { cookie: 'session=A' } }), {}, deps);
  const data = await response.json(); assert.equal(data.state, 'partial'); assert.equal(data.sources.payments, 'unavailable'); assert.equal(data.sources.amendments, 'not_connected');
  assert.equal(data.items.length, 0); // Unknown payment state must not offer another renewal.
  deps.readers.payments = async () => new Response(null, { status: 401 });
  assert.equal((await handleMemberAttention(new Request(url, { headers: { cookie: 'session=A' } }), {}, deps)).status, 401);
});
test('attention API returns at most three stable backend actions when several payments are pending', async () => {
  let reads = 0;
  const records = ['pay_d', 'pay_b', 'pay_a', 'pay_c', 'pay_a'].map(id => ({
    ...payment, id, customer_payment_url: `https://mmdbkk.com/pay/checkout?t=signed_${id}`,
  }));
  const readers = {
    membership: async () => { reads++; return Response.json(member); },
    payments: async () => { reads++; return Response.json({ ok: true, records }); },
    booking: async () => { reads++; return Response.json({ sessionId: 'sess_1', acknowledgement: { customerAckAllowed: true } }); },
  };
  const response = await handleMemberAttention(new Request(url), {}, {
    readSession: async () => ({ lineUserId: 'A' }), readers,
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(reads, 3);
  assert.equal(data.total, 3);
  assert.deepEqual(data.items.map(row => row.id), ['pay_a', 'pay_b', 'pay_c']);
  for (const row of data.items) {
    assert.equal(new URL(row.url).searchParams.get('t'), `signed_${row.id}`);
  }
  assert.match(response.headers.get('cache-control'), /no-store/);
});
