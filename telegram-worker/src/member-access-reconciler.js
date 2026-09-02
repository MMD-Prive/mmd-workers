const SNAPSHOT_VERSION = "my_mmd_entitlement_resolver_v1";
const PROTECTED = new Set(["vip", "svip", "black_card"]);

export function buildMemberAccessReconciliation({ snapshot, current = {}, approvals = {} } = {}) {
  if (!snapshot || snapshot.schema_version !== SNAPSHOT_VERSION) return failClosed("invalid_snapshot");

  const active = new Set(Array.isArray(snapshot.capability_state?.active) ? snapshot.capability_state.active : []);
  const grace = new Set(Array.isArray(snapshot.capability_state?.grace) ? snapshot.capability_state.grace : []);
  const blocked = snapshot.member_blocked === true;
  const access = snapshot.access || {};

  const currentDrive = normalizeSet(current.drive_scopes);
  const currentTelegram = normalizeSet(current.telegram_rooms);

  if (blocked) {
    return {
      schema_version: "my_mmd_downstream_reconciliation_v1",
      source_of_truth: "entitlement_snapshot",
      fail_closed: true,
      blocked: true,
      drive: {
        grant: [],
        keep: [],
        revoke: [...currentDrive],
      },
      telegram: {
        grant: [],
        keep: [],
        revoke: [...currentTelegram],
      },
      reason: "member_blocked",
    };
  }

  const desiredDrive = new Set();
  if (active.has("private_standard")) desiredDrive.add("private_standard");
  if (active.has("private_premium")) desiredDrive.add("private_premium");

  const approvedProtected = new Set();
  for (const capability of PROTECTED) {
    if (approvals?.[capability] === true && active.has(capability)) approvedProtected.add(capability);
  }

  const desiredTelegram = new Set(approvedProtected);

  const drive = reconcileSets(currentDrive, desiredDrive, {
    allowNew: access.new_drive_grants_allowed === true,
    keepGrace: access.existing_grants_may_continue_in_grace === true && grace.size > 0,
  });

  const telegram = reconcileSets(currentTelegram, desiredTelegram, {
    allowNew: access.new_telegram_grants_allowed === true,
    keepGrace: access.existing_grants_may_continue_in_grace === true && grace.size > 0,
  });

  return {
    schema_version: "my_mmd_downstream_reconciliation_v1",
    source_of_truth: "entitlement_snapshot",
    fail_closed: true,
    blocked: false,
    drive,
    telegram,
    protected_approval_required: true,
    grace_present: grace.size > 0,
  };
}

function reconcileSets(current, desired, { allowNew, keepGrace }) {
  const grant = [];
  const keep = [];
  const revoke = [];

  for (const item of desired) {
    if (current.has(item)) keep.push(item);
    else if (allowNew) grant.push(item);
  }

  for (const item of current) {
    if (desired.has(item)) continue;
    if (keepGrace) keep.push(item);
    else revoke.push(item);
  }

  return { grant, keep: unique(keep), revoke };
}

function normalizeSet(value) {
  return new Set((Array.isArray(value) ? value : []).map((item) => String(item || "").trim().toLowerCase()).filter(Boolean));
}

function unique(values) {
  return [...new Set(values)];
}

function failClosed(reason) {
  return {
    schema_version: "my_mmd_downstream_reconciliation_v1",
    source_of_truth: "entitlement_snapshot",
    fail_closed: true,
    blocked: false,
    drive: { grant: [], keep: [], revoke: [] },
    telegram: { grant: [], keep: [], revoke: [] },
    reason,
  };
}
