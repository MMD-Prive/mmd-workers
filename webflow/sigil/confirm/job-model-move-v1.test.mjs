import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
// sha256 of the original Webflow inline blocks (taken before the move)
const EXPECT = {
 "css": {
  "mmd-model-confirm-logo-v2": "0575a203920845ca40613888f2a1b0d7297a3bd7bdc9e0bdf60c4dc1e4d54a6f",
  "mmd-model-confirm-current-photo-v1-css": "681fd1102e36a51482dea01612ffa6131e971a01e1f001d8ec5c091ee0b9e780",
  "mmd-model-confirm-hero-v1": "a2a0783d6a77be45dc6bceb35fba13ae6aea4d8c915680eb2f1b09886be16c18",
  "sigil-model-job-brand-v1-css": "4fdf0737b876ba4893e59a87cf7eda23ac29eb1445855b062deb0da7207cfe96",
  "mmd-model-atelier-v1": "36464bc5ff504ebe75bde2e05448d955564c3a056ec5429d6cac213c30547b05"
 },
 "js_head": [
  [
   1590,
   "e7f8f34c0bf40d804dd06244528921e96e48df94de9254f014db38b21be20e0a"
  ],
  [
   1262,
   "2405220c5ef59fd113c143d5b7d13d9fd14b89dd7ef53be57eec93bbfe98c867"
  ]
 ],
 "js_foot": [
  [
   7515,
   "4259fb231ee37914467df5082f79d1cd271679d46350dace444c8dfbc108f0cb"
  ],
  [
   27841,
   "39eaaef21a3ffa290f586c601fd10cd09cb1f36b96f87816c787af060d1acda7"
  ],
  [
   975,
   "27613933e6bdbc8a23edbb2481ab89e7d91058f610cc354cb5ca50e0a8190f63"
  ],
  [
   3282,
   "a892d0576e9cf6d35ee735e23b3af9930e2995fd87739ebd4cac041cbf73db6a"
  ]
 ]
};

test('head file compiles and injects the original CSS unchanged, in order', () => {
  const styles = [];
  const listeners = [];
  const doc = {
    readyState: 'loading',
    head: { appendChild: (s) => styles.push(s) },
    documentElement: { appendChild: (s) => styles.push(s), hasAttribute: () => false, dataset: {}, lang: 'th' },
    getElementById: (id) => styles.find((s) => s.id === id) || null,
    createElement: () => ({}),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (...a) => listeners.push(a),
    body: {},
  };
  const win = { addEventListener: () => {} };
  vm.runInNewContext(read('job-model-head-v1.js'), { document: doc, window: win, location: { href: 'https://x.test/', origin: 'https://x.test' }, MutationObserver: class { observe() {} disconnect() {} }, console });
  assert.deepEqual(Object.fromEntries(styles.map((s) => [s.id, sha(s.textContent)])), EXPECT.css);
  assert.deepEqual(styles.map((s) => s.id), Object.keys(EXPECT.css));
});

test('head and runtime files contain every original inline script unchanged and in order', () => {
  for (const [file, key] of [['job-model-head-v1.js', 'js_head'], ['job-model-runtime-v1.js', 'js_foot']]) {
    const src = read(file);
    new vm.Script(src);
    const segs = src.split(/\/\* script: [^*]+ \*\/\n/).slice(1);
    assert.equal(segs.length, EXPECT[key].length, file);
    segs.forEach((seg, i) => {
      const [len, hash] = EXPECT[key][i];
      assert.equal(sha(seg.slice(0, len)), hash, file + ' script #' + i);
    });
  }
});

test('runtime keeps the first-job gate before the confirm runtime', () => {
  const src = read('job-model-runtime-v1.js');
  assert.ok(src.indexOf('mmd-direct-private-first-job-gate-v1') < src.indexOf('mmd-model-confirm-runtime-v15-1'));
  assert.ok(src.indexOf('mmd-model-confirm-runtime-v15-1') < src.indexOf('mmd-model-work-navigation-v1'));
});
