import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import worker from '../src/worker.js';

test('Partner Models serves an empty protected client shell with executable nonce CSP', async () => {
  const r = await worker.fetch(new Request('https://mmdbkk.com/partner/models'), {});
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /no-store/);
  const html = await r.text(), csp = r.headers.get('content-security-policy');
  const nonce = csp.match(/script-src 'nonce-([^']+)'/)[1];
  assert.ok([...html.matchAll(/<script([^>]*)>/g)].every(m => m[1].includes(`nonce="${nonce}"`)));
  assert.doesNotMatch(csp, /sandbox|script-src 'unsafe-inline'/);
  assert.match(html, /Partner Models/);
  assert.match(html, /href="\/partner\/dashboard"/);
  assert.match(html, /id="workspace" hidden/);
  assert.doesNotMatch(html, /ค่ะ|<script src=/);
  assert.match(html, /\/v1\/partner\/model-selections\//);
  assert.match(html, /mmd-shortlist:/);
});

test('Partner Models does not accept lookalike routes, dashboard tokens, or writes', async () => {
  const head = await worker.fetch(new Request('https://mmdbkk.com/partner/models/', {method:'HEAD'}), {});
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const post = await worker.fetch(new Request('https://mmdbkk.com/partner/models', {method:'POST'}), {});
  assert.equal(post.status, 405);
  const other = await worker.fetch(new Request('https://mmdbkk.com/partner/models-other'), {});
  assert.equal(other.status, 404);
  const html = await (await worker.fetch(new Request('https://mmdbkk.com/partner/models?t=dashboard-token'), {})).text();
  assert.doesNotMatch(html, /dashboard-token/);
  const source = await fs.readFile(new URL('../../partners-worker/src/public-index.ts', import.meta.url), 'utf8');
  assert.match(source, /href=\\"\/partner\/models\\">ค้นหาโมเดล/);
});
