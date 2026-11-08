// Guarded code-only release. Importing this module never contacts production.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { releaseCurrentSession, createTransport, uploadMetadata, validateSourceState, ROOT } from './admin-current-session-code-only.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import { BASELINE_VERSION, BASELINE_DEPLOYMENT, BASELINE_SOURCE, FEATURE_SOURCE, REVIEW_PATH,
  ACTIVATION_PATH, SOURCE_HASHES, digest, validateSources, validateBaseline, patchApplicationDelete } from './admin-application-delete-overlay.mjs';
import { testCandidate } from './admin-application-delete-candidate-test.mjs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
export async function readLiveModule(token, request = fetch) {
  const response = await request('https://api.cloudflare.com/client/v4' + ROOT + '/content/v2', {
    method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, 'live code read failed');
  assert.match(response.headers.get('content-type') || '', /multipart\/form-data/);
  const form = await response.formData();
  const entries = [...form.entries()];
  assert.equal(entries.length, 1, 'unreviewed live module inventory');
  assert.equal(entries[0][0], 'worker.js', 'unreviewed module name');
  const file = entries[0][1];
  assert.equal(typeof file, 'object');
  assert.ok(file.size > 0 && file.size < 20 * 1024 * 1024);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const code = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert.equal(digest(new TextEncoder().encode(code)), digest(bytes), 'noncanonical UTF-8 module');
  return code;
}
export function buildEvidence(code, preservation, releaseId) {
  assert.match(releaseId, /^\d+\.\d+$/);
  assert.match(process.version, /^v22\./, 'reviewed Node 22 runtime required');
  const modules = [{ name: 'worker.js', bytes: code.byteLength, digest: { algorithm: 'sha256', value: digest(code) } }];
  return { release_id: releaseId, toolchain: { node: process.version, transformation: 'native-js-lexical-closure-no-bundler' },
    reviewed_source_hashes: SOURCE_HASHES,
    lockfile: { path: 'package-lock.json', digest: { algorithm: 'sha256', value: digest(readFileSync('package-lock.json')) } },
    artifact: { digest: modules[0].digest, modules, module_manifest_digest: { algorithm: 'sha256', value: digest(JSON.stringify(modules)) } },
    preservation, verification: { delivered_artifact_contracts: 'passed', business_requests: 'mocked-only' } };
}
async function main() {
  assert.equal(process.argv[2], '--execute-approved');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true');
  assert.equal(process.env.EXPECTED_VERSION, BASELINE_VERSION);
  assert.equal(process.env.EXPECTED_DEPLOYMENT, BASELINE_DEPLOYMENT);
  const sha = process.env.GITHUB_SHA;
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected environment required');
    validateSourceState({ expectedSha: sha, headSha: git('rev-parse', 'HEAD'), dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
    git('merge-base', '--is-ancestor', FEATURE_SOURCE, sha);
    validateSources();
  };
  const releaseId = `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`;
  let preservation;
  const call = createTransport(process.env.CLOUDFLARE_API_TOKEN);
  const save = state => writeFileSync(join(process.env.RUNNER_TEMP, 'application-delete-code-only-receipt.json'), JSON.stringify(state, null, 2), { mode: 0o600 });
  const released = await releaseCurrentSession({ sha, approve, expectedVersion: BASELINE_VERSION, expectedDeployment: BASELINE_DEPLOYMENT,
    call,
    sourceCheck: async (version, deployment) => {
      validateBaseline(version, deployment);
      return { commit_sha: sha, dirty_tree: false, dirty_path_count: 0,
        method: 'exact-live-byte-overlay-review-closure-and-coordinator-hook', baseline_source_sha: BASELINE_SOURCE,
        runtime_source_sha: FEATURE_SOURCE, runtime_paths: [REVIEW_PATH, ACTIVATION_PATH], configuration_diff: false };
    },
    metadataFactory: (version, sourceSha) => {
      const metadata = uploadMetadata(version, sourceSha);
      metadata.annotations['workers/message'] = `Application Delete/Restore only; baseline=${BASELINE_VERSION} feature=${FEATURE_SOURCE} release=${sourceSha}`;
      return metadata;
    },
    bundle: async () => {
      const live = await readLiveModule(process.env.CLOUDFLARE_API_TOKEN);
      const result = patchApplicationDelete(live, readFileSync(REVIEW_PATH, 'utf8'), readFileSync(ACTIVATION_PATH, 'utf8'));
      testCandidate(result.code); // Actual delivered code and DO; fixtures only, stripped subprocess credentials.
      preservation = result.preservation;
      return new TextEncoder().encode(result.code);
    },
    buildEvidence: code => buildEvidence(code, preservation, releaseId),
    now: () => new Date().toISOString(),
    save,
  });
  // The transport verifies version/configuration. Additionally verify the bytes
  // being served, bracketed by exact deployment reads. Never auto-retry this step.
  assert.equal(released.phase, 'complete');
  save({ ...released, phase: 'live-artifact-readback-pending' });
  const expected = { id: released.deployment, strategy: 'percentage', versions: [{ version_id: released.uploaded_version, percentage: 100 }] };
  const verifyActive = async () => {
    const active = (await call(ROOT + '/deployments')).deployments?.[0];
    assert.deepEqual({ id: active?.id, strategy: active?.strategy, versions: active?.versions }, expected, 'deployment drift during final artifact readback');
  };
  await verifyActive();
  const observed = digest(await readLiveModule(process.env.CLOUDFLARE_API_TOKEN));
  assert.equal(observed, preservation.candidate_sha256, 'live artifact digest mismatch');
  await verifyActive();
  save({ ...released, phase: 'complete', live_artifact_readback: { sha256: observed,
    version_id: released.uploaded_version, deployment_id: released.deployment, checked_at: new Date().toISOString() } });
  console.log('Application Delete/Restore overlay verified live; configuration preserved; no business-record probes.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Application release stopped. Inspect receipt; do not retry an uncertain upload or deployment.'); process.exitCode = 1; });
}
