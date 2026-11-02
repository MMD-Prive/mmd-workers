import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MEMBER_WORKER = 'member-pages-worker';
export const ADMIN_WORKER = 'admin-worker';
export const DO_CLASS = 'CustomerRequestMutationCoordinator';
export const CLOUDFLARE_ACCOUNT_ID = 'b176eda1172b741fd2e58904cc9d77c5';
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonHash = value => hash(Buffer.from(JSON.stringify(value ?? null)));
const same = (a, b, message) => assert.equal(JSON.stringify(a), JSON.stringify(b), message);

export function metadataFor(baseline, manifest, worker, liveSettings = null) {
  const resources = baseline?.resources;
  assert.ok(resources?.script && resources?.script_runtime && Array.isArray(resources.bindings), `${worker} baseline incomplete`);
  const metadata = {
    main_module: resources.script.main_module || 'worker.js',
    bindings: resources.bindings.map(binding => ({ name: binding.name, type: 'inherit' })),
    compatibility_date: resources.script_runtime.compatibility_date,
    compatibility_flags: resources.script_runtime.compatibility_flags || [],
  };
  if (resources.script_runtime.usage_model !== undefined) metadata.usage_model = resources.script_runtime.usage_model;
  if (resources.script_runtime.limits !== undefined) metadata.limits = resources.script_runtime.limits;
  if (resources.script.placement !== undefined) metadata.placement = structuredClone(resources.script.placement);
  else if (resources.script.placement_mode === 'smart') metadata.placement = { mode: 'smart' };
  if (baseline.cache_options !== undefined && baseline.cache_options !== null) metadata.cache_options = structuredClone(baseline.cache_options);
  // The version resource does not consistently expose script-level settings
  // (notably observability/tail/tags).  Full-script PUT replaces the script,
  // so take those values from the fresh script-settings snapshot when present.
  // Keep this allowlist narrow: settings not understood by the upload API must
  // not be copied into deployment metadata by accident.
  for (const key of ['observability', 'tail_consumers', 'tags', 'logpush']) {
    const value = liveSettings?.[key] ?? baseline[key] ?? resources.script[key];
    if (value !== undefined) metadata[key] = structuredClone(value);
  }
  Object.defineProperty(metadata, '__expected_bindings', { value: resources.bindings.map(binding => {
    if (['secret_text', 'secret_key'].includes(binding.type)) return { name: binding.name, type: binding.type };
    return structuredClone(binding);
  }), enumerable: false });
  if (worker === MEMBER_WORKER) {
    metadata.bindings.push({ name: 'CUSTOMER_REQUEST_MUTATION', type: 'durable_object_namespace', class_name: DO_CLASS });
    metadata.migrations = { old_tag: 'v3-remembered-login-device', new_tag: 'v5-customer-request-mutation', new_sqlite_classes: [DO_CLASS] };
  }
  assert.ok(metadata.bindings.every(binding => binding.type === 'inherit' || binding.name === 'CUSTOMER_REQUEST_MUTATION'));
  assert.equal(manifest.unchanged_prefix_suffix, true);
  return metadata;
}

export function verifyBaseline(snapshot, expected, worker) {
  assert.equal(snapshot.version.id, expected.version, `${worker} active version drift`);
  assert.equal(snapshot.deployment.id, expected.deployment, `${worker} active deployment drift`);
  assert.equal(snapshot.deployment.versions?.length, 1, `${worker} traffic split`);
  assert.equal(snapshot.deployment.versions[0].percentage, 100, `${worker} traffic allocation`);
  assert.equal(snapshot.deployment.versions[0].version_id, expected.version, `${worker} serving version drift`);
  assert.equal(snapshot.latest_version, expected.version, `${worker} newer version exists`);
  if (expected.baseline_sha256) assert.equal(hash(snapshot.module_bytes), expected.baseline_sha256, `${worker} baseline module drift`);
  if (worker === MEMBER_WORKER) assert.equal(snapshot.version.resources.script_runtime.migration_tag, 'v3-remembered-login-device');
}

