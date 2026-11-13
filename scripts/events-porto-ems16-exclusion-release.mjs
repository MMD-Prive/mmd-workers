// Source-review preparation only. Importing this module performs no work.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import { validateSourceState, activeVersion } from './admin-current-session-code-only.mjs';
import { releaseEventsRotation, createTransport, ROOT, ACCOUNT, ZONE } from './events-rotation-release-transport.mjs';
import { validateReleasePolicy, assertReleaseClock, readReleaseState, assertSameReleaseState } from './events-porto-ems16-release-state.mjs';
import { applyCombinedOverlay, validateManifestBytes, digest, BASELINE_SHA256, CANDIDATE_SHA256, MANIFEST_SHA256 } from '../release/events-porto-ems16-exclusion/build-candidate.mjs';

export const MANIFEST = 'release/events-porto-ems16-exclusion/overlay-manifest.json';
export const REQUIRED_CI = Object.freeze(['build (18.x)', 'build (20.x)', 'build (22.x)']);
// Deliberately absent. Only a separately reviewed source change can enable a
// fixed future window with real combined-target authorization and runtime proof.
// No dispatch input or environment variable can supply/override this policy.
export const REVIEWED_RELEASE_POLICY = null;
const BUCKET = 'mmd-hype-compcard-state';
const SHA = /^[a-f0-9]{40}$/;

export function validateDispatchReadiness(env, policy = REVIEWED_RELEASE_POLICY, now = Date.now()) {
  assert.ok(policy, 'Release disabled: reviewed combined authorization, future window and in-flight evidence are missing; source review only');
  validateReleasePolicy(policy, now);
  assert.ok(typeof policy.authorization_ref === 'string' && policy.authorization_ref.trim(), 'reviewed combined-target authorization reference required');
  assert.equal(policy.source_sha256, BASELINE_SHA256, 'runtime proof must bind to exact baseline');
  assert.equal(policy.candidate_sha256, CANDIDATE_SHA256);
  assert.equal(policy.manifest_sha256, MANIFEST_SHA256);
  assert.equal(policy.account_id, ACCOUNT, 'unapproved account');
  assert.equal(policy.bucket, BUCKET, 'unapproved state bucket');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.match(env.GITHUB_REPOSITORY || '', /^MMD-Prive\/mmd-workers$/);
  assert.match(env.GITHUB_SHA || '', SHA);
  assert.equal(env.APPROVED_SHA, env.GITHUB_SHA, 'exact executing main SHA required');
  assert.equal(env.PRODUCTION_APPROVED, 'true');
  assert.equal(env.APPROVAL_REF, policy.authorization_ref, 'new combined-target authorization required');
  const manifest = validateManifestBytes(readFileSync(MANIFEST));
  assert.equal(env.EXPECTED_VERSION, manifest.expected_version);
  assert.equal(env.EXPECTED_DEPLOYMENT, manifest.expected_deployment);
  return { policy, manifest };
}

