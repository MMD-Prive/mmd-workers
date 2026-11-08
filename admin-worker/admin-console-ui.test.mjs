import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { renderAdminConsolePage } from './src/admin-console-page.js';
import { buildJobsPage } from './src/admin-dashboard-jobs.js';

globalThis.crypto ??= webcrypto;
const NOW = new Date('2026-11-08T18:30:00.000Z'); // 9 November in Bangkok.
const BASE = 'https://www.mmdbkk.com/internal/admin/console';
const CLIENT = 'recAAAAAAAAAAAAAA';
const records = Array.from({ length: 45 }, (_, index) => ({
  id: `recFixture${String(index).padStart(8, '0')}`,
  fields: {
    session_id: `SESSION-${index + 1}`, job_id: `JOB-${index + 1}`,
    model_name: `นายแบบตัวอย่าง ${index + 1}`, client_name: `ลูกค้าตัวอย่าง ${index + 1}`,
    Client: [CLIENT], job_date: '2026-11-09', start_time: '19:00', status: 'confirmed',
  },
}));
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ').trim();
function payload(path, overrides = {}) {
  const url = new URL(path, BASE);
  const date = url.searchParams.get('date') || '';
  const query = normalize(url.searchParams.get('q'));
  const scope = { sessionId: url.searchParams.get('session_id') || '', jobId: url.searchParams.get('job_id') || '', clientId: url.searchParams.get('client_id') || '' };
  const page = buildJobsPage(records, { now: NOW, page: Number(url.searchParams.get('page') || 1), pageSize: 20, jobDate: date, query, ...scope });
  return {
    ok: true, source: 'admin-worker', layer: 'core', view: 'jobs', generated_at: NOW.toISOString(),
    filters: { q: query || null, job_date: date || null, session_id: scope.sessionId || null, job_id: scope.jobId || null, client_id: scope.clientId || null },
    counts: page.counts, pagination: page.pagination, jobs: page.items, ...overrides,
  };
}
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
async function screen(t, { url = BASE, fetcher, beforeBoot } = {}) {
  const html = await renderAdminConsolePage(new Request(url)).text();
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const calls = [];
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [NOW.toISOString()])); } static now() { return NOW.getTime(); } }
  dom.window.Date = FixedDate;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.fetch = async (path, options) => {
    calls.push({ path, options });
    return fetcher ? fetcher(path, options, calls.length) : Response.json(payload(path));
  };
  beforeBoot?.(dom.window);
  dom.window.eval(dom.window.document.querySelector('script[data-admin-console-client]').textContent);
  t.after(() => dom.window.close());
  await settle();
  return { dom, document: dom.window.document, calls };
}
function submit(dom) {
  dom.window.document.querySelector('#ac-filters').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
}

test('initial page uses Bangkok today and real global counts with read-only credentials', async t => {
  const { document, calls } = await screen(t);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].path, BASE);
  assert.equal(url.pathname, '/v1/admin/dashboard');
  assert.equal(url.searchParams.get('view'), 'jobs');
  assert.equal(url.searchParams.get('date'), '2026-11-09');
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.method || 'GET', 'GET');
  assert.equal(document.querySelector('[data-count=today]').textContent, '45');
  assert.equal(document.querySelectorAll('#ac-jobs > li').length, 20);
  assert.equal(document.querySelector('#ac-error').hidden, true);
  assert.equal(document.querySelector('#ac-board').getAttribute('aria-busy'), 'false');
  assert.equal(document.querySelector('#ac-next').disabled, false);
});

