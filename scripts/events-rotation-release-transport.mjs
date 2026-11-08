// Exact-live rotation release transport. No work runs on import.
// Adapted from the existing protected code-only release state machine.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { activeVersion, versionConfiguration, uploadMetadata, validateReceiptLinks } from './admin-current-session-code-only.mjs';
export const ACCOUNT = 'b176eda1172b741fd2e58904cc9d77c5';
export const ZONE = '2d62396174fa2ddadbbcd0e8cf0f3367';
export const ROOT = `/accounts/${ACCOUNT}/workers/scripts/events-worker`;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const canonical = value => JSON.stringify(sort(value));
const ordered = value => [...value].sort((a, b) => canonical(a).localeCompare(canonical(b)));
const same = (a, b, reason) => assert.equal(canonical(a), canonical(b), reason);
const sha256 = value => createHash('sha256').update(value).digest('hex');
function validateShellAssetPin(build) {
  assert.equal(build.build_transformations, undefined, 'unrelated build transformation');
}
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
export async function releaseEventsRotation(io) {
  const root = io.root ?? ROOT;
  assert.ok(root === ROOT, 'unapproved release Worker');
  const state = { phase: 'preflight', worker: root.split('/').at(-1), source_sha: io.sha };
  const save = phase => { state.phase = phase; io.save({ ...state }); };
  let failureStage = 'approval';
  try {
    await io.approve();
    assert.match(io.sha || '', /^[a-f0-9]{40}$/);
    const call = (suffix, init) => io.call(root + suffix, init);
    failureStage = 'baseline_read';
    const deployment = (await call('/deployments'))?.deployments?.[0];
    const active = activeVersion(deployment);
    assert.equal(active, io.expectedVersion, 'approved baseline version mismatch');
    assert.equal(deployment.id, io.expectedDeployment, 'approved baseline deployment mismatch');
    const version = await call('/versions/' + active);
    assert.equal(version.id, active, 'baseline version mismatch');
    const config = versionConfiguration(version);
    const metadata = (io.metadataFactory ?? uploadMetadata)(version, io.sha);
    // A stale build variable or temporal proximity is not source provenance.
    failureStage = 'source_validation';
    state.source_evidence = await io.sourceCheck(version, deployment);
    state.source_evidence.checked_at = io.now();
    failureStage = 'baseline_configuration';
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
    failureStage = 'local_bundle';
    const code = await io.bundle(version, io.sha);
    assert.ok(code instanceof Uint8Array && code.byteLength > 0, 'compiled module required');
    failureStage = 'build_evidence';
    state.build_evidence = { ...await io.buildEvidence(code, io.sha), recorded_at: io.now() };
    assert.ok(state.build_evidence?.artifact?.digest?.algorithm === 'sha256'
      && state.build_evidence.artifact.digest.value === sha256(code), 'artifact digest does not match uploaded module');
    validateShellAssetPin(state.build_evidence, io.sha);
    state.release_id = state.build_evidence.release_id;
    state.bundle_sha256 = state.build_evidence.artifact.digest.value;
    failureStage = 'pre_upload_approval_and_drift';
    await io.approve();
    await unchanged(deployment, active);
    const form = new FormData();
    form.set('metadata', JSON.stringify(metadata));
    form.set('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
    failureStage = 'upload';
    save('upload-attempted-outcome-unknown');
    const uploaded = await call('/versions?bindings_inherit=strict', { method: 'POST', body: form });
    assert.ok(UUID.test(uploaded?.id || '') && uploaded.id !== active, 'ambiguous upload result; do not rerun');
    state.uploaded_version = uploaded.id;
    state.upload_response = { release_id: state.release_id, version_id: uploaded.id,
      created_on: typeof uploaded.created_on === 'string' ? uploaded.created_on : null,
      recorded_at: io.now() };
    save('uploaded-not-promoted');
    failureStage = 'upload_readback';
    const exact = await call('/versions/' + uploaded.id);
    assert.equal(exact.id, uploaded.id, 'uploaded version mismatch');
    same(versionConfiguration(exact), config, 'uploaded configuration mismatch');
    assert.equal(exact.annotations?.['workers/commit_sha'], io.sha, 'source annotation mismatch');
    const versions = (await call('/versions'))?.items;
    assert.equal(versions?.[0]?.id, uploaded.id, 'uploaded latest mismatch');
    assert.equal(versions?.[1]?.id, active, 'upload predecessor mismatch');
    failureStage = 'pre_promotion_approval_and_drift';
    await io.approve();
    await unchanged(deployment, uploaded.id);
    failureStage = 'promotion';
    save('promotion-attempted-outcome-unknown');
    const promoted = await call('/deployments', { method: 'POST', body: JSON.stringify({
      strategy: 'percentage', versions: [{ version_id: uploaded.id, percentage: 100 }],
    }) });
    assert.ok(UUID.test(promoted?.id || '') && promoted.id !== deployment.id, 'ambiguous promotion result; do not rerun');
    state.deployment = promoted.id;
    failureStage = 'promotion_readback';
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
    failureStage = 'active_module_readback';
    assert.equal(typeof io.verifyActiveModule, 'function', 'active module readback required');
    await io.verifyActiveModule(state.bundle_sha256);
    await unchanged(receipt, uploaded.id);
    state.active_module_sha256 = state.bundle_sha256;
    save('complete');
    return state;
  } catch (error) {
    state.stopped_after = state.phase;
    state.failure_stage = failureStage;
    state.reason_code = 'RELEASE_STAGE_FAILED';
    save('stopped'); // No retry, fallback, cleanup mutation or automatic rollback.
    throw error;
  }
}