export function verifyServingBaseline(snapshot, expected, worker) {
  assert.equal(snapshot.version.id, expected.version, `${worker} serving version drift`);
  assert.equal(snapshot.deployment.id, expected.deployment, `${worker} serving deployment drift`);
  assert.equal(snapshot.deployment.versions?.length, 1, `${worker} serving split traffic`);
  assert.equal(snapshot.deployment.versions[0].percentage, 100, `${worker} serving traffic allocation`);
  assert.equal(snapshot.deployment.versions[0].version_id, expected.version, `${worker} serving version mismatch`);
  if (expected.baseline_sha256) assert.equal(hash(snapshot.module_bytes), expected.baseline_sha256, `${worker} serving module drift`);
}

export async function executeRecoveryArtifactRelease(io, plan) {
  const receipt = { phase: 'preflight', scope: 'membership-recovery-artifact-pair', rollback_policy: 'no_automatic_rollback_across_DO_migration', fallback_strategy: 'manual_forward_compatible_full_script_deploy_required', rollback_targets: {}, upload_attempts: {}, promotion_attempts: {} };
  const save = value => io.save?.(structuredClone(value));
  try {
    await io.approve('preflight');
    const member = await io.snapshot(MEMBER_WORKER);
    const admin = await io.snapshot(ADMIN_WORKER);
    verifyBaseline(member, plan.member, MEMBER_WORKER);
    verifyBaseline(admin, plan.admin, ADMIN_WORKER);
    io.assertMigrationReady?.();
    receipt.rollback_targets = {
      member: { deployment_id: member.deployment.id, version_id: member.version.id },
      admin: { deployment_id: admin.deployment.id, version_id: admin.version.id },
    };
    const baselineSettings = { member: member.settings, admin: admin.settings };
    const memberMeta = metadataFor(member.version, plan.memberManifest, MEMBER_WORKER, member.settings);
    const adminMeta = metadataFor(admin.version, plan.adminManifest, ADMIN_WORKER, admin.settings);
    assert.equal(hash(plan.memberBytes), plan.memberManifest.candidate_sha256, 'member candidate hash drift');
    assert.equal(hash(plan.adminBytes), plan.adminManifest.candidate_sha256, 'admin candidate hash drift');
    await io.approve('upload');
    receipt.phase = 'upload-attempted-outcome-unknown'; receipt.upload_attempts.member = { state: 'started' }; await save(receipt);
    const memberUploaded = await io.upload(MEMBER_WORKER, memberMeta, plan.memberBytes);
    receipt.upload_attempts.member = { state: 'returned', version_id: memberUploaded.id }; receipt.uploaded = { member: memberUploaded.id }; await save(receipt);
    receipt.upload_attempts.admin = { state: 'started' }; await save(receipt);
    const adminUploaded = await io.upload(ADMIN_WORKER, adminMeta, plan.adminBytes);
    receipt.upload_attempts.admin = { state: 'returned', version_id: adminUploaded.id }; receipt.uploaded.admin = adminUploaded.id;
    receipt.phase = 'uploaded-readback'; await save(receipt);
    await io.verifyUploaded(MEMBER_WORKER, memberUploaded.id, memberMeta, plan.memberManifest);
    await io.verifyUploaded(ADMIN_WORKER, adminUploaded.id, adminMeta, plan.adminManifest);
    const memberServing = await io.snapshot(MEMBER_WORKER); const adminServing = await io.snapshot(ADMIN_WORKER);
    verifyServingBaseline(memberServing, plan.member, MEMBER_WORKER); verifyServingBaseline(adminServing, plan.admin, ADMIN_WORKER);
    if (memberServing.latest_version !== undefined) assert.equal(memberServing.latest_version, memberUploaded.id, 'member latest version changed after upload');
    if (adminServing.latest_version !== undefined) assert.equal(adminServing.latest_version, adminUploaded.id, 'admin latest version changed after upload');
    await io.approve('promote');
    receipt.phase = 'promotion-attempted-outcome-unknown'; receipt.promotion_attempts.member = { state: 'started', version_id: memberUploaded.id }; await save(receipt);
    const memberDeployment = await io.promote(MEMBER_WORKER, memberUploaded.id);
    receipt.promoted = { member: memberDeployment.id }; receipt.promotion_attempts.member = { state: 'returned', deployment_id: memberDeployment.id }; await save(receipt);
    await io.verifyPromoted?.(MEMBER_WORKER, memberUploaded.id, baselineSettings.member);
    receipt.promotion_attempts.admin = { state: 'started', version_id: adminUploaded.id }; await save(receipt);
    const adminDeployment = await io.promote(ADMIN_WORKER, adminUploaded.id);
    receipt.promoted.admin = adminDeployment.id; receipt.promotion_attempts.admin = { state: 'returned', deployment_id: adminDeployment.id }; await save(receipt);
    await io.verifyPromoted?.(ADMIN_WORKER, adminUploaded.id, baselineSettings.admin);
    receipt.phase = 'complete'; await save(receipt);
    return receipt;
  } catch (error) {
    receipt.phase = receipt.phase === 'promotion-attempted-outcome-unknown' ? 'partial-or-unknown-promotion' : 'stopped';
    receipt.error = String(error?.message || 'release_failed').slice(0, 200);
    await save(receipt);
    throw Object.assign(new Error('Recovery artifact release stopped; inspect receipt and rollback targets.'), { receipt });
  }
}

