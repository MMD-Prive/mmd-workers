import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createCloudflareRecoveryAdapter, metadataFor, verifyBaseline, verifyServingBaseline, requireRecoveryExecuteApproval, MEMBER_WORKER, ADMIN_WORKER, CLOUDFLARE_ACCOUNT_ID } from './member-pages-recovery-artifact-release.mjs';

export const RELEASE = Object.freeze({
  run: '41409338588',
  memberVersion: 'd15ddc16-b1ff-459d-a0a0-00dc4866a690',
  memberDeployment: 'e6f81629-ad4e-469b-a638-bf0f59fdcd8e',
  memberNamespace: 'd04ab9ebe84c47c1b2b6aad6b546c237',
  memberOriginalVersion: '990d2605-69af-4e79-85c3-c08c56b1ae29',
  memberHash: 'e0dcf07e9dbc8c1d74e1c2b5b8afe7db4b2e6f34ae5a69cc308142d89e00ec58',
  adminVersion: '966612cf-caf2-447e-8a08-db2f97f1b110',
  adminBaselineHash: '70e0a9e6f541ef9c71425be84d54f11c124004219ebb9c6c7062b57da950160e',
  adminCandidateHash: 'ebd12d214c1526374019338b2f720c30f08811b76f9142a7c57eeade9a2ac180',
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const memberExpected = { version: RELEASE.memberVersion, deployment: RELEASE.memberDeployment, baseline_sha256: RELEASE.memberHash };
const memberManifest = { unchanged_prefix_suffix: true, candidate_sha256: RELEASE.memberHash, migration: { new_tag: 'v5-customer-request-mutation' } };

// Defense in depth: this transport cannot mutate member, deployments, versions,
// bindings or routes. The only permitted write is the one admin full-script PUT.
export function adminOnlyTransport(request = fetch) {
  return (url, init = {}) => {
    const u = new URL(url); const method = (init.method || 'GET').toUpperCase();
    assert.equal(u.origin, 'https://api.cloudflare.com');
    assert.ok(u.pathname.startsWith(`/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/`));
    if (method !== 'GET') {
      assert.equal(method, 'PUT', 'admin resume forbids other mutation methods');
      assert.equal(u.pathname, `/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${ADMIN_WORKER}`, 'admin resume forbids member writes');
      assert.equal(u.search, '?bindings_inherit=strict');
    }
    return request(url, init);
  };
}

export async function executeAdminOnlyResume(io, plan) {
  const receipt = { scope: 'recovery-admin-only-resume', source_run: RELEASE.run, phase: 'preflight', member_writes: 0, admin_attempt: 'not_started' };
  const save = () => io.save(structuredClone(receipt));
  let initialMemberSettings;
  const verifyMember = async () => {
    const member = await io.snapshot(MEMBER_WORKER);
    verifyServingBaseline(member, memberExpected, MEMBER_WORKER);
    assert.equal(member.latest_version, RELEASE.memberVersion, 'member latest version drift');
    const mutation = member.version.resources.bindings.find(b => b.name === 'CUSTOMER_REQUEST_MUTATION');
    assert.equal(mutation?.namespace_id, RELEASE.memberNamespace, 'member mutation namespace drift');
    if (initialMemberSettings === undefined) initialMemberSettings = structuredClone(member.settings);
    else assert.deepEqual(member.settings, initialMemberSettings, 'member settings drift during resume');
    const original = await io.originalMemberVersion();
    assert.equal(original.id, RELEASE.memberOriginalVersion);
    assert.equal(original.resources.script_runtime.migration_tag, 'v3-remembered-login-device');
    const meta = metadataFor(original, memberManifest, MEMBER_WORKER, member.settings);
    await io.verifyUploaded(MEMBER_WORKER, RELEASE.memberVersion, meta, memberManifest);
    return member;
  };
  try {
    await io.approve('preflight');
    assert.match(plan.adminDeployment || '', /^[a-f0-9-]{36}$/i, 'fresh admin deployment is required');
    assert.equal(hash(plan.adminBytes), RELEASE.adminCandidateHash, 'reviewed admin candidate drift');
    await verifyMember();
    const expected = { version: RELEASE.adminVersion, deployment: plan.adminDeployment, baseline_sha256: RELEASE.adminBaselineHash };
    const first = await io.snapshot(ADMIN_WORKER); verifyBaseline(first, expected, ADMIN_WORKER);
    await io.approve('admin-only-deploy');
    // Recheck both workers after any approval delay; no member migration replay.
    await verifyMember();
    const fresh = await io.snapshot(ADMIN_WORKER); verifyBaseline(fresh, expected, ADMIN_WORKER);
    assert.deepEqual(fresh.settings, first.settings, 'admin settings drift before PUT');
    assert.deepEqual(fresh.version.resources, first.version.resources, 'admin metadata drift before PUT');
    const manifest = { unchanged_prefix_suffix: true, candidate_sha256: RELEASE.adminCandidateHash };
    const metadata = metadataFor(fresh.version, manifest, ADMIN_WORKER, fresh.settings);
    assert.equal(metadata.migrations, undefined, 'admin resume must not migrate');
    receipt.member_verified = memberExpected; receipt.admin_baseline = expected;
    receipt.phase = 'admin-put-outcome-unknown'; receipt.admin_attempt = 'started'; await save();
    await io.deploy(ADMIN_WORKER, metadata, plan.adminBytes);
    receipt.admin_attempt = 'returned'; await save();
    const after = await io.verifyDeployed(ADMIN_WORKER, RELEASE.adminVersion, RELEASE.adminCandidateHash, fresh.settings, metadata, manifest);
    assert.equal(after.deployment.versions[0].percentage, 100, 'admin must serve 100 percent');
    assert.equal(after.latest_version, after.version.id, 'admin latest version drift after PUT');
    assert.equal(after.version.resources.script_runtime.migration_tag, fresh.version.resources.script_runtime.migration_tag, 'admin migration tag changed');
    // Read-only final member check; never try to roll it back on failure.
    await verifyMember();
    receipt.admin = { version: after.version.id, deployment: after.deployment.id, sha256: RELEASE.adminCandidateHash };
    receipt.phase = 'complete'; await save(); return receipt;
  } catch (error) {
    receipt.phase = receipt.admin_attempt === 'not_started' ? 'preflight-stopped' : 'partial-or-unknown-admin-deployment';
    // No raw assertion values: metadata may contain sensitive plaintext bindings.
    receipt.error = 'Resume stopped; inspect live state before any retry. No automatic rollback or retry.';
    await save(); throw Object.assign(new Error(receipt.error), { receipt });
  }
}

export function createAdminResumeAdapter({ token, request = fetch, env = process.env } = {}) {
  const guarded = adminOnlyTransport(request);
  const io = createCloudflareRecoveryAdapter({ token, request: guarded, env });
  return { ...io, originalMemberVersion: async () => {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${MEMBER_WORKER}/versions/${RELEASE.memberOriginalVersion}`;
    const response = await guarded(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json(); assert.ok(response.ok && payload.success === true, 'original member metadata unavailable'); return payload.result;
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv[2], '--execute-admin-only');
  requireRecoveryExecuteApproval();
  assert.ok(process.env.MMD_RECOVERY_RECEIPT_PATH, 'durable receipt path required');
  const adminBytes = readFileSync(process.env.MMD_RECOVERY_ADMIN_CANDIDATE);
  await executeAdminOnlyResume(createAdminResumeAdapter({ token: process.env.CLOUDFLARE_API_TOKEN }), { adminBytes, adminDeployment: process.env.MMD_RECOVERY_ADMIN_DEPLOYMENT });
}
