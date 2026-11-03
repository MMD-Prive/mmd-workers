// Exact reversible CARE BACK artifact delta. Imports never contact a service.
// This does not rebuild main, change prices, or enable automatic >90-day rejoining.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import {
  ACCOUNT, ZONE, activeVersion, versionConfiguration, uploadMetadata, versionAnnotations,
} from './member-pages-code-only-release.mjs';
import { applyReviewedArtifactDelta, verifyModuleInventory } from './member-pages-artifact-delta.mjs';
import { verifyOwnerApproval } from './member-pages-owner-approval.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';

export const PATCH_SCHEMA = 'care_back_november_policy_patch_v1';
export const WORKERS = Object.freeze(['member-pages-worker', 'payments-worker']);
export const APPROVAL_ENVIRONMENTS = Object.freeze({
  'member-pages-worker': 'member-pages-code-only-owner',
  'payments-worker': 'mmd-production-mutation',
});
// These two uploads stopped before promotion on 2026-11-01. Recovery is an
// explicit fresh approved dispatch, bound to the original immutable artifacts
// and sanitized receipts, and has no version-upload transport permission.
export const REVIEWED_UPLOADS = Object.freeze({
  'payments-worker': Object.freeze({
    version: 'f05c4a1c-e4e4-4a91-8160-5ee3743cb7b9',
    tooling_sha: 'faf8b345a707fb9e83252dddf2bf1e042cf15889',
    manifest_sha256: 'a54d425b0487f1eac6a0ca13155c2306b9d1d004c817e34f96b682ea751f73fc',
    configuration_sha256: '14fa0aea4fd87f39ba3eae00db9b18da1c39fe9bd61e0b78dd27ffce59bbe894',
    settings_sha256: 'd13e83ebe9194fdbde48d1d4a9e2f1fd0b9c653ced072a1aa27fb746062c0e80',
    boundary_sha256: 'af4da01186dd1c318601e3823f10c7d0a5f50ea139dc6ee7cc65aebd3799989e',
  }),
  'member-pages-worker': Object.freeze({
    version: '85da9919-e1c8-425d-94e8-fb0a5ff7a0c4',
    tooling_sha: 'faf8b345a707fb9e83252dddf2bf1e042cf15889',
    manifest_sha256: '4b58baff72792b60b0a9de4ed199add23ed48560530781c4b338d8f0c0f8d6d9',
    configuration_sha256: '03ef14cc0c227fa7e9f5f0a67efba7ec970e19d0be7b94e3e36857cd0fe24c8d',
    settings_sha256: 'bb2196b4790bfa7d72473caef52468c66432b712f98eecef4569698ea2939b42',
    boundary_sha256: 'd044df544c19b61be7da556846d804b3549c278200c95942172595ff785516cb',
  }),
});
const MODES = ['inspect', 'execute-approved', 'promote-reviewed-upload'];
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MODULE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(?:js|mjs)$/;
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const canonical = value => JSON.stringify(sort(value));
const ordered = values => [...values].sort((a, b) => canonical(a).localeCompare(canonical(b)));
const same = (a, b, message) => assert.equal(canonical(a), canonical(b), message);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const objectHash = value => sha256(canonical(value));
const scriptRoot = worker => '/accounts/' + ACCOUNT + '/workers/scripts/' + worker;
const versionRoot = worker => '/accounts/' + ACCOUNT + '/workers/workers/' + worker + '/versions';

function exactKeys(value, keys, reason) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), reason);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), reason);
}
function workerName(worker) {
  assert.ok(WORKERS.includes(worker), 'unsupported policy release worker');
  return worker;
}