test('search crosses pagination and preserves canonical customer scope', async t => {
  const { dom, document, calls } = await screen(t, { url: `${BASE}?date=all&client_id=${CLIENT}&page=2` });
  assert.equal(new URL(calls[0].path, BASE).searchParams.get('page'), '2');
  document.querySelector('#ac-query').value = 'ลูกค้าตัวอย่าง 45';
  submit(dom); await settle();
  const url = new URL(calls.at(-1).path, BASE);
  assert.equal(url.searchParams.get('q'), 'ลูกค้าตัวอย่าง 45');
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.searchParams.get('client_id'), CLIENT);
  assert.equal(url.searchParams.has('date'), false);
  assert.equal(document.querySelectorAll('#ac-jobs > li').length, 1);
  assert.match(document.querySelector('#ac-jobs').textContent, /ลูกค้าตัวอย่าง 45/);
  assert.equal(new URL(dom.window.location.href).searchParams.get('client_id'), CLIENT);
  assert.equal(document.querySelector('[data-count=all]').textContent, '45');
});

test('pagination retains selected filters and uses server page bounds', async t => {
  const { document, calls } = await screen(t, { url: `${BASE}?date=all&q=ตัวอย่าง&client_id=${CLIENT}` });
  document.querySelector('#ac-next').click(); await settle();
  const next = new URL(calls.at(-1).path, BASE);
  assert.equal(next.searchParams.get('page'), '2');
  assert.equal(next.searchParams.get('q'), 'ตัวอย่าง');
  assert.equal(next.searchParams.get('client_id'), CLIENT);
  assert.equal(document.querySelector('#ac-previous').disabled, false);
  document.querySelector('#ac-next').click(); await settle();
  assert.equal(document.querySelectorAll('#ac-jobs > li').length, 5);
  assert.equal(document.querySelector('#ac-next').disabled, true);
  assert.match(document.querySelector('#ac-page-label').textContent, /3/);
});

test('unavailable data clears previous rows/counts and retry restores a real result', async t => {
  let failing = false;
  const { document, calls } = await screen(t, { fetcher: path => failing ? Response.json({ ok: false, error: 'jobs_unavailable' }, { status: 503 }) : Response.json(payload(path)) });
  failing = true; document.querySelector('#ac-refresh').click(); await settle();
  assert.equal(document.querySelector('#ac-error').hidden, false);
  assert.equal(document.querySelector('#ac-empty').hidden, true);
  assert.equal(document.querySelectorAll('#ac-jobs > li').length, 0);
  assert.equal(document.querySelector('[data-count=all]').textContent, '—');
  assert.equal(document.querySelector('#ac-pagination').hidden, true);
  failing = false; document.querySelector('#ac-retry').click(); await settle();
  assert.equal(calls.length, 3);
  assert.equal(document.querySelector('#ac-error').hidden, true);
  assert.equal(document.querySelectorAll('#ac-jobs > li').length, 20);
});

test('expired sessions offer an exact login return without stale customer rows', async t => {
  const { document } = await screen(t, { url: `${BASE}?date=all&job_id=JOB-45&q=45`, fetcher: () => Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) });
  assert.equal(document.querySelector('#ac-sign-in').hidden, false);
  const login = new URL(document.querySelector('#ac-sign-in').href);
  assert.equal(login.origin, new URL(BASE).origin);
  assert.equal(login.pathname, '/internal/admin/login');
  const next = new URL(login.searchParams.get('next'), BASE);
  assert.equal(next.pathname, '/internal/admin/console');
  assert.equal(next.searchParams.get('job_id'), 'JOB-45');
  assert.equal(next.searchParams.get('q'), '45');
  assert.equal(document.querySelectorAll('#ac-jobs > li').length, 0);
});