// Full-script deployment is required when the member candidate creates a new
// Durable Object class. Unlike versions upload + promotion, PUT /scripts/{name}
// applies the migration as part of an immediate deployment. The receipt and
// post-write checks make that side effect explicit; there is no fake staging
// claim and no unsafe rollback to the pre-migration version.
export async function executeRecoveryFullScriptDeploy(io, plan) {
  const receipt = { phase: 'preflight', scope: 'membership-recovery-full-script-pair', deployment_policy: 'immediate_full_script_deploy', rollback_policy: 'no_automatic_rollback_across_DO_migration', fallback_strategy: 'manual_forward_compatible_full_script_deploy_required', rollback_targets: {}, deploy_attempts: {} };
  const save = value => io.save?.(structuredClone(value));
  try {
    await io.approve('preflight');
    const member = await io.snapshot(MEMBER_WORKER); const admin = await io.snapshot(ADMIN_WORKER);
    verifyBaseline(member, plan.member, MEMBER_WORKER); verifyBaseline(admin, plan.admin, ADMIN_WORKER);
    io.assertMigrationReady?.();
    receipt.rollback_targets = { member: { deployment_id: member.deployment.id, version_id: member.version.id }, admin: { deployment_id: admin.deployment.id, version_id: admin.version.id } };
    const memberMeta = metadataFor(member.version, plan.memberManifest, MEMBER_WORKER, member.settings);
    const adminMeta = metadataFor(admin.version, plan.adminManifest, ADMIN_WORKER, admin.settings);
    assert.equal(hash(plan.memberBytes), plan.memberManifest.candidate_sha256, 'member candidate hash drift');
    assert.equal(hash(plan.adminBytes), plan.adminManifest.candidate_sha256, 'admin candidate hash drift');
    await io.approve('deploy');
    receipt.phase = 'member-deploy-attempted-outcome-unknown'; receipt.deploy_attempts.member = { state: 'started' }; await save(receipt);
    const memberResult = await io.deploy(MEMBER_WORKER, memberMeta, plan.memberBytes);
    receipt.deploy_attempts.member = { state: 'returned' }; await save(receipt);
    const memberAfter = await io.verifyDeployed(MEMBER_WORKER, member.version.id, plan.memberManifest.candidate_sha256, member.settings, memberMeta, plan.memberManifest);
    receipt.deployed = { member: { version_id: memberAfter.version.id, deployment_id: memberAfter.deployment.id } }; await save(receipt);
    receipt.phase = 'admin-deploy-attempted-outcome-unknown'; receipt.deploy_attempts.admin = { state: 'started' }; await save(receipt);
    // The member migration is an immediate deployment. Re-read the admin
    // baseline after it completes so a concurrent admin change cannot be
    // silently overwritten by the second PUT.
    const adminFresh = await io.snapshot(ADMIN_WORKER);
    verifyBaseline(adminFresh, plan.admin, ADMIN_WORKER);
    const adminFreshMeta = metadataFor(adminFresh.version, plan.adminManifest, ADMIN_WORKER, adminFresh.settings);
    const adminResult = await io.deploy(ADMIN_WORKER, adminFreshMeta, plan.adminBytes);
    receipt.deploy_attempts.admin = { state: 'returned' }; await save(receipt);
    const adminAfter = await io.verifyDeployed(ADMIN_WORKER, adminFresh.version.id, plan.adminManifest.candidate_sha256, adminFresh.settings, adminFreshMeta, plan.adminManifest);
    receipt.deployed.admin = { version_id: adminAfter.version.id, deployment_id: adminAfter.deployment.id };
    receipt.provider_results = { member: Boolean(memberResult), admin: Boolean(adminResult) };
    receipt.phase = 'complete'; await save(receipt); return receipt;
  } catch (error) {
    receipt.phase = receipt.phase.includes('deploy-attempted') ? 'partial-or-unknown-deployment' : 'stopped';
    receipt.error = String(error?.message || 'release_failed').slice(0, 200); await save(receipt);
    throw Object.assign(new Error('Recovery full-script deployment stopped; inspect receipt and forward-compatible recovery plan.'), { receipt });
  }
}

