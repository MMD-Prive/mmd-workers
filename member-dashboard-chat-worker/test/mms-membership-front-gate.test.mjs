import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMmsMembershipRequest, isMmsMembershipOriginPassthrough, proxyMmsMembership } from '../src/mms-membership-front-gate.js';
const req = path => new Request('https://www.mmdbkk.com' + path);

test('membership owns native entry, privacy and its API only', () => {
  for (const path of ['/male-massage/member', '/male-massage/member/', '/male-massage/member/privacy', '/api/mms/app/membership/line']) assert.equal(isMmsMembershipRequest(req(path)), true);
  for (const path of ['/male-massage/my-mms', '/male-massage/home', '/male-massage/member/mms-booking', '/male-massage/membership', '/male-massage/therapists/app', '/api/mms/app/customer']) assert.equal(isMmsMembershipRequest(req(path)), false);
  assert.equal(isMmsMembershipOriginPassthrough(req('/male-massage/member/mms-booking')), true);
  assert.equal(isMmsMembershipOriginPassthrough(req('/male-massage/member/privacy')), false);
});

test('proxy preserves stage, Origin and Set-Cookie without involving MMD', async () => {
  const original = new Request('https://www.mmdbkk.com/api/mms/app/membership/line?stage=developing', { method: 'POST', headers: { origin: 'https://www.mmdbkk.com', 'content-type': 'application/json' }, body: JSON.stringify({ access_token: 'test' }) });
  const response = await proxyMmsMembership(original, { MMS_MEMBER_WORKER: { fetch: async received => {
    assert.equal(received.url, original.url);
    assert.equal(received.headers.get('origin'), 'https://www.mmdbkk.com');
    assert.deepEqual(await received.json(), { access_token: 'test' });
    return Response.json({ ok: true }, { headers: { 'set-cookie': '__Host-mms_customer_developing=test; Path=/; Secure; HttpOnly; SameSite=Lax' } });
  } } });
  assert.match(response.headers.get('set-cookie'), /customer_developing/);
  assert.equal((await proxyMmsMembership(req('/male-massage/member'), {})).status, 503);
});
