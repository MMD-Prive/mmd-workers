import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response as EdgeResponse } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { NOTICE_VERSION } from '../src/runtime.mjs';

test('real Workers RPC + SQLite runtime completes customer enrollment and session revocation', async t => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'],
  });
  const outbound = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-10-17', compatibilityFlags: ['nodejs_compat'],
    durableObjects: { MMS_MEMBER_ACCOUNTS: { className: 'MmsMemberAccount', useSQLite: true } },
    outboundService: async request => {
      const url = new URL(request.url);
      outbound.push(url.toString());
      assert.equal(url.origin, 'https://api.line.me');
      assert.equal(url.pathname, '/oauth2/v2.1/verify');
      return EdgeResponse.json({ sub: 'U' + 'a'.repeat(32), name: 'Edge test', aud: '2011388357',
        iss: 'https://access.line.me', exp: Math.floor(Date.now()/1000)+600, iat: Math.floor(Date.now()/1000) });
    },
  }));
  t.after(() => mf.dispose());
  const base = 'https://www.mmdbkk.com/api/mms/app/membership/';
  const post = (action, body, cookie) => mf.dispatchFetch(base+action, { method: 'POST',
    headers: { origin: 'https://www.mmdbkk.com', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body) });
  const login = await post('line', { id_token: 'test-id-token-1234567890' });
  assert.equal(login.status, 200, JSON.stringify({ response: await login.clone().text(), outbound }));
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Lax/);
  const enrolled = await post('register', { display_name: 'Edge test', account_consent: true, notice_version: NOTICE_VERSION }, cookie);
  assert.equal(enrolled.status, 200, await enrolled.clone().text());
  const memberId = (await enrolled.json()).data.profile.member_id;
  const me = await mf.dispatchFetch(base+'me', { headers: { cookie } });
  assert.equal((await me.json()).data.profile.member_id, memberId);
  assert.equal((await mf.dispatchFetch(base+'me')).status, 401);
  assert.equal((await post('logout', {}, cookie)).status, 200);
  assert.equal((await mf.dispatchFetch(base+'me', { headers: { cookie } })).status, 401);
});