const workerRoot = worker => `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${worker}`;
const versionRoot = worker => `/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/workers/${worker}/versions`;
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

function moduleBytes(version, name = 'worker.js') {
  const module = version?.modules?.find(item => item.name === name);
  assert.ok(module?.content_base64, `uploaded ${name} module content missing`);
  return Buffer.from(module.content_base64, 'base64');
}

export function requireRecoveryExecuteApproval(env = process.env) {
  assert.equal(env.MMD_RECOVERY_APPROVAL, 'approved', 'MMD_RECOVERY_APPROVAL=approved is required for --execute');
  assert.ok(env.MMD_RECOVERY_APPROVAL_REF?.trim(), 'MMD_RECOVERY_APPROVAL_REF is required for --execute');
  assert.match(env.MMD_RECOVERY_APPROVED_SHA || '', /^[a-f0-9]{40}$/i, 'MMD_RECOVERY_APPROVED_SHA is required for --execute');
}

export function requireRecoveryMigrationRoute(env = process.env) {
  assert.equal(env.MMD_RECOVERY_MIGRATION_MODE, 'full-script-deploy-reviewed', 'DO migration route is not approved; version upload is disabled until a reviewed full-script deployment adapter is available');
}

// Production transport for the scoped pair. It is deliberately narrower than a
// general Wrangler client: only Worker version/deployment reads, version upload,
// and deployment promotion are reachable. Secrets are read at runtime and never
// included in receipts or error messages.
export function createCloudflareRecoveryAdapter({ token, request = fetch, accountId = CLOUDFLARE_ACCOUNT_ID, env = process.env } = {}) {
  assert.ok(typeof token === 'string' && token.length > 0, 'Cloudflare API token required');
  assert.equal(accountId, CLOUDFLARE_ACCOUNT_ID, 'unexpected Cloudflare account');
  const call = async (path, { method = 'GET', body } = {}) => {
    assert.ok(path.startsWith(`/accounts/${accountId}/workers/`), 'Cloudflare path outside Worker scope');
    assert.ok(['GET', 'POST', 'PUT'].includes(method), 'Cloudflare method outside release scope');
    const response = await request(CLOUDFLARE_API + path, {
      method, body, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    }).catch(() => { throw new Error('Cloudflare transport failed; outcome may be unknown; do not retry'); });
    const payload = await response.json().catch(() => null);
    assert.ok(response.ok && payload?.success === true, `Cloudflare ${method} failed (${response.status}); stop without retry`);
    return payload.result;
  };
  const snapshot = async worker => {
    const root = workerRoot(worker);
    const deployment = (await call(root + '/deployments'))?.deployments?.[0];
    assert.ok(deployment?.id && Array.isArray(deployment.versions), `${worker} deployment missing`);
    const active = deployment.versions.find(item => item.percentage === 100) || deployment.versions[0];
    assert.ok(active?.version_id, `${worker} active version missing`);
    const version = await call(root + '/versions/' + active.version_id);
    const versions = await call(root + '/versions');
    const artifact = await call(versionRoot(worker) + '/' + active.version_id + '?include=modules');
    const settings = await call(root + '/script-settings');
    return { version, deployment, latest_version: versions?.items?.[0]?.id, module_bytes: moduleBytes(artifact), settings };
  };
  const upload = async (worker, metadata, bytes) => {
    assert.ok(bytes instanceof Uint8Array && bytes.byteLength > 0, `${worker} candidate bytes missing`);
    const form = new FormData();
    form.set('metadata', JSON.stringify(metadata));
    form.set('worker.js', new Blob([bytes], { type: 'application/javascript+module' }), 'worker.js');
    const result = await call(workerRoot(worker) + '/versions?bindings_inherit=strict', { method: 'POST', body: form });
    assert.ok(uuid(result?.id), `${worker} upload returned an invalid version id`);
    return result;
  };
  const verifyUploaded = async (worker, versionId, metadata, manifest) => {
    assert.ok(uuid(versionId), `${worker} uploaded version id invalid`);
    const exact = await call(workerRoot(worker) + '/versions/' + versionId);
    assert.equal(exact?.id, versionId, `${worker} uploaded version identity mismatch`);
    verifyVersionMetadata(exact, metadata, manifest, worker);
    const artifact = await call(versionRoot(worker) + '/' + versionId + '?include=modules');
    assert.equal(hash(moduleBytes(artifact)), manifest.candidate_sha256, `${worker} uploaded module hash mismatch`);
    return exact;
  };
  const verifyVersionMetadata = (exact, metadata, manifest, worker) => {
    const actualBindings = exact?.resources?.bindings || [];
    const actualByName = new Map(actualBindings.map(binding => [binding.name, binding]));
    for (const binding of metadata.__expected_bindings || []) {
      const actual = actualByName.get(binding.name); assert.ok(actual, `${worker} binding readback missing: ${binding.name}`);
      for (const key of Object.keys(binding)) if (!(binding.type === 'secret_text' || binding.type === 'secret_key') || key === 'name' || key === 'type') assert.deepEqual(actual[key], binding[key], `${worker} binding changed: ${binding.name}.${key}`);
    }
    assert.ok(actualByName.has('CUSTOMER_REQUEST_MUTATION') === (worker === MEMBER_WORKER), `${worker} mutation binding scope changed`);
    if (worker === MEMBER_WORKER) {
      const mutation = actualByName.get('CUSTOMER_REQUEST_MUTATION');
      assert.equal(mutation.type, 'durable_object_namespace', `${worker} mutation binding type changed`);
      assert.equal(mutation.class_name, DO_CLASS, `${worker} mutation binding class changed`);
    }
    const runtime = exact?.resources?.script_runtime || {};
    for (const key of ['compatibility_date', 'compatibility_flags', 'usage_model', 'limits']) if (metadata[key] !== undefined) assert.deepEqual(runtime[key], metadata[key], `${worker} runtime metadata changed: ${key}`);
    if (metadata.placement !== undefined) assert.deepEqual(exact?.resources?.script?.placement || exact?.placement, metadata.placement, `${worker} placement changed`);
    if (metadata.cache_options !== undefined) assert.deepEqual(exact.cache_options, metadata.cache_options, `${worker} cache options changed`);
    if (worker === MEMBER_WORKER) {
      assert.equal(exact?.resources?.script_runtime?.migration_tag, manifest.migration?.new_tag, `${worker} migration readback mismatch`);
    }
    for (const key of ['observability', 'tail_consumers', 'tags', 'logpush']) {
      if (metadata[key] !== undefined) assert.deepEqual(exact?.[key] ?? exact?.resources?.script?.[key], metadata[key], `${worker} ${key} changed`);
    }
    return exact;
  };
  const promote = async (worker, versionId) => {
    const result = await call(workerRoot(worker) + '/deployments', {
      method: 'POST', body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: versionId, percentage: 100 }] }),
    });
    assert.ok(result?.id, `${worker} promotion returned no deployment`);
    return result;
  };
  const deploy = async (worker, metadata, bytes) => {
    assert.ok(bytes instanceof Uint8Array && bytes.byteLength > 0, `${worker} candidate bytes missing`);
    const form = new FormData(); form.set('metadata', JSON.stringify(metadata));
    form.set('worker.js', new Blob([bytes], { type: 'application/javascript+module' }), 'worker.js');
    return call(workerRoot(worker) + '?bindings_inherit=strict', { method: 'PUT', body: form });
  };
  const verifyDeployed = async (worker, baselineVersionId, candidateSha256, baselineSettings, metadata, manifest) => {
    const current = await snapshot(worker);
    assert.notEqual(current.version.id, baselineVersionId, `${worker} deployment did not create a new version`);
    assert.equal(current.deployment.versions?.length, 1, `${worker} deployment split traffic`);
    assert.equal(current.deployment.versions[0].version_id, current.version.id, `${worker} deployment serving mismatch`);
    assert.equal(hash(current.module_bytes), candidateSha256, `${worker} deployed module hash mismatch`);
    assert.equal(jsonHash(current.settings), jsonHash(baselineSettings), `${worker} settings changed during deployment`);
    if (metadata && manifest) {
      verifyVersionMetadata(current.version, metadata, manifest, worker);
      assert.equal(current.version.resources?.script_runtime?.migration_tag, manifest.migration?.new_tag || current.version.resources?.script_runtime?.migration_tag, `${worker} migration readback mismatch`);
    }
    return current;
  };
  const verifyPromoted = async (worker, versionId, baselineSettings) => {
    const current = await snapshot(worker);
    assert.equal(current.version.id, versionId, `${worker} post-promotion version mismatch`);
    assert.equal(current.deployment.versions?.length, 1, `${worker} post-promotion split traffic`);
    assert.equal(current.deployment.versions[0].version_id, versionId, `${worker} post-promotion serving mismatch`);
    assert.equal(jsonHash(current.settings), jsonHash(baselineSettings), `${worker} settings changed during promotion`);
  };
  return {
    assertMigrationReady: () => requireRecoveryMigrationRoute(env),
    approve: async stage => {
      requireRecoveryExecuteApproval(env);
    },
    snapshot, upload, verifyUploaded, promote, verifyPromoted, deploy, verifyDeployed,
    save: receipt => {
      const destination = env.MMD_RECOVERY_RECEIPT_PATH;
      if (!destination) return;
      const path = resolve(destination);
      writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    },
  };
}

