// Scoped release transport. Importing this module never contacts production.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';

export const ACCOUNT = 'b176eda1172b741fd2e58904cc9d77c5';
export const ZONE = '2d62396174fa2ddadbbcd0e8cf0f3367';
export const ROOT = `/accounts/${ACCOUNT}/workers/scripts/admin-worker`;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const canonical = value => JSON.stringify(sort(value));
const ordered = value => [...value].sort((a, b) => canonical(a).localeCompare(canonical(b)));
const same = (a, b, reason) => assert.equal(canonical(a), canonical(b), reason);
const sha256 = value => createHash('sha256').update(value).digest('hex');

// One audited historical baseline. These identifiers are not a general fallback
// for missing annotations; neither a tag nor a timestamp proves source identity.
export const BASELINE_CI_RECEIPT = Object.freeze({
  repository: 'MMD-Prive/mmd-workers', repositoryId: 1121397236,
  sourceSha: '339c6009f9974815ff0bd777f019b7442b730df5',
  versionId: '5e18fc0a-fa8c-478a-8dc0-17122b25ba10',
  deploymentId: '100ea975-2603-471d-835b-a718a38ea631',
  runId: 41283302297, attempt: 1, workflowId: 333112512,
  workflowPath: '.github/workflows/deploy-admin-worker.yml',
  jobId: 124779493737, jobName: 'validate-and-deploy',
});
const CI = BASELINE_CI_RECEIPT;
const CI_RUN = `repos/${CI.repository}/actions/runs/${CI.runId}`;
const CI_JOB = `repos/${CI.repository}/actions/jobs/${CI.jobId}`;

// gh performs GETs only, captures output in memory and follows GitHub's log
// download redirect. No credential or raw log is printed or persisted here.
export function readBaselineCiGithub(path, execute = execFileSync) {
  assert.ok([CI_RUN, CI_JOB, CI_JOB + '/logs'].includes(path), 'unapproved baseline receipt endpoint');
  assert.ok(process.env.GH_TOKEN, 'GitHub receipt-read credential required');
  try {
    // Historical test output contains ANSI sequences. Permit capture into the
    // pipe only; the verifier never forwards those bytes to a terminal/receipt.
    const output = execute('gh', ['api', '--hostname', 'github.com', '--method', 'GET',
      ...(path.endsWith('/logs') ? ['--allow-escape-sequences'] : []), path], {
      encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GH_HOST: 'github.com', GH_DEBUG: '' },
    });
    return path.endsWith('/logs') ? output : JSON.parse(output);
  } catch { throw new Error('baseline CI receipt unavailable; no upload permitted'); }
}

function requireAuditedBaseline(version, deployment) {
  assert.equal(version?.id, CI.versionId, 'missing annotation on an unaudited baseline');
  assert.equal(deployment?.id, CI.deploymentId, 'baseline receipt deployment mismatch');
  assert.equal(activeVersion(deployment), CI.versionId, 'baseline receipt allocation mismatch');
}

