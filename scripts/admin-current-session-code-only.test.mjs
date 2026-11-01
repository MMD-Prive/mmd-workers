import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BASELINE_CI_RECEIPT, baselineSourceEvidence, readBaselineCiGithub, validateBaselineCiReceipt, verifyBaselineSourceForRelease, activeVersion, createBuildEvidence, createTransport, releaseCurrentSession, ROOT, uploadMetadata, validateBundleFiles, validateReceiptLinks, validateSourceState, ZONE } from './admin-current-session-code-only.mjs';

const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const sha = 'a'.repeat(40);
const clone = x => structuredClone(x);
test('bundle allows only the primary module and its local-only source map/readme', () => {
  validateBundleFiles(['admin-login-hero-worker.js', 'admin-login-hero-worker.js.map', 'README.md']);
  for (const files of [[], ['other.js'], ['admin-login-hero-worker.js', 'extra.js'],
    ['admin-login-hero-worker.js', 'asset.wasm'], ['admin-login-hero-worker.js', 'nested']]) {
    assert.throws(() => validateBundleFiles(files));
  }
});
test('source state records the full matching SHA and rejects any dirty path', () => {
  assert.deepEqual(validateSourceState({ expectedSha: sha, headSha: sha, dirtyStatus: '' }),
    { commit_sha: sha, dirty_tree: false, dirty_path_count: 0 });
  assert.throws(() => validateSourceState({ expectedSha: sha, headSha: sha, dirtyStatus: ' M admin-worker/index.js' }), /dirty checkout/);
  assert.throws(() => validateSourceState({ expectedSha: sha, headSha: id(1), dirtyStatus: '' }), /checkout SHA mismatch/);
});
test('build evidence hashes lockfile, generated config and exact uploaded module without source contents', () => {
  const code = new Uint8Array([1, 2, 3]);
  const evidence = createBuildEvidence({ code, releaseId: '1200.1', nodeVersion: 'v22.23.3',
    wranglerVersion: '4.105.0', lockfile: new Uint8Array([4, 5]), wranglerConfig: new Uint8Array([6, 7]) });
  assert.equal(evidence.artifact.digest.value, evidence.artifact.modules[0].digest.value);
  assert.equal(evidence.artifact.modules[0].bytes, 3);
  assert.equal(evidence.artifact.digest.algorithm, 'sha256');
  assert.equal(evidence.lockfile.digest.algorithm, 'sha256');
  assert.equal(evidence.additional_inputs[0].digest.algorithm, 'sha256');
  assert.equal(Object.hasOwn(evidence.artifact.modules[0], 'content'), false);
  assert.throws(() => createBuildEvidence({ code, releaseId: '1200.1', nodeVersion: 'v20.1.0',
    wranglerVersion: '4.105.0', lockfile: new Uint8Array([4]), wranglerConfig: new Uint8Array([5]) }), /unexpected Node.js toolchain/);
});
test('receipt chain rejects missing and mismatched upload/deployment evidence', () => {
  const build = createBuildEvidence({ code: new Uint8Array([1]), releaseId: '1001.1', nodeVersion: 'v22.1.0',
    wranglerVersion: '4.105.0', lockfile: new Uint8Array([2]), wranglerConfig: new Uint8Array([3]) });
  const source = { commit_sha: sha, dirty_tree: false };
  const upload = { release_id: '1001.1', version_id: id(3), recorded_at: '2026-10-21T00:00:00.000Z' };
  const deployment = { deployment_id: id(4), readback_at: '2026-10-21T00:00:01.000Z',
    version_id: id(3), strategy: 'percentage', allocations: [{ version_id: id(3), percentage: 100 }] };
  assert.equal(validateReceiptLinks({ source, build, upload, deployment }), true);
  assert.throws(() => validateReceiptLinks({ source, build, upload: null, deployment }), /upload response version missing/);
  assert.throws(() => validateReceiptLinks({ source, build, upload: { ...upload, release_id: '9999.1' }, deployment }), /does not link to this build/);
  assert.throws(() => validateReceiptLinks({ source, build, upload, deployment: { ...deployment, version_id: id(5) } }), /differs from upload response/);
  assert.throws(() => validateReceiptLinks({ source: { ...source, dirty_tree: true }, build, upload, deployment }), /dirty source/);
});
function fixture(options = {}) {
  const baselineVersion = options.baselineVersion || id(2);
  const baselineDeployment = options.baselineDeployment || id(1);
  const initial = { id: baselineDeployment, strategy: 'percentage', versions: [{ version_id: baselineVersion, percentage: 100 }] };
  const version = { id: baselineVersion, resources: {
    bindings: [{ name: 'MODEL_SESSION_SIGNING_SECRET', type: 'secret_text' },
      { name: 'MODE', type: 'plain_text', text: 'unchanged-fixture' },
      { name: 'DATABASE', type: 'kv_namespace', namespace_id: 'fixture-namespace' }],
    script_runtime: { compatibility_date: '2026-01-01', compatibility_flags: [], migration_tag: 'existing' },
    script: { etag: 'old-code', handlers: ['fetch', 'scheduled'], named_handlers: [] },
  } };
  let uploaded = false, promoted = false, approvals = 0;
  const requests = [], receipts = [];
  const io = {
    sha, expectedVersion: baselineVersion, expectedDeployment: baselineDeployment,
    sourceCheck: async () => { if (options.sourceError) throw new Error('source provenance missing'); return { commit_sha: sha, dirty_tree: false, method: 'fixture' }; },
    buildEvidence: async code => createBuildEvidence({ code, releaseId: '1001.1', nodeVersion: 'v22.1.0',
      wranglerVersion: '4.105.0', lockfile: new Uint8Array([4]), wranglerConfig: new Uint8Array([5]) }),
    now: () => '2026-10-21T00:00:00.000Z',
    approve: async () => { approvals++; if (approvals === options.rejectApproval) throw new Error('approval blocked'); },
    bundle: async () => { if (options.bundleError) throw new Error('bundle error'); return new Uint8Array([1, 2, 3]); },
    save: value => receipts.push(clone(value)),
    call: async (path, init = {}) => {
      const method = init.method || 'GET';
      requests.push({ path, method, body: init.body });
      let result;
      if (path === ROOT + '/versions?bindings_inherit=strict' && method === 'POST') {
        if (options.uploadError) throw new Error('migration or network error; outcome unknown');
        uploaded = true;
        result = { id: id(3) };
      } else if (path === ROOT + '/deployments' && method === 'POST') {
        if (options.promoteError) throw new Error('promotion outcome unknown');
        promoted = true;
        result = { id: id(4) };
      } else if (path === ROOT + '/deployments' || path === ROOT + '/deployments/' + id(4)) {
        const current = promoted ? { ...initial, id: id(4), versions: [{ version_id: id(3), percentage: 100 }] } : initial;
        result = path.endsWith('/deployments') ? { deployments: [clone(current)] } : clone(current);
      } else if (path === ROOT + '/versions') {
        result = { items: (uploaded ? [id(3), baselineVersion] : [baselineVersion]).map(id => ({ id })) };
      } else if (path === ROOT + '/versions/' + baselineVersion) result = clone(version);
      else if (path === ROOT + '/versions/' + id(3)) result = {
        ...clone(version), id: id(3), annotations: { 'workers/commit_sha': sha },
        resources: { ...clone(version.resources), script: { ...clone(version.resources.script), etag: 'new-code' } },
      };
      else if (path.endsWith('/script-settings')) result = { logpush: false, observability: { enabled: true } };
      else if (path.endsWith('/schedules')) result = { schedules: [{ cron: '*/5 * * * *' }] };
      else if (path.endsWith('/subdomain')) result = { enabled: true, previews_enabled: false };
      else if (path === `/zones/${ZONE}/workers/routes`) result = [{ pattern: 'mmdbkk.com/v1/model/session/current*', script: 'admin-worker' }];
      else throw new Error('unexpected request: ' + path);
      return options.alter ? options.alter(clone(result), { path, method, uploaded, promoted, requests }) : result;
    },
  };
  return { io, requests, receipts, version, writes: () => requests.filter(x => x.method === 'POST') };
}

