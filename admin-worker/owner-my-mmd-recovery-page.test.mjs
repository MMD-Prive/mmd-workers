import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const { renderOwnerMyMmdRecoveryPage } = await import(process.env.RECOVERY_PAGE_MODULE || './src/owner-my-mmd-recovery-page.js');

const client = 'recFixture123456';
const fixture = (overrides = {}) => ({ ok: true, customer: { display_name: 'สมาชิกทดสอบ', canonical_client_id: client }, membership: { label: 'SVIP', lifecycle: 'active', active_through: '2028-09-19' }, recovery: { state: 'reconciled', terminal: true, pending_review_count: 0 }, points: { status: 'verified', value: 1250 }, ...overrides });
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function page(t, fetch, query = '', setup = () => {}) {
  const dom = new JSDOM(renderOwnerMyMmdRecoveryPage(), { url: 'https://www.mmdbkk.com/internal/admin/my-mmd/recovery' + query, runScripts: 'dangerously', beforeParse(w) { w.fetch = fetch; setup(w); } });
  t.after(() => dom.window.close());
  await tick();
  return dom.window;
}
function search(w, value) { w.document.querySelector('input').value = value; w.document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }
const content = w => w.document.querySelector('[data-result]').textContent;

test('historical candidate shows match evidence without automatically selecting a client', async t => {
  let calls = 0;
  const w = await page(t, async () => { calls++; return reply({ ok: false, error: 'recovery_client_selection_required', choices: [{ client_id: client, display_name: 'Current name', matched_value: '<img src=x onerror=alert(1)>' }] }, 409); }, '?q=Old');
  assert.match(content(w), /Current name/);
  assert.match(content(w), /พบจากชื่อ: <img/);
  assert.equal(w.document.querySelector('[data-result] img'), null);
  assert.equal(calls, 1);
  assert.equal(w.document.querySelector('[data-client]').getAttribute('data-client'), client);
});

test('search failures distinguish missing names from unavailable data', async t => {
  const w = await page(t, async () => reply({ ok: false, error: 'per_rename_not_resolved' }, 404), '?q=Missing');
  assert.match(content(w), /ไม่พบสมาชิกจากชื่อนี้/);
  w.fetch = async () => reply({ ok: false, error: 'identity_resolution_unavailable' }, 503);
  search(w, 'Again'); await tick();
  assert.match(content(w), /ไม่ได้หมายความว่าไม่พบลูกค้า/);
});

test('server query is escaped and inline client script parses', () => {
  const html = renderOwnerMyMmdRecoveryPage('\"></script><img src=x onerror=alert(1)>');
  assert.match(html, /&lt;\/script&gt;/);
  assert.equal((html.match(/<script>/g) || []).length, 1);
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});

test('canonical client read uses existing GET API and shows verified zero without losing it', async t => {
  const calls = [];
  const w = await page(t, async (url, options) => { calls.push([String(url), options]); return reply(fixture({ points: { status: 'verified', value: 0 } })); }, '?client_id=' + client);
  assert.match(calls[0][0], /recovery-diagnostic\?client_id=recFixture123456/);
  assert.equal(calls[0][1].credentials, 'include');
  assert.equal(calls[0][1].method, undefined);
  assert.equal(w.document.querySelectorAll('.rc-value')[2].textContent, '0');
  assert.equal(w.document.querySelector('[data-result]').getAttribute('aria-busy'), 'false');
  assert.equal(w.document.querySelector('input').value, client);
  assert.match(w.document.querySelector('.rc-person a').href, /customer-data\?client_id=recFixture123456/);
});

for (const state of ['checking', 'in_progress', 'blocked', 'unavailable']) {
  test('unconfirmed points remain pending in ' + state, async t => {
    const w = await page(t, async () => reply(fixture({ recovery: { state }, points: { status: 'verified', value: 0 } })), '?client_id=' + client);
    assert.equal(w.document.querySelectorAll('.rc-value')[2].textContent, 'รอยืนยัน');
    assert.doesNotMatch(content(w), /Guest/);
  });
}

test('missing identity explains next step and does not render invented balances', async t => {
  const w = await page(t, async () => reply({ ok: false, error: 'canonical_client_line_identity_missing', customer: fixture().customer }, 409), '?client_id=' + client);
  assert.match(content(w), /ยังไม่พบ LINE ที่ผูกกับระเบียนนี้/);
  assert.ok(w.document.querySelector('a[href*="customer-data"]'));
  assert.equal(w.document.querySelector('.rc-metric'), null);
});