export function validateBaselineCiReceipt({ version, deployment, run, job, log }) {
  requireAuditedBaseline(version, deployment);
  for (const repository of [run?.repository, run?.head_repository]) {
    assert.equal(repository?.full_name, CI.repository, 'baseline receipt repository mismatch');
    assert.equal(repository?.id, CI.repositoryId, 'baseline receipt repository identity mismatch');
  }
  assert.equal(run?.id, CI.runId, 'baseline receipt run mismatch');
  assert.equal(run?.run_attempt, CI.attempt, 'baseline receipt attempt mismatch');
  assert.equal(run?.workflow_id, CI.workflowId, 'baseline receipt workflow mismatch');
  assert.equal(run?.path, CI.workflowPath, 'baseline receipt workflow path mismatch');
  assert.equal(run?.event, 'workflow_dispatch', 'baseline receipt was not a manual release');
  assert.equal(run?.head_branch, 'main', 'baseline receipt branch mismatch');
  assert.equal(run?.head_sha, CI.sourceSha, 'baseline receipt source mismatch');
  assert.equal(run?.status, 'completed', 'baseline receipt run incomplete');
  assert.equal(run?.conclusion, 'success', 'baseline receipt run did not succeed');
  assert.equal(job?.id, CI.jobId, 'baseline receipt job mismatch');
  assert.equal(job?.run_id, CI.runId, 'baseline receipt job/run mismatch');
  assert.equal(job?.run_attempt, CI.attempt, 'baseline receipt job attempt mismatch');
  assert.equal(job?.head_sha, CI.sourceSha, 'baseline receipt job source mismatch');
  assert.equal(job?.name, CI.jobName, 'baseline receipt job name mismatch');
  assert.equal(job?.status, 'completed', 'baseline receipt job incomplete');
  assert.equal(job?.conclusion, 'success', 'baseline receipt job did not succeed');
  for (const name of ['Check out repository', 'Run tests and source validation',
    'Pin Kenji admin shell assets to deploy SHA', 'Validate Cloudflare version upload',
    'Upload admin-worker version', 'Resolve uploaded version ID',
    'Deploy uploaded admin-worker version', 'Require verified live deployment']) {
    const steps = job.steps?.filter(step => step.name === name);
    assert.equal(steps?.length, 1, 'baseline receipt critical step missing or ambiguous');
    assert.equal(steps[0].conclusion, 'success', 'baseline receipt critical step failed');
  }
  const migration = job.steps?.filter(step => step.name === 'Apply Durable Object migration with direct deploy');
  assert.equal(migration?.length, 1, 'baseline receipt migration outcome missing');
  assert.equal(migration[0].conclusion, 'skipped', 'baseline receipt used migration fallback');
  assert.ok(typeof log === 'string' && log.length > 0 && Buffer.byteLength(log) <= 2 * 1024 * 1024,
    'baseline receipt log missing or oversized');
  const records = log.replace(/\r\n/g, '\n').split('\n').map(line => {
    const match = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) (.*)$/.exec(line);
    return match ? { at: match[1], text: match[2] } : null;
  }).filter(Boolean);
  const one = pattern => {
    const matches = records.map((record, index) => ({ ...record, index })).filter(record => pattern.test(record.text));
    assert.equal(matches.length, 1, 'baseline receipt record missing or ambiguous');
    return matches[0];
  };
  const checkout = one(/^\[command\]\/usr\/bin\/git log -1 --format=%H$/);
  assert.equal(records[checkout.index + 1]?.text, CI.sourceSha, 'checkout receipt source mismatch');
  const pinned = one(/^Pinned Kenji admin shell JS\/CSS to [a-f0-9]{40}$/);
  assert.equal(pinned.text, `Pinned Kenji admin shell JS/CSS to ${CI.sourceSha}`, 'baseline build pin mismatch');
  const upload = one(/^Worker Version ID: [a-f0-9-]+$/);
  assert.equal(upload.text, `Worker Version ID: ${CI.versionId}`, 'upload receipt version mismatch');
  const resolved = one(/^Resolved version [a-f0-9-]+ from versions upload output$/);
  assert.equal(resolved.text, `Resolved version ${CI.versionId} from versions upload output`, 'resolved version mismatch');
  const receipts = records.map((record, index) => {
    try { return { ...record, index, value: JSON.parse(record.text) }; } catch { return null; }
  }).filter(record => record?.value?.worker === 'admin-worker');
  assert.equal(receipts.length, 1, 'deployment receipt missing or ambiguous');
  const promoted = receipts[0];
  assert.ok(canonical(promoted.value) === canonical({ ok: true, worker: 'admin-worker',
    version: CI.versionId, deployment: CI.deploymentId }), 'deployment receipt linkage mismatch');
  const chain = [checkout, pinned, upload, resolved, promoted];
  for (let i = 0; i < chain.length; i++) {
    assert.ok(Number.isFinite(Date.parse(chain[i].at)), 'baseline receipt timestamp invalid');
    if (i) assert.ok(chain[i].index > chain[i - 1].index && Date.parse(chain[i].at) >= Date.parse(chain[i - 1].at),
      'baseline receipt ordering mismatch');
  }
  return {
    method: 'audited-github-ci-receipt', baseline_source_sha: CI.sourceSha,
    baseline_ci: { repository: CI.repository, run_id: CI.runId, run_attempt: CI.attempt,
      job_id: CI.jobId, workflow_path: CI.workflowPath, version_id: CI.versionId,
      deployment_id: CI.deploymentId, checkout_at: checkout.at, upload_at: upload.at, deployment_at: promoted.at,
      build_transformations: ['kenji-shell-assets-pinned-to-source-sha'], artifact_digest_verified: false },
  };
}

