const CAMPAIGN_ID = "mmd_6th_anniversary_2026";
const BENEFIT_TYPES = new Set(["membership_extension", "membership_upgrade", "anniversary_points"]);

export async function executeMutationGate(input, store) {
  validateInput(input);
  const plan = uniquePlan(input.plan);
  const existing = new Map();
  for (const item of plan) existing.set(item.benefitType, await store.getApplication(item.idempotencyKey));

  const membershipItems = plan.filter((item) => item.benefitType !== "anniversary_points");
  const membershipResult = await applyComponentGroup(input, membershipItems, existing, store, "membership");
  if (!membershipResult.complete) {
    return result(plan, existing, false, membershipResult.newMembershipExpiry);
  }

  const pointsItems = plan.filter((item) => item.benefitType === "anniversary_points");
  const pointsResult = await applyComponentGroup(input, pointsItems, existing, store, "points");
  return result(plan, existing, pointsResult.complete, membershipResult.newMembershipExpiry);
}

export function createSerializedMutationRunner(store) {
  let queue = Promise.resolve();
  return async (input) => {
    let release;
    const turn = new Promise((resolve) => { release = resolve; });
    const previous = queue;
    queue = turn;
    await previous;
    try { return await executeMutationGate(input, store); }
    finally { release(); }
  };
}

async function applyComponentGroup(input, items, existing, store, component) {
  if (!items.length) return { complete: true, newMembershipExpiry: null };
  const pending = items.filter((item) => existing.get(item.benefitType)?.status !== "applied");
  if (!pending.length) {
    const stored = existing.get(items[0].benefitType);
    return { complete: true, newMembershipExpiry: stored?.after?.newExpiry || null };
  }
  if (pending.some((item) => ![null, undefined, "retry_required"].includes(existing.get(item.benefitType)?.status))) {
    return { complete: false, newMembershipExpiry: null };
  }

  for (const item of pending) {
    const application = await store.reserveApplication(item, input, existing.get(item.benefitType) || null);
    existing.set(item.benefitType, application);
  }

  try {
    const mutation = component === "membership"
      ? await store.applyMembershipAtomically(input, items)
      : await store.applyPoints(input, items[0]);
    for (const item of pending) {
      const application = await store.markApplication(existing.get(item.benefitType), "applied", mutation, input);
      existing.set(item.benefitType, application);
    }
    return { complete: true, newMembershipExpiry: mutation?.newExpiry || null };
  } catch (error) {
    const status = error?.safeToRetry === true ? "retry_required" : "failed";
    for (const item of pending) {
      const application = await store.markApplication(existing.get(item.benefitType), status,
        { error: String(error?.code || error?.message || "mutation_failed") }, input);
      existing.set(item.benefitType, application);
    }
    return { complete: false, newMembershipExpiry: null };
  }
}

function result(plan, applications, completed, newMembershipExpiry) {
  const results = plan.map((item) => {
    const application = applications.get(item.benefitType);
    return { benefitType: item.benefitType, idempotencyKey: item.idempotencyKey,
      status: application?.status === "applied" ? (application.wasExisting ? "already_applied" : "applied") : application?.status || "missing" };
  });
  const allApplied = results.every((item) => ["applied", "already_applied"].includes(item.status));
  return { ok: completed && allApplied, status: completed && allApplied ? "completed" : "partial_failure",
    results, newMembershipExpiry: newMembershipExpiry || null };
}

function uniquePlan(plan) {
  if (!Array.isArray(plan) || !plan.length) throw new GateError("benefit_plan_required");
  const seen = new Set();
  return plan.map((item) => {
    if (!BENEFIT_TYPES.has(item?.benefitType)) throw new GateError("invalid_benefit_type");
    if (seen.has(item.benefitType)) throw new GateError("duplicate_benefit_type");
    seen.add(item.benefitType);
    const expected = `${CAMPAIGN_ID}:${inputHash(item.idempotencyKey)}:${item.benefitType}`;
    if (item.idempotencyKey !== expected) throw new GateError("invalid_idempotency_key");
    return structuredClone(item);
  });
}

function inputHash(key) {
  const parts = String(key || "").split(":");
  if (parts.length !== 3 || !/^[a-f0-9]{64}$/i.test(parts[1])) throw new GateError("invalid_idempotency_key");
  return parts[1].toLowerCase();
}

function validateInput(input) {
  if (input?.campaignId !== CAMPAIGN_ID) throw new GateError("invalid_campaign");
  for (const key of ["claimId", "identityHash", "memberId", "requestId"]) required(input?.[key], key);
  if (!/^[a-f0-9]{64}$/i.test(input.identityHash)) throw new GateError("invalid_identity_hash");
  for (const key of ["id", "sessionId"]) required(input?.actor?.[key], `actor_${key}`);
  if (input.paymentRequired && input.paymentTruth?.paymentVerified !== true) throw new GateError("verified_payment_required");
  if (input.upgradeRequired && input.paymentTruth?.upgradePaymentVerified !== true) throw new GateError("verified_upgrade_payment_required");
}

function required(value, field) { if (!String(value || "").trim()) throw new GateError(`${field}_required`); }
export class GateError extends Error { constructor(code) { super(code); this.code = code; } }
export class MutationError extends Error { constructor(code, safeToRetry = false) { super(code); this.code = code; this.safeToRetry = safeToRetry; } }