test('happy path: one strict-inherit upload, one exact promotion, GET-only boundary reads', async () => {
  const f = fixture();
  const result = await releaseCurrentSession(f.io);
  assert.equal(result.phase, 'complete');
  assert.deepEqual(f.writes().map(x => x.path), [ROOT + '/versions?bindings_inherit=strict', ROOT + '/deployments']);
  const metadata = JSON.parse(f.writes()[0].body.get('metadata'));
  assert.deepEqual(metadata.bindings, f.version.resources.bindings.map(b => ({ name: b.name, type: 'inherit' })));
  assert.equal(JSON.stringify(metadata).includes('unchanged-fixture'), false);
  assert.deepEqual(JSON.parse(f.writes()[1].body), { strategy: 'percentage', versions: [{ version_id: id(3), percentage: 100 }] });
  assert.equal(f.receipts.some(x => JSON.stringify(x).includes('unchanged-fixture')), false);
  assert.equal(result.deployment, id(4));
  const completedReceipt = f.receipts.find(x => x.phase === 'complete');
  assert.equal(completedReceipt.source_evidence.commit_sha, sha);
  assert.equal(completedReceipt.source_evidence.dirty_tree, false);
  assert.equal(completedReceipt.upload_response.version_id, id(3));
  assert.equal(completedReceipt.deployment_evidence.deployment_id, id(4));
  assert.deepEqual(completedReceipt.deployment_evidence.allocations, [{ version_id: id(3), percentage: 100 }]);
  assert.equal(completedReceipt.build_evidence.artifact.digest.value, completedReceipt.bundle_sha256);
});