export async function baselineSourceEvidence(version, deployment, readGithub = readBaselineCiGithub) {
  const annotated = version?.annotations?.['workers/commit_sha'];
  if (annotated !== undefined) {
    assert.match(annotated || '', /^[a-f0-9]{40}$/, 'invalid baseline source annotation');
    return { method: 'version-commit-annotation', baseline_source_sha: annotated };
  }
  requireAuditedBaseline(version, deployment); // Reject unknown baselines before any receipt request.
  const run = await readGithub(CI_RUN);
  const job = await readGithub(CI_JOB);
  const log = await readGithub(CI_JOB + '/logs');
  return validateBaselineCiReceipt({ version, deployment, run, job, log });
}

export async function verifyBaselineSourceForRelease({ version, deployment, sourceState, sha, git, readGithub }) {
  assert.match(sha || '', /^[a-f0-9]{40}$/, 'full candidate SHA required');
  assert.equal(sourceState?.commit_sha, sha, 'candidate checkout SHA mismatch');
  assert.equal(sourceState?.dirty_tree, false, 'dirty candidate checkout');
  const evidence = await baselineSourceEvidence(version, deployment, readGithub);
  git('merge-base', '--is-ancestor', evidence.baseline_source_sha, sha);
  assert.equal(git('diff', evidence.baseline_source_sha, sha, '--', 'admin-worker/wrangler.toml'), '',
    'source configuration or migration changed; separate release approval required');
  return { ...sourceState, ...evidence, candidate_source_sha: sha, configuration_diff: false };
}

export function validateSourceState({ expectedSha, headSha, dirtyStatus }) {
  assert.match(expectedSha || '', /^[a-f0-9]{40}$/, 'full source SHA required');
  assert.equal(headSha, expectedSha, 'checkout SHA mismatch');
  assert.equal(dirtyStatus, '', 'dirty checkout; release stopped before bundle/upload');
  return { commit_sha: expectedSha, dirty_tree: false, dirty_path_count: 0 };
}

export function createBuildEvidence({ code, releaseId, nodeVersion, wranglerVersion, lockfile, wranglerConfig }) {
  assert.ok(code instanceof Uint8Array && code.byteLength > 0, 'compiled module required');
  assert.match(releaseId || '', /^\d+\.\d+$/, 'workflow run identity required');
  assert.match(nodeVersion || '', /^v22\./, 'unexpected Node.js toolchain');
  assert.equal(wranglerVersion, '4.105.0', 'unexpected Wrangler toolchain');
  assert.ok(lockfile instanceof Uint8Array && lockfile.byteLength > 0, 'dependency lockfile required');
  assert.ok(wranglerConfig instanceof Uint8Array && wranglerConfig.byteLength > 0, 'build configuration required');
  const module = { name: 'admin-login-hero-worker.js', bytes: code.byteLength,
    digest: { algorithm: 'sha256', value: sha256(code) } };
  const moduleManifest = [module];
  return {
    release_id: releaseId,
    toolchain: { node: nodeVersion, wrangler: wranglerVersion },
    lockfile: { path: 'package-lock.json', digest: { algorithm: 'sha256', value: sha256(lockfile) } },
    additional_inputs: [{ path: 'generated-wrangler-config.json', digest: { algorithm: 'sha256', value: sha256(wranglerConfig) } }],
    artifact: { digest: { algorithm: 'sha256', value: module.digest.value },
      module_manifest_digest: { algorithm: 'sha256', value: sha256(canonical(moduleManifest)) }, modules: moduleManifest },
  };
}

