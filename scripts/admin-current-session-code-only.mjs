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
  const state = { phase: 'preflight', worker: 'admin-worker', source_sha: io.sha };
  const save = phase => { state.phase = phase; io.save({ ...state }); };
  try {
    await io.approve();
    assert.match(io.sha || '', /^[a-f0-9]{40}$/);
    const call = (suffix, init) => io.call(ROOT + suffix, init);
    const deployment = (await call('/deployments'))?.deployments?.[0];
    const active = activeVersion(deployment);
    assert.equal(active, io.expectedVersion, 'approved baseline version mismatch');
    assert.equal(deployment.id, io.expectedDeployment, 'approved baseline deployment mismatch');
    const version = await call('/versions/' + active);
    assert.equal(version.id, active, 'baseline version mismatch');
    const config = versionConfiguration(version);
    const metadata = uploadMetadata(version, io.sha);
    // A stale build variable or temporal proximity is not source provenance.
    state.source_evidence = await io.sourceCheck(version);
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
    sourceCheck: async baseline => {
      const source = baseline.annotations?.['workers/commit_sha'];
      assert.match(source || '', /^[a-f0-9]{40}$/, 'baseline source provenance missing; independent code-equivalence audit required');
      git('merge-base', '--is-ancestor', source, sha);
      assert.equal(git('diff', source, sha, '--', 'admin-worker/wrangler.toml'), '',
        'source configuration or migration changed; separate release approval required');
      return { ...sourceState, method: 'version-commit-annotation', baseline_source_sha: source,
        candidate_source_sha: sha, configuration_diff: false };
    },
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