// The manifest itself must be pinned by the reviewer, separately from all byte pins inside it.
export function parsePatchManifest(raw, expectedHash, expectedWorker) {
  assert.ok(Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 8 * 1024 * 1024, 'invalid patch manifest bytes');
  assert.match(expectedHash || '', SHA256, 'exact manifest hash required');
  assert.equal(sha256(raw), expectedHash, 'patch manifest hash drift');
  assert.deepEqual(Buffer.from(raw.toString('utf8')), raw, 'manifest must be exact UTF-8');
  const manifest = JSON.parse(raw.toString('utf8'));
  exactKeys(manifest, ['schema', 'worker', 'baseline_version', 'baseline_deployment', 'main_module', 'modules'], 'unknown manifest fields');
  assert.equal(manifest.schema, PATCH_SCHEMA, 'unknown patch schema');
  assert.equal(workerName(manifest.worker), workerName(expectedWorker), 'manifest worker mismatch');
  assert.match(manifest.baseline_version, UUID);
  assert.match(manifest.baseline_deployment, UUID);
  assert.match(manifest.main_module, MODULE, 'unsupported main module');
  assert.ok(Array.isArray(manifest.modules) && manifest.modules.length > 0 && manifest.modules.length <= 8, 'invalid module inventory');
  const names = new Set();
  const ids = new Set();
  let count = 0;
  for (const module of manifest.modules) {
    exactKeys(module, ['name', 'type', 'before_sha256', 'after_sha256', 'patches'], 'unknown module manifest fields');
    assert.match(module.name, MODULE);
    assert.ok(!names.has(module.name), 'duplicate module');
    names.add(module.name);
    assert.equal(module.type, 'esm', 'only reviewed JavaScript modules are supported');
    assert.match(module.before_sha256, SHA256);
    assert.match(module.after_sha256, SHA256);
    assert.ok(Array.isArray(module.patches), 'patch inventory missing');
    for (const patch of module.patches) {
      exactKeys(patch, ['id', 'before', 'after', 'before_sha256', 'after_sha256'], 'unknown function pair fields');
      assert.match(patch.id, /^[a-zA-Z][a-zA-Z0-9_.-]{0,119}$/, 'invalid patch identity');
      assert.ok(!ids.has(patch.id), 'duplicate patch identity');
      ids.add(patch.id);
      assert.ok(typeof patch.before === 'string' && patch.before.length > 0, 'empty before code');
      assert.ok(typeof patch.after === 'string' && patch.after.length > 0, 'empty after code');
      assert.notEqual(patch.before, patch.after, 'no-op replacement');
      assert.match(patch.before_sha256, SHA256);
      assert.match(patch.after_sha256, SHA256);
      assert.equal(sha256(patch.before), patch.before_sha256, 'before function bytes drift');
      assert.equal(sha256(patch.after), patch.after_sha256, 'after function bytes drift');
      count += 1;
    }
    if (module.patches.length === 0) assert.equal(module.before_sha256, module.after_sha256, 'unpatched module changed');
    else assert.notEqual(module.before_sha256, module.after_sha256, 'patched module hash did not change');
  }
  assert.ok(names.has(manifest.main_module), 'main module missing');
  assert.ok(count > 0 && count <= 40, 'invalid bounded patch count');
  return manifest;
}

export function buildPolicyModules(artifact, manifest) {
  const baselineHashes = Object.fromEntries(manifest.modules.map(m => [m.name, m.before_sha256]));
  const baseline = verifyModuleInventory(artifact, manifest.baseline_version, manifest.main_module, baselineHashes);
  return baseline.map(module => {
    const spec = manifest.modules.find(m => m.name === module.name);
    if (!spec.patches.length) return { name: module.name, bytes: Buffer.from(module.bytes) };
    const edits = spec.patches.map(p => ({
      before: Buffer.from(p.before), after: Buffer.from(p.after),
      beforeHash: p.before_sha256, afterHash: p.after_sha256,
    }));
    const bytes = applyReviewedArtifactDelta(module.bytes, edits, spec.before_sha256);
    assert.equal(sha256(bytes), spec.after_sha256, 'candidate module hash drift');
    const reverse = applyReviewedArtifactDelta(bytes, edits.map(e => ({
      before: e.after, after: e.before, beforeHash: e.afterHash, afterHash: e.beforeHash,
    })), spec.after_sha256);
    assert.deepEqual(reverse, module.bytes, 'reverse patch did not recover exact baseline');
    return { name: module.name, bytes };
  });
}

export function verifyCandidateModules(artifact, id, manifest) {
  return verifyModuleInventory(artifact, id, manifest.main_module,
    Object.fromEntries(manifest.modules.map(m => [m.name, m.after_sha256])));
}

