import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { MemberAccountStore } from '../src/account-store.mjs';
import { handleMemberRequest, NOTICE_VERSION, STAGES } from '../src/runtime.mjs';

function storage(db) {
  return {
    sql: { exec(query, ...args) {
      const stmt = db.prepare(query);
      const rows = stmt.columns().length ? stmt.all(...args) : (stmt.run(...args), []);
      return { toArray: () => rows };
    } },
    transactionSync(fn) {
      db.exec('BEGIN');
      try { const result = fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
function environment(t) {
  const stores = new Map();
  t.after(() => { for (const { db } of stores.values()) db.close(); });
  return { stores, MMS_MEMBER_ACCOUNTS: { getByName(key) {
    if (!stores.has(key)) { const db = new DatabaseSync(':memory:'); stores.set(key, { db, store: new MemberAccountStore(storage(db)) }); }
    return stores.get(key).store;
  } } };
}
const subjectA = 'U' + 'a'.repeat(32);
function mockLine(t, { subject = subjectA, channel = STAGES.published.channel, name = 'คุณต้น', invalid = false, failing = false } = {}) {
  return t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (failing) throw new Error('network');
    if (invalid) return Response.json({ error: 'invalid' }, { status: 400 });
    if (String(url).startsWith('https://api.line.me/oauth2/v2.1/verify?')) return Response.json({ client_id: channel, expires_in: 600 });
    if (String(url) === 'https://api.line.me/v2/profile') return Response.json({ userId: subject, displayName: name });
    assert.equal(String(url), 'https://api.line.me/oauth2/v2.1/verify');
    assert.equal(init.method, 'POST');
    return Response.json({ iss: 'https://access.line.me', aud: channel, sub: subject, name, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+600 });
  });
}
function req(action, method = 'GET', body, cookie, stage = 'published', extraHeaders = {}) {
  return new Request(`https://www.mmdbkk.com/api/mms/app/membership/${action}?stage=${stage}`, {
    method, headers: { origin: 'https://www.mmdbkk.com', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function login(env, stage = 'published', token = { id_token: 'test-token-1234567890' }) {
  const response = await handleMemberRequest(req('line', 'POST', token, '', stage), env);
  assert.equal(response.status, 200, await response.clone().text());
  return { cookie: response.headers.get('set-cookie').split(';')[0], data: (await response.json()).data };
}
const registration = { display_name: 'คุณต้น', phone: '', email: '', language: 'th', marketing_consent: false, account_consent: true, notice_version: NOTICE_VERSION };

test('enrollment, repeat enrollment, editing, restart persistence and logout use one account', async t => {
  const env = environment(t); mockLine(t);
  const signed = await login(env);
  assert.equal(signed.data.registered, false);
  const cookie = signed.cookie;
  let response = await handleMemberRequest(req('register', 'POST', registration, cookie), env);
  assert.equal(response.status, 200);
  const first = (await response.json()).data;
  assert.match(first.profile.member_id, /^mmsmem_[a-f0-9]{32}$/);
  assert.equal(first.profile.marketing_consent, false);
  response = await handleMemberRequest(req('register', 'POST', { ...registration, display_name: 'duplicate' }, cookie), env);
  assert.deepEqual((await response.json()).data, first);
  const changed = { display_name: '<script>alert(1)</script>', email: 'ton@example.test', phone: '+66 812345678', language: 'en', marketing_consent: true };
  response = await handleMemberRequest(req('profile', 'PUT', changed, cookie), env);
  assert.equal(response.status, 200);
  const next = (await response.json()).data;
  assert.equal(next.profile.email, changed.email);
  assert.equal(next.profile.phone_verified, false);
  assert.equal(next.profile.email_verified, false);
  assert.equal(next.profile.member_id, first.profile.member_id);
  // Reconstruct the store from persisted SQLite, with no cached profile/session.
  for (const item of env.stores.values()) item.store = new MemberAccountStore(storage(item.db));
  response = await handleMemberRequest(req('me', 'GET', null, cookie), env);
  assert.deepEqual((await response.json()).data, next);
  response = await handleMemberRequest(req('logout', 'POST', {}, cookie), env);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await handleMemberRequest(req('me', 'GET', null, cookie), env)).status, 401);
  assert.equal((await handleMemberRequest(req('logout', 'POST', {}, cookie), env)).status, 200);
});

test('rejects forged identities and foreign channels; accepts server-verified access tokens', async t => {
  const env = environment(t); const mocked = mockLine(t);
  assert.equal((await handleMemberRequest(req('line', 'POST', { userId: subjectA }), env)).status, 400);
  assert.equal((await handleMemberRequest(req('line', 'POST', { id_token: 'a'.repeat(20), displayName: 'fake' }), env)).status, 400);
  assert.equal(env.stores.size, 0);
  mocked.mock.restore();
  const foreign = mockLine(t, { channel: '2011425652' });
  assert.equal((await handleMemberRequest(req('line', 'POST', { access_token: 'a'.repeat(20) }), env)).status, 401);
  assert.equal(env.stores.size, 0);
  foreign.mock.restore(); mockLine(t);
  const result = await login(env, 'published', { access_token: 'a'.repeat(20) });
  assert.equal(result.data.line_display_name, 'คุณต้น');
  const raw = Array.from(env.stores.values())[0].db.prepare('SELECT * FROM sessions').all();
  assert.doesNotMatch(JSON.stringify(raw), /test-token|access_token|Uaaaaaaaa/);
});

test('MMD and therapist cookies cannot authenticate MMS customer reads or writes', async t => {
  const env = environment(t);
  for (const cookie of ['__Host-mmd_liff_session=old', '__Secure-mms_therapist_session=old', '']) {
    assert.equal((await handleMemberRequest(req('me', 'GET', null, cookie), env)).status, 401);
    assert.equal((await handleMemberRequest(req('register', 'POST', registration, cookie), env)).status, 401);
  }
  assert.equal(env.stores.size, 0);
});

test('MINI App stages remain isolated even when a development session cookie is renamed', async t => {
  const env = environment(t); const mock = mockLine(t, { channel: STAGES.developing.channel });
  const dev = await login(env, 'developing');
  assert.equal((await handleMemberRequest(req('register', 'POST', registration, dev.cookie, 'developing'), env)).status, 200);
  const copied = dev.cookie.replace('customer_developing=', 'customer_published=');
  assert.equal((await handleMemberRequest(req('me', 'GET', null, copied), env)).status, 401);
  mock.mock.restore(); mockLine(t);
  const pub = await login(env);
  assert.equal(pub.data.registered, false);
});

test('different verified LINE accounts cannot overwrite another membership', async t => {
  const env = environment(t); const firstMock = mockLine(t);
  const a = await login(env);
  const first = await (await handleMemberRequest(req('register', 'POST', registration, a.cookie), env)).json();
  firstMock.mock.restore(); mockLine(t, { subject: 'U'+'b'.repeat(32), name: 'B' });
  const b = await login(env);
  assert.equal(b.data.registered, false);
  const change = await handleMemberRequest(req('profile', 'PUT', { ...registration, member_id: first.data.profile.member_id }, b.cookie), env);
  assert.equal(change.status, 400);
  const unchanged = await (await handleMemberRequest(req('me', 'GET', null, a.cookie), env)).json();
  assert.equal(unchanged.data.profile.member_id, first.data.profile.member_id);
});

test('explicit account acknowledgment and optional marketing choice are enforced', async t => {
  const env = environment(t); mockLine(t); const a = await login(env);
  for (const update of [{ account_consent: false }, { notice_version: 'old' }, { display_name: '' }, { marketing_consent: 'yes' }, { phone: 'invalid' }, { email: 'invalid' }]) {
    assert.equal((await handleMemberRequest(req('register', 'POST', { ...registration, ...update }, a.cookie), env)).status, 400);
  }
  assert.equal((await handleMemberRequest(req('register', 'POST', registration, a.cookie), env)).status, 200);
});

test('same-origin writes, method boundaries and bounded JSON bodies', async t => {
  const env = environment(t);
  for (const origin of ['', 'https://evil.test', 'https://mmdbkk.com']) {
    assert.equal((await handleMemberRequest(req('line', 'POST', { id_token: 'a'.repeat(20) }, '', 'published', { origin }), env)).status, 403);
  }
  assert.equal((await handleMemberRequest(req('line'), env)).status, 405);
  assert.equal((await handleMemberRequest(req('config?line_user_id=bad'), env)).status, 400);
  assert.equal((await handleMemberRequest(req('config', 'GET', null, '', '__proto__'), env)).status, 400);
  assert.equal((await handleMemberRequest(req('line', 'POST', { id_token: 'a'.repeat(17000) }), env)).status, 413);
  assert.equal((await handleMemberRequest(req('line', 'POST', { id_token: 'a'.repeat(20) }, '', 'published', { 'content-type': 'text/plain' }), env)).status, 415);
  assert.equal((await handleMemberRequest(req('me'), {})).status, 503);
});

test('session expiry and bounded device sessions survive store reconstruction', t => {
  const env = environment(t); const store = env.MMS_MEMBER_ACCOUNTS.getByName('expiry');
  store.openSession('old', 'A', 0, 100);
  assert.equal(store.view('old', 100), null);
  for (let i=0;i<10;i++) assert.ok(store.openSession('session'+i, 'A', 1000, 5000));
  assert.equal(store.view('session0', 1001), null);
  assert.ok(store.view('session9', 1001));
  assert.equal(env.stores.get('expiry').db.prepare('SELECT count(*) AS n FROM sessions').get().n, 8);
});

test('LINE failures never issue cookies or create identities', async t => {
  const env = environment(t); mockLine(t, { failing: true });
  const response = await handleMemberRequest(req('line', 'POST', { id_token: 'a'.repeat(20) }), env);
  assert.equal(response.status, 503); assert.equal(response.headers.has('set-cookie'), false); assert.equal(env.stores.size, 0);
});

test('LINE redirects are rejected without following credentials to another origin', async t => {
  const env = environment(t);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'https://example.invalid' } });
  });
  const response = await handleMemberRequest(req('line', 'POST', { id_token: 'a'.repeat(20) }), env);
  assert.equal(response.status, 503); assert.equal(response.headers.has('set-cookie'), false); assert.equal(env.stores.size, 0);
});

test('anonymous shell, privacy and stage config are available without customer data', async () => {
  const response = await handleMemberRequest(new Request('https://www.mmdbkk.com/male-massage/member'));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /เข้าสู่ระบบด้วย LINE/);
  assert.match(html, /\.textContent = p\.display_name/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|getDecodedIDToken/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await handleMemberRequest(new Request('https://www.mmdbkk.com/male-massage/member/privacy'))).status, 200);
  assert.equal((await handleMemberRequest(req('config'))).status, 200);
});
