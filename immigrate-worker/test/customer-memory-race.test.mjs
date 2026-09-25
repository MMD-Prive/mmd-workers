import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise both independent readers with responses arriving after selection changed.
for (const [file, stateKey, oldValue] of [
  ['customer-360-live-client.ts', '[data-ci-rel]', 'OLD CLIENT'],
  ['customer-identity-alignment-client.ts', '[data-ia-liff]', 'MATCHED ✓'],
]) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8').split('String.raw`')[1].split('`;')[0];
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      textContent: '', innerHTML: '', hidden: false, dataset: {}, style: {},
      appendChild() {}, insertAdjacentElement() {}, addEventListener() {}, closest() { return null; },
      querySelector: s => node(s), querySelectorAll: () => [],
    });
    return nodes.get(selector);
  };
  node('[data-client]').textContent = 'recAlpha';
  let observer;
  const pending = [];
  const document = {
    querySelector: s => /runtime/.test(s) ? null : node(s),
    querySelectorAll: () => [], createElement: () => node('new' + nodes.size),
    head: node('head'), documentElement: node('html'),
  };
  const context = vm.createContext({ document, location: { pathname: '/internal/admin/customer-data', href: 'https://example.test/internal/admin/customer-data', origin: 'https://example.test' }, URL, setTimeout,
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} },
    fetch: () => new Promise(resolve => pending.push(resolve)),
  });
  vm.runInContext(source, context);
  assert.equal(pending.length, 1);
  node('[data-client]').textContent = 'ยังไม่ได้จับคู่';
  observer();
  assert.equal(pending.length, 1, 'unmatched selected row must not fall back to URL client');
  pending[0]({ ok: true, status: 200, text: async () => JSON.stringify({ relationship: { relationship_state: oldValue }, identity: { alignment: { status: 'verified_match', liff: { status: 'matched' } } } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node(stateKey).textContent, '—', 'late response must not restore previous client');
  node('[data-client]').textContent = 'recBeta';
  observer();
  assert.equal(pending.length, 2);
  assert.equal(node(stateKey).textContent, '—', 'new selection clears old context while loading');
}
console.log('Customer memory selection races: passed');

// A canonical deep link from Member Intelligence must reveal a read-only detail
// surface even when the client is absent from the current staging review queue.
{
  const source = readFileSync(new URL('../src/customer-360-live-client.ts', import.meta.url), 'utf8').split('String.raw`')[1].split('`;')[0];
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      textContent: '', innerHTML: '', hidden: false, href: '', dataset: {}, style: {},
      appendChild() {}, insertAdjacentElement() {}, addEventListener() {}, closest() { return null; },
      querySelector: s => node(s), querySelectorAll: () => [],
    });
    return nodes.get(selector);
  };
  node('[data-detail]').hidden = true;
  node('[data-empty]').hidden = false;
  node('[data-client]').textContent = '—';
  const pending = [];
  const document = {
    querySelector: s => /runtime/.test(s) ? null : node(s),
    querySelectorAll: () => [],
    createElement: () => node('deep-link-' + nodes.size),
    head: node('head-deep-link'),
    documentElement: node('html-deep-link'),
  };
  const context = vm.createContext({
    document,
    location: {
      pathname: '/internal/admin/customer-data',
      href: 'https://example.test/internal/admin/customer-data?client_id=recDeepLink',
      origin: 'https://example.test',
    },
    URL,
    setTimeout,
    MutationObserver: class { observe() {} },
    fetch: () => new Promise(resolve => pending.push(resolve)),
  });
  vm.runInContext(source, context);
  assert.equal(node('[data-detail]').hidden, true, 'scope stays locked before the canonical read');
  assert.equal(node('[data-empty]').hidden, false);
  assert.equal(node('[data-client]').textContent, '—');
  assert.doesNotMatch(node('[data-session]').href, /client_id=recDeepLink/);
  assert.equal(pending.length, 1);
  pending[0]({ ok: true, status: 200, text: async () => JSON.stringify({
    ok: true, client_id: 'recDeepLink', identity: { status: 'canonical' },
  }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('[data-detail]').hidden, false);
  assert.equal(node('[data-empty]').hidden, true);
  assert.equal(node('[data-client]').textContent, 'recDeepLink');
  assert.equal(node('[data-name]').textContent, 'ลูกค้า Canonical ที่เลือก');
  assert.equal(node('.decision').hidden, true);
  assert.match(node('[data-session]').href, /client_id=recDeepLink/);
}

console.log('Customer memory deep link: passed');