export function validateReceiptLinks({ source, build, upload, deployment }) {
  assert.match(source?.commit_sha || '', /^[a-f0-9]{40}$/, 'source commit missing from receipt');
  assert.equal(source.dirty_tree, false, 'dirty source cannot be released');
  assert.ok(build?.release_id && build.artifact?.digest?.algorithm === 'sha256'
    && /^[a-f0-9]{64}$/.test(build.artifact.digest.value), 'artifact build receipt missing');
  assert.ok(UUID.test(upload?.version_id || ''), 'upload response version missing');
  assert.equal(build.release_id, upload.release_id, 'upload does not link to this build operation');
  assert.ok(Number.isFinite(Date.parse(upload?.recorded_at || '')), 'upload response timestamp missing');
  assert.ok(UUID.test(deployment?.deployment_id || ''), 'deployment readback ID missing');
  assert.ok(Number.isFinite(Date.parse(deployment?.readback_at || '')), 'deployment readback timestamp missing');
  assert.equal(deployment?.version_id, upload.version_id, 'deployment version differs from upload response');
  assert.equal(deployment?.strategy, 'percentage', 'deployment allocation strategy missing');
  assert.deepEqual(deployment?.allocations, [{ version_id: upload.version_id, percentage: 100 }],
    'deployment allocation is not the exact uploaded version at 100%');
  return true;
}

export function activeVersion(deployment) {
  assert.ok(UUID.test(deployment?.id || ''), 'exact deployment required');
  assert.equal(deployment.strategy, 'percentage', 'unknown allocation strategy');
  assert.equal(deployment.versions?.length, 1, 'split traffic requires review');
  assert.equal(deployment.versions[0].percentage, 100, '100% baseline required');
  assert.ok(UUID.test(deployment.versions[0].version_id || ''), 'exact active version required');
  return deployment.versions[0].version_id;
}

export function versionConfiguration(version) {
  const r = version?.resources;
  assert.ok(r?.script && r?.script_runtime && Array.isArray(r.bindings), 'version inventory incomplete');
  const names = new Set();
  const bindings = r.bindings.map(binding => {
    assert.ok(binding.name && binding.type && !names.has(binding.name), 'invalid/duplicate binding');
    names.add(binding.name);
    // Secret values are neither compared nor written into receipts.
    return ['secret_text', 'secret_key'].includes(binding.type)
      ? { name: binding.name, type: binding.type } : binding;
  });
  const { etag, last_deployed_from, ...scriptConfiguration } = r.script;
  return { bindings: ordered(bindings), runtime: r.script_runtime,
    script: scriptConfiguration, cache_options: version.cache_options ?? null };
}

export function uploadMetadata(version, sha) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  versionConfiguration(version);
  const r = version.resources;
  const runtime = r.script_runtime;
  assert.ok(Object.keys(runtime).every(key => [
    'compatibility_date', 'compatibility_flags', 'usage_model', 'limits', 'migration_tag',
  ].includes(key)), 'unknown runtime setting; explicit mapping required');
  assert.match(runtime.compatibility_date || '', /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!r.assets && !r.script.assets && !r.script.containers, 'assets/containers require separate review');
  const result = {
    main_module: 'worker.js',
    bindings: r.bindings.map(binding => ({ name: binding.name, type: 'inherit' })),
    compatibility_date: runtime.compatibility_date,
    compatibility_flags: runtime.compatibility_flags || [],
    annotations: { 'workers/commit_sha': sha, 'workers/message': `current-session code-only source-sha=${sha}` },
  };
  for (const key of ['usage_model', 'limits']) if (runtime[key] !== undefined) result[key] = runtime[key];
  if (r.script.placement) result.placement = r.script.placement;
  else if (r.script.placement_mode === 'smart') result.placement = { mode: 'smart' };
  else assert.ok(!r.script.placement_mode || r.script.placement_mode === 'off', 'unknown placement');
  if (version.cache_options != null) result.cache_options = version.cache_options;
  return result;
}

