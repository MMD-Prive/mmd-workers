// Server-side read-only adapter. Do not bundle the private dataset in a browser.
// authenticatedSession MUST come from the app's verified LINE/session service,
// never request JSON, URL/query UID, a name/email lookup or a client assertion.
const UID = /^U[0-9a-f]{32}$/;
const BASIS = 'saved_oa_job_notes_recorded_estimate';
const STATES = new Set(['preliminary_review', 'identity_review', 'missing_evidence']);
const notice = '\u0e22\u0e2d\u0e14\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e40\u0e1a\u0e37\u0e49\u0e2d\u0e07\u0e15\u0e49\u0e19 \u0e2d\u0e22\u0e39\u0e48\u0e23\u0e30\u0e2b\u0e27\u0e48\u0e32\u0e07\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a';
function invalid() { throw new Error('invalid_private_preview_dataset'); }
export async function preparePrivatePreviewDataset(rawJson, serverPinnedSha256) {
  if (typeof rawJson !== 'string' || !/^[a-f0-9]{64}$/.test(serverPinnedSha256 || '')) invalid();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawJson));
  const checksum = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  if (checksum !== serverPinnedSha256) throw new Error('private_preview_checksum_mismatch');
  const dataset = JSON.parse(rawJson);
  if (dataset.schemaVersion !== 1 || dataset.sourceBasis !== BASIS || dataset.scope !== 'client_and_purchased_snapshot'
    || dataset.pointsBaselineTHBPerPoint !== 100 || dataset.noExpiryOrDeductionsApplied !== true
    || !dataset.customersByLineUid || typeof dataset.customersByLineUid !== 'object' || Array.isArray(dataset.customersByLineUid)) invalid();
  const index = new Map();
  for (const [uid, row] of Object.entries(dataset.customersByLineUid)) {
    if (!UID.test(uid) || !row || !STATES.has(row.historyState) || typeof row.displayName !== 'string'
      || row.displayName.length > 160 || row.redemptionEnabled !== false || row.automaticPrivilegeEnabled !== false) invalid();
    const amount = row.recordedHistoryAmountTHB;
    const points = row.estimatedGrossPointsBeforeDeduction;
    if (row.historyState === 'preliminary_review') {
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(points) || points !== amount / 100) invalid();
    } else if (amount !== null || points !== null) invalid();
    index.set(uid, Object.freeze({displayName: row.displayName, recordedHistoryAmountTHB: amount,
      estimatedGrossPointsBeforeDeduction: points, historyState: row.historyState}));
  }
  const context = Object.freeze({datasetId: dataset.datasetId, asOfDate: dataset.asOfDate,
    windowStart: dataset.windowStart, windowEnd: dataset.windowEnd});
  return Object.freeze({
    lookupOwnHistory(authenticatedSession) {
      if (authenticatedSession?.isVerified !== true || authenticatedSession.provider !== 'line'
        || !UID.test(authenticatedSession.lineUserId || '')) return {statusCode: 401, data: null};
      const row = index.get(authenticatedSession.lineUserId);
      if (!row) return {statusCode: 404, data: null};
      return {statusCode: 200, data: {...row, ...context, notice,
        amountMeaning: 'recorded_job_estimate_not_verified_paid', pointsMeaning: 'gross_estimate_before_any_deduction_not_redeemable',
        pointsBaselineTHBPerPoint: 100, noExpiryOrDeductionsApplied: true,
        redemptionEnabled: false, automaticPrivilegeEnabled: false}};
    }
  });
}
