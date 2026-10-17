import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { memberPage } from '../src/member-page.mjs';

async function settle() { for (let i=0; i<12; i++) await new Promise(resolve => setImmediate(resolve)); }

function browserFixture() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, disabled: false, style: {}, value: '', checked: false, setAttribute() {} });
    return nodes.get(id);
  };
  const calls = [];
  let loggedOut = false, registered = false, failSave = false;
  const profile = { member_id: 'mmsmem_'+'a'.repeat(32), display_name: '<script>untrusted</script>', phone: '', email: '', created_at: '2026-10-17T00:00:00Z', marketing_consent: false };
  const context = vm.createContext({
    document: { getElementById: node }, location: { origin: 'https://www.mmdbkk.com', search: '?stage=developing' },
    URLSearchParams, URL, AbortSignal, Date,
    liff: {
      init: async options => { assert.equal(options.liffId, '2011388355-vspjKK62'); },
      isLoggedIn: () => !loggedOut, getIDToken: () => null, getAccessToken: () => 'raw-line-access-token',
      logout: () => { loggedOut = true; },
    },
    fetch: async (url, init) => {
      const action = new URL(url, 'https://www.mmdbkk.com').pathname.split('/').at(-1);
      calls.push({ action, init });
      let data;
      if (action === 'config') data = { liff_id: '2011388355-vspjKK62', notice_version: 'mms-account-2026-10-17' };
      else if (action === 'me') return Response.json({ ok: false }, { status: 401 });
      else if (action === 'line') data = { registered: false, line_display_name: 'Ton' };
      else if (action === 'register' || action === 'profile') {
        if (failSave) return Response.json({ ok: false, error: { code: 'MMS_SERVICE_UNAVAILABLE' } }, { status: 503 });
        registered = true; data = { registered, line_display_name: 'Ton', profile };
      } else if (action === 'logout') return Response.json({ ok: true });
      return Response.json({ ok: true, data });
    },
  });
  const script = memberPage().match(/<script>\(([\s\S]*?)\)\(\);<\/script>/)[1];
  new vm.Script('('+script+')();').runInContext(context);
  return { node, calls, setFail: value => { failSave = value; } };
}

test('mobile client verifies raw LINE tokens, enrolls explicitly, renders untrusted names as text and logs out', async () => {
  const { node, calls } = browserFixture();
  await settle();
  assert.deepEqual(JSON.parse(calls.find(c => c.action === 'line').init.body), { access_token: 'raw-line-access-token' });
  assert.equal(node('editor').hidden, false);
  assert.equal(node('name').value, 'Ton');
  assert.equal(node('marketing').checked, false);
  node('consent').checked = true;
  await node('form').onsubmit({ preventDefault() {} });
  const payload = JSON.parse(calls.find(c => c.action === 'register').init.body);
  assert.equal(payload.account_consent, true);
  assert.equal(payload.marketing_consent, false);
  assert.equal(node('account').hidden, false);
  assert.equal(node('cardname').textContent, '<script>untrusted</script>');
  await node('logout').onclick();
  assert.equal(node('welcome').hidden, false);
  assert.equal(node('account').hidden, true);
});

test('failed enrollment stays on the form and never displays a successful member card', async () => {
  const { node, setFail } = browserFixture(); await settle();
  setFail(true); node('consent').checked = true;
  await node('form').onsubmit({ preventDefault() {} });
  assert.equal(node('editor').hidden, false);
  assert.equal(node('account').hidden, true);
  assert.equal(node('error').hidden, false);
  assert.equal(node('save').disabled, false);
});
