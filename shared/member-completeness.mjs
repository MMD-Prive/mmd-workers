/**
 * Structural reconciliation only. This does not validate historical truth,
 * identity ownership, or the accuracy of any source-system value.
 */
const text = value => typeof value === "string" ? value.trim() : "";
const scalar = value => value == null ? "" : String(value).trim();
const selectText = value => text(value) || (value && typeof value === "object" ? text(value.name) : "");
const linkedIds = value => (Array.isArray(value) ? value : value == null ? [] : [value])
  .map(item => typeof item === "object" && item !== null ? scalar(item.id) : scalar(item))
  .filter(Boolean);
const field = (record, name) => record && record.fields && typeof record.fields === "object" ? record.fields[name] : undefined;
const recordId = record => scalar(record && record.id);

function groupDuplicates(records, readValue) {
  const groups = new Map();
  for (const record of records) {
    const value = text(readValue(record));
    if (!value) continue;
    const ids = groups.get(value) || [];
    ids.push(recordId(record)); groups.set(value, ids);
  }
  return [...groups.values()].filter(ids => ids.length > 1);
}

export function classifyMemberCompleteness({ members = [], clients = [], entitlements = [], ledger = [] } = {}) {
  const memberRows = Array.isArray(members) ? members : [];
  const clientRows = Array.isArray(clients) ? clients : [];
  const entitlementRows = Array.isArray(entitlements) ? entitlements : [];
  const ledgerRows = Array.isArray(ledger) ? ledger : [];
  const duplicateMemberIds = new Set(groupDuplicates(memberRows, row => field(row, "member_id")).flat());
  const duplicateLineIds = new Set(groupDuplicates(memberRows, row => field(row, "line_id")).flat());
  const clientLineCounts = new Map();
  for (const client of clientRows) {
    const clientLineId = text(field(client, "line_user_id"));
    if (clientLineId) clientLineCounts.set(clientLineId, (clientLineCounts.get(clientLineId) || 0) + 1);
  }
  const duplicateClientLineIds = new Set([...clientLineCounts].filter(([, count]) => count > 1).map(([lineId]) => lineId));
  const clientById = new Map(clientRows.map(row => [recordId(row), row]));
  const memberLinkedClients = new Set();

  const rows = memberRows.map(member => {
    const id = recordId(member);
    const memberId = text(field(member, "member_id"));
    const lineId = text(field(member, "line_id"));
    const clientLinks = linkedIds(field(member, "Clients"));
    const reasons = [];
    const identityReasons = [];
    const missingReasons = [];
    if (!memberId) identityReasons.push("missing_member_id");
    if (!lineId) identityReasons.push("missing_line_id");
    if (memberId && duplicateMemberIds.has(id)) identityReasons.push("duplicate_member_id");
    if (lineId && duplicateLineIds.has(id)) identityReasons.push("duplicate_line_id");
    if (clientLinks.length !== 1) identityReasons.push(clientLinks.length ? "multiple_clients_links" : "missing_client_link");
    for (const clientId of clientLinks) {
      memberLinkedClients.add(clientId);
      const linkedClient = clientById.get(clientId);
      if (!linkedClient) { identityReasons.push("missing_linked_client_record"); continue; }
      const clientLineId = text(field(linkedClient, "line_user_id"));
      if (lineId && clientLineId && lineId !== clientLineId) identityReasons.push("member_client_line_conflict");
      if (lineId && clientLineId === lineId && duplicateClientLineIds.has(clientLineId)) identityReasons.push("duplicate_client_line_user_id");
    }
    if (!text(field(member, "Full Name"))) missingReasons.push("missing_full_name");
    if (!selectText(field(member, "Membership Status"))) missingReasons.push("missing_membership_status");
    if (!text(field(member, "Membership Expiry"))) missingReasons.push("missing_membership_expiry");

    const hasEntitlement = entitlementRows.some(entitlement => {
      const entitlementMemberId = text(field(entitlement, "member_id"));
      const entitlementMemberLinks = linkedIds(field(entitlement, "member"));
      return (memberId && entitlementMemberId === memberId) || (id && entitlementMemberLinks.includes(id));
    });
    if (!hasEntitlement) missingReasons.push("missing_entitlement");

    const points = field(member, "Points Balance");
    const numericPoints = typeof points === "number" ? points : (typeof points === "string" && points.trim() ? Number(points) : NaN);
    const hasNonzeroSnapshot = Number.isFinite(numericPoints) && numericPoints !== 0;
    const hasLedger = ledgerRows.some(entry => text(field(entry, "member_id")) === memberId && Boolean(memberId));
    if (hasNonzeroSnapshot && !hasLedger) missingReasons.push("points_snapshot_without_member_ledger");

    reasons.push(...identityReasons, ...missingReasons);
    const category = identityReasons.length ? "identity_review" : missingReasons.length ? "missing_data" : "structurally_complete";
    return { record_id: id, reasons, category };
  });

  const duplicateClientLineGroups = groupDuplicates(clientRows, row => field(row, "line_user_id"));
  const clientSummary = {
    missing_line: clientRows.filter(row => !text(field(row, "line_user_id"))).length,
    duplicate_line_groups: duplicateClientLineGroups.length,
    no_member_link: clientRows.filter(row => !memberLinkedClients.has(recordId(row))).length,
  };
  const ledgerSummary = {
    missing_member_id: ledgerRows.filter(row => !text(field(row, "member_id"))).length,
  };
  const counts = {
    total: rows.length,
    structurally_complete: rows.filter(row => row.category === "structurally_complete").length,
    missing_data: rows.filter(row => row.category === "missing_data").length,
    identity_review: rows.filter(row => row.category === "identity_review").length,
  };
  return { scope: "structural_only_not_validated_historical_truth", counts, rows, clients: clientSummary, ledger: ledgerSummary };
}