export async function verifyCurrentMainCi(env, request = fetch) {
  assert.equal(env.GITHUB_REPOSITORY, 'MMD-Prive/mmd-workers');
  assert.match(env.GITHUB_SHA || '', SHA);
  assert.equal(env.APPROVED_SHA, env.GITHUB_SHA);
  assert.match(env.GITHUB_RUN_ID || '', /^\d+$/);
  assert.match(env.GITHUB_RUN_ATTEMPT || '', /^\d+$/);
  assert.ok(env.GH_TOKEN, 'existing GitHub read token required');
  const prefix = 'https://api.github.com/repos/' + env.GITHUB_REPOSITORY;
  const get = async suffix => {
    const response = await request(prefix + suffix, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    assert.equal(response.status, 200, 'cannot establish current main or exact-head Actions evidence');
    return response.json();
  };
  const list = async (path, key) => {
    const rows = []; let total;
    for (let page = 1; page <= 20; page++) {
      const result = await get(path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
      assert.ok(Number.isSafeInteger(result.total_count) && result.total_count >= 0 && result.total_count <= 2000);
      if (total == null) total = result.total_count;
      assert.equal(result.total_count, total, 'Actions inventory changed during pagination');
      assert.ok(Array.isArray(result[key]) && result[key].length <= 100);
      rows.push(...result[key]);
      if (rows.length >= total) break;
      assert.equal(result[key].length, 100, 'incomplete Actions inventory');
    }
    assert.equal(rows.length, total, 'incomplete Actions inventory');
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'duplicate Actions evidence');
    return rows;
  };
  const checkMain = async () => assert.equal((await get('/git/ref/heads/main'))?.object?.sha, env.GITHUB_SHA, 'main advanced beyond approved executing SHA');
  const validateRun = (run, path, event) => {
    assert.equal(run.head_sha, env.GITHUB_SHA, 'CI is not for exact approved SHA');
    assert.equal(run.head_branch, 'main');
    assert.equal(run.head_repository?.full_name, env.GITHUB_REPOSITORY);
    assert.equal(run.path, path, 'wrong evidence workflow');
    assert.equal(run.event, event);
    assert.ok(Number.isSafeInteger(run.id) && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
  };
  const verifyJobs = async (run, names) => {
    const jobs = await list('/actions/runs/' + run.id + '/attempts/' + run.run_attempt + '/jobs', 'jobs');
    const evidence = [];
    for (const name of names) {
      const matches = jobs.filter(row => row.name === name);
      assert.equal(matches.length, 1, 'missing or ambiguous required job: ' + name);
      const row = matches[0];
      assert.equal(row.run_id, run.id); assert.equal(row.head_sha, env.GITHUB_SHA);
      assert.equal(row.status, 'completed', 'required job unfinished');
      assert.equal(row.conclusion, 'success', 'required job did not pass');
      evidence.push({ name, job_id: row.id });
    }
    const after = await get('/actions/runs/' + run.id);
    for (const key of ['id', 'head_sha', 'run_attempt', 'path', 'event']) assert.equal(after[key], run[key], 'run changed during evidence read');
    if (run.event === 'push') { assert.equal(after.status, 'completed'); assert.equal(after.conclusion, 'success'); }
    else { assert.equal(after.status, 'in_progress', 'current dispatch is no longer running'); assert.equal(after.conclusion, null, 'current dispatch was concluded/cancelled'); }
    return evidence;
  };
  await checkMain();
  const all = await list('/actions/runs?head_sha=' + env.GITHUB_SHA, 'workflow_runs');
  const nodeRuns = all.filter(row => row.path === '.github/workflows/node.js.yml' && row.event === 'push' && row.head_branch === 'main');
  assert.ok(nodeRuns.length, 'exact-main Node CI push run missing');
  const selected = nodeRuns.sort((a, b) => b.id - a.id)[0];
  const nodeRun = await get('/actions/runs/' + selected.id);
  validateRun(nodeRun, '.github/workflows/node.js.yml', 'push');
  assert.equal(nodeRun.id, selected.id);
  assert.equal(nodeRun.status, 'completed', 'Node CI is unfinished');
  assert.equal(nodeRun.conclusion, 'success', 'Node CI did not pass');
  const nodeJobs = await verifyJobs(nodeRun, REQUIRED_CI);
  const scopedRun = await get('/actions/runs/' + env.GITHUB_RUN_ID);
  validateRun(scopedRun, '.github/workflows/deploy-events-porto-ems16-exclusion-code-only.yml', 'workflow_dispatch');
  assert.equal(scopedRun.id, Number(env.GITHUB_RUN_ID));
  assert.equal(scopedRun.run_attempt, Number(env.GITHUB_RUN_ATTEMPT), 'scoped contracts belong to a different run attempt');
  assert.equal(scopedRun.status, 'in_progress', 'current dispatch is no longer running');
  assert.equal(scopedRun.conclusion, null, 'current dispatch was concluded/cancelled');
  const scopedJobs = await verifyJobs(scopedRun, ['contracts']);
  await checkMain();
  return { source_sha: env.GITHUB_SHA, node_run_id: nodeRun.id, node_attempt: nodeRun.run_attempt, node_jobs: nodeJobs,
    scoped_run_id: scopedRun.id, scoped_attempt: scopedRun.run_attempt, scoped_jobs: scopedJobs, checked_at: new Date().toISOString() };
}

export function validateQuietSchedule(version, schedules) {
  const bindings = version?.resources?.bindings;
  assert.ok(Array.isArray(bindings), 'schedule bindings unavailable');
  for (const [name, text] of Object.entries({ HYPE_COMPCARD_ENABLED: 'true', HYPE_STANDARD_ENABLED: 'true', HYPE_INTAKE_ENABLED: 'true',
    HYPE_PROMOTION_ENABLED: 'false', HYPE_COMPCARD_SEND_AT_ICT: '16:30', HYPE_STANDARD_SEND_AT_ICT: '20:00',
    HYPE_PROMOTION_SEND_AT_ICT: '20:00', HYPE_CADENCE_START_DATE: '2026-10-23', HYPE_PROMOTION_WEEKDAYS: '2,5' })) {
    const rows = bindings.filter(row => row.name === name);
    assert.equal(rows.length, 1, 'ambiguous schedule binding');
    assert.equal(rows[0].type, 'plain_text');
    assert.equal(rows[0].text, text, 'reviewed schedule changed');
  }
  assert.deepEqual(schedules?.schedules?.map(row => row.cron), ['*/15 * * * *'], 'reviewed cron changed');
}

export async function readActiveModule(token, expectedName, request = fetch) {
  assert.ok(['model-eta-wrapper.js', 'worker.js'].includes(expectedName));
  const response = await request('https://api.cloudflare.com/client/v4' + ROOT + '/content/v2', {
    method: 'GET', headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, 'cannot read exact active module');
  const entries = [...(await response.formData()).entries()];
  assert.equal(entries.length, 1, 'unexpected module or source map');
  assert.equal(entries[0][0], expectedName);
  assert.ok(typeof entries[0][1] !== 'string' && entries[0][1].size < 1024 * 1024);
  return entries[0][1].text();
}

export function testCombinedCandidate(baseline) {
  const directory = mkdtempSync(join(tmpdir(), 'events-combined-guards-'));
  const input = join(directory, 'live-baseline.mjs');
  const output = join(directory, 'combined-candidate.mjs');
  writeFileSync(input, baseline, { mode: 0o600 });
  writeFileSync(output, applyCombinedOverlay(baseline), { mode: 0o600 });
  execFileSync(process.execPath, ['--check', output], { stdio: 'pipe', timeout: 60000 });
  // Never pass production credentials to memory-only tests.
  const result = execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'release/events-porto-ems16-exclusion/candidate.test.mjs'], {
    env: { PATH: process.env.PATH, COMBINED_GUARD_BASELINE: input }, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  assert.match(result, /# fail 0\b/);
  assert.match(result, /# skipped 0\b/, 'release requires exact-runtime tests with zero skips');
  return { exact_runtime_tests: 'passed_no_skips', baseline_sha256: digest(baseline), candidate_sha256: digest(readFileSync(output)) };
}

const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const canonical = value => JSON.stringify(sorted(value));
const ordered = values => [...values].sort((a, b) => canonical(a).localeCompare(canonical(b)));
export async function readProductionBoundary(transport) {
  const deployment = (await transport(ROOT + '/deployments'))?.deployments?.[0];
  activeVersion(deployment);
  const latest = (await transport(ROOT + '/versions'))?.items?.[0]?.id;
  assert.match(latest || '', /^[a-f0-9-]{36}$/i, 'latest version unavailable');
  const settings = await transport(ROOT + '/script-settings');
  const routes = await transport(`/zones/${ZONE}/workers/routes`);
  const schedules = await transport(ROOT + '/schedules');
  const subdomain = await transport(ROOT + '/subdomain');
  assert.ok(settings && typeof settings === 'object' && !Array.isArray(settings));
  assert.ok(Array.isArray(routes) && Array.isArray(schedules?.schedules));
  assert.equal(typeof subdomain?.enabled, 'boolean');
  assert.deepEqual((await transport(ROOT + '/deployments'))?.deployments?.[0], deployment, 'deployment changed during final boundary read');
  assert.equal((await transport(ROOT + '/versions'))?.items?.[0]?.id, latest, 'latest changed during final boundary read');
  return { deployment, latest, settings, routes: ordered(routes), schedules: ordered(schedules.schedules), subdomain };
}
export async function verifyProductionBoundary(transport, expected, latest) {
  assert.ok(expected, 'baseline production boundary unavailable');
  const current = await readProductionBoundary(transport);
  assert.equal(current.latest, latest, 'latest version changed during state verification');
  assert.deepEqual({ ...current, latest: expected.latest }, expected, 'deployment/settings/routes/cron/subdomain changed during state verification');
}
export async function verifyCurrentMainRef(env, request = fetch) {
  assert.equal(env.GITHUB_REPOSITORY, 'MMD-Prive/mmd-workers');
  assert.match(env.GITHUB_SHA || '', SHA); assert.equal(env.APPROVED_SHA, env.GITHUB_SHA); assert.ok(env.GH_TOKEN);
  const response = await request('https://api.github.com/repos/' + env.GITHUB_REPOSITORY + '/git/ref/heads/main', {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  assert.equal(response.status, 200, 'final current-main read failed');
  assert.equal((await response.json())?.object?.sha, env.GITHUB_SHA, 'main changed during state verification');
}
export async function verifyCurrentDispatchRun(env, request = fetch) {
  assert.equal(env.GITHUB_REPOSITORY, 'MMD-Prive/mmd-workers');
  assert.match(env.GITHUB_SHA || '', SHA); assert.equal(env.APPROVED_SHA, env.GITHUB_SHA); assert.ok(env.GH_TOKEN);
  assert.match(env.GITHUB_RUN_ID || '', /^\d+$/); assert.match(env.GITHUB_RUN_ATTEMPT || '', /^\d+$/);
  const response = await request('https://api.github.com/repos/' + env.GITHUB_REPOSITORY + '/actions/runs/' + env.GITHUB_RUN_ID, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  assert.equal(response.status, 200, 'final current-run read failed');
  const run = await response.json();
  assert.equal(run.id, Number(env.GITHUB_RUN_ID)); assert.equal(run.run_attempt, Number(env.GITHUB_RUN_ATTEMPT));
  assert.equal(run.head_sha, env.GITHUB_SHA); assert.equal(run.head_branch, 'main');
  assert.equal(run.head_repository?.full_name, env.GITHUB_REPOSITORY);
  assert.equal(run.path, '.github/workflows/deploy-events-porto-ems16-exclusion-code-only.yml');
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(run.status, 'in_progress', 'current dispatch is no longer running');
  assert.equal(run.conclusion, null, 'current dispatch was concluded/cancelled');
}
export function withCombinedBoundary(transport, verifyBoundary, policy, finalReadback, now = Date.now) {
  return async (path, init) => {
    if (init?.method === 'POST') {
      assert.ok([ROOT + '/versions?bindings_inherit=strict', ROOT + '/deployments'].includes(path), 'unapproved mutation');
      assertReleaseClock(policy, now());
      await verifyBoundary();
      assert.equal(typeof finalReadback, 'function', 'final production/main drift check required');
      await finalReadback(path);
      assertReleaseClock(policy, now());
    }
    return transport(path, init);
  };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
async function main() {
  assert.ok(['--check-dispatch-readiness', '--execute-approved'].includes(process.argv[2]), 'explicit command required');
  // This must precede protection approval, production secret access and Cloudflare calls.
  const { policy, manifest } = validateDispatchReadiness(process.env);
  await verifyCurrentMainCi(process.env);
  if (process.argv[2] === '--check-dispatch-readiness') return;
  const sha = process.env.GITHUB_SHA;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const transport = createTransport(token);
  const manifestBytes = readFileSync(MANIFEST);
  let snapshot;
  let ciEvidence;
  let runtimeTests;
  let productionBoundary;
  let uploadedVersion;
  const readCurrent = async () => {
    assertReleaseClock(policy);
    validateQuietSchedule(await transport(ROOT + '/versions/' + manifest.expected_version), await transport(ROOT + '/schedules'));
    const current = await readReleaseState({ token, policy });
    assertReleaseClock(policy);
    return current;
  };
  const verifyBoundary = async () => {
    assertReleaseClock(policy);
    ciEvidence = await verifyCurrentMainCi(process.env);
    const current = await readCurrent();
    if (snapshot) assertSameReleaseState(snapshot, current);
    else snapshot = current;
    assertReleaseClock(policy);
  };
  const approve = async () => {
    validateDispatchReadiness(process.env);
    // This validates protection configuration; the workflow's protected release
    // job, not this return value or an owner message ID, supplies actual approval.
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected main-only Per-review environment required');
    validateSourceState({ expectedSha: sha, headSha: git('rev-parse', 'HEAD'), dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
    if (!productionBoundary) {
      productionBoundary = await readProductionBoundary(transport);
      assert.equal(productionBoundary.deployment.id, manifest.expected_deployment);
      assert.equal(activeVersion(productionBoundary.deployment), manifest.expected_version);
      assert.equal(productionBoundary.latest, manifest.expected_version);
    }
    await verifyBoundary();
  };
  const releaseId = process.env.GITHUB_RUN_ID + '.' + process.env.GITHUB_RUN_ATTEMPT;
  assert.match(releaseId, /^\d+\.\d+$/);
  const journal = join(process.env.RUNNER_TEMP, 'events-porto-ems16-exclusion-release.json');
  const guardedTransport = async (path, init) => {
    const result = await transport(path, init);
    if (init?.method === 'POST' && path === ROOT + '/versions?bindings_inherit=strict') uploadedVersion = result?.id;
    return result;
  };
  const finalReadback = async path => {
    const expectedLatest = path === ROOT + '/deployments' ? uploadedVersion : manifest.expected_version;
    assert.match(expectedLatest || '', /^[a-f0-9-]{36}$/i, 'verified upload ID required before promotion');
    await verifyProductionBoundary(transport, productionBoundary, expectedLatest);
    await verifyCurrentMainRef(process.env);
    await verifyCurrentDispatchRun(process.env);
  };
  await releaseEventsRotation({ sha, approve, expectedVersion: manifest.expected_version, expectedDeployment: manifest.expected_deployment,
    call: withCombinedBoundary(guardedTransport, verifyBoundary, policy, finalReadback),
    sourceCheck: async version => {
      validateQuietSchedule(version, await transport(ROOT + '/schedules'));
      const buckets = version.resources.bindings.filter(row => row.name === 'HYPE_COMPCARD_STATE');
      assert.equal(buckets.length, 1); assert.equal(buckets[0].type, 'r2_bucket'); assert.equal(buckets[0].bucket_name, BUCKET);
      return { commit_sha: sha, dirty_tree: false, method: 'exact-live-porto-ems16-private-ems23-group-guards-only',
        baseline_module_sha256: BASELINE_SHA256, candidate_module_sha256: CANDIDATE_SHA256 };
    },
    bundle: async () => {
      const baseline = await readActiveModule(token, manifest.module);
      const candidate = applyCombinedOverlay(baseline, manifestBytes);
      runtimeTests = testCombinedCandidate(baseline);
      return new TextEncoder().encode(candidate);
    },
    buildEvidence: code => ({ release_id: releaseId, toolchain: { node: process.version, compiler: 'none-exact-overlay' },
      artifact: { digest: { algorithm: 'sha256', value: digest(code) } },
      preservation: { unrelated_bytes_preserved: true, sections: manifest.sections, manifest_sha256: digest(manifestBytes) }, runtime_tests: runtimeTests }),
    verifyActiveModule: async expected => {
      assert.equal(digest(await readActiveModule(token, 'worker.js')), expected, 'active module digest mismatch');
      assertSameReleaseState(snapshot, await readCurrent());
    },
    now: () => new Date().toISOString(),
    save: state => writeFileSync(journal, JSON.stringify({ ...state, authorization_ref: policy.authorization_ref,
      release_policy_sha256: digest(JSON.stringify(policy)), state_snapshot: snapshot, ci_evidence: ciEvidence }, null, 2), { mode: 0o600 }),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(REVIEWED_RELEASE_POLICY === null
    ? 'Release disabled: combined authorization/window/runtime-horizon evidence has not been reviewed. Source contracts remain runnable.'
    : 'Combined release stopped. Inspect the sanitized receipt and reconcile read-only; never retry or roll back an uncertain mutation.'); process.exitCode = 1; });
}
