import test from 'node:test';
import assert from 'node:assert/strict';

import { hasValidAdminBrowserSession } from './src/admin-browser-session.js';
import { createCredentialBoundAdminSession } from './src/credential-bound-admin-session.js';
import { handleMmsAdminRequest } from './src/mms-admin-runtime.js';

const env = {
  ADMIN_LOGIN_CREDENTIAL: 'owner-code',
  ADMIN_SESSION_SECRET: 'session-secret',
  ADMIN_WORKER_BUILD_SHA: 'test-build-sha',
};

async function signedCookie({ origin = 'https://mmdbkk.com', expOffset = 60_000 } = {}) {
  if (expOffset <= 0) {
    const expired = await createCredentialBoundAdminSession(
      new Request(`${origin}/internal/admin/login/session`),
      { id: 'boss-per' },
      env,
    );
    return `mmd_admin_gate_v1=${expired.replace(/.$/, expired.endsWith('a') ? 'b' : 'a')}`;
  }
  const token = await createCredentialBoundAdminSession(
    new Request(`${origin}/internal/admin/login/session`),
    { id: 'boss-per' },
    env,
  );
  return `mmd_admin_gate_v1=${token}`;
}

test('valid credential-bound browser cookie remains accepted on MMS admin page', async () => {
  const cookie = await signedCookie();
  const request = new Request('https://mmdbkk.com/internal/admin/mms', { headers: { cookie } });
  assert.equal(await hasValidAdminBrowserSession(request, env), true);

  const response = await handleMmsAdminRequest(request, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-mmd-admin-build'), 'test-build-sha');
  assert.equal(response.headers.get('x-mmd-admin-surface'), 'mms-admin');
  const body = await response.text();
  assert.match(body, /MMS · Internal Operations/);
  assert.match(body, /<meta name="mmd-admin-build" content="test-build-sha">/);
  assert.match(body, /data-mmd-admin-build="test-build-sha"/);
});

test('HEAD exposes the MMS production build marker without a body', async () => {
  const cookie = await signedCookie();
  const request = new Request('https://mmdbkk.com/internal/admin/mms', { method: 'HEAD', headers: { cookie } });
  const response = await handleMmsAdminRequest(request, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-mmd-admin-build'), 'test-build-sha');
  assert.equal(await response.text(), '');
});

test('valid browser cookie also keeps MMS admin API in-session instead of returning 401', async () => {
  const cookie = await signedCookie();
  const request = new Request('https://mmdbkk.com/v1/admin/mms/system-check', { headers: { cookie } });
  const response = await handleMmsAdminRequest(request, env);
  assert.notEqual(response.status, 401);
  assert.equal(response.status, 503);
});

test('production admin session is shared only across apex and www aliases', async () => {
  const cookie = await signedCookie({ origin: 'https://mmdbkk.com' });
  const request = new Request('https://www.mmdbkk.com/internal/admin/mms', { headers: { cookie } });
  assert.equal(await hasValidAdminBrowserSession(request, env), true);

  const outsideProduction = new Request('https://mmdprive.webflow.io/internal/admin/mms', { headers: { cookie } });
  assert.equal(await hasValidAdminBrowserSession(outsideProduction, env), false);
});

test('expired or tampered browser session remains rejected', async () => {
  const expired = await signedCookie({ expOffset: -1 });
  assert.equal(
    await hasValidAdminBrowserSession(new Request('https://mmdbkk.com/internal/admin/mms', { headers: { cookie: expired } }), env),
    false
  );

  const valid = await signedCookie();
  const tampered = valid.replace(/.$/, valid.endsWith('a') ? 'b' : 'a');
  assert.equal(
    await hasValidAdminBrowserSession(new Request('https://mmdbkk.com/internal/admin/mms', { headers: { cookie: tampered } }), env),
    false
  );
});