// Defense in depth: no generic Cloudflare write client, redirect or retry path.
export function createTransport(token, request = fetch) {
  assert.ok(token, 'Cloudflare credential required');
  return async (path, { method = 'GET', body } = {}) => {
    const read = method === 'GET' && (
      new RegExp(`^${ROOT}/(deployments(?:/[a-f0-9-]{36})?|versions(?:/[a-f0-9-]{36})?|script-settings|schedules|subdomain)$`, 'i').test(path)
      || path === `/zones/${ZONE}/workers/routes`);
    const write = method === 'POST' && [ROOT + '/versions?bindings_inherit=strict', ROOT + '/deployments'].includes(path);
    assert.ok(read || write, 'endpoint/method outside code-only scope');
    let response;
    try {
      response = await request('https://api.cloudflare.com/client/v4' + path, {
        method, body, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`,
          ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      });
    } catch { throw new Error('Cloudflare transport failed; mutation outcome may be unknown; do not retry'); }
    const data = await response.json().catch(() => null);
    assert.ok(response.ok && data?.success === true, `Cloudflare ${method} failed (${response.status}); stop without retry`);
    return data.result;
  };
}

export async function releaseCurrentSession(io) {
  const root = io.root ?? ROOT;
  assert.ok([ROOT, `/accounts/${ACCOUNT}/workers/scripts/immigrate-worker`, `/accounts/${ACCOUNT}/workers/scripts/member-dashboard-chat-worker`].includes(root), 'unapproved release Worker');
  const state = { phase: 'preflight', worker: root.split('/').at(-1), source_sha: io.sha };
  const save = phase => { state.phase = phase; io.save({ ...state }); };
  try {
    await io.approve();
    assert.match(io.sha || '', /^[a-f0-9]{40}$/);
    const call = (suffix, init) => io.call(root + suffix, init);
    const deployment = (await call('/deployments'))?.deployments?.[0];
    const active = activeVersion(deployment);
    assert.equal(active, io.expectedVersion, 'approved baseline version mismatch');
    assert.equal(deployment.id, io.expectedDeployment, 'approved baseline deployment mismatch');
    const version = await call('/versions/' + active);
    assert.equal(version.id, active, 'baseline version mismatch');
    const config = versionConfiguration(version);
    const metadata = (io.metadataFactory ?? uploadMetadata)(version, io.sha);
    // A stale build variable or temporal proximity is not source provenance.
    state.source_evidence = await io.sourceCheck(version, deployment);
    state.source_evidence.checked_at = io.now();
    const settings = await call('/script-settings');
    assert.ok(settings && typeof settings === 'object', 'settings unavailable');
    const boundary = async () => {
      const routes = await io.call(`/zones/${ZONE}/workers/routes`);
      const schedules = await call('/schedules');
      const subdomain = await call('/subdomain');
      assert.ok(Array.isArray(routes) && Array.isArray(schedules?.schedules), 'route/cron inventory unavailable');
      assert.equal(typeof subdomain?.enabled, 'boolean', 'subdomain inventory unavailable');
      return { routes: ordered(routes), schedules: ordered(schedules.schedules), subdomain };
    };
    const environment = await boundary();
    const unchanged = async (expectedDeployment, latest) => {
      const current = (await call('/deployments'))?.deployments?.[0];
      activeVersion(current);
      same(current, expectedDeployment, 'active deployment drift');
      assert.equal((await call('/versions'))?.items?.[0]?.id, latest, 'latest upload drift');
      same(await call('/script-settings'), settings, 'operational settings drift');
      same(await boundary(), environment, 'routes/cron/subdomain drift');
    };
    await unchanged(deployment, active); // inherit resolves LATEST, not necessarily active.
    state.baseline_version = active;
    state.baseline_deployment = deployment.id;
    const code = await io.bundle(version);
    assert.ok(code instanceof Uint8Array && code.byteLength > 0, 'compiled module required');
    state.build_evidence = { ...await io.buildEvidence(code), recorded_at: io.now() };
    assert.ok(state.build_evidence?.artifact?.digest?.algorithm === 'sha256'
      && state.build_evidence.artifact.digest.value === sha256(code), 'artifact digest does not match uploaded module');
    state.release_id = state.build_evidence.release_id;
    state.bundle_sha256 = state.build_evidence.artifact.digest.value;
    await io.approve();
    await unchanged(deployment, active);
    const form = new FormData();
    form.set('metadata', JSON.stringify(metadata));
    form.set('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
    save('upload-attempted-outcome-unknown');
    const uploaded = await call('/versions?bindings_inherit=strict', { method: 'POST', body: form });
    assert.ok(UUID.test(uploaded?.id || '') && uploaded.id !== active, 'ambiguous upload result; do not rerun');
    state.uploaded_version = uploaded.id;
    state.upload_response = { release_id: state.release_id, version_id: uploaded.id,
      created_on: typeof uploaded.created_on === 'string' ? uploaded.created_on : null,
      recorded_at: io.now() };
    save('uploaded-not-promoted');
    const exact = await call('/versions/' + uploaded.id);
    assert.equal(exact.id, uploaded.id, 'uploaded version mismatch');
    same(versionConfiguration(exact), config, 'uploaded configuration mismatch');
    assert.equal(exact.annotations?.['workers/commit_sha'], io.sha, 'source annotation mismatch');
    const versions = (await call('/versions'))?.items;
    assert.equal(versions?.[0]?.id, uploaded.id, 'uploaded latest mismatch');
    assert.equal(versions?.[1]?.id, active, 'upload predecessor mismatch');
    await io.approve();
    await unchanged(deployment, uploaded.id);
    save('promotion-attempted-outcome-unknown');
    const promoted = await call('/deployments', { method: 'POST', body: JSON.stringify({
      strategy: 'percentage', versions: [{ version_id: uploaded.id, percentage: 100 }],
    }) });
    assert.ok(UUID.test(promoted?.id || '') && promoted.id !== deployment.id, 'ambiguous promotion result; do not rerun');
    state.deployment = promoted.id;
    const receipt = await call('/deployments/' + promoted.id);
    assert.equal(receipt.id, promoted.id);
    assert.equal(activeVersion(receipt), uploaded.id);
    await unchanged(receipt, uploaded.id);
    same(versionConfiguration(await call('/versions/' + uploaded.id)), config, 'post-promotion configuration mismatch');
    state.deployment_evidence = { deployment_id: receipt.id,
      created_on: typeof receipt.created_on === 'string' ? receipt.created_on : null,
      strategy: receipt.strategy,
      allocations: receipt.versions.map(({ version_id, percentage }) => ({ version_id, percentage })) };
    state.deployment_evidence.readback_at = io.now();
    state.deployment_evidence.version_id = activeVersion(receipt);
    validateReceiptLinks({ source: state.source_evidence, build: state.build_evidence,
      upload: state.upload_response, deployment: { ...state.deployment_evidence, version_id: state.deployment_evidence.version_id } });
    save('complete');
    return state;
  } catch (error) {
    state.stopped_after = state.phase;
    save('stopped'); // No retry, fallback, cleanup mutation or automatic rollback.
    throw error;
  }
}

export function validateBundleFiles(files) {
  assert.deepEqual(files.filter(name => !['README.md', 'admin-login-hero-worker.js.map'].includes(name)).sort(),
    ['admin-login-hero-worker.js'], 'multi-module output requires separate review');
}

export function buildCurrentSessionBundle(baseline, dir) {
  const r = baseline.resources.script_runtime;
  const config = join(dir, 'bundle.json');
  writeFileSync(config, JSON.stringify({ name: 'admin-worker',
    main: resolve('admin-worker/src/admin-login-hero-worker.js'),
    compatibility_date: r.compatibility_date, compatibility_flags: r.compatibility_flags || [],
    send_metrics: false,
  }), { mode: 0o600 });
  try {
    execFileSync('wrangler', ['versions', 'upload', '--dry-run', '--config', config, '--outdir', join(dir, 'bundle')], {
      stdio: 'ignore', env: { ...process.env, CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_API_KEY: '',
        WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(dir, 'wrangler.log') },
    });
  } catch { throw new Error('local bundle failed; no upload permitted'); }
  validateBundleFiles(readdirSync(join(dir, 'bundle')));
  return readFileSync(join(dir, 'bundle', 'admin-login-hero-worker.js'));
}

function collectBuildEvidence(code, dir, releaseId) {
  const versionOutput = execFileSync('wrangler', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const match = versionOutput.match(/wrangler\s+([0-9]+\.[0-9]+\.[0-9]+)/i);
  assert.ok(match, 'Wrangler version could not be identified');
  const lockfile = readFileSync(resolve('package-lock.json'));
  const wranglerConfig = readFileSync(join(dir, 'bundle.json'));
  return createBuildEvidence({ code, releaseId, nodeVersion: process.version,
    wranglerVersion: match[1], lockfile, wranglerConfig });
}

async function main() {
  assert.equal(process.argv[2], '--execute-approved', 'explicit execution argument required');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true', 'owner dispatch approval required');
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT, 'wrong Cloudflare account');
  const sha = process.env.GITHUB_SHA;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
  assert.match(runId || '', /^\d+$/, 'GitHub workflow run ID required');
  assert.match(runAttempt || '', /^\d+$/, 'GitHub workflow attempt required');
  const releaseId = `${runId}.${runAttempt}`;
  let sourceState;
  const approve = async () => {
    await verifyProductionApproval(process.env);
    const protection = await inspectEnvironment(process.env);
    assert.equal(protection.ready, true, 'exact main-only branch restriction required');
    sourceState = validateSourceState({ expectedSha: sha,
      headSha: git('rev-parse', 'HEAD'), dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
    git('merge-base', '--is-ancestor', '5dd40718129f3902e16be6c93dbaea509eb15fd1', sha);
  };
  const dir = mkdtempSync(join(tmpdir(), 'mmd-current-session-code-only-'));
  const journal = resolve(process.env.RUNNER_TEMP || dir, 'current-session-code-only-receipt.json');
  await releaseCurrentSession({ sha, approve,
    expectedVersion: process.env.EXPECTED_VERSION,
    expectedDeployment: process.env.EXPECTED_DEPLOYMENT,
    releaseId,
    call: createTransport(process.env.CLOUDFLARE_API_TOKEN),
    sourceCheck: (baseline, deployment) => verifyBaselineSourceForRelease({
      version: baseline, deployment, sourceState, sha, git,
    }),
    buildEvidence: code => collectBuildEvidence(code, dir, releaseId),
    now: () => new Date().toISOString(),
    save: state => writeFileSync(journal, JSON.stringify(state, null, 2), { mode: 0o600 }),
    bundle: async baseline => buildCurrentSessionBundle(baseline, dir),
  });
  console.log('Code-only deployment readback complete; no business-write smoke was performed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Code-only release stopped. Inspect sanitized receipt; do not retry automatically.'); process.exitCode = 1; });
}
