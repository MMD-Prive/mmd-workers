const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const pause = () => new Promise(resolve => setTimeout(resolve, 25));

test('Webflow YOU links to canonical privacy controls inside the verified workspace only', () => {
  const dom = new JSDOM('<main id="mmd-model-home-v4"><div data-mm-workspace hidden><section id="mmd-model-self-service"></section></div></main>', { runScripts: 'outside-only', url: 'https://www.mmdbkk.com/sigil/model/dashboard?member_id=untrusted' });
  try {
    const source = fs.readFileSync(new URL('../webflow/sigil/model/customer-discovery-privacy-entry-v1.js', 'file://' + __filename), 'utf8');
    dom.window.fetch = () => { throw new Error('Navigation must never call identity or write APIs'); };
    dom.window.eval(source);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    dom.window.eval(source);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    const links = dom.window.document.querySelectorAll('[data-mm-model-privacy-entry]');
    assert.equal(links.length, 1);
    assert.equal(links[0].href, 'https://mmdbkk.com/sigil/model/dashboard/more#privacy-panel');
    assert.equal(links[0].closest('[data-mm-workspace]').hidden, true);
    assert.equal(links[0].getAttribute('data-i18n-text'), 'myModel.privacy.open');
    assert.equal(links[0].target, '', 'Keep the same browser session and tab');
  } finally { dom.window.close(); }
});

async function dashboard(t, { ready = true, denied = false, stale = false, hash = '#privacy-panel' } = {}) {
  const { modelDigitalDashboardHtml } = await import('./src/model-digital-dashboard.js');
  const html = modelDigitalDashboardHtml(new Request('https://mmdbkk.com/sigil/model/dashboard/more'));
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://mmdbkk.com/sigil/model/dashboard/more' + hash });
  t.after(() => dom.window.close());
  const calls = [], blocked = new Set();
  let revision = 'revision-0';
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
    if (url === '/v1/model/settings/customer-visibility') {
      if (denied) return reply({ ok: false, error: 'model_session_required' }, 401);
      if (init.method === 'POST') {
        if (stale) return reply({ ok: false, error: 'privacy_settings_changed' }, 409);
        const body = JSON.parse(init.body);
        assert.equal(body.revision, revision);
        if (body.action === 'block') blocked.add(body.session_id); else blocked.delete(body.session_id);
        revision = 'revision-' + calls.filter(call => call.init.method === 'POST').length;
      }
      return reply({ ok: true, ready, revision, blocked_count: blocked.size, blocked_session_ids: [...blocked] });
    }
    if (url === '/v1/model/history') return reply({ ok: true, items: [
      { id: 'session:owned-one', source: 'canonical_session', work_date: '2026-10-01' },
      { id: 'historical:import', source: 'approved_historical_import', work_date: '2026-10-02' },
      { id: 'session:owned-two', source: 'canonical_session', work_date: '2026-10-03' },
    ] });
    if (url === '/v1/model/profile') return reply({ ok: true, model: { display_name: 'QA Model', availability_status: 'available' } });
    if (url === '/v1/model/settings/gps-visibility') return reply({ ok: true, enabled: false });
    if (url === '/v1/model/session/current') return reply({ ok: false }, 404);
    throw new Error('Unexpected endpoint: ' + url);
  };
  for (const script of dom.window.document.querySelectorAll('script:not([src])')) dom.window.eval(script.textContent);
  await pause();
  return { dom, document: dom.window.document, calls };
}

test('privacy deep link opens; block and unblock use the selected owned job and fresh revision', async t => {
  const { dom, document: d, calls } = await dashboard(t);
  const panel = d.querySelector('#privacy-panel'), select = d.querySelector('#privacy-job');
  const block = d.querySelector('#privacy-block'), unblock = d.querySelector('#privacy-unblock');
  assert.equal(panel.open, true);
  assert.deepEqual([...select.options].map(option => option.value), ['owned-one', 'owned-two']);
  assert.equal(block.disabled, false);
  assert.equal(unblock.disabled, true);
  assert.equal(calls.some(call => call.init.method === 'POST'), false, 'Opening the panel is read only');
  select.value = 'owned-two';
  select.dispatchEvent(new dom.window.Event('change'));
  block.click();
  await pause();
  assert.equal(select.value, 'owned-two', 'Keep the selected customer reference after refreshing');
  assert.equal(block.disabled, true);
  assert.equal(unblock.disabled, false);
  unblock.click();
  await pause();
  const writes = calls.filter(call => call.init.method === 'POST');
  assert.deepEqual(writes.map(call => JSON.parse(call.init.body)), [
    { action: 'block', session_id: 'owned-two', revision: 'revision-0' },
    { action: 'unblock', session_id: 'owned-two', revision: 'revision-1' },
  ]);
  assert.ok(calls.every(call => call.init.credentials === 'include'));
  assert.equal(block.disabled, false);
  assert.equal(unblock.disabled, true);
});

test('privacy data is loaded only when the panel is opened', async t => {
  const { document: d, calls } = await dashboard(t, { hash: '' });
  assert.equal(calls.some(call => call.url.includes('customer-visibility')), false);
  d.querySelector('#privacy-panel').open = true;
  await pause();
  assert.equal(calls.filter(call => call.url.includes('customer-visibility')).length, 1);
});

test('unverified session or incomplete media closure keeps both write buttons disabled', async t => {
  for (const options of [{ denied: true }, { ready: false }]) {
    const { document: d, calls } = await dashboard(t, options);
    assert.equal(d.querySelector('#privacy-block').disabled, true);
    assert.equal(d.querySelector('#privacy-unblock').disabled, true);
    d.querySelector('#privacy-block').click();
    assert.equal(calls.some(call => call.init.method === 'POST'), false);
  }
});

test('stale server revision shows failure and disables further writes until settings are reloaded', async t => {
  const { document: d, calls } = await dashboard(t, { stale: true });
  d.querySelector('#privacy-block').click();
  await pause();
  assert.match(d.querySelector('#privacy-status').textContent, /ยังบันทึกไม่ได้/);
  assert.equal(d.querySelector('#privacy-block').disabled, true);
  assert.equal(d.querySelector('#privacy-unblock').disabled, true);
  assert.equal(calls.filter(call => call.init.method === 'POST').length, 1);
});
