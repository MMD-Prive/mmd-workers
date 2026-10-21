import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { renderMmsDirectChatPage } from '../src/mms-direct-chat-page.mjs';
import { handleMyMmsCustomerApi } from '../src/my-mms-customer-app-front-gate.js';
import { maybeHandleMmsChat } from '../../mms-worker/src/mms-chat-runtime.mjs';
import { fixture, cookie, CUSTOMER, OTHER_CUSTOMER, ORIGIN } from '../../mms-worker/test/helpers/mms-chat-fixture.mjs';

// jsdom is already a root development dependency; no browser network is used.
const { JSDOM } = createRequire(import.meta.url)('jsdom');
async function settle(check = () => true) {
  for (let i = 0; i < 60; i++) { await new Promise(resolve => setImmediate(resolve)); if (check()) return; }
  assert.ok(check(), 'UI did not settle');
}
function page(role, fixture) {
  const html = renderMmsDirectChatPage(role);
  const dom = new JSDOM(html, { url: ORIGIN + (role === 'customer' ? '/male-massage/support/chat' : '/male-massage/therapists/app/chat'), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const timers = new Map(); let tick = 0; const calls = [];
  let customerId = CUSTOMER.id;
  w.AbortController = AbortController;
  Object.defineProperty(w, 'crypto', { value: globalThis.crypto });
  w.setTimeout = (fn, ms) => { const id = ++tick; timers.set(id, { fn, ms }); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const env = { ...fixture.env,
    MMS_MEMBER_WORKER: { fetch: async () => Response.json({ ok: true, data: { registered: true, profile: { member_id: customerId } } }) },
    MMS_WORKER: { fetch: req => maybeHandleMmsChat(req, fixture.env) },
  };
  w.fetch = async (path, options = {}) => {
    calls.push({ path, options });
    const headers = new Headers(options.headers); headers.set('origin', ORIGIN); headers.set('cookie', cookie(fixture.env));
    const req = new Request(ORIGIN + path, { ...options, headers });
    return role === 'customer' ? handleMyMmsCustomerApi(req, env) : maybeHandleMmsChat(req, fixture.env);
  };
  const script = w.document.querySelector('script').textContent;
  new vm.Script(script); w.eval(script);
  const $ = id => w.document.getElementById(id);
  return { dom, w, $, calls, timers, switchCustomer(id) { customerId = id; },
    async ready() { await settle(() => !$('policy-card').hidden); },
    async agree() { $('agree').click(); await settle(() => !$('app').hidden && calls.some(c => c.path.endsWith('/threads'))); await settle(); },
    async choose() { await settle(() => $('therapists').querySelector('button')); $('therapists').querySelector('button').click(); await settle(() => !$('conversation').hidden && $('peer').textContent !== 'กำลังโหลดบทสนทนา'); },
    async open() { await settle(() => $('threads').querySelector('button')); $('threads').querySelector('button').click(); await settle(() => !$('conversation').hidden && $('peer').textContent !== 'กำลังโหลดบทสนทนา'); },
    type(value) { $('text').value = value; $('text').dispatchEvent(new w.Event('input')); },
    send() { $('compose').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); },
    async refresh() { $('refresh').click(); await settle(() => !$('refresh').disabled); },
    close() { timers.clear(); w.close(); },
  };
}

test('both real DOM clients accept rules, select a Therapist, exchange text, block contact and request review', async () => {
  const f = fixture(); const customer = page('customer', f); let therapist;
  try {
    await customer.ready(); assert.equal(customer.$('app').hidden, true); assert.equal(customer.$('rules').children.length, 7);
    await customer.agree(); await customer.choose();
    therapist = page('therapist', f); await therapist.ready(); await therapist.agree(); await therapist.open();
    customer.type('คอร์ส 60 นาทีรับงานไหมครับ'); customer.send(); await settle(() => !customer.$('send').disabled);
    await therapist.refresh(); assert.match(therapist.$('messages').textContent, /คอร์ส 60 นาที/);
    therapist.type('รับครับ ราคา 1500 บาท'); therapist.send(); await settle(() => !therapist.$('send').disabled);
    await customer.refresh(); assert.match(customer.$('messages').textContent, /ราคา 1500 บาท/);
    customer.type('ขอไลน์หน่อยครับ'); customer.send(); await settle(() => !customer.$('blocked').hidden);
    assert.equal(customer.$('text').value, 'ขอไลน์หน่อยครับ');
    await therapist.refresh(); assert.doesNotMatch(therapist.$('messages').textContent, /ขอไลน์/);
    customer.$('review').click(); await settle(() => customer.$('review').hidden); assert.match(customer.$('notice').textContent, /บันทึกคำขอ/);
    customer.type('ขอรายละเอียดคอร์สครับ'); customer.send(); await settle(() => !customer.$('send').disabled);
    await therapist.refresh(); assert.match(therapist.$('messages').textContent, /ขอรายละเอียดคอร์ส/);
    assert.equal(customer.w.document.querySelector('input[type=file]'), null);
  } finally { customer.close(); therapist?.close(); f.restore(); }
});

test('uncertain transport retry uses the same request key and does not duplicate the stored message', async () => {
  const f = fixture(); const customer = page('customer', f);
  try {
    await customer.ready(); await customer.agree(); await customer.choose();
    const original = customer.w.fetch; let failed = false;
    customer.w.fetch = async (path, options) => { const result = await original(path, options); if (path.endsWith('/messages') && !failed) { failed = true; throw new Error('response lost after commit'); } return result; };
    customer.type('สวัสดีครับ'); customer.send(); await settle(() => !customer.$('send').disabled);
    assert.equal(customer.$('text').value, 'สวัสดีครับ'); customer.send(); await settle(() => !customer.$('send').disabled);
    const sent = customer.calls.filter(c => c.path.endsWith('/messages')).map(c => JSON.parse(c.options.body));
    assert.equal(sent.length, 2); assert.equal(sent[0].request_key, sent[1].request_key);
    assert.equal(customer.$('messages').children.length, 1); assert.equal(customer.$('text').value, '');
  } finally { customer.close(); f.restore(); }
});

test('typing a new draft while a message is in flight does not lose the new draft; markup renders as text', async () => {
  const f = fixture(); const customer = page('customer', f);
  try {
    await customer.ready(); await customer.agree(); await customer.choose();
    const original = customer.w.fetch; let release;
    customer.w.fetch = async (path, options) => { const result = await original(path, options); if (path.endsWith('/messages')) await new Promise(resolve => { release = resolve; }); return result; };
    customer.type('<img src=x onerror=alert(1)>'); customer.send(); await settle(() => Boolean(release));
    customer.type('ร่างข้อความถัดไป'); release(); await settle(() => !customer.$('send').disabled);
    assert.equal(customer.$('text').value, 'ร่างข้อความถัดไป');
    assert.equal(customer.$('messages').querySelector('img'), null); assert.match(customer.$('messages').textContent, /<img src=x/);
  } finally { customer.close(); f.restore(); }
});

test('account changes clear the previous transcript and drafts before showing the new account', async () => {
  const f = fixture(); const customer = page('customer', f);
  try {
    await customer.ready(); await customer.agree(); await customer.choose();
    customer.type('สวัสดีครับ'); customer.send(); await settle(() => !customer.$('send').disabled);
    assert.equal(customer.$('messages').children.length, 1);
    customer.type('ร่างส่วนตัว'); customer.switchCustomer(OTHER_CUSTOMER.id);
    customer.$('retry').click(); await settle(() => !customer.$('retry').disabled);
    assert.equal(customer.$('app').hidden, true); assert.equal(customer.$('conversation').hidden, true);
    assert.equal(customer.$('messages').children.length, 0); assert.equal(customer.$('text').value, '');
  } finally { customer.close(); f.restore(); }
});