export function checkModuleSyntax(modules, run = execFileSync) {
  assert.ok(Array.isArray(modules) && modules.length > 0);
  return modules.map(module => {
    assert.ok(Buffer.isBuffer(module.bytes) && module.bytes.length > 0);
    assert.deepEqual(Buffer.from(module.bytes.toString('utf8')), module.bytes, 'module must be exact UTF-8');
    if (typeof vm.SourceTextModule === 'function') {
      // Parse only; never link or evaluate production code during inspection.
      new vm.SourceTextModule(module.bytes.toString('utf8'), { identifier: module.name });
    } else {
      run(process.execPath, ['--input-type=module', '--check'], {
        input: module.bytes, stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
      });
    }
    return { name: module.name, sha256: sha256(module.bytes), syntax: 'valid' };
  });
}

export function validateReleaseInputs(env, mode = 'inspect') {
  assert.ok(MODES.includes(mode), 'unsupported execution mode');
  const worker = workerName(env.CARE_BACK_WORKER);
  assert.equal(env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT, 'wrong account');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'manual dispatch required');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'main required');
  assert.equal(env.GITHUB_REPOSITORY?.toLowerCase(), 'mmd-prive/mmd-workers', 'wrong repository');
  assert.equal(env.GITHUB_REPOSITORY_ID, '1121397236', 'wrong repository identity');
  assert.equal(env.GITHUB_ACTOR, 'mmdprive', 'owner dispatch required');
  assert.equal(env.GITHUB_ACTOR_ID, '216427112', 'owner identity required');
  assert.equal(env.GITHUB_TRIGGERING_ACTOR, 'mmdprive', 'owner trigger required');
  assert.equal(env.GITHUB_RUN_ATTEMPT, '1', 'fresh dispatch required');
  assert.match(env.GITHUB_RUN_ID || '', /^[1-9][0-9]*$/);
  assert.match(env.GITHUB_SHA || '', SHA);
  assert.equal(env.APPROVED_SHA, env.GITHUB_SHA, 'exact approved main SHA required');
  assert.match(env.EXPECTED_VERSION || '', UUID);
  assert.match(env.EXPECTED_DEPLOYMENT || '', UUID);
  assert.match(env.EXPECTED_MODULE_SHA256 || '', SHA256);
  assert.match(env.EXPECTED_MANIFEST_SHA256 || '', SHA256);
  assert.ok(env.PATCH_MANIFEST && env.GH_TOKEN, 'manifest and GitHub evidence token required');
  if (mode !== 'inspect') {
    assert.equal(env.PRODUCTION_APPROVED, 'true', 'explicit execution approval required');
    assert.ok(env.APPROVAL_REF?.trim(), 'approval reference required');
    assert.equal(env.PRODUCTION_ENVIRONMENT_NAME, APPROVAL_ENVIRONMENTS[worker], 'wrong protected release environment');
  }
  if (mode === 'promote-reviewed-upload') {
    assert.equal(env.EXPECTED_MANIFEST_SHA256, REVIEWED_UPLOADS[worker].manifest_sha256, 'unreviewed recovery manifest');
  }
  return { worker, mode, releaseSha: env.GITHUB_SHA };
}

// Existing verifiers remain authoritative. In particular, a new workflow name
// cannot bypass member-pages-owner-approval.mjs's supported-workflow whitelist.
export async function verifyPolicyApproval(env, request = fetch) {
  validateReleaseInputs(env, 'execute-approved');
  if (env.CARE_BACK_WORKER === 'member-pages-worker') return verifyOwnerApproval(env, request);
  return verifyProductionApproval(env, request);
}

