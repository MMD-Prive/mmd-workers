import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, PARTNER, apiModule } from './helpers/partner-fixture.mjs';
import { handleRelaxSpaPartner } from '../src/relax-spa-partner.mjs';
test('recognized MY Partner opens spa page and refers under their canonical record, never caller role', async t => {
  const f = await fixture(); t.after(() => f.restore());
  let sent;
  f.env.MMS_WORKER = { fetch: async req => { sent = req; return Response.json({ ok: true, data: {} }); } };
  const page = await f.call('/partner/dashboard/relax-spa');
  assert.equal(page.status, 200); assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await page.text(), /กลับ MY Partner/);
  const res = await f.call('/v1/partner/relax-spa/referrals', { body: { therapist_id: 'mmst_' + 'a'.repeat(24), partner_id: 'partner:recForgedValue000', request_key: 'fixture-request' }, headers: { origin: 'https://www.mmdbkk.com', 'x-mms-spa-role': 'owner', 'x-mms-spa-actor': 'per' } });
  assert.equal(res.status, 200);
  assert.equal(sent.headers.get('x-mms-spa-actor'), 'partner:' + PARTNER);
  assert.equal(sent.headers.get('x-mms-spa-role'), 'spa_partner');
  assert.equal(new URL(sent.url).searchParams.has('t'), false);
});
test('MY Partner cannot call spa finance or submit cross-origin', async t => {
  const f = await fixture(); t.after(() => f.restore());
  let calls = 0; f.env.MMS_WORKER = { fetch: async () => { calls++; return Response.json({ ok: true }); } };
  for (const command of ['services', 'agreements', 'receipts', 'settlements', 'payouts']) assert.equal((await f.call('/v1/partner/relax-spa/' + command, { body: {} })).status, 403);
  assert.equal((await f.call('/v1/partner/relax-spa/referrals', { body: {}, headers: { origin: 'https://other.example' } })).status, 403);
  assert.equal(calls, 0);
});
test('unverified MY Partner and missing MMS binding fail closed', async t => {
  const f = await fixture(); t.after(() => f.restore());
  assert.equal((await apiModule.default.fetch(new Request('https://www.mmdbkk.com/v1/partner/relax-spa/snapshot'), f.env, { waitUntil() {} })).status, 401);
  const page = await apiModule.default.fetch(new Request('https://www.mmdbkk.com/partner/dashboard/relax-spa'), f.env, { waitUntil() {} });
  assert.equal(page.status, 302); assert.match(page.headers.get('location'), /partner-login/);
  assert.equal((await f.call('/v1/partner/relax-spa/snapshot')).status, 503);
  const direct = await handleRelaxSpaPartner(new Request('https://www.mmdbkk.com/v1/partner/relax-spa/snapshot'), {}, 'forged');
  assert.equal(direct.status, 403);
});
