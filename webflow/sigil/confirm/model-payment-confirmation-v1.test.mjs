import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// sha256 of the original Webflow inline blocks (taken before the move)
const EXPECT = {
 "mc_css": [
  "b37f990839b4af3b1023ec05a0a8ea2b2b4786845017ce02d2808d1f7592c474",
  "2ab0f05241af0dd463292e9e28b68456ef6057353b1be67778367a795e3493bf"
 ],
 "mc_js": [
  "7fa8f10bbbb910be27be89351c111fa9957c89530769e6d97e2258075dddcd7d",
  "b5314753f45655d764e86cbbc95ba97b6c190c95a94095977c2b589a715df199"
 ],
 "pc_css": [
  "ba8fd8f879b5b81ca6abfaf75ec1cee6d26b17d8e37680c559dcc09587e5b8e1",
  "a0a6ac65975f65b4255e071d0c5fc5a169ccae018dc75492362c721f1e9411e5",
  "7ba09b7d9763e44a72a34e7c18ac73e6f6d538d3fba3f4922a77961dfebe68b2"
 ],
 "pc_js": [
  "c2ad361f689060cf31b6fe79b94149c4aa023fc7f4f0c367c336e02192c341d0"
 ]
};

function inject(file) {
  const styles = [];
  const doc = {
    head: { appendChild: (s) => styles.push(s) },
    documentElement: { appendChild: (s) => styles.push(s) },
    getElementById: (id) => styles.find((s) => s.id === id) || null,
    createElement: () => ({}),
  };
  vm.runInNewContext(read(file), { document: doc });
  return styles;
}

test('model-confirmation theme injects the original CSS unchanged', () => {
  const s = inject('model-confirmation-theme-v1.js');
  assert.deepEqual(s.map((x) => sha(x.textContent)), EXPECT.mc_css);
  assert.equal(s[1].id, 'mmd-confirm-compact-logo-v1');
});

test('payment-confirmation theme injects the original CSS unchanged', () => {
  const s = inject('payment-confirmation-theme-v1.js');
  assert.deepEqual(s.map((x) => sha(x.textContent)), EXPECT.pc_css);
  assert.deepEqual(s.slice(1).map((x) => x.id), ['mmd-payment-theme-v3', 'mmd-tmib-atelier-20261101']);
});

test('runtime files contain the original inline scripts unchanged', () => {
  for (const [file, key] of [['model-confirmation-runtime-v1.js', 'mc_js'], ['payment-confirmation-runtime-v1.js', 'pc_js']]) {
    const src = read(file);
    const body = src.slice(src.indexOf('*/') + 3);
    const parts = EXPECT[key].length === 1 ? [body.trim()] : body.split('\n;\n').map((p) => p.trim());
    assert.deepEqual(parts.map(sha), EXPECT[key].map((x) => x), file);
  }
});

test('theme scripts make no network calls', () => {
  for (const f of ['model-confirmation-theme-v1.js', 'payment-confirmation-theme-v1.js']) {
    assert.doesNotMatch(read(f), /fetch\(|XMLHttpRequest|sendBeacon/);
  }
});
