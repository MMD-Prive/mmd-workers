import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./mmd-now-feed.js', import.meta.url), 'utf8');
const timers = new Map(); let timerId = 0;
const context = { module: { exports: {} }, URL, AbortController, setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id), globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'mmd-now-feed.js' });
const { init, ENDPOINT } = context.module.exports;

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.style = {}; this.textContent = ''; this.removed = false; }
  append(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  remove() { this.removed = true; }
}
const document = { createElement: tag => new Element(tag) };
const root = () => Object.assign(new Element('div'), { ownerDocument: document });
const response = (body, ok = true) => ({ ok, json: async () => body });

test('shows a loading state and fetches same-origin without cache', async () => {
  let resolveFetch;
  const host = root();
  const pending = new Promise(resolve => { resolveFetch = resolve; });
  init(host, { document, origin: 'https://mmdbkk.com', fetch: (url, options) => {
    assert.equal(url, ENDPOINT);
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    return pending;
  } });
  assert.match(host.children[0].textContent, /กำลังตรวจสอบ/);
  resolveFetch(response({ items: [] }));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(host.children[0].textContent, /ยังไม่มีอัปเดต/);
  assert.equal(host.children[0].attributes.role, 'status');
});

test('shows a distinct error and retry button, then loads updates', async () => {
  const host = root(); let calls = 0;
  init(host, { document, origin: 'https://mmdbkk.com', fetch: async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    return response({ items: [{ title: 'ประกาศใหม่' }] });
  } });
  await new Promise(resolve => setImmediate(resolve));
  const box = host.children[0];
  assert.match(box.textContent, /โหลดไม่สำเร็จ/);
  assert.equal(box.attributes.role, 'alert');
  const retry = box.children[0];
  assert.equal(retry.tagName, 'button');
  await retry.listeners.click();
  assert.equal(calls, 2);
  assert.equal(host.children[0].children[0].textContent, 'ประกาศใหม่');
});

test('renders text safely and accepts only valid same-origin image and CTA URLs', async () => {
  const host = root();
  init(host, { document, origin: 'https://mmdbkk.com', fetch: async () => response({ items: [
    { title: '<img src=x onerror=alert(1)>', excerpt: '<b>unsafe</b>', image_url: 'javascript:alert(1)', cta: { label: 'Bad', url: 'https://evil.example/x' } },
    { title: 'Valid', image_url: '/updates/photo.jpg', cta: { label: 'อ่านต่อ', url: 'https://mmdbkk.com/news?id=1' } },
    { title: 'Protocol-relative', image_url: '//evil.example/x.jpg', cta: { label: 'Bad host', url: '//evil.example' } },
  ] }) });
  await new Promise(resolve => setImmediate(resolve));
  const [first, second, third] = host.children;
  assert.equal(first.children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(first.children.some(child => child.tagName === 'img' || child.tagName === 'a'), false);
  assert.equal(second.children.find(child => child.tagName === 'img').src, '/updates/photo.jpg');
  assert.equal(second.children.find(child => child.tagName === 'a').href, '/news?id=1');
  assert.equal(third.children.some(child => child.tagName === 'img' || child.tagName === 'a'), false);
});

test('broken image is removed without affecting its card', async () => {
  const host = root();
  init(host, { document, origin: 'https://mmdbkk.com', fetch: async () => response({ items: [{ title: 'Card', image_url: '/bad.jpg' }] }) });
  await new Promise(resolve => setImmediate(resolve));
  const image = host.children[0].children.find(child => child.tagName === 'img');
  image.listeners.error();
  assert.equal(image.removed, true);
});

test('allows only HTTPS Webflow image CDNs while CTAs remain same-origin', async () => {
  const host = root();
  init(host, { document, origin: 'https://mmdbkk.com', fetch: async () => response({ items: [
    { title: 'Cover', image_url: 'https://cdn.prod.website-files.com/abc/cover.webp', cta: { label: 'External', url: 'https://cdn.prod.website-files.com/go' } },
    { title: 'Legacy cover', image_url: 'https://uploads-ssl.webflow.com/abc/cover.jpg' },
    { title: 'Bad image', image_url: 'http://cdn.prod.website-files.com/abc/x' },
  ] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.children[0].children.find(child => child.tagName === 'img').src, 'https://cdn.prod.website-files.com/abc/cover.webp');
  assert.equal(host.children[0].children.some(child => child.tagName === 'a'), false);
  assert.equal(host.children[1].children.find(child => child.tagName === 'img').src, 'https://uploads-ssl.webflow.com/abc/cover.jpg');
  assert.equal(host.children[2].children.some(child => child.tagName === 'img'), false);
});

test('treats non-OK and malformed payloads as errors instead of empty feeds', async () => {
  for (const result of [response({ items: [] }, false), response({ items: 'not-an-array' })]) {
    const host = root();
    init(host, { document, origin: 'https://mmdbkk.com', fetch: async () => result });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(host.children[0].textContent, /โหลดไม่สำเร็จ/);
    assert.equal(host.children[0].attributes.role, 'alert');
  }
});

test('aborts after timeout and ignores stale concurrent responses', async () => {
  const host = root(); const first = []; let calls = 0;
  const app = init(host, { document, origin: 'https://mmdbkk.com', fetch: (url, options) => {
    calls += 1;
    if (calls === 1) return new Promise((resolve, reject) => {
      first.push(resolve);
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
    return Promise.resolve(response({ items: [{ title: 'Latest response' }] }));
  } });
  const timeout = [...timers.values()][0];
  timeout();
  await app.load();
  assert.equal(calls, 2);
  first[0](response({ items: [{ title: 'Stale response' }] }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.children[0].children[0].textContent, 'Latest response');
  assert.equal([...timers.values()].length, 0);
});

test('a slower earlier request cannot overwrite a newer feed', async () => {
  const host = root(); let resolveFirst; let calls = 0;
  const app = init(host, { document, origin: 'https://mmdbkk.com', fetch: () => {
    calls += 1;
    if (calls === 1) return new Promise(resolve => { resolveFirst = resolve; });
    return Promise.resolve(response({ items: [{ title: 'Newer' }] }));
  } });
  await app.load();
  resolveFirst(response({ items: [{ title: 'Older' }] }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.children[0].children[0].textContent, 'Newer');
});