test('names stay text, API hrefs are ignored, and money is null-aware', async t => {
  const attack = '<img src=x onerror=alert(1)>';
  const { document } = await screen(t, { fetcher: path => {
    const data = payload(path); data.jobs = data.jobs.slice(0, 2);
    data.pagination = { page: 1, page_size: 20, total: 2, total_pages: 1, has_prev: false, has_next: false };
    data.counts.filtered = 2;
    data.jobs[0] = { ...data.jobs[0], customer_name: attack, model_name: attack, href: 'https://example.com/steal', finance: null };
    data.jobs[1] = { ...data.jobs[1], href: 'javascript:alert(1)', finance: { amount_thb: 0, model_payout_thb: null, payment_status: 'pending', payment_ref: 'fixture-payment' } };
    return Response.json(data);
  } });
  assert.equal(document.querySelectorAll('#ac-jobs img').length, 0);
  assert.match(document.querySelector('#ac-jobs').textContent, /<img/);
  const links = [...document.querySelectorAll('#ac-jobs a')].map(node => new URL(node.href));
  assert.ok(links.length > 0);
  assert.ok(links.every(link => link.origin === new URL(BASE).origin));
  assert.ok(links.every(link => link.pathname.startsWith('/internal/')));
  const rows = [...document.querySelectorAll('#ac-jobs > li')];
  assert.match(rows[0].textContent, /—/);
  assert.match(rows[1].textContent, /(?:฿|THB)\s*0(?:\.00)?/);
});

test('invalid URL selectors do not broaden into a normal unscoped fetch', async t => {
  for (const query of ['q=one&q=two', 'client_id=not-a-record', 'job_id=', 'date=2026-02-31', 'q=%E2%80%8B']) {
    const { document, calls } = await screen(t, { url: `${BASE}?${query}` });
    assert.equal(calls.length, 0, query);
    assert.equal(document.querySelector('#ac-error').hidden, false, query);
    assert.equal(document.querySelectorAll('#ac-jobs > li').length, 0, query);
  }
});

test('malformed or mismatched scoped API data cannot appear as a successful empty queue', async t => {
  for (const mode of ['html', 'missing', 'scope']) {
    const { document } = await screen(t, { url: `${BASE}?client_id=${CLIENT}`, fetcher: path => {
      if (mode === 'html') return new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } });
      if (mode === 'missing') return Response.json({ ok: true, jobs: [] });
      const data = payload(path); data.filters.client_id = 'recBBBBBBBBBBBBBB'; return Response.json(data);
    } });
    assert.equal(document.querySelector('#ac-error').hidden, false, mode);
    assert.equal(document.querySelector('#ac-empty').hidden, true, mode);
    assert.equal(document.querySelector('[data-count=all]').textContent, '—', mode);
  }
});

test('invalid client scope cannot silently become unscoped through ordinary filters', async t => {
  for (const query of ['client_id=invalid', `client_id=${CLIENT}&client_id=${CLIENT}`]) {
    const { dom, document, calls } = await screen(t, { url: `${BASE}?${query}` });
    assert.equal(calls.length, 0);
    document.querySelector('#ac-today').click();
    document.querySelector('#ac-all-dates').click();
    document.querySelector('#ac-query').value = 'fixture';
    submit(dom); await settle();
    assert.equal(calls.length, 0, 'ordinary filters must not discard unresolved identity scope');
    assert.equal(new URL(dom.window.location.href).search, '?' + query);
    document.querySelector('#ac-clear-filters').click(); await settle();
    assert.equal(calls.length, 1, 'explicit reset is allowed to discard invalid filters');
    assert.equal(new URL(calls[0].path, BASE).searchParams.has('client_id'), false);
    assert.equal(document.querySelector('#ac-query').disabled, false);
  }
});

test('old in-flight data cannot replace a newly selected canonical job', async t => {
  const pending = [];
  const { dom, document, calls } = await screen(t, { url: `${BASE}?date=all`, fetcher: path => new Promise(resolve => pending.push({ path, resolve })) });
  assert.equal(pending.length, 1);
  dom.window.history.pushState(null, '', `${BASE}?date=all&job_id=JOB-45`);
  dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
  await settle();
  assert.equal(pending.length, 2);
  assert.equal(calls[0].options.signal.aborted, true);
  pending[1].resolve(Response.json(payload(pending[1].path))); await settle();
  assert.equal(document.querySelectorAll('#ac-jobs > li').length, 1);
  assert.match(document.querySelector('#ac-jobs').textContent, /ลูกค้าตัวอย่าง 45/);
  pending[0].resolve(Response.json(payload(pending[0].path))); await settle();
  assert.equal(document.querySelectorAll('#ac-jobs > li').length, 1);
  assert.match(document.querySelector('#ac-jobs').textContent, /ลูกค้าตัวอย่าง 45/);
});

