import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { handleMmsAdminRequest } from './src/mms-admin-runtime.js';
import { rebuildMmsAdminLv7 } from './src/mms-admin-lv7.js';

test('LV7 production assembly preserves controls and parses every feature script', async () => {
  const env = { ADMIN_BEARER: 'synthetic-lv7-test' };
  const url = 'https://mmdbkk.com/internal/admin/mms';
  const blocked = await handleMmsAdminRequest(new Request(url), env);
  assert.notEqual(blocked.status, 200);
  const response = await handleMmsAdminRequest(new Request(url, {
    headers: { authorization: 'Bearer synthetic-lv7-test' },
  }), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html data-mms-lv7/);
  assert.equal((html.match(/<details class="lv7-tool">/g) || []).length, 2);
  for (const id of ['intakeForm', 'appSearch', 'therSearch', 'preSearch', 'workspaceReload', 'mmsOpsRefresh', 'mmsLoadProgress']) {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  }
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    assert.doesNotThrow(() => new Script(script[1]));
  }
  assert.match(html, /snapshotTask=lv7Track\(call\('\/snapshot'\)\)/);
  assert.match(html, /catalogTask=lv7Track\(call\('\/catalog'\)\)/);
  assert.doesNotMatch(html, /<img class="mms-hero-photo"|<div class="mms-city-band">/);
  assert.equal(rebuildMmsAdminLv7(html), html);
});
