import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIVE_MEMBER_SHA256, ACTIVE_ADMIN_SHA256, RECOVERY_SOURCE_SHA, DO_CLASS, DO_BINDING, buildMemberRecoveryArtifact, buildAdminRecoveryArtifact } from './build-member-pages-recovery-artifact.mjs';
import { fetchActiveWorkerArtifact } from './fetch-member-pages-recovery-baseline.mjs';

test('recovery artifact manifest pins both active baselines and the reviewed source', () => {
  const member = JSON.parse(readFileSync(new URL('./member-pages-recovery-artifact-manifest.json', import.meta.url)));
  const admin = JSON.parse(readFileSync(new URL('./admin-recovery-artifact-manifest.json', import.meta.url)));
  assert.equal(member.baseline_sha256, ACTIVE_MEMBER_SHA256);
  assert.equal(admin.baseline_sha256, ACTIVE_ADMIN_SHA256);
  assert.equal(member.recovery_source_sha, RECOVERY_SOURCE_SHA);
  assert.equal(member.migration.binding.name, DO_BINDING);
  assert.equal(member.migration.new_sqlite_classes[0], DO_CLASS);
  assert.equal(member.unchanged_prefix_suffix, true);
  assert.deepEqual(member.overlays.map(item => item.kind), [
    'recovery-handler-bundle', 'identity-start-bundle', 'member-owner-rpc-bundle', 'durable-object-class-bundle', 'export',
  ]);
  assert.equal(admin.unchanged_prefix_suffix, true);
});

test('artifact builders fail closed on any active-byte drift', () => {
  assert.throws(() => buildMemberRecoveryArtifact({ activeBytes: Buffer.from('wrong'), recoverySourceDir: '.', outputPath: '/tmp/no-member', manifestPath: '/tmp/no-member-manifest' }), /active member artifact drift/);
  assert.throws(() => buildAdminRecoveryArtifact({ activeBytes: Buffer.from('wrong'), recoverySourceDir: '.', outputPath: '/tmp/no-admin', manifestPath: '/tmp/no-admin-manifest' }), /active admin artifact drift/);
});

test('baseline fetch requires exact serving version/deployment and module hash', async () => {
  const bytes = Buffer.from('active-worker');
  const form = new FormData(); form.set('worker.js', new Blob([bytes], { type: 'application/javascript' }), 'worker.js');
  const request = async (url) => {
    const path = new URL(url).pathname.replace(/^\/client\/v4/, '');
    if (path.endsWith('/deployments')) return Response.json({ success: true, result: { deployments: [{ id: 'dep', versions: [{ version_id: 'ver', percentage: 100 }] }] } });
    if (path.endsWith('/versions/ver')) return Response.json({ success: true, result: { id: 'ver' } });
    if (path.endsWith('/content/v2')) return new Response(form);
    throw new Error(`unexpected path ${path}`);
  };
  const sha = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
  const result = await fetchActiveWorkerArtifact({ worker: 'member-pages-worker', expectedVersion: 'ver', expectedDeployment: 'dep', expectedSha256: sha, token: 'synthetic', request });
  assert.equal(result.sha256, sha);
  await assert.rejects(fetchActiveWorkerArtifact({ worker: 'member-pages-worker', expectedVersion: 'wrong', expectedDeployment: 'dep', expectedSha256: sha, token: 'synthetic', request }), /serving version drift/);
});

test('workflow contract fetches baselines, builds candidates, then invokes execute adapter', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-member-pages-worker-code-only.yml', import.meta.url), 'utf8');
  assert.match(workflow, /fetch-member-pages-recovery-baseline\.mjs/);
  assert.match(workflow, /build-member-pages-recovery-artifact\.mjs member/);
  assert.match(workflow, /build-member-pages-recovery-artifact\.mjs admin/);
  assert.match(workflow, /member-pages-recovery-artifact-release\.mjs --execute/);
  assert.match(workflow, /MMD_RECOVERY_MIGRATION_MODE: full-script-deploy-reviewed/);
  assert.match(workflow, /member-pages-recovery-frontend-compatibility\.mjs/);
  assert.match(workflow, /member-pages-recovery-receipt/);
});
