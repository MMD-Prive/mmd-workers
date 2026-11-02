import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTIVE_MEMBER_SHA256, ACTIVE_ADMIN_SHA256, RECOVERY_SOURCE_SHA, DO_CLASS, DO_BINDING, buildMemberRecoveryArtifact, buildAdminRecoveryArtifact } from './build-member-pages-recovery-artifact.mjs';

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