test('missing/mismatched build receipt stops before any upload', async () => {
  for (const mode of ['missing', 'mismatch']) {
    const f = fixture();
    if (mode === 'missing') f.io.buildEvidence = undefined;
    else f.io.buildEvidence = async () => ({ release_id: '1001.1', artifact: { digest: { algorithm: 'sha256', value: '0'.repeat(64) } } });
    await assert.rejects(releaseCurrentSession(f.io));
    assert.equal(f.writes().length, 0);
  }
});

for (const [stage, writes] of [[1, 0], [2, 0], [3, 1]]) test(`approval denial at stage ${stage} stops before next mutation`, async () => {
  const f = fixture({ rejectApproval: stage });
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, writes);
});

for (const key of ['expectedVersion', 'expectedDeployment']) test(`wrong ${key} prevents upload`, async () => {
  const f = fixture(); f.io[key] = id(99);
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, 0);
});

for (const [name, options, writes] of [
  ['bundle failure', { bundleError: true }, 0],
  ['source provenance missing', { sourceError: true }, 0],
  ['upload error/migration', { uploadError: true }, 1],
  ['promotion unknown', { promoteError: true }, 2],
]) test(`${name}: never retry, fall back, or automatically roll back`, async () => {
  const f = fixture(options);
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, writes);
  assert.equal(f.receipts.at(-1).phase, 'stopped');
});

for (const [name, change] of [
  ['binding', x => { x.resources.bindings[1].text = 'changed'; }],
  ['secret name', x => { x.resources.bindings[0].name = 'OTHER_SECRET'; }],
  ['runtime', x => { x.resources.script_runtime.compatibility_date = '2026-02-01'; }],
  ['migration tag', x => { x.resources.script_runtime.migration_tag = 'new'; }],
  ['handlers', x => { x.resources.script.handlers = ['fetch']; }],
  ['source', x => { x.annotations['workers/commit_sha'] = 'b'.repeat(40); }],
]) test(`uploaded ${name} mismatch blocks promotion`, async () => {
  const f = fixture({ alter(x, context) { if (context.path === ROOT + '/versions/' + id(3)) change(x); return x; } });
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, 1);
});

for (const path of ['/script-settings', '/schedules', '/subdomain', 'workers/routes', '/versions', '/deployments']) {
  test(`${path} drift after upload blocks promotion`, async () => {
    const f = fixture({ alter(x, context) {
      if (context.uploaded && !context.promoted && context.method === 'GET' && context.path.endsWith(path)) {
        if (path === '/versions') x.items[0].id = id(99);
        else if (path === '/deployments') x.deployments[0].id = id(99);
        else if (Array.isArray(x)) x.push({ pattern: 'changed', script: 'other-worker' });
        else x.drift = true;
        if (path === '/schedules') x.schedules.push({ cron: '* * * * *' });
      }
      return x;
    } });
    await assert.rejects(releaseCurrentSession(f.io));
    assert.equal(f.writes().length, 1);
  });
}

test('inactive latest version prevents inheritance from the wrong configuration', async () => {
  const f = fixture({ alter(x, c) { if (c.path === ROOT + '/versions') x.items[0].id = id(99); return x; } });
  await assert.rejects(releaseCurrentSession(f.io)); assert.equal(f.writes().length, 0);
});

