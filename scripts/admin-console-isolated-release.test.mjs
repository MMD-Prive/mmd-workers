import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BASELINE, CONSOLE_HEAD, RUNTIME_PATHS } from './admin-console-isolated-build.mjs';
import { BASELINE_CI, BASELINE_VERSION, BASELINE_DEPLOYMENT, validateBaselineReceipt,
  validateLiveBaseline, consoleBuildEvidence, verifyPublicConsoleGates } from './admin-console-isolated-release.mjs';

function receipt() {
  const repository = { full_name: BASELINE_CI.repository, id: BASELINE_CI.repositoryId };
  const run = { id: BASELINE_CI.runId, run_attempt: 1, workflow_id: BASELINE_CI.workflowId,
    path: BASELINE_CI.workflowPath, event: 'workflow_dispatch', head_branch: 'main',
    head_sha: BASELINE, status: 'completed', conclusion: 'success', repository, head_repository: repository };
  const steps = ['Check out repository', 'Run tests and source validation', 'Pin Kenji admin shell assets to deploy SHA',
    'Validate Cloudflare version upload', 'Upload admin-worker version', 'Resolve uploaded version ID',
    'Deploy uploaded admin-worker version', 'Require verified live deployment'].map(name => ({ name, conclusion: 'success' }));
  steps.push({ name: 'Apply Durable Object migration with direct deploy', conclusion: 'skipped' });
  const job = { id: BASELINE_CI.jobId, run_id: BASELINE_CI.runId, run_attempt: 1,
    head_sha: BASELINE, name: 'validate-and-deploy', status: 'completed', conclusion: 'success', steps };
  const lines = ['[command]/usr/bin/git log -1 --format=%H', BASELINE, 'node: v22.23.4',
    ' ⛅️ wrangler 4.158.0', 'Pinned Kenji admin shell JS/CSS to ' + BASELINE,
    'Worker Version ID: ' + BASELINE_VERSION,
    'Resolved version ' + BASELINE_VERSION + ' from versions upload output',
    JSON.stringify({ ok: true, worker: 'admin-worker', version: BASELINE_VERSION, deployment: BASELINE_DEPLOYMENT })];
  return { run, job, log: lines.map((line, index) => '2026-11-07T06:25:0' + index + '.000Z ' + line).join('\n') };
}

test('baseline provenance links the exact source, successful protected job, uploaded version and active deployment', () => {
  const evidence = validateBaselineReceipt(receipt());
  assert.equal(evidence.source_sha, BASELINE);
  assert.equal(evidence.version_id, BASELINE_VERSION);
  assert.equal(evidence.deployment_id, BASELINE_DEPLOYMENT);
  assert.equal(evidence.wrangler, '4.158.0');
  assert.equal(evidence.node, 'v22.23.4');
});

test('a successful but different run, changed upload, migration, duplicate record or wrong compiler cannot establish the baseline', () => {
  const mutations = [
    r => { r.run.id++; },
    r => { r.run.head_sha = CONSOLE_HEAD; },
    r => { r.job.run_id++; },
    r => { r.job.steps.at(-1).conclusion = 'success'; },
    r => { r.log = r.log.replace('Worker Version ID: ' + BASELINE_VERSION, 'Worker Version ID: 11111111-1111-4111-8111-111111111111'); },
    r => { r.log += '\n2026-11-07T06:25:09.000Z Worker Version ID: ' + BASELINE_VERSION; },
    r => { r.log = r.log.replace('wrangler 4.158.0', 'wrangler 4.105.0'); },
    r => { r.log = r.log.replace('node: v22.23.4', 'node: v24.0.0'); },
  ];
  for (const mutate of mutations) { const data = receipt(); mutate(data); assert.throws(() => validateBaselineReceipt(data)); }
});

test('release accepts only the observed single-version production baseline and its verified source annotations', () => {
  const version = { id: BASELINE_VERSION, annotations: {
    'workers/message': 'GitHub Actions ' + BASELINE, 'workers/tag': 'gha-' + BASELINE.slice(0, 12),
  } };
  const deployment = { id: BASELINE_DEPLOYMENT, strategy: 'percentage', versions: [{ version_id: BASELINE_VERSION, percentage: 100 }] };
  validateLiveBaseline(version, deployment);
  assert.throws(() => validateLiveBaseline({ ...version, id: '11111111-1111-4111-8111-111111111111' }, deployment));
  assert.throws(() => validateLiveBaseline(version, { ...deployment, versions: [{ version_id: BASELINE_VERSION, percentage: 90 }] }));
  assert.throws(() => validateLiveBaseline({ ...version, annotations: {} }, deployment));
});

