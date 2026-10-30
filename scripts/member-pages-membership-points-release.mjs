// Narrow artifact-preserving release for the merged membership/Points read paths.
// The workflow pins both the source boundary and the active production baseline.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { activeVersion, buildMemberPagesBundle, createTransport, uploadMetadata, versionConfiguration } from './member-pages-code-only-release.mjs';
import { verifyOwnerApproval } from './member-pages-owner-approval.mjs';

export const ACCOUNT = 'b176eda1172b741fd2e58904cc9d77c5';
export const ROOT = `/accounts/${ACCOUNT}/workers/scripts/member-pages-worker`;
export const BASELINE_SOURCE_SHA = 'c1f030ae90a19ab2bec2fb72f65c7759fe036b9e';
export const APPROVED_SOURCE_SHA = 'd3ad42ec9d66639a3dc215045e5a4d5e9a040c86';
export const ALLOWED_DELTA_PATHS = Object.freeze([
  'member-dashboard-chat-worker/src/kenji-line-live-truth.mjs',
  'member-dashboard-chat-worker/src/mmd-i18n.mjs',
  'member-dashboard-chat-worker/test/kenji-line-live-truth.test.mjs',
  'member-pages-worker/src/kenji-line-member-truth.js',
  'member-pages-worker/src/member-history-preload.js',
  'member-pages-worker/test/kenji-line-member-truth.test.mjs',
  'member-pages-worker/test/member-history-preload.test.mjs',
].sort());

export function validateMembershipSourceScope(sourceSha, approvedSourceSha, changedPaths) {
  assert.equal(sourceSha, APPROVED_SOURCE_SHA, 'membership source must be the exact merged release SHA');
  assert.equal(approvedSourceSha, APPROVED_SOURCE_SHA, 'approved source SHA must be the exact merged release SHA');
  assert.deepEqual([...changedPaths].sort(), ALLOWED_DELTA_PATHS, 'source delta includes unreviewed runtime or release files');
  return { source_sha: sourceSha, baseline_source_sha: BASELINE_SOURCE_SHA, paths: [...ALLOWED_DELTA_PATHS] };
}

export function verifyArtifactPreservation(baseline, candidate, expectedConfigDigest, digest) {
  assert.equal(digest(versionConfiguration(candidate)), expectedConfigDigest, 'Worker bindings/runtime configuration changed');
  assert.equal(candidate.resources?.script_runtime?.compatibility_date, baseline.resources?.script_runtime?.compatibility_date);
  assert.deepEqual(candidate.resources?.bindings, baseline.resources?.bindings, 'binding inventory changed');
  return true;
}

function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export async function releaseMembershipPoints(io) {
  const state = { phase: 'preflight', worker: 'member-pages-worker', source_sha: APPROVED_SOURCE_SHA, release_sha: io.releaseSha };
  const save = phase => io.save({ ...state, phase });
  const call = (suffix, init) => io.call(ROOT + suffix, init);
  await io.approve();
  const deployment = (await call('/deployments'))?.deployments?.[0];
  const current = activeVersion(deployment);
  assert.equal(current, io.expectedVersion, 'active version differs from approved preflight');
  assert.equal(deployment.id, io.expectedDeployment, 'active deployment differs from approved preflight');
  const baseline = await call(`/versions/${current}`);
  const config = versionConfiguration(baseline);
  const configDigest = digest(config);
  const settingsDigest = digest(await call('/script-settings'));
  const boundary = async () => ({
    schedules: (await call('/schedules'))?.schedules || [],
    subdomain: await call('/subdomain'),
  });
  const boundaryDigest = digest(await boundary());
  const unchanged = async () => {
    const latest = (await call('/deployments'))?.deployments?.[0];
    assert.equal(activeVersion(latest), current);
    assert.equal(latest.id, deployment.id);
    assert.equal(digest(await call('/script-settings')), settingsDigest);
    assert.equal(digest(await boundary()), boundaryDigest);
  };
  await unchanged();
  const dir = mkdtempSync(join(tmpdir(), 'mmd-membership-points-'));
  const module = await io.bundle(dir);
  assert.ok(module instanceof Uint8Array && module.length > 0);
  state.baseline_version = current;
  state.baseline_deployment = deployment.id;
  state.configuration_digest = configDigest;
  state.settings_digest = settingsDigest;
  state.boundary_digest = boundaryDigest;
  state.bundle_sha256 = createHash('sha256').update(module).digest('hex');
  await unchanged();
  const metadata = uploadMetadata(baseline, APPROVED_SOURCE_SHA);
  const form = new FormData();
  form.set('metadata', JSON.stringify(metadata));
  form.set('worker.js', new Blob([module], { type: 'application/javascript+module' }), 'worker.js');
  save('upload-attempted-outcome-unknown');
  const uploaded = await call('/versions?bindings_inherit=strict', { method: 'POST', body: form });
  assert.ok(uploaded?.id && uploaded.id !== current);
  state.uploaded_version = uploaded.id;
  const exact = await call(`/versions/${uploaded.id}`);
  verifyArtifactPreservation(baseline, exact, configDigest, digest);
  save('uploaded-not-promoted');
  await io.approve();
  await unchanged();
  save('promotion-attempted-outcome-unknown');
  const promoted = await call('/deployments', { method: 'POST', body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: uploaded.id, percentage: 100 }] }) });
  assert.ok(promoted?.id && promoted.id !== deployment.id);
  state.deployment = promoted.id;
  const receipt = await call(`/deployments/${promoted.id}`);
  assert.equal(activeVersion(receipt), uploaded.id);
  const promotedVersion = await call(`/versions/${uploaded.id}`);
  verifyArtifactPreservation(baseline, promotedVersion, configDigest, digest);
  save('complete');
  return { ...state, phase: 'complete' };
}

export async function runApproved() {
  assert.equal(process.env.PRODUCTION_APPROVED, 'true');
  assert.equal(process.env.APPROVED_SOURCE_SHA, APPROVED_SOURCE_SHA);
  const sourceDirectory = resolve(process.env.SOURCE_DIRECTORY || '');
  const changedPaths = git(sourceDirectory, 'diff', '--name-only', BASELINE_SOURCE_SHA, APPROVED_SOURCE_SHA).split('\n').filter(Boolean);
  validateMembershipSourceScope(APPROVED_SOURCE_SHA, process.env.APPROVED_SOURCE_SHA, changedPaths);
  const dir = mkdtempSync(join(tmpdir(), 'mmd-membership-points-bundle-'));
  const journal = resolve(process.env.RUNNER_TEMP || dir, 'member-pages-membership-points-receipt.json');
  const result = await releaseMembershipPoints({
    releaseSha: process.env.GITHUB_SHA,
    expectedVersion: process.env.EXPECTED_VERSION,
    expectedDeployment: process.env.EXPECTED_DEPLOYMENT,
    approve: () => verifyOwnerApproval(process.env, fetch),
    call: createTransport(process.env.CLOUDFLARE_API_TOKEN),
    bundle: () => buildMemberPagesBundle(dir, sourceDirectory),
    save: value => writeFileSync(journal, JSON.stringify(value, null, 2), { mode: 0o600 }),
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv[2], '--execute-approved');
  runApproved().catch(() => { console.error('Membership/Points artifact release stopped; inspect the sanitized receipt.'); process.exitCode = 1; });
}
