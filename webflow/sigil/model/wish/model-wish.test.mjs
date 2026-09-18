import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('./model-wish.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const flush = async () => { for (let i = 0; i < 6; i++) await tick(); };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

class Element {
  constructor() {
    this.dataset = {}; this.value = ''; this.textContent = ''; this.hidden = false; this.checked = false;
    this.listeners = {}; this.children = {}; this.attributes = {}; this.classes = new Set(); this.files = [];
    this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c),
      toggle: (c, value) => value ? this.classes.add(c) : this.classes.delete(c) };
  }
  querySelector(selector) { return this.children[selector] || null; }
  querySelectorAll(selector) { return this.children[selector] || []; }
  closest(selector) { return this.parents?.[selector] || null; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  fire(type) { this.listeners[type]?.forEach(handler => handler({ preventDefault() {} })); }
  setAttribute(key, value) { this.attributes[key] = value; }
  appendChild() {}
  remove() {}
  focus() { this.focused = true; }
  scrollIntoView() {}
}

function setup({ handle, liff } = {}) {
  const root = new Element(), nodes = {}, requests = [], storage = new Map();
  const names = ['wish-form', 'birthday-wish', 'mmd-message', 'private-per', 'telegram-consent',
    'past-clients-consent', 'media-input', 'media-grid', 'media-count', 'media-note', 'error',
    'submit', 'submit-label', 'session-chip', 'auth-note', 'success', 'success-scope', 'written-count'];
  for (const name of names) root.children['[data-' + name + ']'] = nodes[name] = new Element();
  for (const key of ['birthday', 'mmd', 'private']) root.children['[data-count="' + key + '"]'] = new Element();
  const questions = ['birthday-wish', 'mmd-message', 'private-per'].map(name => {
    const section = new Element();
    section.children['[data-question-state]'] = new Element(); section.children.textarea = nodes[name];
    nodes[name].parents = { '[data-question]': section }; return section;
  });
  root.children['[data-question]'] = questions;
  const next = [1, 2].map(i => { const b = new Element(); b.dataset.nextQuestion = String(i); return b; });
  root.children['[data-next-question]'] = next;
  const wrap = new Element(); nodes['wish-form'].parents = { '.mmw-form-wrap': wrap };
  nodes['auth-note'].children.p = new Element(); nodes.success.hidden = true;
  nodes['media-grid'].children['[data-media-slot]'] = Array.from({ length: 5 }, () => new Element());
  const context = {
    document: { querySelector: () => root, createElement: () => new Element(), head: new Element() },
    window: { liff }, location: { href: 'https://www.mmdbkk.com/sigil/model/wish?t=fixture-preserved&from=LINE' },
    sessionStorage: { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k), removeItem: k => storage.delete(k) },
    URL: { createObjectURL: () => 'blob:fixture', revokeObjectURL() {} },
    FormData: class { append() {} }, matchMedia: () => ({ matches: true }),
    fetch: async (url, options = {}) => {
      requests.push({ url, ...options });
      return handle ? await handle(url, options) : response(url.includes('profile') ? { display_name: 'Fixture Model' } : { ok: true });
    }
  };
  runInNewContext(source, context);
  return { root, nodes, requests, storage, questions, next, wrap, context };
}

test('empty submission opens and focuses the first writing field without a POST', async () => {
  const f = setup(); await flush();
  f.questions[0].open = false; f.nodes['wish-form'].fire('submit'); await flush();
  assert.equal(f.questions[0].open, true); assert.equal(f.nodes['birthday-wish'].focused, true);
  assert.equal(f.requests.filter(r => r.method === 'POST').length, 0);
  assert.match(f.nodes.error.textContent, /อย่างน้อย 1/);
});

test('next question preserves the previous answer and updates the written count', async () => {
  const f = setup(); await flush();
  f.nodes['birthday-wish'].value = 'สุขสันต์วันครบรอบ'; f.nodes['birthday-wish'].fire('input');
  f.next[0].fire('click');
  assert.equal(f.questions[0].open, false); assert.equal(f.questions[1].open, true);
  assert.equal(f.nodes['mmd-message'].focused, true); assert.equal(f.nodes['birthday-wish'].value, 'สุขสันต์วันครบรอบ');
  assert.equal(f.nodes['written-count'].textContent, '1 / 3 ข้อความ');
});

