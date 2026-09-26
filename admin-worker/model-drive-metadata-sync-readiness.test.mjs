import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveModelDriveMetadataSyncReadiness } from './src/model-drive-metadata-sync-readiness.js';

test('missing and false feature flag keep metadata sync disabled', () => {
  assert.deepEqual(resolveModelDriveMetadataSyncReadiness(), {
    status: 'disabled',
    reason: 'feature_flag_off',
  });
  assert.equal(resolveModelDriveMetadataSyncReadiness({ MMD_MODEL_DRIVE_METADATA_SYNC_ENABLED: 'false' }).status, 'disabled');
});

test('enabled flag remains open while current external gates and writer are missing', () => {
  assert.deepEqual(resolveModelDriveMetadataSyncReadiness({ MMD_MODEL_DRIVE_METADATA_SYNC_ENABLED: 'true' }), {
    status: 'open',
    blockers: [
      'drive_read_credential_not_verified',
      'private_metadata_r2_contract_unverified',
      'manifest_writer_not_implemented',
    ],
  });
});
