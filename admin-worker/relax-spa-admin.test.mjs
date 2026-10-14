import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { handleRelaxSpaAdmin, isRelaxSpaAdminRequest } from './src/relax-spa-admin.js';
import { renderRelaxSpaPage } from './src/relax-spa-page.js';
const origin = 'https://www.mmdbkk.com';
const env = { ADMIN_LOGIN_CREDENTIAL: 'local-test-credential', ADMIN_SESSION_SECRET: 'local-test-session' };
async function req(role, command, body, extra = {}) {
  const token = await createCredentialBoundAdminSession(new Request(origin), { id: role === 'owner' ? 'per' : 'mms-partner:henna', role }, env);
  return new Request(origin + '/v1/admin/mms/relax-spa/' + command, { method: body ? 'POST' : 'GET', headers: { cookie: 'mmd_admin_gate_v1=' + token, ...(body ? { origin, 'content-type': 'application/json' } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
}
test('spa page and navigation have valid script and stay in existing MMS tree', () => {
  const html = renderRelaxSpaPage();
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Script(m[1]));
  assert.match(html, /Relax Spa by 9/); assert.match(html, /SĪGIL \| SYSTEM/);
  assert.equal(isRelaxSpaAdminRequest('/internal/admin/mms/relax-spa'), true);
  assert.equal(isRelaxSpaAdminRequest('/internal/admin/mms/relax-spa-other'), false);
});
test('client actor headers never replace credential-bound session', async () => {
  let calls = 0;
  const e = { ...env, MMS_WORKER: { fetch: async () => { calls++; return Response.json({ ok: true }); } } };
  const r = await handleRelaxSpaAdmin(new Request(origin + '/v1/admin/mms/relax-spa/snapshot', { headers: { 'x-mms-spa-role': 'owner', 'x-mms-spa-actor': 'per' } }), e);
  assert.equal(r.status, 401); assert.equal(calls, 0);
});
test('partner can refer but cannot approve money or change actor', async () => {
  let sent;
  const e = { ...env, MMS_WORKER: { fetch: async request => { sent = request; return Response.json({ ok: true }); } } };
  for (const command of ['agreements', 'agreement-preview', 'drafts', 'quotes', 'referral-decision', 'services', 'receipts', 'refunds', 'settlements', 'payouts', 'expenses', 'close']) {
    assert.equal((await handleRelaxSpaAdmin(await req('mms_partner', command, {}), e)).status, 403);
  }
  assert.equal(sent, undefined);
  await handleRelaxSpaAdmin(await req('mms_partner', 'referrals', { therapist_id: 'x' }, { 'x-mms-spa-role': 'owner', 'x-mms-spa-actor': 'per' }), e);
  assert.equal(sent.headers.get('x-mms-spa-role'), 'mms_partner'); assert.equal(sent.headers.get('x-mms-spa-actor'), 'mms-partner:henna');
  assert.equal(sent.headers.has('cookie'), false);
});
test('same-origin POST is required; owner read and page have no mutation', async () => {
  let calls = 0;
  const e = { ...env, MMS_WORKER: { fetch: async () => { calls++; return Response.json({ ok: true }); } } };
  assert.equal((await handleRelaxSpaAdmin(await req('owner', 'receipts', {}, { origin: 'https://other.example' }), e)).status, 403);
  assert.equal((await handleRelaxSpaAdmin(await req('owner', 'receipts', {}, { origin: '' }), e)).status, 403);
  assert.equal(calls, 0);
  assert.equal((await handleRelaxSpaAdmin(await req('owner', 'snapshot'), e)).status, 200);
  assert.equal(calls, 1);
});

test('Owner forwards v2 lifecycle and preview commands without caller actor headers', async () => {
  let seen;
  const e = { ...env, MMS_WORKER: { fetch: async r => { seen = r; return Response.json({ ok: true }); } } };
  for (const command of ['agreement-preview', 'drafts', 'quotes', 'refunds', 'close']) {
    assert.equal((await handleRelaxSpaAdmin(await req('owner', command, { request_key: 'synthetic-key' }), e)).status, 200);
    assert.equal(new URL(seen.url).pathname.endsWith('/'+command), true);
    assert.equal(seen.headers.get('x-mms-spa-role'), 'owner');
  }
});