test('artifact receipt distinguishes the release SHA from the pinned baseline and Console source without repinning Kenji', () => {
  const urls = ['css', 'js'].map(extension => 'https://models.mmdbkk.com/webflow/internal/admin/kenji/kenji-admin-v1.' + extension
    + '?v=' + BASELINE + '?v=0caeb7176f642fb4866e9bf7687777271fc49f6a');
  const code = Buffer.from('export default ' + JSON.stringify(urls));
  const args = { code, releaseId: '12345.1',
    nodeVersion: 'v22.23.4', wranglerVersion: '4.158.0', buildConfig: { name: 'admin-worker' },
    sourceManifest: { baseline_source_sha: BASELINE, console_source_sha: CONSOLE_HEAD, runtime_paths: [...RUNTIME_PATHS] },
    compiledPreservation: { kenji_asset_urls: urls, baseline_asset_transform: 'reproduce-original-prepend-preserving-existing-tail',
      compiled_before_asset_transform_sha256: 'a'.repeat(64), compiled_after_asset_transform_sha256: createHash('sha256').update(code).digest('hex') } };
  const evidence = consoleBuildEvidence(args);
  assert.equal(evidence.preservation.kenji_shell_asset_pin, BASELINE);
  assert.equal(evidence.preservation.source_configuration_overlaid, false);
  assert.equal(evidence.build_transformations, undefined);
  assert.equal(evidence.artifact.digest.value.length, 64);
  assert.deepEqual(evidence.preservation.kenji_asset_urls, urls);
  assert.throws(() => consoleBuildEvidence({ ...args, code: Buffer.from('changed artifact') }));
  assert.throws(() => consoleBuildEvidence({ ...args, wranglerVersion: '4.105.0' }));
  assert.throws(() => consoleBuildEvidence({ ...args, sourceManifest: { ...args.sourceManifest, runtime_paths: [...RUNTIME_PATHS, 'admin-worker/wrangler.toml'] } }));
});

test('post-release public checks are only GET/HEAD and retain the Console login return on both hosts', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, method: options.method, redirect: options.redirect });
    assert.equal(options.redirect, 'manual');
    if (options.method === 'HEAD') return new Response(null, { status: 401 });
    const parsed = new URL(url);
    const origin = parsed.origin;
    const next = parsed.pathname.replace(/\/$/, '') + parsed.search;
    return new Response(null, { status: 303,
      headers: { location: origin + '/internal/admin/login?next=' + encodeURIComponent(next) } });
  };
  const result = await verifyPublicConsoleGates(request);
  assert.equal(result.length, 6);
  assert.deepEqual(calls.map(call => call.method), Array.from({ length: 6 }, () => ['GET', 'HEAD']).flat());
  assert.ok(calls.every(call => ['/internal/admin/console', '/internal/admin/console/'].includes(new URL(call.url).pathname)));
  await assert.rejects(verifyPublicConsoleGates(async () => new Response('<p>legacy public page</p>')), /signed-out gate/);
});

test('Console workflow retains protected exact-main approval and pins the baseline compiler without broad deploy commands', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-admin-console-isolated.yml', import.meta.url), 'utf8');
  assert.match(workflow, /inputs\.approved_sha == github\.sha/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /inputs\.production_approved == true/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/admin-production-approval\.yml/);
  assert.match(workflow, /needs: \[production-approval, contracts\]/);
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /deploy-admin-worker-production/);
  assert.match(workflow, /node-version: '22\.23\.4'/);
  assert.match(workflow, /wrangler@4\.158\.0/);
  assert.doesNotMatch(workflow, /wrangler (?:deploy|triggers|secret|kv|r2)|deploy-admin-worker-direct-hotfix/);
  assert.match(workflow, /admin-console-isolated-release\.mjs --execute-approved/);
});
