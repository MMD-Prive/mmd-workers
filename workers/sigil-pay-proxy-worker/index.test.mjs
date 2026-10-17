import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import worker, {handle, tokenFromSearch, patchPaymentRuntime, prepareHtml, readBounded, BOOTSTRAP, LIFF_ID, UPSTREAM} from './index.mjs';

const runtime = await readFile(new URL('../../webflow/sigil/pay/sigil-pay-v21.js', import.meta.url), 'utf8');
const page = `<html><head></head><body><script>${runtime}</script></body></html>`;
const identityRewriter = () => ({on() { return this; }, transform(response) { return response; }});

test('recovers exact token from direct and primary LIFF state without trusting another origin', () => {
  for (const state of ['?t=abc.def-123', '/?t=abc.def-123', '/sigil/pay/?t=abc.def-123', 't=abc.def-123', '%3Ft%3Dabc.def-123']) {
    assert.equal(tokenFromSearch('?liff.state=' + encodeURIComponent(state)), 'abc.def-123');
  }
  assert.equal(tokenFromSearch('?t=direct&liff.state=%3Ft%3Dother'), 'direct');
  assert.equal(tokenFromSearch('?liff.state=' + encodeURIComponent('https://evil.example/?t=other')), '');
  assert.equal(tokenFromSearch('?liff.state=' + encodeURIComponent('https://evil.example/?x=1&t=other')), '');
  assert.equal(tokenFromSearch('?liff.state=%2F%2Fevil.example%2F%3Ft%3Dother'), '');
  assert.equal(tokenFromSearch(''), '');
});

test('runtime initializes LINE before loading the signed payment; unexpected page changes fail closed', () => {
  const patched = patchPaymentRuntime(runtime);
  new Function(patched);
  assert.match(patched, /Promise.resolve\(window.__sigilPayReady\)/);
  assert.match(patched, /if\(ready===false\)/);
  assert.match(prepareHtml(page), /data-sigil-pay-liff/);
  assert.throws(() => prepareHtml('<html><head></head></html>'), /contract_changed/);
  assert.throws(() => patchPaymentRuntime(runtime.replace('  function tokenFromUrl(){', '  function changed(){')), /contract_changed/);
});

test('bootstrap uses the published ID and leaves LINE URL parameters unchanged', async () => {
  let supplied;
  const context = {
    window: {liff: {init(config) {supplied = config; return Promise.resolve();}}},
    navigator: {userAgent: 'Line/15.0'}, location: {search: '?liff.state=%2F%3Ft%3Ddemo'},
    setTimeout, clearTimeout
  };
  runInNewContext(BOOTSTRAP.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''), context);
  assert.equal(await context.window.__sigilPayReady, true);
  assert.equal(supplied.liffId, LIFF_ID);
  assert.equal(context.location.search, '?liff.state=%2F%3Ft%3Ddemo');
});

test('GET serves current Webflow presentation without forwarding token or client credentials', async () => {
  let observed;
  const response = await handle(new Request('https://sigil.mmdbkk.com/sigil/pay?t=secret&liff.access_token=private', {
    headers: {cookie: 'private=yes', authorization: 'Bearer private'}
  }), async (url, options) => {
    observed = {url, options};
    return new Response(page, {headers: {'content-type': 'text/html'}});
  }, identityRewriter);
  assert.equal(response.status, 200);
  assert.equal(observed.url, UPSTREAM);
  assert.deepEqual(observed.options.headers, {accept: 'text/html'});
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await response.text(), /data-sigil-pay-liff/);
});

test('HEAD, unsupported methods, API/renewal routes and upstream failures stay bounded', async () => {
  const upstream = async () => new Response(page, {headers: {'content-type': 'text/html'}});
  const head = await handle(new Request('https://sigil.mmdbkk.com/sigil/pay/', {method: 'HEAD'}), upstream, identityRewriter);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await handle(new Request('https://sigil.mmdbkk.com/sigil/pay', {method:'POST'}))).status, 405);
  for (const path of ['/v1/pay/slip/evidence', '/sigil/pay/renewal', '/sigil/payment']) {
    assert.equal((await handle(new Request('https://sigil.mmdbkk.com' + path))).status, 404);
  }
  assert.equal((await handle(new Request('https://sigil.mmdbkk.com/sigil/pay'), async () => new Response('bad', {status:522}))).status, 503);
  await assert.rejects(readBounded(new Response('x'.repeat(512*1024+1))), /too_large/);
});

test('Cloudflare entrypoint does not interpret env as the fetch dependency', () => {
  assert.equal(worker.fetch.length, 1);
});
