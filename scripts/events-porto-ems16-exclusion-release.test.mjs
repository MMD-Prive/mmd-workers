import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { REVIEWED_RELEASE_POLICY, REQUIRED_CI, validateDispatchReadiness, verifyCurrentMainCi,
  validateQuietSchedule, readActiveModule, testCombinedCandidate, withCombinedBoundary, readProductionBoundary, verifyProductionBoundary, verifyCurrentMainRef, verifyCurrentDispatchRun } from './events-porto-ems16-exclusion-release.mjs';
import { ROOT, ACCOUNT, ZONE } from './events-rotation-release-transport.mjs';
import { PINS } from '../release/events-porto-ems16-exclusion/build-candidate.mjs';

globalThis.fetch = () => { throw new Error('Network forbidden in combined release contracts'); };
const sha = 'a'.repeat(40);
const env = { GITHUB_REPOSITORY: 'MMD-Prive/mmd-workers', GITHUB_SHA: sha, APPROVED_SHA: sha,
  GITHUB_RUN_ID: '200', GITHUB_RUN_ATTEMPT: '2', GH_TOKEN: 'synthetic-read-token' };
const run = (id, path, event, extra = {}) => ({ id, path, event, head_sha: sha, head_branch: 'main',
  head_repository: { full_name: env.GITHUB_REPOSITORY }, run_attempt: id === 200 ? 2 : 1, status: 'completed', conclusion: 'success', ...extra });
function githubFixture(change = () => {}) {
  const node = run(100, '.github/workflows/node.js.yml', 'push');
  const scoped = run(200, '.github/workflows/deploy-events-porto-ems16-exclusion-code-only.yml', 'workflow_dispatch', { status: 'in_progress', conclusion: null });
  const nodeJobs = REQUIRED_CI.map((name, i) => ({ id: i + 1, run_id: 100, head_sha: sha, name, status: 'completed', conclusion: 'success' }));
  const scopedJobs = [{ id: 4, run_id: 200, head_sha: sha, name: 'contracts', status: 'completed', conclusion: 'success' }];
  const state = { node, scoped, nodeJobs, scopedJobs, listed: [node, scoped], main: sha, requests: [], mainReads: 0 };
  change(state);
  const request = async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    const path = url.replace('https://api.github.com/repos/MMD-Prive/mmd-workers', '');
    state.requests.push(path);
    let value;
    if (path === '/git/ref/heads/main') { state.mainReads++; value = { object: { sha: state.mainReads > 1 && state.lateMain ? state.lateMain : state.main } }; }
    else if (path.startsWith('/actions/runs?head_sha=')) value = { total_count: state.listed.length, workflow_runs: state.listed };
    else if (path === '/actions/runs/100') value = state.node;
    else if (path === '/actions/runs/200') value = state.scoped;
    else if (path === '/actions/runs/100/attempts/1/jobs?per_page=100&page=1') value = { total_count: state.nodeJobs.length, jobs: state.nodeJobs };
    else if (path === '/actions/runs/200/attempts/2/jobs?per_page=100&page=1') {
      value = { total_count: state.scopedJobs.length, jobs: state.scopedJobs };
      if (state.cancelAfterJobs) { state.scoped.status = 'completed'; state.scoped.conclusion = 'cancelled'; }
    }
    else assert.fail('unapproved/missing fixture endpoint: ' + path);
    return { status: state.denied ? 403 : 200, json: async () => structuredClone(value) };
  };
  return { state, request };
}

test('source review is deliberately disabled for dispatch, regardless of inputs or environment override', () => {
  assert.equal(REVIEWED_RELEASE_POLICY, null);
  assert.throws(() => validateDispatchReadiness({ ...env, RELEASE_POLICY: '{}', PRODUCTION_APPROVED: 'true', APPROVAL_REF: 'old-porto-reference' }), /Release disabled/);
});