test('post-promotion drift is reported without automatic recovery mutation', async () => {
  const f = fixture({ alter(x, c) { if (c.promoted && c.path.endsWith('/subdomain')) x.enabled = false; return x; } });
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(f.writes().length, 2);
  assert.equal(f.receipts.at(-1).stopped_after, 'promotion-attempted-outcome-unknown');
});

test('split/unknown allocation, duplicate bindings, and unknown runtime fail closed', () => {
  const f = fixture();
  assert.throws(() => activeVersion({ id: id(1), strategy: 'percentage', versions: [] }));
  f.version.resources.bindings.push(f.version.resources.bindings[0]);
  assert.throws(() => uploadMetadata(f.version, sha));
  const other = fixture().version; other.resources.script_runtime.unknown = true;
  assert.throws(() => uploadMetadata(other, sha));
});

for (const [method, path] of [
  ['PUT', ROOT], ['PATCH', ROOT + '/settings'], ['POST', ROOT + '/schedules'],
  ['POST', `/zones/${ZONE}/workers/routes`], ['POST', ROOT + '/secrets'],
  ['DELETE', ROOT + '/versions/' + id(3)], ['POST', ROOT + '/versions'],
  ['GET', ROOT.replace('admin-worker', 'payments-worker') + '/settings'],
  ['POST', 'https://outside.example/path'],
]) test(`transport rejects ${method} ${path} before fetch`, async () => {
  let calls = 0;
  const request = createTransport('fixture', async () => { calls++; });
  await assert.rejects(request(path, { method })); assert.equal(calls, 0);
});

test('transport never retries or exposes upstream bodies', async () => {
  let calls = 0;
  const request = createTransport('fixture', async (_, options) => {
    calls++; assert.equal(options.redirect, 'error');
    return { ok: false, status: 400, json: async () => ({ success: false, errors: ['private-upstream'] }) };
  });
  await assert.rejects(request(ROOT + '/versions?bindings_inherit=strict', { method: 'POST', body: new FormData() }),
    error => !error.message.includes('private-upstream'));
  assert.equal(calls, 1);
});

