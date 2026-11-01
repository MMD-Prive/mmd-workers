import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { completionOwnerPage } from './src/session-completion-owner-page.js';

test('owner page script compiles, uses textContent, and requires explicit transfer confirmation', async () => {
  const r=completionOwnerPage(), html=await r.text();
  assert.match(r.headers.get('cache-control'),/no-store/);
  assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const source=html.match(/<script>([\s\S]+)<\/script>/)[1];
  new vm.Script(source);
  assert.match(source,/confirm\(/);
  assert.match(source,/textContent/);
  assert.doesNotMatch(source,/innerHTML/);
});