test('canonical language preference survives history and login without entering jobs filters', async t => {
  const { dom, document, calls } = await screen(t, { url: `${BASE}?date=all&lang=en`, fetcher: () => Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) });
  assert.equal(new URL(calls[0].path, BASE).searchParams.has('lang'), false);
  assert.equal(new URL(dom.window.location.href).searchParams.get('lang'), 'en');
  const next = new URL(new URL(document.querySelector('#ac-sign-in').href).searchParams.get('next'), BASE);
  assert.equal(next.searchParams.get('lang'), 'en');
});

test('deferred canonical document events repaint dynamic copy even when the initial locale is unchanged', async t => {
  const { dom, document, calls } = await screen(t, {
    url: `${BASE}?date=all&lang=en`,
    beforeBoot: window => { window.document.documentElement.lang = 'en'; },
    fetcher: path => {
      const data = payload(path);
      data.jobs[0].finance = { payment_status: 'partial' };
      return Response.json(data);
    },
  });
  assert.equal(document.querySelector('#ac-results-summary').textContent, '45 รายการ · แสดง 1–20');
  const english = {
    'admin.console.results': '{total} jobs · showing {start}–{end}',
    'admin.console.page': 'Page {page} of {pages}',
    'admin.console.loaded': 'Loaded {count} jobs',
    'admin.console.updated': 'Updated {time}',
    'admin.console.paymentPrefix': 'Payment: {status}',
    'admin.console.paymentPartial': 'Partial payment recorded',
    'admin.console.jobConfirmed': 'Job confirmed',
  };
  dom.window.MMD_I18N = { t: key => english[key] || null };
  // The pinned canonical core dispatches these events on document without bubbling.
  const ready = new dom.window.CustomEvent('mmd:i18n:ready', { detail: { lang: 'en' } });
  assert.equal(ready.bubbles, false);
  document.dispatchEvent(ready);
  await settle();

  assert.equal(document.querySelector('#ac-results-summary').textContent, '45 jobs · showing 1–20');
  assert.equal(document.querySelector('#ac-page-label').textContent, 'Page 1 of 3');
  assert.equal(document.querySelector('#ac-status').textContent, 'Loaded 20 jobs');
  assert.match(document.querySelector('#ac-updated').textContent, /^Updated /);
  assert.equal(document.querySelector('.ac-payment-state').textContent, 'Payment: Partial payment recorded');
  assert.equal(document.querySelector('.ac-status-pill').textContent, 'Job confirmed');
  assert.equal(calls.length, 1, 'copy repaint must not fetch operational data again');

  const firstRow = document.querySelector('#ac-jobs > li');
  document.dispatchEvent(new dom.window.CustomEvent('mmd:i18n:applied', { detail: { lang: 'en' } }));
  await settle();
  assert.equal(document.querySelector('#ac-jobs > li'), firstRow, 'same-language observer events must not rebuild rows');

  document.documentElement.lang = 'zh';
  dom.window.MMD_I18N.t = key => ({
    'admin.console.results': '共 {total} 项 · 显示 {start}–{end}',
    'admin.console.page': '第 {page} 页，共 {pages} 页',
    'admin.console.loaded': '已加载 {count} 项',
  })[key] || null;
  document.dispatchEvent(new dom.window.CustomEvent('mmd:i18n:applied', { detail: { lang: 'zh' } }));
  await settle();
  assert.equal(document.querySelector('#ac-results-summary').textContent, '共 45 项 · 显示 1–20');
  assert.equal(document.querySelector('#ac-page-label').textContent, '第 1 页，共 3 页');
  assert.equal(document.querySelector('#ac-status').textContent, '已加载 20 项');
  assert.equal(calls.length, 1);
});
