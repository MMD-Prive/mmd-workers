import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const ACTIVE_MEMBER_SHA256 = '9e1e7eb7b425af0e08789f9aca2a65b467cfd234d50fbac90927aec574122849';
export const ACTIVE_ADMIN_SHA256 = '70e0a9e6f541ef9c71425be84d54f11c124004219ebb9c6c7062b57da950160e';
export const RECOVERY_SOURCE_SHA = 'd82c284fb48943c7c8a8cc5a970107f799186ee3';
export const DO_CLASS = 'CustomerRequestMutationCoordinator';
export const DO_BINDING = 'CUSTOMER_REQUEST_MUTATION';
export const OLD_MIGRATION_TAG = 'v3-remembered-login-device';
export const NEW_MIGRATION_TAG = 'v5-customer-request-mutation';
export const EXPECTED_MEMBER_CANDIDATE_SHA256 = '3cb754442de491c63bcbe3992055c76feefb667853f0172ea6c482d77af4d628';
export const EXPECTED_ADMIN_CANDIDATE_SHA256 = 'dfccb9dc54c98662a99e596c3765dec19a2c70c183ef5182fa0ad3984a070164';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const esbuild = process.env.ESBUILD || 'esbuild';

function verifyReviewedSource(sourceDir, paths) {
  for (const path of paths) {
    const expected = execFileSync('git', ['rev-parse', `${RECOVERY_SOURCE_SHA}:${path}`], { cwd: sourceDir, encoding: 'utf8' }).trim();
    const actual = execFileSync('git', ['hash-object', path], { cwd: sourceDir, encoding: 'utf8' }).trim();
    assert.equal(actual, expected, `reviewed source blob drift: ${path}`);
  }
}

function bundle(entry, globalName, out) {
  execFileSync(esbuild, [entry, '--bundle', '--format=iife', `--global-name=${globalName}`, '--platform=neutral', '--target=es2022', '--minify=false', `--outfile=${out}`], { stdio: 'ignore' });
  return readFileSync(out, 'utf8').trim();
}

export function buildMemberRecoveryArtifact({ activeBytes, recoverySourceDir, outputPath, manifestPath }) {
  assert.equal(sha256(activeBytes), ACTIVE_MEMBER_SHA256, 'active member artifact drift');
  verifyReviewedSource(recoverySourceDir, [
    'member-pages-worker/src/member-email-recovery.js',
    'member-pages-worker/src/liff-identity-foundation.js',
    'member-pages-worker/src/owner-my-mmd-recovery-diagnostic.js',
    'member-pages-worker/src/customer-request-mutation-durable-object.js',
  ]);
  const tmp = resolve(dirname(outputPath), '.recovery-build');
  mkdirSync(tmp, { recursive: true });
  const recoveryPatch = bundle(resolve(recoverySourceDir, 'member-pages-worker/src/member-email-recovery.js'), 'RecoveryPatch', resolve(tmp, 'recovery.js'));
  const identityPatch = bundle(resolve(recoverySourceDir, 'member-pages-worker/src/liff-identity-foundation.js'), 'IdentityPatch', resolve(tmp, 'identity.js'));
  const ownerPatch = bundle(resolve(recoverySourceDir, 'member-pages-worker/src/owner-my-mmd-recovery-diagnostic.js'), 'OwnerPatch', resolve(tmp, 'owner.js'));
  const recoveryDo = bundle(resolve(recoverySourceDir, 'member-pages-worker/src/customer-request-mutation-durable-object.js'), 'RecoveryDO', resolve(tmp, 'mutation.js'));
  const source = activeBytes.toString('utf8');
  const exportMarker = '\nexport {\n';
  assert.equal(source.split(exportMarker).length, 2, 'worker export boundary must be unique');
  const injected = `${identityPatch}\n${recoveryPatch}\n${ownerPatch}\n${recoveryDo}\nhandleStart = IdentityPatch.handleStart;\nhandleMemberEmailRecovery = RecoveryPatch.handleMemberEmailRecovery;\nisMemberEmailRecoveryPath = RecoveryPatch.isMemberEmailRecoveryPath;\nhandleOwnerMyMmdRecoveryDiagnosticRpc = OwnerPatch.handleOwnerMyMmdRecoveryDiagnosticRpc;\nisOwnerMyMmdRecoveryDiagnosticRpc = OwnerPatch.isOwnerMyMmdRecoveryDiagnosticRpc;\nvar ${DO_CLASS} = RecoveryDO.${DO_CLASS};\n`;
  const candidateText = source.replace(exportMarker, `\n${injected}\nexport {\n  ${DO_CLASS},\n`);
  const candidate = Buffer.from(candidateText);
  assert.equal(sha256(candidate), EXPECTED_MEMBER_CANDIDATE_SHA256, 'member candidate hash drift');
  const manifest = {
    method: 'active-worker-byte-overlay',
    baseline_sha256: ACTIVE_MEMBER_SHA256,
    candidate_sha256: sha256(candidate),
    recovery_source_sha: RECOVERY_SOURCE_SHA,
    unchanged_prefix_suffix: true,
    overlays: [
      { kind: 'recovery-handler-bundle', source: 'member-pages-worker/src/member-email-recovery.js' },
      { kind: 'identity-start-bundle', source: 'member-pages-worker/src/liff-identity-foundation.js' },
      { kind: 'member-owner-rpc-bundle', source: 'member-pages-worker/src/owner-my-mmd-recovery-diagnostic.js' },
      { kind: 'durable-object-class-bundle', source: 'member-pages-worker/src/customer-request-mutation-durable-object.js' },
      { kind: 'export', name: DO_CLASS },
    ],
    migration: { old_tag: OLD_MIGRATION_TAG, new_tag: NEW_MIGRATION_TAG, new_sqlite_classes: [DO_CLASS], binding: { name: DO_BINDING, type: 'durable_object_namespace', class_name: DO_CLASS } },
  };
  writeFileSync(outputPath, candidate, { mode: 0o600 });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return manifest;
}

