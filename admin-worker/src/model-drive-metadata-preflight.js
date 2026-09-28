// Source-only preflight for a future Drive -> R2 metadata sync. This module
// neither reads media bytes nor writes R2, Airtable, or Drive.
const ID = /^[A-Za-z0-9_-]{10,180}$/;
const MODEL_ID = /^rec[A-Za-z0-9]+$/;
const LANES = new Set(['public', 'private', 'exclusive']);

export function reconcileModelDriveFolder(folder, records) {
  const folderId = String(folder?.drive_folder_id || '');
  const lane = String(folder?.lane || '');
  const scopeKey = String(folder?.folder_scope_key || '');
  const rootId = String(folder?.approved_root_id || '');
  if (!ID.test(folderId) || !ID.test(rootId) || !LANES.has(lane) ||
      scopeKey !== `${lane}:drive:${folderId}`) {
    return { status: 'review_required', reason: 'source_scope_invalid' };
  }
  if (!Array.isArray(records)) return { status: 'review_required', reason: 'canonical_lookup_unavailable' };
  // A record returned by either the folder-ID or scope-key query participates
  // in the conflict check. An unrelated record must never be silently ignored.
  if (records.length !== 1) {
    return { status: 'review_required', reason: records.length ? 'canonical_binding_conflict' : 'canonical_binding_missing' };
  }
  const record = records[0];
  const fields = record?.fields || {};
  if (!MODEL_ID.test(String(record?.id || '')) ||
      fields.drive_folder_id !== folderId || fields.folder_scope_key !== scopeKey) {
    return { status: 'review_required', reason: 'canonical_binding_mismatch' };
  }
  if (lane === 'public' && fields.can_work_public !== true) {
    return { status: 'review_required', reason: 'canonical_lane_mismatch' };
  }
  if (lane !== 'public' && fields.can_work_private !== true) {
    return { status: 'review_required', reason: 'canonical_lane_mismatch' };
  }
  return {
    status: 'ready',
    source: {
      model_record_id: record.id,
      drive_folder_id: folderId,
      approved_root_id: rootId,
      folder_scope_key: scopeKey,
      lane,
    },
  };
}