test('synthetic reviewed readiness policy validates exact new target; no fixture is a real release authorization', () => {
  const synthetic = { schema: 'porto_ems16_release_policy_v1', account_id: ACCOUNT, bucket: 'mmd-hype-compcard-state',
    source_sha256: PINS.baseline_sha256, candidate_sha256: PINS.candidate_sha256, manifest_sha256: PINS.manifest_sha256,
    authorization_ref: 'synthetic-combined-authorization-not-real', round_date: '2099-01-01',
    window: { start: '2099-01-01T14:45:00Z', end: '2099-01-01T16:45:00Z' },
    chat_ids: { premium: '-100111', standard: '-100222', preview: '-100333' },
    promotion_enabled: false, promotion_disabled_at: '2099-01-01T00:00:00Z', historical_promotion_objects: [],
    in_flight: { source_sha256: PINS.baseline_sha256, entrypoint_review_sha256: 'b'.repeat(64), runtime_bound_review_sha256: 'c'.repeat(64),
      coverage: 'all_potentially_running_versions_entrypoints_retries_background_and_downstream_producers',
      entrypoint_inventory: ['scheduled', 'http', 'internal', 'background', 'other'].map(kind => ({ kind, entrypoint: kind, send_capable: kind === 'scheduled', state_write_capable: kind === 'scheduled' })),
      producer_entrypoints: ['scheduled'], last_possible_producer_start: '2099-01-01T14:00:00Z', max_producer_activity_ms: 1234,
      clock_skew_ms: 12, no_new_producer_start_before: '2099-01-01T16:45:00Z' } };
  const inputs = { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', PRODUCTION_APPROVED: 'true',
    APPROVAL_REF: synthetic.authorization_ref, EXPECTED_VERSION: PINS.expected_version, EXPECTED_DEPLOYMENT: PINS.expected_deployment };
  const now = Date.parse('2099-01-01T15:00:00Z');
  assert.equal(validateDispatchReadiness(inputs, synthetic, now).manifest.candidate_sha256, PINS.candidate_sha256);
  for (const change of [{ APPROVAL_REF: 'prior-Porto-only-request' }, { APPROVED_SHA: 'b'.repeat(40) }, { EXPECTED_VERSION: 'changed' },
    { EXPECTED_DEPLOYMENT: 'changed' }, { GITHUB_REF: 'refs/heads/feature' }, { PRODUCTION_APPROVED: 'false' }]) {
    assert.throws(() => validateDispatchReadiness({ ...inputs, ...change }, synthetic, now));
  }
  for (const field of ['source_sha256', 'candidate_sha256', 'manifest_sha256']) assert.throws(() => validateDispatchReadiness(inputs, { ...synthetic, [field]: 'f'.repeat(64) }, now));
});

for (const command of ['--check-dispatch-readiness', '--execute-approved']) {
  test(`${command} stops without tokens, protected approval or production I/O while policy is absent`, () => {
    const result = spawnSync(process.execPath, ['scripts/events-porto-ems16-exclusion-release.mjs', command], { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 10000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /Release disabled.*authorization\/window\/runtime-horizon/);
    assert.doesNotMatch(result.stderr, /credential required|token required|fetch|Cloudflare.*failed/);
  });
}

test('current main and exact-SHA Node/scoped contracts use only existing Actions read APIs', async () => {
  const f = githubFixture(); const result = await verifyCurrentMainCi(env, f.request);
  assert.equal(result.source_sha, sha); assert.equal(result.node_run_id, 100); assert.equal(result.scoped_attempt, 2);
  assert.deepEqual(result.node_jobs.map(row => row.name), REQUIRED_CI); assert.equal(result.scoped_jobs[0].name, 'contracts');
  assert.equal(f.state.mainReads, 2);
  assert.ok(f.state.requests.every(path => path === '/git/ref/heads/main' || path.startsWith('/actions/runs')));
  assert.ok(f.state.requests.every(path => !path.includes('check-runs')));
});

for (const [label, mutate] of [
  ['stale main', s => { s.main = 'b'.repeat(40); }],
  ['main advances during read', s => { s.lateMain = 'b'.repeat(40); }],
  ['required build missing', s => { s.nodeJobs.pop(); }],
  ['required build pending', s => { s.nodeJobs[0].status = 'in_progress'; }],
  ['required build failed', s => { s.nodeJobs[0].conclusion = 'failure'; }],
  ['required build wrong SHA', s => { s.nodeJobs[0].head_sha = 'b'.repeat(40); }],
  ['ambiguous build', s => { s.nodeJobs.push({ ...s.nodeJobs[0], id: 5 }); }],
  ['wrong repository', s => { s.node.head_repository.full_name = 'other/repo'; }],
  ['PR-only evidence', s => { s.node.event = 'pull_request'; }],
  ['failed latest Node run', s => { s.node.conclusion = 'failure'; }],
  ['current dispatch cancelled', s => { s.scoped.status = 'completed'; s.scoped.conclusion = 'cancelled'; }],
  ['current dispatch no longer running', s => { s.scoped.status = 'waiting'; }],
  ['dispatch cancelled after contracts read', s => { s.cancelAfterJobs = true; }],
  ['scoped contracts missing', s => { s.scopedJobs = []; }],
  ['scoped contracts failed', s => { s.scopedJobs[0].conclusion = 'failure'; }],
  ['scoped attempt stale', s => { s.scoped.run_attempt = 1; }],
  ['scoped run wrong SHA', s => { s.scoped.head_sha = 'b'.repeat(40); }],
  ['duplicate run evidence', s => { s.listed.push(s.node); }],
  ['permission denied', s => { s.denied = true; }],
]) test('CI preflight rejects ' + label, async () => { const f = githubFixture(mutate); await assert.rejects(verifyCurrentMainCi(env, f.request)); });

const schedule = () => ({ resources: { bindings: Object.entries({ HYPE_COMPCARD_ENABLED: 'true', HYPE_STANDARD_ENABLED: 'true', HYPE_INTAKE_ENABLED: 'true', HYPE_PROMOTION_ENABLED: 'false', HYPE_COMPCARD_SEND_AT_ICT: '16:30', HYPE_STANDARD_SEND_AT_ICT: '20:00', HYPE_PROMOTION_SEND_AT_ICT: '20:00', HYPE_CADENCE_START_DATE: '2026-10-23', HYPE_PROMOTION_WEEKDAYS: '2,5' }).map(([name, text]) => ({ name, type: 'plain_text', text })) } });
test('all reviewed flags/times and cron must remain unchanged, especially Promotion OFF', () => {
  const cron = { schedules: [{ cron: '*/15 * * * *' }] }; validateQuietSchedule(schedule(), cron);
  for (const name of schedule().resources.bindings.map(row => row.name)) {
    const v = schedule(); v.resources.bindings.find(row => row.name === name).text += 'changed'; assert.throws(() => validateQuietSchedule(v, cron));
  }
  const duplicate = schedule(); duplicate.resources.bindings.push(duplicate.resources.bindings[0]); assert.throws(() => validateQuietSchedule(duplicate, cron));
  assert.throws(() => validateQuietSchedule(schedule(), { schedules: [{ cron: '* * * * *' }] }));
});

test('active module read is exact-name single-module GET only', async () => {
  const request = async (url, init) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4' + ROOT + '/content/v2'); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    const form = new FormData(); form.set('model-eta-wrapper.js', new Blob(['synthetic-module']), 'model-eta-wrapper.js');
    return { status: 200, formData: async () => form };
  };
  assert.equal(await readActiveModule('synthetic', 'model-eta-wrapper.js', request), 'synthetic-module');
  await assert.rejects(readActiveModule('synthetic', 'wrong.js', request));
  await assert.rejects(readActiveModule('synthetic', 'worker.js', request));
  await assert.rejects(readActiveModule('synthetic', 'model-eta-wrapper.js', async () => ({ status: 403 })));
});

