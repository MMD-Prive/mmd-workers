import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MEMBER_WORKER = 'member-pages-worker';
export const ADMIN_WORKER = 'admin-worker';
export const DO_CLASS = 'CustomerRequestMutationCoordinator';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b, message) => assert.equal(JSON.stringify(a), JSON.stringify(b), message);

export function metadataFor(baseline, manifest, worker) {
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
  assert.equal(snapshot.latest_version, expected.version, `${worker} newer version exists`);
  if (worker === MEMBER_WORKER) assert.equal(snapshot.version.resources.script_runtime.migration_tag, 'v3-remembered-login-device');
}

export async function executeRecoveryArtifactRelease(io, plan) {
  const receipt = { phase: 'preflight', scope: 'membership-recovery-artifact-pair', rollback_targets: {} };
  const save = value => io.save?.(structuredClone(value));
  try {
    await io.approve('preflight');
    const member = await io.snapshot(MEMBER_WORKER);
    const admin = await io.snapshot(ADMIN_WORKER);
    verifyBaseline(member, plan.member, MEMBER_WORKER);
    verifyBaseline(admin, plan.admin, ADMIN_WORKER);
    receipt.rollback_targets = { member: member.deployment.id, admin: admin.deployment.id };
    const memberMeta = metadataFor(member.version, plan.memberManifest, MEMBER_WORKER);
    const adminMeta = metadataFor(admin.version, plan.adminManifest, ADMIN_WORKER);
    assert.equal(hash(plan.memberBytes), plan.memberManifest.candidate_sha256, 'member candidate hash drift');
    assert.equal(hash(plan.adminBytes), plan.adminManifest.candidate_sha256, 'admin candidate hash drift');
    await io.approve('upload');
    receipt.phase = 'upload-attempted-outcome-unknown'; await save(receipt);
    const memberUploaded = await io.upload(MEMBER_WORKER, memberMeta, plan.memberBytes);
    const adminUploaded = await io.upload(ADMIN_WORKER, adminMeta, plan.adminBytes);
    receipt.uploaded = { member: memberUploaded.id, admin: adminUploaded.id };
    receipt.phase = 'uploaded-readback'; await save(receipt);
    await io.verifyUploaded(MEMBER_WORKER, memberUploaded.id, memberMeta, plan.memberManifest);
    await io.verifyUploaded(ADMIN_WORKER, adminUploaded.id, adminMeta, plan.adminManifest);
    await io.approve('promote');
    receipt.phase = 'promotion-attempted-outcome-unknown'; await save(receipt);
    const memberDeployment = await io.promote(MEMBER_WORKER, memberUploaded.id);
    receipt.promoted = { member: memberDeployment.id };
    const adminDeployment = await io.promote(ADMIN_WORKER, adminUploaded.id);
    receipt.promoted.admin = adminDeployment.id;
    receipt.phase = 'complete'; await save(receipt);
    return receipt;
  } catch (error) {
    receipt.phase = receipt.phase === 'promotion-attempted-outcome-unknown' ? 'partial-or-unknown-promotion' : 'stopped';
    receipt.error = String(error?.message || 'release_failed').slice(0, 200);
    await save(receipt);
    throw Object.assign(new Error('Recovery artifact release stopped; inspect receipt and rollback targets.'), { receipt });
  }
}

export function readPlan(memberCandidate, adminCandidate, memberManifestPath, adminManifestPath) {
  return {
    memberBytes: readFileSync(memberCandidate), adminBytes: readFileSync(adminCandidate),
    memberManifest: JSON.parse(readFileSync(memberManifestPath, 'utf8')),
    adminManifest: JSON.parse(readFileSync(adminManifestPath, 'utf8')),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv[2], '--plan-only', 'production adapter is intentionally not wired into this local runner');
  console.log(JSON.stringify({ scope: 'membership-recovery-artifact-pair', requires: ['fresh active snapshots', 'owner approval', 'paired upload readback', 'paired promotion'] }));
}
