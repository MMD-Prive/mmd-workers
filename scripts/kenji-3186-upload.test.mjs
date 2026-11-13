import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pin, transport, runUpload } from './kenji-3186-upload.mjs';
import { buildCandidate } from './kenji-3186-delta.mjs';

test('upload is confined to the Kenji version endpoint; promotion and settings writes are rejected', async () => {
  const root = '/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/scripts/';
  let calls = 0;
  const call = transport('synthetic', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.cloudflare.com/client/v4' + root + pin.worker + '/versions?bindings_inherit=strict');
    assert.equal(options.redirect, 'error');
    return Response.json({ success: true, result: {} });
  });
  for (const path of [pin.worker + '/deployments', pin.worker + '/script-settings', 'admin-worker/versions?bindings_inherit=strict']) {
    await assert.rejects(call(root + path, 'POST', new FormData()), /outside upload-only/);
  }
  await call(root + pin.worker + '/versions?bindings_inherit=strict', 'POST', new FormData());
  assert.equal(calls, 1);
});

test('approval failure and baseline drift both stop before upload', async () => {
  const save = () => {};
  await assert.rejects(runUpload({ save, approve: async () => { throw Error('owner denied'); }, call: assert.fail }), /owner denied/);
  await assert.rejects(runUpload({ save, approve: async () => {}, call: async (path, method) => {
    assert(path.endsWith('/deployments'));
    assert.equal(method, undefined);
    return { deployments: [{ id: 'drift' }] };
  } }), /drift/);
});

test('changed baseline bytes are rejected before source is read', () => {
  assert.throws(() => buildCandidate(Buffer.from('unreviewed baseline'), assert.fail, pin));
});

test('PR validation is offline; upload requires manual main dispatch and existing Owner environment', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/kenji-3186-upload-only.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/admin-production-approval.yml/);
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /reviewed-operation:\n    if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main' && github.actor == 'mmdprive'/);
  assert.match(workflow, /github.run_attempt == 1/);
});
