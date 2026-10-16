// Blank legacy inventory status is recoverable only after an explicit owner action.
// This never overrides a deliberate inactive/review decision or existing LINE identity.
export function canRecoverLegacyDriveModel(record, approvedFolder = null) {
  const f = record?.fields || {};
  const text = value => String(value || '').trim();
  if (!record?.id || !/^[A-Za-z0-9_-]{10,180}$/.test(text(f.drive_folder_id))) return false;
  if ([f.status, f.Status, f.model_status, f['Model Status'], f.line_user_id, f['LINE User ID']].some(v => text(v))) return false;
  const review = text(f.private_review_status).toLowerCase();
  if (review && !['approved', 'active'].includes(review)) return false;
  if (['intake_gate_status', 'registry_record_type', 'visibility_review_status', 'folder_approval_status'].some(k => /blocked|rejected|quarantine|hidden|draft|review|application/i.test(text(f[k])))) return false;
  if (text(f.quarantine_reason)) return false;
  return !approvedFolder || (text(approvedFolder.drive_folder_id) === text(f.drive_folder_id)
    && ['public', 'private', 'exclusive'].includes(text(approvedFolder.lane).toLowerCase()));
}
