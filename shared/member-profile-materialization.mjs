const TRIGGERS = new Set([
  "dashboard_access",
  "sigil_booking",
  "verified_renewal",
  "admin_commit",
]);

const OUTCOMES = new Set([
  "triggered",
  "already_seen",
  "already_materialized",
  "partial_resume",
  "not_eligible",
  "materialization_failed_safe",
]);

function clean(value, max = 200) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function exactId(value, pattern, label) {
  const result = clean(value, 160);
  if (!pattern.test(result)) throw new Error(`${label}_invalid`);
  return result;
}

export function normalizeMaterializationRequest(input = {}) {
  const trigger = clean(input.trigger, 40);
  if (!TRIGGERS.has(trigger)) throw new Error("trigger_invalid");
  return Object.freeze({
    trigger,
    stagingImportId: exactId(input.stagingImportId, /^[A-Za-z0-9:_-]{6,120}$/, "staging_import_id"),
    memberId: exactId(input.memberId, /^[A-Za-z0-9:_-]{3,120}$/, "member_id"),
    commit: input.commit === true,
    actor: clean(input.actor, 120) || `trigger:${trigger}`,
  });
}

export async function sha256Hex(value, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle) throw new Error("crypto_unavailable");
  const bytes = new TextEncoder().encode(String(value));
  const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function materializationEventKey({ trigger, memberId, version = "v1" }, cryptoImpl) {
  if (!TRIGGERS.has(trigger)) throw new Error("trigger_invalid");
  const member = exactId(memberId, /^[A-Za-z0-9:_-]{3,120}$/, "member_id");
  return `member_profile:${trigger}:${await sha256Hex(`${version}:${trigger}:${member}`, cryptoImpl)}`;
}

function boundedResult(payload = {}) {
  const outcome = OUTCOMES.has(payload.outcome) ? payload.outcome : "materialization_failed_safe";
  return {
    ok: payload.ok === true,
    outcome,
    dry_run: payload.dry_run === true,
    wrote: Array.isArray(payload.wrote)
      ? payload.wrote.filter((value) => ["session", "points", "audit", "receipt"].includes(value)).slice(0, 4)
      : [],
  };
}

export async function invokeMemberProfileMaterializer(binding, input, options = {}) {
  const request = normalizeMaterializationRequest(input);
  if (!binding || typeof binding.fetch !== "function") {
    return boundedResult({ outcome: "materialization_failed_safe" });
  }
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 1500, 100), 3000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await binding.fetch("https://member-profile-materializer.internal/v1/materialize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return boundedResult({ outcome: "materialization_failed_safe" });
    return boundedResult(payload);
  } catch {
    return boundedResult({ outcome: "materialization_failed_safe" });
  } finally {
    clearTimeout(timer);
  }
}

export function validateReadinessAggregate(input = {}) {
  const keys = [
    "total_staged", "safe", "review_required", "blocked", "cancelled", "reconciled",
    "resolved_member", "unresolved_member", "approved_materialization", "rejected_materialization",
    "ready_to_materialize", "already_materialized", "integrity_conflict",
  ];
  return Object.fromEntries(keys.map((key) => {
    const value = Number(input[key]);
    return [key, Number.isSafeInteger(value) && value >= 0 ? value : 0];
  }));
}

export { OUTCOMES, TRIGGERS };
