import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCloudflareRecoveryAdapter, executeRecoveryArtifactRelease, metadataFor, requireRecoveryExecuteApproval, verifyBaseline } from './member-pages-recovery-artifact-release.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const snapshot = (worker, version, deployment) => ({ version: { id: version, resources: { script: { main_module: 'worker.js' }, script_runtime: { compatibility_date: '2026-06-20', migration_tag: worker === 'member-pages-worker' ? 'v3-remembered-login-device' : 'v1' }, bindings: [{ name: 'KEEP', type: 'secret_text' }] } }, deployment: { id: deployment, versions: [{ version_id: version, percentage: 100 }] }, latest_version: version });
const manifest = (candidate_sha256 = 'candidate') => ({ candidate_sha256, unchanged_prefix_suffix: true });

test('metadata preserves existing bindings and adds only the mutation DO migration', () => {
  const m = metadataFor(snapshot('member-pages-worker', id(1), id(2)).version, manifest(), 'member-pages-worker');
  assert.deepEqual(m.bindings, [{ name: 'KEEP', type: 'inherit' }, { name: 'CUSTOMER_REQUEST_MUTATION', type: 'durable_object_namespace', class_name: 'CustomerRequestMutationCoordinator' }]);
  assert.deepEqual(m.migrations, { old_tag: 'v3-remembered-login-device', new_tag: 'v5-customer-request-mutation', new_sqlite_classes: ['CustomerRequestMutationCoordinator'] });
});

test('baseline verification rejects version, deployment, split traffic, and migration drift', () => {
  const s = snapshot('member-pages-worker', id(1), id(2));
  verifyBaseline(s, { version: id(1), deployment: id(2) }, 'member-pages-worker');
  for (const mutate of [x => x.version.id = id(3), x => x.deployment.id = id(3), x => x.deployment.versions[0].percentage = 50, x => x.latest_version = id(3), x => x.version.resources.script_runtime.migration_tag = 'v2']) {
    const c = structuredClone(s); mutate(c); assert.throws(() => verifyBaseline(c, { version: id(1), deployment: id(2) }, 'member-pages-worker'));
  }
  const wrongServing = structuredClone(s); wrongServing.deployment.versions[0].version_id = id(9);
  assert.throws(() => verifyBaseline(wrongServing, { version: id(1), deployment: id(2) }, 'member-pages-worker'));
});

test('paired release stages both workers and records rollback targets on partial promotion', async () => {
  const calls = []; const receipt = [];
  const io = {
    save: r => receipt.push(r), approve: async stage => calls.push(`approve:${stage}`),
    snapshot: async worker => snapshot(worker, id(worker === 'member-pages-worker' ? 1 : 3), id(worker === 'member-pages-worker' ? 2 : 4)),
    upload: async (worker) => { calls.push(`upload:${worker}`); return { id: id(worker === 'member-pages-worker' ? 5 : 6) }; },
    verifyUploaded: async worker => calls.push(`verify:${worker}`),
    promote: async worker => { calls.push(`promote:${worker}`); if (worker === 'admin-worker') throw Error('admin promotion denied'); return { id: id(7) }; },
  };
  const bytes = Buffer.from('candidate');
  const digest = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(bytes).digest('hex'));
  await assert.rejects(executeRecoveryArtifactRelease(io, { member: { version: id(1), deployment: id(2) }, admin: { version: id(3), deployment: id(4) }, memberBytes: bytes, adminBytes: bytes, memberManifest: manifest(digest), adminManifest: manifest(digest) }));
  assert.deepEqual(calls, ['approve:preflight', 'approve:upload', 'upload:member-pages-worker', 'upload:admin-worker', 'verify:member-pages-worker', 'verify:admin-worker', 'approve:promote', 'promote:member-pages-worker', 'promote:admin-worker']);
  assert.equal(receipt.at(-1).phase, 'partial-or-unknown-promotion');
  assert.deepEqual(receipt.at(-1).rollback_targets, { member: { deployment_id: id(2), version_id: id(1) }, admin: { deployment_id: id(4), version_id: id(3) } });
});