export async function verifyPolicyCheckout(env, manifestPath, request = fetch, git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) {
  const root = realpathSync(process.cwd());
  const path = realpathSync(manifestPath);
  const rel = relative(root, path).split(sep).join('/');
  assert.ok(rel && !rel.startsWith('../') && !rel.startsWith('/'), 'manifest must be inside release checkout');
  assert.equal(realpathSync(git('rev-parse', '--show-toplevel')), root, 'checkout root mismatch');
  assert.equal(git('rev-parse', 'HEAD'), env.APPROVED_SHA, 'checkout SHA drift');
  assert.equal(git('status', '--porcelain', '--untracked-files=all', '--ignored'), '', 'dirty release checkout');
  assert.equal(git('hash-object', '--no-filters', rel), git('rev-parse', env.APPROVED_SHA + ':' + rel), 'manifest is not the approved tracked blob');
  assert.equal(sha256(readFileSync(path)), env.EXPECTED_MANIFEST_SHA256, 'tracked manifest bytes drift');
  const response = await request('https://api.github.com/repos/MMD-Prive/mmd-workers/git/ref/heads/main', {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  assert.equal(response.status, 200, 'cannot verify current main');
  assert.equal((await response.json()).object?.sha, env.APPROVED_SHA, 'main drift');
  return { release_sha: env.APPROVED_SHA, manifest_sha256: env.EXPECTED_MANIFEST_SHA256 };
}

export function createPolicyTransport(token, worker, { allowWrites = false, promoteOnly = false, request = fetch } = {}) {
  assert.ok(token, 'Cloudflare credential required');
  workerName(worker);
  const root = scriptRoot(worker);
  const versions = versionRoot(worker);
  const id = '[a-f0-9-]{36}';
  return async (path, { method = 'GET', body } = {}) => {
    const read = new RegExp('^' + root + '/(deployments(?:/' + id + ')?|versions(?:/' + id + ')?|script-settings|schedules|subdomain)$', 'i').test(path)
      || new RegExp('^' + versions + '/' + id + '(?:\\?include=modules)?$', 'i').test(path)
      || path === '/zones/' + ZONE + '/workers/routes';
    const writes = promoteOnly ? [root + '/deployments'] : [root + '/versions?bindings_inherit=strict', root + '/deployments'];
    const write = allowWrites === true && method === 'POST' && writes.includes(path);
    assert.ok((method === 'GET' && read) || write, 'call outside bounded policy transport');
    let response;
    try {
      response = await request('https://api.cloudflare.com/client/v4' + path, {
        method, body, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: 'Bearer ' + token, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      });
    } catch { throw new Error('transport outcome unknown; do not retry automatically'); }
    const payload = await response.json().catch(() => null);
    assert.ok(response.ok && payload?.success === true, 'Cloudflare request failed; do not retry automatically');
    return payload.result;
  };
}

export async function releasePolicyPatch(io, { reviewedUploads = REVIEWED_UPLOADS, parseManifest = parsePatchManifest, releaseLabel = 'CARE BACK November exact artifact delta' } = {}) {
  const mode = io.mode || 'inspect';
  assert.ok(MODES.includes(mode));
  assert.match(io.releaseSha || '', SHA);
  const manifest = parseManifest(io.manifestBytes, io.expectedManifestHash, io.worker);
  assert.equal(manifest.baseline_version, io.expectedVersion, 'version pin mismatch');
  assert.equal(manifest.baseline_deployment, io.expectedDeployment, 'deployment pin mismatch');
  assert.equal(manifest.modules.find(m => m.name === manifest.main_module).before_sha256, io.expectedModuleHash, 'main module pin mismatch');
  const recovery = mode === 'promote-reviewed-upload' ? reviewedUploads[manifest.worker] : null;
  if (mode === 'promote-reviewed-upload') assert.ok(recovery, 'reviewed upload contract required');
  if (recovery) assert.equal(io.expectedManifestHash, recovery.manifest_sha256, 'unreviewed recovery manifest');
  const expectedLatest = recovery?.version || manifest.baseline_version;
  const state = { phase: 'preflight', worker: manifest.worker, mode, release_sha: io.releaseSha,
    manifest_sha256: io.expectedManifestHash, baseline_version: io.expectedVersion,
    baseline_deployment: io.expectedDeployment };
  const save = phase => { state.phase = phase; io.save?.({ ...state }); };
  const call = (suffix, init) => io.call(scriptRoot(manifest.worker) + suffix, init);
  const modulesPath = id => versionRoot(manifest.worker) + '/' + id + '?include=modules';
  try {
    state.stage = 'source-check';
    await io.sourceCheck();
    state.stage = 'approval-check';
    if (mode !== 'inspect') await io.approve();
    state.stage = 'baseline-read';
    const deployment = (await call('/deployments'))?.deployments?.[0];
    assert.equal(activeVersion(deployment), manifest.baseline_version, 'active version drift');
    assert.equal(deployment.id, manifest.baseline_deployment, 'active deployment drift');
    const [baseline, artifact, settings, routes, schedules, subdomain, versions] = await Promise.all([
      call('/versions/' + manifest.baseline_version), io.call(modulesPath(manifest.baseline_version)),
      call('/script-settings'), io.call('/zones/' + ZONE + '/workers/routes'),
      call('/schedules'), call('/subdomain'), call('/versions'),
    ]);
    assert.equal(baseline.id, manifest.baseline_version, 'version readback identity mismatch');
    assert.equal(versions?.items?.[0]?.id, expectedLatest, 'latest version differs from reviewed release');
    if (recovery) assert.equal(versions?.items?.[1]?.id, manifest.baseline_version, 'reviewed upload predecessor changed');
    state.stage = 'configuration-check';
    const config = versionConfiguration(baseline);
    assert.ok(Array.isArray(routes) && Array.isArray(schedules?.schedules), 'boundary inventory incomplete');
    const boundary = { routes: ordered(routes), schedules: ordered(schedules.schedules), subdomain };
    const metadata = uploadMetadata(baseline, io.releaseSha);
    metadata.main_module = manifest.main_module;
    delete metadata.annotations['workers/commit_sha'];
    metadata.annotations['workers/message'] = releaseLabel + '; base=' + manifest.baseline_version
      + '; manifest=' + io.expectedManifestHash + '; tooling=' + (recovery?.tooling_sha || io.releaseSha);
    state.stage = 'exact-artifact-patch';
    const candidate = buildPolicyModules(artifact, manifest);
    state.stage = 'whole-module-syntax';
    state.modules = checkModuleSyntax(candidate);
    state.configuration_sha256 = objectHash(config);
    state.settings_sha256 = objectHash(settings);
    state.boundary_sha256 = objectHash(boundary);
    if (recovery) {
      state.stage = 'original-upload-receipt-check';
      for (const key of ['configuration_sha256', 'settings_sha256', 'boundary_sha256']) {
        assert.equal(state[key], recovery[key], 'original upload receipt drift: ' + key);
      }
      state.uploaded_tooling_sha = recovery.tooling_sha;
    }
    const unchanged = async (expectedDeployment, latestId) => {
      const [deploymentsNow, versionsNow, settingsNow, routesNow, schedulesNow, subdomainNow] = await Promise.all([
        call('/deployments'), call('/versions'), call('/script-settings'),
        io.call('/zones/' + ZONE + '/workers/routes'), call('/schedules'), call('/subdomain'),
      ]);
      activeVersion(deploymentsNow?.deployments?.[0]);
      same(deploymentsNow.deployments[0], expectedDeployment, 'active deployment changed during release');
      assert.equal(versionsNow?.items?.[0]?.id, latestId, 'latest upload changed during release');
      assert.ok(Array.isArray(routesNow) && Array.isArray(schedulesNow?.schedules), 'boundary recheck incomplete');
      same(settingsNow, settings, 'script settings changed');
      same({ routes: ordered(routesNow), schedules: ordered(schedulesNow.schedules), subdomain: subdomainNow }, boundary, 'routes, schedules or subdomain changed');
    };
    state.stage = 'baseline-recheck';
    await unchanged(deployment, expectedLatest);
    if (mode === 'inspect') { save('inspected'); return { ...state }; }

    let uploaded;
    if (recovery) {
      uploaded = { id: recovery.version };
    } else {
      state.stage = 'upload-approval';
      await io.sourceCheck();
      await io.approve();
      await unchanged(deployment, manifest.baseline_version);
      const form = new FormData();
      form.set('metadata', JSON.stringify(metadata));
      for (const module of candidate) form.set(module.name, new Blob([module.bytes], { type: 'application/javascript+module' }), module.name);
      save('upload-attempted-outcome-unknown');
      state.stage = 'upload';
      uploaded = await call('/versions?bindings_inherit=strict', { method: 'POST', body: form });
    }
    assert.match(uploaded?.id || '', UUID, 'upload identity missing');
    assert.notEqual(uploaded.id, manifest.baseline_version, 'upload identity did not change');
    state.uploaded_version = uploaded.id;
    save('uploaded-not-promoted');
    state.stage = 'uploaded-readback';
    const [uploadedVersion, uploadedArtifact, annotations, latest] = await Promise.all([
      call('/versions/' + uploaded.id), io.call(modulesPath(uploaded.id)),
      io.call(versionRoot(manifest.worker) + '/' + uploaded.id), call('/versions'),
    ]);
    state.stage = 'uploaded-configuration-check';
    assert.equal(uploadedVersion.id, uploaded.id, 'uploaded version identity mismatch');
    same(versionConfiguration(uploadedVersion), config, 'uploaded configuration changed');
    state.stage = 'uploaded-annotations-check';
    assert.equal(annotations?.id, uploaded.id, 'annotation identity mismatch');
    // Cloudflare adds this exact server-owned marker to a version upload.
    // All authored annotations and every other key still compare exactly.
    same(versionAnnotations(annotations), { ...metadata.annotations, 'workers/triggered_by': 'version_upload' }, 'uploaded annotations changed');
    state.stage = 'uploaded-modules-check';
    verifyCandidateModules(uploadedArtifact, uploaded.id, manifest);
    state.stage = 'uploaded-predecessor-check';
    assert.equal(latest?.items?.[0]?.id, uploaded.id, 'uploaded version is not latest');
    assert.equal(latest?.items?.[1]?.id, manifest.baseline_version, 'uploaded predecessor changed');

    state.stage = 'promotion-approval';
    await io.sourceCheck();
    await io.approve();
    await unchanged(deployment, uploaded.id);
    save('promotion-attempted-outcome-unknown');
    state.stage = 'promotion';
    const promoted = await call('/deployments', { method: 'POST', body: JSON.stringify({
      strategy: 'percentage', versions: [{ version_id: uploaded.id, percentage: 100 }],
    }) });
    assert.match(promoted?.id || '', UUID, 'promotion identity missing');
    assert.notEqual(promoted.id, manifest.baseline_deployment, 'promotion identity did not change');
    state.deployment = promoted.id;
    state.stage = 'post-promotion-readback';
    const receipt = await call('/deployments/' + promoted.id);
    assert.equal(receipt.id, promoted.id, 'deployment receipt identity mismatch');
    assert.equal(activeVersion(receipt), uploaded.id, 'uploaded version is not serving all traffic');
    await unchanged(receipt, uploaded.id);
    const [promotedVersion, promotedArtifact] = await Promise.all([
      call('/versions/' + uploaded.id), io.call(modulesPath(uploaded.id)),
    ]);
    assert.equal(promotedVersion.id, uploaded.id);
    same(versionConfiguration(promotedVersion), config, 'post-promotion configuration changed');
    verifyCandidateModules(promotedArtifact, uploaded.id, manifest);
    save('complete');
    return { ...state };
  } catch (error) {
    state.stopped_after = state.phase;
    save('stopped');
    throw error;
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  assert.ok(argv.length <= 1 && (!argv.length || MODES.map(mode => '--' + mode).includes(argv[0])), 'unsupported arguments');
  const mode = argv[0]?.slice(2) || 'inspect';
  const input = validateReleaseInputs(env, mode);
  const manifestPath = resolve(env.PATCH_MANIFEST);
  const receipt = resolve(env.RUNNER_TEMP || '/tmp', 'care-back-november-' + input.worker + '-receipt.json');
  await verifyPolicyCheckout(env, manifestPath);
  return releasePolicyPatch({
    ...input, manifestBytes: readFileSync(manifestPath), expectedManifestHash: env.EXPECTED_MANIFEST_SHA256,
    expectedModuleHash: env.EXPECTED_MODULE_SHA256, expectedVersion: env.EXPECTED_VERSION,
    expectedDeployment: env.EXPECTED_DEPLOYMENT,
    sourceCheck: () => verifyPolicyCheckout(env, manifestPath),
    approve: () => verifyPolicyApproval(env),
    call: createPolicyTransport(env.CLOUDFLARE_API_TOKEN, input.worker, {
      allowWrites: mode !== 'inspect', promoteOnly: mode === 'promote-reviewed-upload',
    }),
    save: value => writeFileSync(receipt, JSON.stringify(value, null, 2), { mode: 0o600 }),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('CARE BACK policy release stopped; inspect the sanitized receipt. Do not retry automatically.'); process.exitCode = 1; });
}

