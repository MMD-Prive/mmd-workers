import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOT, createTransport, promote, validateCandidate } from './kenji-code-only-promote.mjs';
import { deployRequired } from './kenji-pause-release-scope.mjs';
const baselineId = '11111111-1111-1111-1111-111111111111';
const candidateId = '22222222-2222-2222-2222-222222222222';
const sha = 'a'.repeat(40);
const version = () => ({ annotations: { 'workers/commit_sha': sha }, resources: {
  script: {}, script_runtime: { compatibility_date: '2026-07-02' }, bindings: [
    ...['LINE_AUTO_REPLY_ENABLED', 'LINE_KENJI_MODEL_ENABLED', 'KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED'].map(name => ({ name, type: 'plain_text', text: 'false' })),
    { name: 'SECRET_FIXTURE', type: 'secret_text' },
    { name: 'ADMIN_WORKER', type: 'service', service: 'admin-worker' },
  ],
} });
test('matching configuration and owner-approved source accepted', () => validateCandidate(version(), version(), sha));
test('protected Per AI upload tag and message bind the exact reviewed source', () => {
  const candidate = version();
  candidate.annotations = {
    'workers/message': `Per AI Support source-sha=${sha}`,
    'workers/tag': `per-support-${sha.slice(0, 12)}`,
  };
  validateCandidate(version(), candidate, sha);
  candidate.annotations['workers/tag'] = 'unrelated';
  assert.throws(() => validateCandidate(version(), candidate, sha));
  candidate.annotations['workers/tag'] = `per-support-${sha.slice(0, 12)}`;
  candidate.annotations['workers/commit_sha'] = 'b'.repeat(40);
  assert.throws(() => validateCandidate(version(), candidate, sha));
});
test('ON flags, binding drift and source mismatch block promotion', () => {
  for (let index = 0; index < 3; index++) {
    const candidate = version(); candidate.resources.bindings[index].text = 'true';
    assert.throws(() => validateCandidate(version(), candidate, sha));
  }
  const drift = version(); drift.resources.bindings.pop();
  assert.throws(() => validateCandidate(version(), drift, sha));
  assert.throws(() => validateCandidate(version(), version(), 'b'.repeat(40)));
});
test('transport rejects routes, secrets, uploads and other Workers before any request', async () => {
  let calls = 0;
  const call = createTransport('fixture', async () => { calls++; });
  for (const [path, method] of [[ROOT + '/secrets', 'PUT'], [ROOT + '/versions', 'POST'], ['/zones/fixture/workers/routes', 'POST'], [ROOT.replace('member-dashboard-chat-worker', 'admin-worker') + '/deployments', 'POST']]) {
    await assert.rejects(call(path, method));
  }
  assert.equal(calls, 0);
});
test('one Worker promotion and readback; no retries or side effects', async () => {
  const calls = []; let promoted = false;
  const call = async (path, method = 'GET') => {
    calls.push([path, method]);
    if (method === 'POST') { promoted = true; return { id: 'new-deployment' }; }
    if (path.endsWith('/deployments')) return { deployments: [{ id: promoted ? 'new-deployment' : 'old-deployment', versions: [{ version_id: promoted ? candidateId : baselineId, percentage: 100 }] }] };
    return version();
  };
  const result = await promote({ call, baselineId, candidateId, sourceSha: sha });
  assert.equal(result.version, candidateId);
  assert.deepEqual(calls.filter(([, method]) => method === 'POST'), [[ROOT + '/deployments', 'POST']]);
});
test('baseline or config drift causes zero writes', async () => {
  let writes = 0;
  const call = async (path, method = 'GET') => {
    if (method !== 'GET') writes++;
    if (path.endsWith('/deployments')) return { deployments: [{ id: 'drift', versions: [{ version_id: candidateId, percentage: 100 }] }] };
    return version();
  };
  await assert.rejects(promote({ call, baselineId, candidateId, sourceSha: sha }));
  assert.equal(writes, 0);
});
test('ambiguous promotion failure is not retried', async () => {
  let writes = 0;
  const call = async (path, method = 'GET') => {
    if (method !== 'GET') { writes++; throw new Error('unknown write outcome'); }
    if (path.endsWith('/deployments')) return { deployments: [{ id: 'baseline', versions: [{ version_id: baselineId, percentage: 100 }] }] };
    return version();
  };
  await assert.rejects(promote({ call, baselineId, candidateId, sourceSha: sha }));
  assert.equal(writes, 1);
});
test('Kenji context diff skips broad auto job but mixed runtime changes do not qualify', () => {
  const files = ['member-dashboard-chat-worker/src/kenji-context-followup.mjs', '.github/workflows/deploy-member-dashboard-chat-worker.yml', 'scripts/kenji-pause-release-scope.mjs', '.github/workflows/kenji-code-only-promote.yml'];
  assert.equal(deployRequired('push', files), false);
  assert.equal(deployRequired('push', [...files, 'mms-member-worker/src/index.js']), true);
});
test('manual-only protected workflow has no route sync, uploads, sibling deploy or message smoke', () => {
  const workflow = readFileSync(new URL('../.github/workflows/kenji-code-only-promote.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n  (?:push|pull_request):|wrangler|route_sync|CLOUDFLARE_ROUTES_API_TOKEN|mms-member-worker|secret put|webhook/);
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
});
test('Per AI release uploads under protection and promotes only exact reviewed code', () => {
  const path = '.github/workflows/per-support-code-only-release.yml';
  const workflow = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.equal(deployRequired('push', [
    'member-dashboard-chat-worker/src/kenji-seed-line-runtime.mjs',
    'member-dashboard-chat-worker/test/rich-menu-navigation-webhook.test.mjs',
    path,
    'scripts/kenji-code-only-promote.mjs',
    'scripts/kenji-code-only-promote.test.mjs',
    'scripts/kenji-pause-release-scope.mjs',
  ]), false);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /inputs\.approved_sha == github\.sha/);
  assert.match(workflow, /wrangler@4 versions upload --keep-vars/);
  assert.match(workflow, /node scripts\/kenji-code-only-promote\.mjs/);
  assert.doesNotMatch(workflow, /\n  (?:push|pull_request):|wrangler@4 deploy|route_sync|CLOUDFLARE_ROUTES_API_TOKEN|secret put|mms-member-worker/);
});