test('production adapter uses only scoped Cloudflare reads, uploads and promotions', async () => {
  const workers = {
    'member-pages-worker': { version: id(11), deployment: id(12), uploaded: id(15), candidate: Buffer.from('member candidate'), migration: 'v3-remembered-login-device', newMigration: 'v5-customer-request-mutation' },
    'admin-worker': { version: id(13), deployment: id(14), uploaded: id(16), candidate: Buffer.from('admin candidate'), migration: 'v1', newMigration: 'v1' },
  };
  const calls = [];
  const response = result => new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  const request = async (url, init = {}) => {
    const u = new URL(url); const path = u.pathname.replace(/^\/client\/v4/, ''); const match = path.match(/\/workers\/(?:scripts|workers)\/([^/]+)(?:\/versions)?/);
    const worker = match?.[1]; const state = workers[worker];
    assert.ok(state, `unexpected worker in ${path}`); calls.push({ method: init.method || 'GET', path: path + u.search, auth: init.headers?.Authorization });
    assert.equal(init.headers?.Authorization, 'Bearer synthetic-token');
    const root = `/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/scripts/${worker}`;
    const versionPath = `/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/workers/${worker}/versions/`;
    if (path === root + '/deployments' && (init.method || 'GET') === 'GET') return response({ deployments: [{ id: state.deployment, versions: [{ version_id: state.version, percentage: 100 }] }] });
    if (path === root + '/versions' && (init.method || 'GET') === 'GET') return response({ items: [{ id: state.uploadedReady ? state.uploaded : state.version }] });
    if (path.startsWith(root + '/versions/') && (init.method || 'GET') === 'GET') {
      const version = path.endsWith(state.uploaded) && state.uploadedReady
        ? state.uploadedVersion
        : { id: state.version, resources: { script: { main_module: 'worker.js' }, script_runtime: { compatibility_date: '2026-06-20', migration_tag: state.migration }, bindings: [{ name: 'KEEP' }] } };
      return response(version);
    }
    if (path.startsWith(versionPath) && u.search === '?include=modules' && (init.method || 'GET') === 'GET') {
      return response({ id: state.uploaded, modules: [{ name: 'worker.js', content_base64: state.candidate.toString('base64') }] });
    }
    if (path === root + '/versions' && u.search === '?bindings_inherit=strict' && init.method === 'POST') {
      state.uploadedReady = true;
      state.uploadedVersion = { id: state.uploaded, resources: { bindings: [{ name: 'KEEP' }, ...(worker === 'member-pages-worker' ? [{ name: 'CUSTOMER_REQUEST_MUTATION' }] : [])], script_runtime: { migration_tag: state.newMigration } } };
      return response({ id: state.uploaded });
    }
    if (path === root + '/deployments' && init.method === 'POST') {
      const body = JSON.parse(init.body); assert.deepEqual(body.versions, [{ version_id: state.uploaded, percentage: 100 }]);
      state.deployment = id(Number(state.deployment.slice(-2)) + 10); state.version = state.uploaded;
      return response({ id: state.deployment, versions: body.versions });
    }
    if (path === root + '/script-settings' && (init.method || 'GET') === 'GET') return response({ settings: 'unchanged' });
    throw new Error(`unexpected ${init.method || 'GET'} ${path}${u.search}`);
  };
  const env = { MMD_RECOVERY_APPROVAL: 'approved', MMD_RECOVERY_APPROVAL_REF: 'test-ref', MMD_RECOVERY_APPROVED_SHA: 'a'.repeat(40) };
  const io = createCloudflareRecoveryAdapter({ token: 'synthetic-token', request, env });
  const memberBytes = workers['member-pages-worker'].candidate, adminBytes = workers['admin-worker'].candidate;
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const memberManifest = { candidate_sha256: digest(memberBytes), unchanged_prefix_suffix: true, migration: { new_tag: 'v5-customer-request-mutation' } };
  const adminManifest = { candidate_sha256: digest(adminBytes), unchanged_prefix_suffix: true };
  const receipt = await executeRecoveryArtifactRelease(io, {
    member: { version: id(11), deployment: id(12) }, admin: { version: id(13), deployment: id(14) },
    memberBytes, adminBytes, memberManifest, adminManifest,
  });
  assert.equal(receipt.phase, 'complete');
  assert.equal(calls.filter(call => call.method === 'POST').length, 4);
  assert.ok(calls.every(call => call.path.startsWith('/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/')));
});

test('execute approval fails closed before any Cloudflare request', () => {
  assert.throws(() => requireRecoveryExecuteApproval({}), /MMD_RECOVERY_APPROVAL=approved/);
  assert.throws(() => requireRecoveryExecuteApproval({ MMD_RECOVERY_APPROVAL: 'approved' }), /MMD_RECOVERY_APPROVAL_REF/);
});

test('upload receipt preserves a returned member version when the admin upload is uncertain', async () => {
  const calls = []; const receipt = [];
  const bytes = Buffer.from('candidate'); const digest = createHash('sha256').update(bytes).digest('hex');
  const io = {
    save: r => receipt.push(r), approve: async stage => calls.push(stage), snapshot: async worker => snapshot(worker, id(worker === 'member-pages-worker' ? 1 : 3), id(worker === 'member-pages-worker' ? 2 : 4)),
    upload: async worker => { calls.push('upload:' + worker); if (worker === 'admin-worker') throw Error('timeout'); return { id: id(5) }; },
    verifyUploaded: async () => {},
  };
  await assert.rejects(executeRecoveryArtifactRelease(io, { member: { version: id(1), deployment: id(2) }, admin: { version: id(3), deployment: id(4) }, memberBytes: bytes, adminBytes: bytes, memberManifest: manifest(digest), adminManifest: manifest(digest) }));
  assert.deepEqual(receipt.at(-1).upload_attempts.member, { state: 'returned', version_id: id(5) });
  assert.deepEqual(receipt.at(-1).upload_attempts.admin, { state: 'started' });
});
