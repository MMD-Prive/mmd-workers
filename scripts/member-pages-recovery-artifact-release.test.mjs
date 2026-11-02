import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRecoveryArtifactRelease, metadataFor, verifyBaseline } from './member-pages-recovery-artifact-release.mjs';

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
  assert.deepEqual(receipt.at(-1).rollback_targets, { member: id(2), admin: id(4) });
});
