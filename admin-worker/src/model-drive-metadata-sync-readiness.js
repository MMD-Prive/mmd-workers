const FEATURE_FLAG = 'MMD_MODEL_DRIVE_METADATA_SYNC_ENABLED';

/**
 * Pure readiness gate for the deferred metadata sync. No storage or network
 * access happens here. The feature remains disabled unless an operator has
 * explicitly enabled it and every external contract is verified.
 */
export function resolveModelDriveMetadataSyncReadiness(env = {}) {
  if (env?.[FEATURE_FLAG] !== 'true') {
    return { status: 'disabled', reason: 'feature_flag_off' };
  }

  return {
    status: 'open',
    blockers: [
      'drive_read_credential_not_verified',
      'private_metadata_r2_contract_unverified',
      'manifest_writer_not_implemented',
    ],
  };
}
