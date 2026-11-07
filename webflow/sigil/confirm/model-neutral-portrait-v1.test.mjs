import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');

function run(file, href) {
  const styles = [];
  const attrs = {};
  const doc = {
    title: 'orig',
    head: { appendChild: (s) => styles.push(s) },
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, appendChild: (s) => styles.push(s) },
    getElementById: (id) => styles.find((s) => s.id === id) || null,
    createElement: () => ({}),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const win = { addEventListener: () => {} };
  vm.runInNewContext(read(file), { document: doc, window: win, location: { href }, URL, TextDecoder, Uint8Array, atob, console });
  return { styles, attrs, doc };
}
const tok = (o) => Buffer.from(JSON.stringify(o)).toString('base64url') + '.sig';

test('neutral: partner neutral claim sets attribute, title and injects css', () => {
  const r = run('model-neutral-v1.js', 'https://x.test/p?t=' + tok({ neutral: true, via: 'partner' }));
  assert.equal(r.attrs['data-mmd-neutral'], '1');
  assert.equal(r.doc.title, 'Job confirmation');
  assert.equal(r.styles.length, 1);
  assert.match(r.styles[0].textContent, /html\[data-mmd-neutral\] body #mmd-model-confirm-v15 \.mm15__brand/);
});

test('neutral: no claim or non-partner claim changes nothing', () => {
  for (const href of ['https://x.test/p', 'https://x.test/p?t=' + tok({ neutral: true, via: 'self' }), 'https://x.test/p?t=!!!']) {
    const r = run('model-neutral-v1.js', href);
    assert.deepEqual(r.attrs, {});
    assert.equal(r.doc.title, 'orig');
    assert.equal(r.styles.length, 0);
  }
});

test('portrait: injects the background style once', () => {
  const r = run('customer-confirm-portrait-v1.js', 'https://x.test/');
  assert.equal(r.styles.length, 1);
  assert.equal(r.styles[0].id, 'sigil-customer-confirm-portrait-v1');
  assert.match(r.styles[0].textContent, /#mmd-job-confirm-v16::before/);
  assert.match(r.styles[0].textContent, /sigil-customer-confirm-bg\.webp/);
});

test('no network calls in either script', () => {
  for (const f of ['model-neutral-v1.js', 'customer-confirm-portrait-v1.js']) {
    assert.doesNotMatch(read(f), /fetch\(|XMLHttpRequest|sendBeacon/);
  }
});