test('workflow is manual, exact-SHA, independently protected, and not the broad deployment path', () => {
  const source = readFileSync(new URL('../.github/workflows/deploy-admin-current-session-code-only.yml', import.meta.url), 'utf8');
  assert.match(source, /^  workflow_dispatch:/m);
  assert.doesNotMatch(source, /^  (push|pull_request|schedule|workflow_run):/m);
  assert.match(source, /default: false/);
  assert.match(source, /actions: read/);
  assert.equal((source.match(/inputs.approved_sha == github.sha/g) || []).length, 2);
  assert.match(source, /needs: \[production-approval\]\n    environment: mmd-production-mutation/);
  assert.match(source, /EXPECTED_VERSION: \$\{\{ inputs.expected_version \}\}/);
  assert.match(source, /EXPECTED_DEPLOYMENT: \$\{\{ inputs.expected_deployment \}\}/);
  assert.doesNotMatch(source, /ensure-private|ensure-payment|ensure.*routes|wrangler deploy|wrangler secret|secrets: inherit|--var|--keep-vars/);
  assert.equal((source.match(/secrets\./g) || []).length, 1);
  assert.match(source, /node scripts\/admin-current-session-code-only.mjs --execute-approved/);
  assert.match(source, /current-session-code-only-receipt-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(source, /retention-days: 90/);
});

// Synthetic records exercise the verifier; these are NOT historical CI receipts.
const ci = BASELINE_CI_RECEIPT;
function ciFixture() {
  const version = { id: ci.versionId };
  const deployment = { id: ci.deploymentId, strategy: 'percentage', versions: [{ version_id: ci.versionId, percentage: 100 }] };
  const run = { id: ci.runId, run_attempt: 1, workflow_id: ci.workflowId, path: ci.workflowPath,
    event: 'workflow_dispatch', head_branch: 'main', head_sha: ci.sourceSha, status: 'completed', conclusion: 'success',
    repository: { id: ci.repositoryId, full_name: ci.repository }, head_repository: { id: ci.repositoryId, full_name: ci.repository } };
  const job = { id: ci.jobId, run_id: ci.runId, run_attempt: 1, head_sha: ci.sourceSha,
    name: ci.jobName, status: 'completed', conclusion: 'success', steps: [
      'Check out repository', 'Run tests and source validation', 'Pin Kenji admin shell assets to deploy SHA',
      'Validate Cloudflare version upload', 'Upload admin-worker version', 'Resolve uploaded version ID',
      'Deploy uploaded admin-worker version', 'Require verified live deployment',
    ].map(name => ({ name, conclusion: 'success' })).concat({ name: 'Apply Durable Object migration with direct deploy', conclusion: 'skipped' }) };
  const lines = [
    '[command]/usr/bin/git log -1 --format=%H', ci.sourceSha,
    `Pinned Kenji admin shell JS/CSS to ${ci.sourceSha}`,
    `Worker Version ID: ${ci.versionId}`,
    `Resolved version ${ci.versionId} from versions upload output`,
    JSON.stringify({ ok: true, worker: 'admin-worker', version: ci.versionId, deployment: ci.deploymentId }),
  ];
  const log = lines.map((line, i) => `2026-11-01T10:13:0${i}.000Z ${line}`).join('\n');
  const data = { version, deployment, run, job, log };
  const reads = [];
  const readGithub = async path => {
    reads.push(path);
    if (path === `repos/${ci.repository}/actions/runs/${ci.runId}`) return data.run;
    if (path === `repos/${ci.repository}/actions/jobs/${ci.jobId}`) return data.job;
    if (path === `repos/${ci.repository}/actions/jobs/${ci.jobId}/logs`) return data.log;
    throw new Error('unexpected fixture endpoint');
  };
  return { data, reads, readGithub };
}

test('audited CI receipt links exact run/attempt/job, checkout, build pin, upload and active deployment', async () => {
  const f = ciFixture();
  const evidence = await baselineSourceEvidence(f.data.version, f.data.deployment, f.readGithub);
  assert.equal(evidence.method, 'audited-github-ci-receipt');
  assert.equal(evidence.baseline_source_sha, ci.sourceSha);
  assert.equal(evidence.baseline_ci.version_id, ci.versionId);
  assert.equal(evidence.baseline_ci.deployment_id, ci.deploymentId);
  assert.equal(evidence.baseline_ci.artifact_digest_verified, false);
  assert.equal(f.reads.length, 3);
  assert.equal(JSON.stringify(evidence).includes('Worker Version ID:'), false, 'never retain raw log content');
});

for (const [name, mutate] of [
  ['wrong version', d => { d.version.id = id(99); }],
  ['wrong deployment', d => { d.deployment.id = id(99); }],
  ['wrong allocation', d => { d.deployment.versions[0].version_id = id(99); }],
  ['split traffic', d => { d.deployment.versions[0].percentage = 50; }],
  ['wrong repository', d => { d.run.repository.full_name = 'other/repo'; }],
  ['wrong repository ID', d => { d.run.repository.id++; }],
  ['fork', d => { d.run.head_repository.id++; }],
  ['wrong run', d => { d.run.id++; }],
  ['rerun attempt', d => { d.run.run_attempt++; }],
  ['wrong workflow', d => { d.run.workflow_id++; }],
  ['wrong workflow path', d => { d.run.path = 'another.yml'; }],
  ['automatic event', d => { d.run.event = 'push'; }],
  ['wrong branch', d => { d.run.head_branch = 'feature'; }],
  ['wrong source', d => { d.run.head_sha = sha; }],
  ['run incomplete', d => { d.run.status = 'in_progress'; }],
  ['run failed', d => { d.run.conclusion = 'failure'; }],
  ['wrong job', d => { d.job.id++; }],
  ['wrong job run', d => { d.job.run_id++; }],
  ['wrong job attempt', d => { d.job.run_attempt++; }],
  ['wrong job source', d => { d.job.head_sha = sha; }],
  ['wrong job name', d => { d.job.name = 'test'; }],
  ['job incomplete', d => { d.job.status = 'in_progress'; }],
  ['job failed', d => { d.job.conclusion = 'failure'; }],
  ['critical step absent', d => { d.job.steps.shift(); }],
  ['critical step failed', d => { d.job.steps[0].conclusion = 'failure'; }],
  ['migration fallback', d => { d.job.steps.at(-1).conclusion = 'success'; }],
  ['missing logs', d => { d.log = ''; }],
  ['oversized logs', d => { d.log = 'x'.repeat(2 * 1024 * 1024 + 1); }],
  ['checkout mismatch', d => { d.log = d.log.replace(`Z ${ci.sourceSha}`, `Z ${sha}`); }],
  ['wrong build pin', d => { d.log = d.log.replace(`JS/CSS to ${ci.sourceSha}`, `JS/CSS to ${sha}`); }],
  ['wrong upload', d => { d.log = d.log.replace(`Worker Version ID: ${ci.versionId}`, `Worker Version ID: ${id(99)}`); }],
  ['wrong resolved version', d => { d.log = d.log.replace(`Resolved version ${ci.versionId}`, `Resolved version ${id(99)}`); }],
  ['wrong promotion', d => { d.log = d.log.replace(`"deployment":"${ci.deploymentId}"`, `"deployment":"${id(99)}"`); }],
  ['duplicate receipt', d => { d.log += '\n' + d.log.split('\n').at(-1); }],
  ['upload record missing', d => { d.log = d.log.split('\n').filter(l => !l.includes('Worker Version ID:')).join('\n'); }],
  ['comment is not receipt', d => { d.log = d.log.replace('Worker Version ID:', '# Worker Version ID:'); }],
  ['temporal correlation only', d => { d.log = `2026-11-01T10:13:00.000Z ${ci.sourceSha} ${ci.versionId} ${ci.deploymentId}`; }],
  ['reordered receipts', d => { d.log = d.log.split('\n').reverse().join('\n'); }],
]) test(`CI baseline ${name}: reject before build or upload`, async () => {
  const c = ciFixture(); mutate(c.data);
  assert.throws(() => validateBaselineCiReceipt(c.data));
  const f = fixture({ baselineVersion: ci.versionId, baselineDeployment: ci.deploymentId });
  let builds = 0; f.io.bundle = async () => { builds++; return new Uint8Array([1]); };
  f.io.sourceCheck = (version, deployment) => baselineSourceEvidence(version, deployment, c.readGithub);
  // Feed mismatched baseline observations too, rather than substituting a fixture's valid pair.
  if (['wrong version', 'wrong deployment', 'wrong allocation', 'split traffic'].includes(name)) {
    f.io.sourceCheck = () => baselineSourceEvidence(c.data.version, c.data.deployment, c.readGithub);
  }
  await assert.rejects(releaseCurrentSession(f.io));
  assert.equal(builds, 0); assert.equal(f.writes().length, 0);
});

test('annotation path remains strict; unknown unannotated baseline never reads CI', async () => {
  let reads = 0; const read = async () => { reads++; throw Error('unexpected'); };
  assert.deepEqual(await baselineSourceEvidence({ annotations: { 'workers/commit_sha': sha } }, {}, read),
    { method: 'version-commit-annotation', baseline_source_sha: sha });
  await assert.rejects(baselineSourceEvidence({ id: id(99) }, {}, read));
  await assert.rejects(baselineSourceEvidence({ annotations: { 'workers/commit_sha': '' } }, {}, read));
  assert.equal(reads, 0);
});

test('receipt-read failure never falls back or leaks upstream errors', async () => {
  const c = ciFixture(); const f = fixture({ baselineVersion: ci.versionId, baselineDeployment: ci.deploymentId });
  let reads = 0;
  f.io.sourceCheck = (version, deployment) => baselineSourceEvidence(version, deployment, async () => { reads++; throw Error('fixture unavailable'); });
  await assert.rejects(releaseCurrentSession(f.io)); assert.equal(reads, 1); assert.equal(f.writes().length, 0);
  assert.throws(() => readBaselineCiGithub('repos/other/repo/actions/jobs/1/logs'), /unapproved baseline receipt endpoint/);
});

test('CI receipt path still requires clean exact source, ancestry and unchanged source configuration', async () => {
  for (const mode of ['ok', 'dirty', 'wrong-candidate', 'unrelated', 'changed-config']) {
    const c = ciFixture(), calls = [];
    const git = (...args) => { calls.push(args); if (mode === 'unrelated' && args[0] === 'merge-base') throw Error('not ancestor');
      return args[0] === 'diff' && mode === 'changed-config' ? 'configuration changed' : ''; };
    const run = () => verifyBaselineSourceForRelease({ version: c.data.version, deployment: c.data.deployment,
      sourceState: { commit_sha: mode === 'wrong-candidate' ? 'b'.repeat(40) : sha, dirty_tree: mode === 'dirty' },
      sha, git, readGithub: c.readGithub });
    if (mode === 'ok') {
      const evidence = await run(); assert.equal(evidence.method, 'audited-github-ci-receipt');
      assert.deepEqual(calls, [['merge-base', '--is-ancestor', ci.sourceSha, sha], ['diff', ci.sourceSha, sha, '--', 'admin-worker/wrangler.toml']]);
    } else await assert.rejects(run());
  }
});

test('verified CI baseline retains complete new artifact/upload/deployment receipts and every approval gate', async () => {
  const c = ciFixture(); const f = fixture({ baselineVersion: ci.versionId, baselineDeployment: ci.deploymentId });
  f.io.sourceCheck = async (version, deployment) => ({ commit_sha: sha, dirty_tree: false,
    ...await baselineSourceEvidence(version, deployment, c.readGithub) });
  const result = await releaseCurrentSession(f.io);
  assert.equal(result.phase, 'complete'); assert.equal(result.source_evidence.baseline_ci.artifact_digest_verified, false);
  assert.equal(result.build_evidence.artifact.digest.algorithm, 'sha256');
  assert.equal(f.writes().length, 2);
  assert.equal(result.upload_response.version_id, result.deployment_evidence.version_id);
  assert.equal(JSON.stringify(result).includes('Worker Version ID:'), false);
  for (const rejectApproval of [1, 2, 3]) {
    const f = fixture({ baselineVersion: ci.versionId, baselineDeployment: ci.deploymentId, rejectApproval });
    f.io.sourceCheck = async (version, deployment) => ({ commit_sha: sha, dirty_tree: false,
      ...await baselineSourceEvidence(version, deployment, c.readGithub) });
    await assert.rejects(releaseCurrentSession(f.io));
    assert.equal(f.writes().length, rejectApproval === 3 ? 1 : 0);
  }
});

test('receipt reader permits only three GET endpoints, captures logs in memory and sanitizes failures', () => {
  const previous = process.env.GH_TOKEN;
  try {
    process.env.GH_TOKEN = 'fixture-token-not-a-secret';
    for (const path of [`repos/${ci.repository}/actions/runs/${ci.runId}`,
      `repos/${ci.repository}/actions/jobs/${ci.jobId}`, `repos/${ci.repository}/actions/jobs/${ci.jobId}/logs`]) {
      const raw = path.endsWith('/logs');
      const output = readBaselineCiGithub(path, (command, args, options) => {
        assert.equal(command, 'gh');
        assert.deepEqual(args, ['api', '--hostname', 'github.com', '--method', 'GET',
          ...(raw ? ['--allow-escape-sequences'] : []), path]);
        assert.deepEqual(options.stdio, ['ignore', 'pipe', 'ignore']);
        assert.equal(options.env.GH_DEBUG, '');
        return raw ? 'fixture raw log' : '{"id":1}';
      });
      assert.deepEqual(output, raw ? 'fixture raw log' : {id:1});
    }
    assert.throws(() => readBaselineCiGithub(`repos/${ci.repository}/actions/jobs/${ci.jobId}/logs`,
      () => { throw Error('private-upstream-body'); }), error => !error.message.includes('private-upstream-body'));
    assert.throws(() => readBaselineCiGithub(`repos/${ci.repository}/actions/runs/${ci.runId}`, () => 'invalid private-body'),
      error => !error.message.includes('private-body'));
    for (const path of ['https://outside.invalid', `repos/${ci.repository}/actions/runs/1`, `${ci.jobId}/rerun`]) {
      let called = false;
      assert.throws(() => readBaselineCiGithub(path, () => {called=true;}), /unapproved baseline receipt endpoint/);
      assert.equal(called, false);
    }
    delete process.env.GH_TOKEN;
    assert.throws(() => readBaselineCiGithub(`repos/${ci.repository}/actions/runs/${ci.runId}`), /credential required/);
  } finally {
    if (previous === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = previous;
  }
});

test('unexpected data in a receipt never appears in a verifier error or output evidence', () => {
  const f = ciFixture();
  f.data.log = f.data.log.replace(`"deployment":"${ci.deploymentId}"`, `"deployment":"${ci.deploymentId}","payload":"private-marker"`);
  assert.throws(() => validateBaselineCiReceipt(f.data), error => !error.message.includes('private-marker'));
});
