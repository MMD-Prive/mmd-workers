import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('./my-mmd-operations.js', import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
function page(response, markup = '<section id="my-mmd-management"></section>') {
  const dom = new JSDOM(markup, { url: 'https://www.mmdbkk.com/internal/admin/dashboard', runScripts: 'outside-only' });
  const calls = [];
  dom.window.fetch = async (url, options) => { calls.push({ url, options }); return response; };
  dom.window.eval(source);
  return { dom, calls };
}
test('member queue reads through the routed Dashboard URL and renders partial coverage without writes', async () => {
  const { dom, calls } = page({ status: 200, ok: true, json: async () => ({ ok: true, checked_at: '2026-10-29T00:00:00Z', state: 'partial', groups: [{ id: 'identity', title: 'ข้อมูลสมาชิก', state: 'resolved', count: 1, href: '/internal/admin/my-mmd/completeness', items: [{ title: '<script>fixture</script>', href: 'javascript:alert(1)' }] }, { id: 'renewals', title: 'ต่ออายุค้าง', state: 'unavailable', count: null, items: [] }] }) });
  try {
    await settle();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/v1/admin/dashboard?view=my-mmd-operations');
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.method || 'GET', 'GET');
    const root = dom.window.document.querySelector('#my-mmd-live-operations');
    assert.match(root.textContent, /บางคิวยังตรวจไม่ได้/);
    assert.match(root.textContent, /ต่ออายุค้าง · ยังตรวจไม่ได้/);
    assert.equal(root.querySelector('script'), null);
    assert.equal(root.querySelector('a[href^="javascript:"]'), null);
  } finally { dom.window.close(); }
});
test('Owner denial and HTML 404 remain explicit failures without misleading empty success', async () => {
  for (const status of [403, 404]) {
    const { dom } = page({ status, ok: false, json: async () => { throw new SyntaxError('HTML instead of JSON'); } });
    try {
      await settle();
      const root = dom.window.document.querySelector('#my-mmd-live-operations');
      assert.match(root.textContent, status === 403 ? /เฉพาะบัญชี Owner/ : /ยังโหลดคิวไม่ได้/);
      assert.equal(root.querySelectorAll('details').length, 0);
      assert.equal(root.querySelector('button').disabled, false);
    } finally { dom.window.close(); }
  }
});
test('MMS without the Dashboard host never reads or installs the member queue', async () => {
  const { dom, calls } = page({}, '<main id="mmsAdmin">MMS</main>');
  try {
    await settle();
    assert.equal(calls.length, 0);
    assert.equal(dom.window.document.querySelector('#my-mmd-live-operations'), null);
  } finally { dom.window.close(); }
});