export function readPlan(memberCandidate, adminCandidate, memberManifestPath, adminManifestPath) {
  return {
    memberBytes: readFileSync(memberCandidate), adminBytes: readFileSync(adminCandidate),
    memberManifest: JSON.parse(readFileSync(memberManifestPath, 'utf8')),
    adminManifest: JSON.parse(readFileSync(adminManifestPath, 'utf8')),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] || '--plan-only';
  if (mode === '--plan-only') {
    console.log(JSON.stringify({ scope: 'membership-recovery-artifact-pair', requires: ['fresh active snapshots', 'owner approval', 'paired upload readback', 'paired promotion'] }));
  } else if (mode === '--execute') {
    requireRecoveryExecuteApproval();
    requireRecoveryMigrationRoute();
    const required = ['MMD_RECOVERY_MEMBER_CANDIDATE', 'MMD_RECOVERY_ADMIN_CANDIDATE', 'MMD_RECOVERY_MEMBER_MANIFEST', 'MMD_RECOVERY_ADMIN_MANIFEST', 'MMD_RECOVERY_MEMBER_VERSION', 'MMD_RECOVERY_MEMBER_DEPLOYMENT', 'MMD_RECOVERY_ADMIN_VERSION', 'MMD_RECOVERY_ADMIN_DEPLOYMENT'];
    for (const name of required) assert.ok(process.env[name], `${name} is required for --execute`);
    const plan = readPlan(process.env.MMD_RECOVERY_MEMBER_CANDIDATE, process.env.MMD_RECOVERY_ADMIN_CANDIDATE, process.env.MMD_RECOVERY_MEMBER_MANIFEST, process.env.MMD_RECOVERY_ADMIN_MANIFEST);
    plan.member = { version: process.env.MMD_RECOVERY_MEMBER_VERSION, deployment: process.env.MMD_RECOVERY_MEMBER_DEPLOYMENT, baseline_sha256: plan.memberManifest.baseline_sha256 };
    plan.admin = { version: process.env.MMD_RECOVERY_ADMIN_VERSION, deployment: process.env.MMD_RECOVERY_ADMIN_DEPLOYMENT, baseline_sha256: plan.adminManifest.baseline_sha256 };
    await executeRecoveryFullScriptDeploy(createCloudflareRecoveryAdapter({ token: process.env.CLOUDFLARE_API_TOKEN }), plan);
  } else {
    throw new Error('Use --plan-only or --execute');
  }
}
