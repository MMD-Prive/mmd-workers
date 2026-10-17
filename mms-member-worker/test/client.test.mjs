import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserFixture, settle } from './support/client-fixture.mjs';
import { memberPage } from '../src/member-page.mjs';

test('mobile client verifies raw LINE tokens, enrolls explicitly, renders untrusted names as text and logs out', async () => {
  const { node, calls } = browserFixture(memberPage());
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
  const { node, setFail } = browserFixture(memberPage()); await settle();
  setFail(true); node('consent').checked = true;
  await node('form').onsubmit({ preventDefault() {} });
  assert.equal(node('editor').hidden, false);
  assert.equal(node('account').hidden, true);
  assert.equal(node('error').hidden, false);
  assert.equal(node('save').disabled, false);
});
