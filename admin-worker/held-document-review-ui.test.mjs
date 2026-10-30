import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { HELD_DOCUMENT_CLIENT } from './src/held-document-review-ui.js';
const { handleMoneyControlWorkerHome } = await import(process.env.HELD_DOCUMENT_PAGE_MODULE || './src/money-control-worker-home.js');
const require = createRequire(import.meta.url);
const { JSDOM } = require(process.env.MMD_UI_TEST_MODULES ? `${process.env.MMD_UI_TEST_MODULES}/jsdom` : 'jsdom');

const item = { reference: 'line_synthetic_fixture', customer: 'ลูกค้าตัวอย่าง 9 เมย 68', identity_state: 'exact_line_client_per_rename_v1', reason: 'not_extracted', received_at: '2026-10-30T14:00:00.000Z', image_url: '/v1/admin/payments/held-images/image?id=synthetic_opaque_reference' };
async function boot(fetcher) {
  const response = handleMoneyControlWorkerHome(new Request('https://mmdbkk.com/internal/admin/payments?view=held-images'));
  const calls = [];
  const dom = new JSDOM(await response.text(), { url: 'https://mmdbkk.com/internal/admin/payments?view=held-images', runScripts: 'dangerously', beforeParse(window) {
    window.fetch = async (url, options) => { calls.push({ url, options }); return fetcher(url, options, calls.length); };
  } });
  return { dom, document: dom.window.document, calls };
}
async function settled() { for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve)); }
const ok = data => ({ ok: true, json: async () => ({ ok: true, read_only: true, ...data }) });

test('delivered browser script does not depend on Worker-only bundle helpers', async () => {
  assert.equal(typeof HELD_DOCUMENT_CLIENT, 'string');
  assert.match(HELD_DOCUMENT_CLIENT, /^function heldDocumentClient\(copy\)/);
  const html = await handleMoneyControlWorkerHome(new Request('https://mmdbkk.com/internal/admin/payments?view=held-images')).text();
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotMatch(scripts[0], /\b__name\s*\(/);
});

test('held UI loads via GET only, shows readable reason/customer/time and opens private image', async () => {
  const { dom, document, calls } = await boot(() => ok({ items: [item], next_cursor: null }));
  try {
    await settled();
    assert.match(document.querySelector('#held-list').textContent, /ลูกค้าตัวอย่าง|ยังไม่ได้อ่านข้อมูล|รับภาพ/);
    assert.equal(calls.length, 1); assert.equal(calls[0].options.method, undefined); assert.equal(calls[0].options.cache, 'no-store');
    document.querySelector('#held-list button').click();
    assert.equal(document.querySelector('#held-viewer').hidden, false);
    assert.equal(document.querySelector('#held-image img').getAttribute('src'), item.image_url);
    document.querySelector('#held-image img').dispatchEvent(new dom.window.Event('error'));
    assert.match(document.querySelector('#held-image-status').textContent, /เปิดภาพไม่ได้/);
    document.querySelector('#held-close').click(); assert.equal(document.querySelector('#held-image').children.length, 0);
    assert.equal(document.querySelector('[type=file],#confirm-decision,#extract-slip,#reject-proof'), null);
    assert.equal(document.querySelectorAll('script').length, 1);
  } finally { dom.window.close(); }
});
test('empty, loading and backend error states are explicit without implying zero balance/payment', async () => {
  let resolveFetch;
  const { dom, document } = await boot(() => new Promise(resolve => { resolveFetch = resolve; }));
  try {
    assert.match(document.querySelector('#held-status').textContent, /กำลังอ่าน/);
    resolveFetch(ok({ items: [], next_cursor: null })); await settled();
    assert.match(document.querySelector('#held-status').textContent, /ยังไม่พบภาพ/);
    dom.window.fetch = async () => { throw new Error('private backend detail'); };
    document.querySelector('#held-refresh').click(); await settled();
    assert.match(document.querySelector('#held-status').textContent, /อ่านรายการไม่ได้/); assert.doesNotMatch(document.body.textContent, /private backend detail/);
  } finally { dom.window.close(); }
});
test('pagination bounded, deduplicated and escaped; foreign image URL never loads', async () => {
  const injection = { ...item, reference: 'line_injection_fixture', customer: '<img src=x onerror=alert(1)>', image_url: 'https://evil.example/private' };
  const { dom, document, calls } = await boot((url, options, n) => ok(n === 1 ? { items: [item], next_cursor: 'opaque_cursor' } : { items: [item, injection], next_cursor: null }));
  try {
    await settled(); assert.equal(document.querySelector('#held-more').hidden, false);
    document.querySelector('#held-more').click(); await settled();
    assert.equal(document.querySelectorAll('.held-row').length, 2); assert.match(calls[1].url, /cursor=opaque_cursor/);
    assert.equal(document.querySelectorAll('.held-row img').length, 0); assert.match(document.querySelector('#held-list').textContent, /<img src=x/);
    assert.equal(document.querySelectorAll('#held-list button').length, 1); assert.equal(document.querySelector('#held-more').hidden, true);
  } finally { dom.window.close(); }
});