// Synthetic dates are test data, not a proposed/approved release window.
const policy = { round_date: '2030-01-02', window: { start: '2030-01-02T14:45:00Z', end: '2030-01-02T16:45:00Z' } };
const start = Date.parse(policy.window.start), end = Date.parse(policy.window.end);
for (const path of [ROOT + '/versions?bindings_inherit=strict', ROOT + '/deployments']) {
  test('every ' + path.split('/').at(-1) + ' POST rechecks state and clock', async () => {
    const calls = []; const wrapped = withCombinedBoundary(async () => calls.push('post'), async () => calls.push('verify'), policy, async () => calls.push('final'), () => start);
    await wrapped(path, { method: 'POST' }); assert.deepEqual(calls, ['verify', 'final', 'post']);
    let now = start;
    const expired = withCombinedBoundary(async () => calls.push('unexpected'), async () => { now = end; }, policy, async () => {}, () => now);
    await assert.rejects(expired(path, { method: 'POST' }), /outside reviewed/); assert.ok(!calls.includes('unexpected'));
    const drift = withCombinedBoundary(async () => calls.push('unexpected'), async () => { throw new Error('state drift'); }, policy, async () => {}, () => start);
    await assert.rejects(drift(path, { method: 'POST' }), /state drift/); assert.ok(!calls.includes('unexpected'));
  });
}
test('unapproved POST rejected and GET never mutates state', async () => {
  let checks = 0, calls = 0;
  const wrapped = withCombinedBoundary(async () => ++calls, async () => ++checks, policy, async () => {}, () => start);
  assert.equal(await wrapped(ROOT + '/versions'), 1); assert.equal(checks, 0);
  await assert.rejects(wrapped(ROOT + '/settings', { method: 'POST' })); assert.equal(calls, 1);
});