export function buildAdminRecoveryArtifact({ activeBytes, recoverySourceDir, outputPath, manifestPath }) {
  assert.equal(sha256(activeBytes), ACTIVE_ADMIN_SHA256, 'active admin artifact drift');
  verifyReviewedSource(recoverySourceDir, ['admin-worker/src/owner-my-mmd-recovery-diagnostic.js']);
  const tmp = resolve(dirname(outputPath), '.recovery-build');
  mkdirSync(tmp, { recursive: true });
  const patch = bundle(resolve(recoverySourceDir, 'admin-worker/src/owner-my-mmd-recovery-diagnostic.js'), 'AdminRecoveryPatch', resolve(tmp, 'admin-recovery.js'));
  const source = activeBytes.toString('utf8');
  const marker = '\nexport {\n';
  assert.equal(source.split(marker).length, 2, 'admin worker export boundary must be unique');
  const injected = `${patch}\nhandleOwnerMyMmdRecoveryDiagnostic = AdminRecoveryPatch.handleOwnerMyMmdRecoveryDiagnostic;\nisOwnerMyMmdRecoveryDiagnosticRequest = AdminRecoveryPatch.isOwnerMyMmdRecoveryDiagnosticRequest;\n`;
  const candidate = Buffer.from(source.replace(marker, `\n${injected}${marker}`));
  assert.equal(sha256(candidate), EXPECTED_ADMIN_CANDIDATE_SHA256, 'admin candidate hash drift');
  const manifest = {
    method: 'active-worker-byte-overlay',
    baseline_sha256: ACTIVE_ADMIN_SHA256,
    candidate_sha256: sha256(candidate),
    recovery_source_sha: RECOVERY_SOURCE_SHA,
    overlays: [{ kind: 'owner-recovery-admin-bundle', source: 'admin-worker/src/owner-my-mmd-recovery-diagnostic.js' }],
    unchanged_prefix_suffix: true,
  };
  writeFileSync(outputPath, candidate, { mode: 0o600 });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return manifest;
}

if (process.argv[1] && new URL(import.meta.url).pathname === resolve(process.argv[1])) {
  const [kind, activePath, sourceDir, outputPath, manifestPath] = process.argv.slice(2);
  assert.ok(['member','admin'].includes(kind) && activePath && sourceDir && outputPath && manifestPath, 'usage: node build-member-pages-recovery-artifact.mjs member|admin ACTIVE SOURCE_DIR OUTPUT MANIFEST');
  const manifest = kind === 'admin'
    ? buildAdminRecoveryArtifact({ activeBytes: readFileSync(activePath), recoverySourceDir: sourceDir, outputPath, manifestPath })
    : buildMemberRecoveryArtifact({ activeBytes: readFileSync(activePath), recoverySourceDir: sourceDir, outputPath, manifestPath });
  console.log(JSON.stringify({ candidate_sha256: manifest.candidate_sha256, baseline_sha256: manifest.baseline_sha256 }));
}