test('neither, either, or both sharing scopes remain independent and Per-only text stays separate', async () => {
  for (const [telegram, past] of [[false, false], [true, false], [false, true], [true, true]]) {
    const f = setup(); await flush();
    f.nodes['birthday-wish'].value = 'Birthday fixture'; f.nodes['mmd-message'].value = 'Team fixture';
    f.nodes['private-per'].value = 'PER ONLY FIXTURE'; f.nodes['telegram-consent'].checked = telegram;
    f.nodes['past-clients-consent'].checked = past; f.nodes['wish-form'].fire('submit'); await flush();
    const writes = f.requests.filter(r => r.method === 'POST'); assert.equal(writes.length, 1);
    assert.equal(writes[0].url, '/v1/model/session/current?mode=year6_direct_wish');
    const payload = JSON.parse(writes[0].body);
    assert.equal(payload.telegram_consent, telegram); assert.equal(payload.past_clients_consent, past);
    assert.equal(payload.private_note_scope, 'per_only'); assert.equal(payload.private_note_per, 'PER ONLY FIXTURE');
    assert.equal(payload.message.includes('PER ONLY FIXTURE'), false);
    assert.equal('media_ids' in payload, false); assert.equal(f.nodes.success.hidden, false);
    assert.equal(f.wrap.hidden, true); assert.equal(f.storage.size, 0);
  }
});

test('a private note alone is a valid submission with no media or sharing requirement', async () => {
  const f = setup(); await flush(); f.nodes['private-per'].value = 'Private only';
  f.nodes['wish-form'].fire('submit'); await flush();
  const payload = JSON.parse(f.requests.find(r => r.method === 'POST').body);
  assert.equal(payload.message, ''); assert.equal(payload.private_note_per, 'Private only');
  assert.equal(f.nodes.success.hidden, false);
});

test('auth-in-progress blocks duplicate submission and initialization; login keeps the full return URL', async () => {
  let release, redirect;
  const pending = new Promise(resolve => { release = resolve; });
  const f = setup({ handle: () => response({}, 401),
    liff: { init: () => pending, isLoggedIn: () => false, login: args => { redirect = args.redirectUri; } } });
  await flush(); runInNewContext(source, f.context);
  assert.equal(f.requests.length, 1);
  f.nodes['birthday-wish'].value = 'Draft retained'; f.nodes['wish-form'].fire('submit');
  f.nodes['wish-form'].fire('submit'); assert.equal(f.nodes.submit.disabled, true);
  release(); await flush();
  assert.equal(redirect, f.context.location.href); assert.equal(f.requests.length, 1);
  assert.equal(f.nodes.submit.disabled, false); assert.equal(f.storage.size, 1);
});

test('an unconfirmed or malformed submit response keeps the draft and visible form for retry', async () => {
  for (const result of [response({ error: 'unavailable' }, 503), { ok: true, status: 200, json: async () => { throw new Error('bad JSON'); } }]) {
    const f = setup({ handle: url => url.includes('profile') ? response({ display_name: 'Fixture' }) : result });
    await flush(); f.nodes['birthday-wish'].value = 'Retry fixture'; f.nodes['wish-form'].fire('submit'); await flush();
    assert.equal(f.nodes.success.hidden, true); assert.equal(f.wrap.hidden, false);
    assert.equal(f.storage.size, 1); assert.equal(f.nodes.submit.disabled, false);
    assert.match(f.nodes.error.textContent, /ยังยืนยัน/);
  }
});

test('more than five files or an oversized photo is rejected before upload', async () => {
  const f = setup(); await flush();
  for (const files of [Array.from({ length: 6 }, () => ({ type: 'image/jpeg', size: 100, name: 'fixture.jpg' })),
    [{ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1, name: 'large.jpg' }]]) {
    f.nodes['media-input'].files = files; f.nodes['media-input'].fire('change');
    assert.ok(f.nodes.error.textContent); assert.equal(f.nodes['media-count'].textContent, '0 / 5');
  }
  assert.equal(f.requests.filter(r => r.method === 'POST').length, 0);
});

test('retrying a failed wish reuses a completed Gallery upload rather than uploading twice', async () => {
  let attempts = 0;
  const f = setup({ handle: url => {
    if (url.includes('profile')) return response({ display_name: 'Fixture' });
    if (url.includes('media/upload')) return response({ media_id: 'fixture-media' });
    return ++attempts === 1 ? response({ error: 'temporary' }, 503) : response({ ok: true });
  } });
  await flush(); f.nodes['birthday-wish'].value = 'Retry after upload';
  f.nodes['media-input'].files = [{ type: 'image/jpeg', size: 100, name: 'fixture.jpg' }];
  f.nodes['media-input'].fire('change'); f.nodes['wish-form'].fire('submit'); await flush();
  f.nodes['wish-form'].fire('submit'); await flush();
  assert.equal(f.requests.filter(r => r.url.includes('media/upload')).length, 1);
  assert.equal(attempts, 2); assert.equal(f.nodes.success.hidden, false);
});