test('name search routes ambiguity to explicit canonical selection and escapes customer text', async t => {
  const calls = [];
  const w = await page(t, async url => {
    calls.push(String(url));
    if (String(url).includes('client_id=')) return reply(fixture());
    return reply({ ok: false, error: 'ambiguous', choices: [{ client_id: client, display_name: '<img src=x onerror=alert(1)>' }] }, 409);
  }, '?q=fixture');
  assert.equal(w.document.querySelector('img'), null);
  w.document.querySelector('[data-client]').click(); await tick();
  assert.match(calls.at(-1), /client_id=recFixture123456/);
  assert.match(w.location.search, /client_id=recFixture123456/);
  assert.match(content(w), /สมาชิกทดสอบ/);
});

test('new search supersedes a slow earlier response', async t => {
  let first;
  const w = await page(t, (url) => String(url).includes('q=slow') ? new Promise(resolve => { first = resolve; }) : Promise.resolve(reply(fixture())), '?q=slow');
  search(w, client); await tick();
  first(reply(fixture({ customer: { display_name: 'STALE' } }))); await tick();
  assert.match(content(w), /สมาชิกทดสอบ/);
  assert.doesNotMatch(content(w), /STALE/);
});

test('request reference view only shows identity evidence, never fabricated membership', async t => {
  const w = await page(t, async url => { assert.match(String(url), /request_id=IMR-ABC123/); return reply({ ok: true, identity_recovery_request: { found: true, request_id: 'IMR-ABC123', status: 'review_required', claimed_name: 'ตัวอย่าง', submitted: { email: 'fixture@example.test' } } }); }, '?request_id=IMR-ABC123');
  assert.match(content(w), /IMR-ABC123/);
  assert.match(content(w), /fixture@example.test/);
  assert.equal(w.document.querySelector('.rc-metric'), null);
});

test('empty inbox differs from unavailable inbox and supports retry', async t => {
  let count = 0;
  const w = await page(t, async () => reply({ ok: true, recovery_inbox: { state: ++count === 1 ? 'unavailable' : 'available', items: [] } }));
  assert.match(content(w), /ยังยืนยันข้อมูลไม่ได้/);
  w.document.querySelector('[data-retry]').click(); await tick();
  assert.match(content(w), /ยังไม่มีคำขอ Recovery ที่อ่านได้/);
});

test('inbox preserves contact evidence and supports scoped request links', async t => {
  const w = await page(t, async () => reply({ ok: true, recovery_inbox: { state: 'available', items: [{ request_id: 'IMR-ABC123', claimed_name: 'ตัวอย่าง', status: 'review_required', submitted: { email: 'fixture@example.test', phone: '+66000000000' } }] } }));
  assert.match(content(w), /fixture@example.test · \+66000000000/);
  assert.match(w.document.querySelector('.rc-inbox a').href, /\?request_id=IMR-ABC123$/);
});

test('HTTP error cannot render an apparently successful payload', async t => {
  const w = await page(t, async () => reply(fixture(), 503), '?client_id=' + client);
  assert.match(content(w), /ยังยืนยันข้อมูลไม่ได้/);
  assert.equal(w.document.querySelector('.rc-metric'), null);
});

test('network and timeout errors terminate loading with a retry', async t => {
  const w = await page(t, async () => { throw Error('offline'); });
  assert.match(content(w), /เชื่อมต่อไม่สำเร็จ/);
  assert.equal(w.document.querySelector('[data-result]').getAttribute('aria-busy'), 'false');
  let deadline;
  const timeout = await page(t, (_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted')))), '', w => {
    w.setTimeout = fn => { deadline = fn; return 1; }; w.clearTimeout = () => {};
  });
  deadline(); await tick();
  assert.match(content(timeout), /ใช้เวลาอ่านข้อมูลนานเกินไป/);
  assert.ok(timeout.document.querySelector('[data-retry]'));
});

test('request references and record IDs typed in the search form use their own scope', async t => {
  const calls = [];
  const w = await page(t, async u => { calls.push(String(u)); return reply({ ok: true, recovery_inbox: { state: 'available', items: [] } }); });
  search(w, 'imr-abc123'); await tick(); assert.match(calls.at(-1), /request_id=IMR-ABC123/);
  search(w, client); await tick(); assert.match(calls.at(-1), /client_id=recFixture123456/);
  w.document.querySelector('[data-inbox]').click(); await tick(); assert.match(calls.at(-1), /inbox=1/);
  assert.equal(w.document.querySelector('input').value, '');
});