function productionFixture() {
  const state = { deployment: { id: PINS.expected_deployment, strategy: 'percentage', versions: [{ version_id: PINS.expected_version, percentage: 100 }] },
    latest: PINS.expected_version, settings: { logpush: false }, routes: [{ id: 'synthetic-route', pattern: 'example.invalid/*' }],
    schedules: [{ cron: '*/15 * * * *' }], subdomain: { enabled: true }, posts: 0 };
  const transport = async (path, init) => {
    if (init?.method === 'POST') { state.posts++; return {}; }
    const values = { [ROOT + '/deployments']: { deployments: [state.deployment] }, [ROOT + '/versions']: { items: [{ id: state.latest }] },
      [ROOT + '/script-settings']: state.settings, [`/zones/${ZONE}/workers/routes`]: state.routes,
      [ROOT + '/schedules']: { schedules: state.schedules }, [ROOT + '/subdomain']: state.subdomain };
    assert.ok(Object.hasOwn(values, path)); return structuredClone(values[path]);
  };
  return { state, transport };
}
for (const [label, mutate] of [
  ['latest upload', s => { s.latest = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; }],
  ['active deployment', s => { s.deployment.id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; }],
  ['settings', s => { s.settings.logpush = true; }],
  ['routes', s => { s.routes[0].pattern = 'different.invalid/*'; }],
  ['cron', s => { s.schedules[0].cron = '* * * * *'; }],
  ['subdomain', s => { s.subdomain.enabled = false; }],
]) test('final boundary prevents POST when ' + label + ' changes during long state read', async () => {
  const f = productionFixture(); const pinned = await readProductionBoundary(f.transport);
  const wrapped = withCombinedBoundary(f.transport, async () => mutate(f.state), policy,
    () => verifyProductionBoundary(f.transport, pinned, PINS.expected_version), () => start);
  await assert.rejects(wrapped(ROOT + '/versions?bindings_inherit=strict', { method: 'POST' })); assert.equal(f.state.posts, 0);
});
test('pre-promotion final boundary permits only the exact uploaded ID and unchanged original deployment/configuration', async () => {
  const f = productionFixture(); const pinned = await readProductionBoundary(f.transport);
  const uploaded = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; f.state.latest = uploaded;
  await verifyProductionBoundary(f.transport, pinned, uploaded);
  await assert.rejects(verifyProductionBoundary(f.transport, pinned, PINS.expected_version));
  f.state.deployment.versions[0].version_id = uploaded;
  await assert.rejects(verifyProductionBoundary(f.transport, pinned, uploaded));
});
test('final current-main read prevents POST when main changes during state checks', async () => {
  const f = productionFixture();
  const wrapped = withCombinedBoundary(f.transport, async () => {}, policy,
    () => verifyCurrentMainRef(env, async () => ({ status: 200, json: async () => ({ object: { sha: 'b'.repeat(40) } }) })), () => start);
  await assert.rejects(wrapped(ROOT + '/deployments', { method: 'POST' }), /main changed/); assert.equal(f.state.posts, 0);
});
test('final current-run read prevents POST when dispatch is cancelled during state checks', async () => {
  const f = productionFixture();
  const cancelled = run(200, '.github/workflows/deploy-events-porto-ems16-exclusion-code-only.yml', 'workflow_dispatch', { status: 'completed', conclusion: 'cancelled' });
  const wrapped = withCombinedBoundary(f.transport, async () => {}, policy,
    () => verifyCurrentDispatchRun(env, async () => ({ status: 200, json: async () => cancelled })), () => start);
  await assert.rejects(wrapped(ROOT + '/deployments', { method: 'POST' }), /no longer running/); assert.equal(f.state.posts, 0);
});

test('workflow blocks before protected environment or production credentials; contracts remain runnable', () => {
  const workflow = readFileSync('.github/workflows/deploy-events-porto-ems16-exclusion-code-only.yml', 'utf8');
  const readiness = workflow.split('  dispatch-readiness:')[1].split('  production-approval:')[0];
  assert.ok(readiness.includes('needs: contracts')); assert.ok(readiness.includes('--check-dispatch-readiness'));
  assert.doesNotMatch(readiness, /\n\s+environment:|secrets\.|CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /production-approval:[\s\S]*?needs: \[contracts, dispatch-readiness\]/);
  assert.match(workflow, /release:[\s\S]*?needs: \[contracts, dispatch-readiness, production-approval\]\n    environment: mmd-production-mutation/);
  assert.match(workflow, /permissions:\n  contents: read\n  actions: read\nconcurrency:/);
  assert.doesNotMatch(workflow, /checks:|contents: write|actions: write|id-token:/);
  assert.ok(workflow.includes('deploy-events-worker-production')); assert.ok(workflow.includes('cancel-in-progress: false'));
  const entry = readFileSync('scripts/events-porto-ems16-exclusion-release.mjs', 'utf8');
  const main = entry.slice(entry.indexOf('async function main()'));
  assert.ok(main.indexOf('validateDispatchReadiness') < main.indexOf('CLOUDFLARE_API_TOKEN'));
  assert.ok(main.includes('withCombinedBoundary(guardedTransport, verifyBoundary, policy, finalReadback)'));
});

test('release exact-runtime gate runs without skipped tests and without inherited credentials', { skip: !process.env.COMBINED_GUARD_BASELINE }, () => {
  const evidence = testCombinedCandidate(readFileSync(process.env.COMBINED_GUARD_BASELINE, 'utf8'));
  assert.equal(evidence.exact_runtime_tests, 'passed_no_skips');
});
