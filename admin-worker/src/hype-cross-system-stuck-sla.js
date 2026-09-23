import { handlePaymentReviewRequest } from "./payment-review-runtime.js";

const AIRTABLE_API = "https://api.airtable.com/v0";

export const HYPE_STUCK_SLA_SCHEMA = "mmd.hype_cross_system_stuck_sla.v1";
export const HYPE_STUCK_SLA_POLICY = "mmd-cross-system-stuck-sla-v1-20260921";

const TABLES = Object.freeze({
  entitlements: "tblNImdF9PKAxhXGi",
  sessions: "tblC98mKWbzmPuNzX",
  couponClaims: "tblTH1LGJikBI0rly",
  telegramBinds: "tblnoEmhS3EpdtV6E",
});

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  jobId: "fldHw5HdDDdkHXMhG",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  customerAckAt: "fldJSS5GNN7quJwa8",
  modelAckAt: "fldFgkHXivIAThfDz",
  state: "fld57fhdWqIcOy4Jp",
  stateUpdatedAt: "fldFJI1Leni6wvzR4",
  createdAt: "flduULqxy2FIuJuaf",
  jobDate: "fldpnqoIsUMfN7y3c",
  reconfirmOverdueAt: "fldVElAODigVt7AcR",
});

const DEFAULT_THRESHOLDS = Object.freeze({
  payment_proof: Object.freeze({ watch: 120, overdue: 360 }),
  entitlement_notification: Object.freeze({ watch: 60, overdue: 240, maxAge: 30 * 24 * 60 }),
  job_confirmation: Object.freeze({ watch: 120, overdue: 360, maxAge: 30 * 24 * 60 }),
  coupon_manual_review: Object.freeze({ watch: 240, overdue: 1440 }),
  telegram_bind: Object.freeze({ watch: 10, overdue: 15, maxAge: 24 * 60 }),
});

const CONFIRMATION_STATES = new Set([
  "created",
  "offered",
  "confirmed",
  "accepted",
  "pending",
  "pending_confirmation",
  "awaiting_confirmation",
  "awaiting_customer_confirmation",
  "awaiting_model_confirmation",
]);

const INCOMPLETE_NOTIFICATION_STATES = new Set([
  "pending",
  "pending_invite",
  "pending_notification",
  "notification_pending",
  "retryable",
  "failed",
  "failed_terminal",
]);

const OWNER_ACTION_DEDICATED_KINDS = new Set([
  "payment_proof_pending",
  "job_confirmation_pending",
]);

export async function readCrossSystemStuckSlaWatch(env = {}, {
  now = new Date(),
  recoveryQueue = null,
} = {}) {
  const sourcePromises = {
    payment_proofs: loadPaymentProofQueue(env),
    entitlement_notifications: airtableList(env, entitlementTable(env), {
      maxRecords: 300,
      sort: [
        { field: "updated_at", direction: "desc" },
        { field: "created_at", direction: "desc" },
      ],
      fields: [
        "entitlement_id",
        "package_code",
        "target_package_label",
        "access_status",
        "source",
        "payment_ref",
        "telegram_access_status",
        "created_at",
        "updated_at",
        "start_at",
      ],
    }),
    job_confirmations: airtableList(env, sessionsTable(env), {
      maxRecords: 300,
      returnFieldsByFieldId: true,
      sort: [
        { field: SESSION_FIELDS.stateUpdatedAt, direction: "desc" },
        { field: SESSION_FIELDS.createdAt, direction: "desc" },
      ],
      fields: Object.values(SESSION_FIELDS),
    }),
    coupon_manual_review: airtableList(env, couponClaimsTable(env), {
      maxRecords: 250,
      sort: [{ field: "updated_at", direction: "desc" }],
      fields: ["claim_id", "campaign_id", "match_status", "review_status", "claim_status", "created_at", "updated_at"],
    }),
    telegram_binds: airtableList(env, telegramBindsTable(env), {
      maxRecords: 250,
      sort: [{ field: "created_at", direction: "desc" }],
      fields: ["bind_id", "role", "status", "created_at", "expires_at", "consumed_at"],
    }),
  };

  const entries = Object.entries(sourcePromises);
  const settled = await Promise.allSettled(entries.map(([, promise]) => promise));
  const sources = {};
  const sourceStatus = {};

  settled.forEach((result, index) => {
    const key = entries[index][0];
    if (result.status === "fulfilled") {
      const value = result.value;
      sources[key] = Array.isArray(value) ? value : array(value?.records);
      const complete = Array.isArray(value) || value?.complete !== false;
      sourceStatus[key] = {
        available: true,
        complete,
        record_count: sources[key].length,
        reason: complete ? null : "candidate_window_truncated",
      };
      return;
    }
    sources[key] = [];
    sourceStatus[key] = {
      available: false,
      record_count: 0,
      reason: safeCode(result.reason?.message || result.reason || `${key}_unavailable`),
    };
  });

  if (recoveryQueue?.ok === true && recoveryQueue?.queue) {
    sources.recovery_queue = recoveryQueue;
    sourceStatus.recovery_queue = {
      available: true,
      complete: recoveryQueue.complete !== false,
      record_count: nonNegative(recoveryQueue.queue.open_count),
      reason: recoveryQueue.complete === false ? "candidate_window_truncated" : null,
    };
  } else {
    sources.recovery_queue = null;
    sourceStatus.recovery_queue = {
      available: false,
      record_count: 0,
      reason: safeCode(recoveryQueue?.error || "recovery_queue_unavailable"),
    };
  }

  return buildCrossSystemStuckSlaWatch(sources, now, {
    thresholds: thresholdsFromEnv(env),
    sourceStatus,
  });
}

export function buildCrossSystemStuckSlaWatch(sources = {}, now = new Date(), options = {}) {
  const clock = validDate(now) || new Date();
  const nowMs = clock.getTime();
  const thresholds = normalizeThresholds(options.thresholds);
  const unaged = {};
  const items = [];

  for (const proof of array(sources.payment_proofs)) {
    const observedAt = firstText(proof?.created_at, proof?.submitted_at, proof?.received_at);
    const item = timedItem({
      kind: "payment_proof_pending",
      observedAt,
      nowMs,
      policy: thresholds.payment_proof,
      reference: firstText(proof?.proof_id, proof?.proof_record_id),
      label: firstText(proof?.customer_name, proof?.payer_name, "Payment Proof"),
      detail: "Payment Proof รอ Official Review",
      href: "/internal/admin/payments",
      authority: "payments-worker",
    });
    if (item) items.push(item);
    else if (!validDate(observedAt)) increment(unaged, "payment_proof_pending");
  }

  for (const record of array(sources.entitlement_notifications)) {
    const fields = record?.fields || {};
    const notificationState = normalize(firstField(fields, [
      "telegram_access_status",
      "notification_status",
      "customer_notification_status",
    ]));
    const accessState = normalize(firstField(fields, ["access_status", "member_lifecycle_status", "member_status"]));
    const source = normalize(firstField(fields, ["source", "source_type"]));
    const paymentRefPresent = Boolean(firstField(fields, ["payment_ref", "Payment Reference"]));
    const looksMaterialized = !["blocked", "revoked", "suspended", "rejected"].includes(accessState)
      && (accessState === "active" || source === "renewal" || paymentRefPresent);
    if (!looksMaterialized || !INCOMPLETE_NOTIFICATION_STATES.has(notificationState)) continue;
    const observedAt = firstText(
      firstField(fields, ["materialized_at", "created_at", "updated_at", "start_at"]),
      record?.createdTime,
    );
    const item = timedItem({
      kind: "entitlement_notification_incomplete",
      observedAt,
      nowMs,
      policy: thresholds.entitlement_notification,
      reference: firstText(firstField(fields, ["entitlement_id"]), record?.id),
      label: firstText(firstField(fields, ["target_package_label", "package_code"]), "Membership entitlement"),
      detail: `Entitlement materialized · notification ${notificationState || "pending"}`,
      href: "/internal/admin/member-intelligence",
      authority: "my_mmd_entitlement_resolver_v1",
    });
    if (item) items.push(item);
    else if (!validDate(observedAt)) increment(unaged, "entitlement_notification_incomplete");
  }

  for (const record of array(sources.job_confirmations)) {
    const fields = record?.fields || {};
    const state = normalize(firstField(fields, [SESSION_FIELDS.state, "model_session_state", "session_state", "status", "Session Status"]));
    if (!CONFIRMATION_STATES.has(state)) continue;
    const customerAck = firstText(firstField(fields, [SESSION_FIELDS.customerAckAt, "customer_ack_at", "client_ack_at"]));
    const modelAck = firstText(firstField(fields, [SESSION_FIELDS.modelAckAt, "model_ack_at"]));
    if (customerAck && modelAck) continue;
    const observedAt = firstText(
      firstField(fields, [SESSION_FIELDS.stateUpdatedAt, "state_updated_at", "updated_at", SESSION_FIELDS.createdAt, "created_at"]),
      record?.createdTime,
    );
    const overdueAt = firstText(firstField(fields, [SESSION_FIELDS.reconfirmOverdueAt, "reconfirm_overdue_at", "confirmation_overdue_at"]));
    const jobDate = firstText(firstField(fields, [SESSION_FIELDS.jobDate, "job_date", "service_date"]));
    if (historicalJob(jobDate, observedAt, nowMs, thresholds.job_confirmation.maxAge)) continue;
    const missing = !customerAck && !modelAck ? "customer + model" : !customerAck ? "customer" : "model";
    const sessionId = firstText(firstField(fields, [SESSION_FIELDS.sessionId, "session_id"]), record?.id);
    const item = timedItem({
      kind: "job_confirmation_pending",
      observedAt,
      nowMs,
      policy: thresholds.job_confirmation,
      explicitOverdue: isPast(overdueAt, nowMs),
      reference: firstText(firstField(fields, [SESSION_FIELDS.jobId, "job_id"]), sessionId),
      label: compact([
        firstField(fields, [SESSION_FIELDS.modelName, "model_name"]),
        firstField(fields, [SESSION_FIELDS.clientName, "client_name", "customer_name"]),
      ]) || "Job confirmation",
      detail: `รอ ${missing} confirmation`,
      href: sessionId ? `/internal/admin/jobs/${encodeURIComponent(clean(sessionId, 160))}` : "/internal/admin/jobs",
      authority: "canonical_sessions_and_reconfirm",
    });
    if (item) items.push(item);
    else if (!validDate(observedAt) && !isPast(overdueAt, nowMs)) increment(unaged, "job_confirmation_pending");
  }

  for (const item of recoveryItems(sources.recovery_queue)) items.push(item);

  for (const record of array(sources.coupon_manual_review)) {
    const fields = record?.fields || {};
    const claimState = normalize(firstField(fields, ["claim_status"]));
    const reviewState = normalize(firstField(fields, ["review_status"]));
    const matchState = normalize(firstField(fields, ["match_status"]));
    if (![claimState, reviewState, matchState].includes("manual_review")) continue;
    const observedAt = firstText(firstField(fields, ["updated_at", "created_at"]), record?.createdTime);
    const item = timedItem({
      kind: "coupon_manual_review",
      observedAt,
      nowMs,
      policy: thresholds.coupon_manual_review,
      reference: firstText(firstField(fields, ["claim_id"]), record?.id),
      label: firstText(firstField(fields, ["campaign_id"]), "CARE BACK"),
      detail: "Coupon claim อยู่ manual_review",
      href: "/internal/admin/member-intelligence",
      authority: "care_back_claim_policy",
    });
    if (item) items.push(item);
    else if (!validDate(observedAt)) increment(unaged, "coupon_manual_review");
  }

  for (const record of array(sources.telegram_binds)) {
    const fields = record?.fields || {};
    if (normalize(firstField(fields, ["status"])) !== "pending") continue;
    const observedAt = firstText(firstField(fields, ["created_at"]), record?.createdTime);
    const expiresAt = firstText(firstField(fields, ["expires_at"]));
    const item = timedItem({
      kind: "telegram_bind_unconsumed",
      observedAt,
      nowMs,
      policy: thresholds.telegram_bind,
      explicitOverdue: isPast(expiresAt, nowMs),
      reference: firstText(firstField(fields, ["bind_id"]), record?.id),
      label: `${firstText(firstField(fields, ["role"]), "identity")} Telegram bind`,
      detail: isPast(expiresAt, nowMs) ? "Bind issued แต่หมดอายุก่อน consume" : "Bind issued และยังไม่ consume",
      href: "/internal/admin/control-room",
      authority: "telegram_identity_bind_authority",
    });
    if (item) items.push(item);
    else if (!validDate(observedAt)) increment(unaged, "telegram_bind_unconsumed");
  }

  const deduped = dedupeItems(items).sort(compareItems);
  const ownerActionableOverdue = deduped.filter((item) =>
    item.sla_status === "overdue" && !OWNER_ACTION_DEDICATED_KINDS.has(item.kind)
  );
  const counts = {
    total: deduped.length,
    overdue: deduped.filter((item) => item.sla_status === "overdue").length,
    watch: deduped.filter((item) => item.sla_status === "watch").length,
    owner_actionable_overdue: ownerActionableOverdue.length,
    by_kind: countBy(deduped, "kind"),
  };
  const sourceStatus = normalizedSourceStatus(options.sourceStatus, sources);
  const unavailableSources = Object.entries(sourceStatus)
    .filter(([, status]) => status.available !== true || status.complete === false)
    .map(([key]) => key);
  const status = counts.overdue > 0
    ? "overdue"
    : counts.watch > 0
      ? "watch"
      : unavailableSources.length
        ? "partial"
        : "clear";

  return {
    available: Object.values(sourceStatus).some((source) => source.available === true),
    complete: unavailableSources.length === 0,
    schema: HYPE_STUCK_SLA_SCHEMA,
    policy_version: HYPE_STUCK_SLA_POLICY,
    status,
    checked_at: clock.toISOString(),
    attention_required: counts.total > 0,
    counts: {
      ...counts,
      unavailable_sources: unavailableSources.length,
      unaged_records: Object.values(unaged).reduce((sum, value) => sum + nonNegative(value), 0),
    },
    unavailable_sources: unavailableSources,
    sources: sourceStatus,
    unaged_by_kind: unaged,
    items: deduped.slice(0, 20),
    summary: summaryText(status, counts, unavailableSources.length),
    operational_only: true,
    business_truth_inferred: false,
    business_truth_mutated: false,
    owner_confirmation_required_for_mutation: true,
  };
}

function recoveryItems(result) {
  if (!result || result.ok !== true || !result.queue) return [];
  const candidates = [...array(result.queue.attention), ...array(result.queue.picker_attention)];
  const byCase = new Map();
  for (const candidate of candidates) {
    if (normalize(candidate?.assignment_status) !== "unassigned") continue;
    const slaStatus = normalize(candidate?.sla_status);
    if (!new Set(["watch", "overdue"]).has(slaStatus)) continue;
    const caseRef = clean(candidate?.case_ref, 180);
    if (!caseRef) continue;
    const item = {
      kind: "recovery_unassigned",
      sla_status: slaStatus,
      age_minutes: nullableNonNegative(candidate?.since_update_minutes),
      observed_at: clean(candidate?.updated_at, 80) || null,
      threshold_minutes: null,
      reference: caseRef,
      label: clean(candidate?.client_name, 120) || "Recovery Case",
      detail: `Recovery ${clean(candidate?.domain, 40) || "case"} ยังไม่มีคนรับ`,
      href: safeInternalHref(candidate?.href) || `/internal/admin/recovery?case_ref=${encodeURIComponent(caseRef)}`,
      authority: "recovery_queue_operational_metadata",
      operational_only: true,
      business_truth_inferred: false,
    };
    const existing = byCase.get(caseRef);
    if (!existing || compareItems(item, existing) < 0) byCase.set(caseRef, item);
  }
  return [...byCase.values()];
}

function timedItem({ kind, observedAt, nowMs, policy, explicitOverdue = false, reference, label, detail, href, authority }) {
  const observed = validDate(observedAt);
  const ageMinutes = observed ? Math.max(0, Math.floor((nowMs - observed.getTime()) / 60000)) : null;
  if (ageMinutes !== null && Number.isFinite(policy?.maxAge) && ageMinutes > policy.maxAge) return null;
  let slaStatus = "";
  if (explicitOverdue === true) slaStatus = "overdue";
  else if (ageMinutes !== null && ageMinutes >= policy.overdue) slaStatus = "overdue";
  else if (ageMinutes !== null && ageMinutes >= policy.watch) slaStatus = "watch";
  if (!slaStatus) return null;
  return {
    kind,
    sla_status: slaStatus,
    age_minutes: ageMinutes,
    observed_at: observed?.toISOString() || null,
    threshold_minutes: slaStatus === "overdue" ? policy.overdue : policy.watch,
    reference: safeReference(reference),
    label: clean(label, 180) || kind,
    detail: clean(detail, 260),
    href: safeInternalHref(href) || "/internal/admin/control-room",
    authority: clean(authority, 120) || "operational_read_only",
    operational_only: true,
    business_truth_inferred: false,
  };
}

function thresholdsFromEnv(env = {}) {
  return {
    payment_proof: threshold(env, "HYPE_STUCK_PAYMENT_PROOF", DEFAULT_THRESHOLDS.payment_proof),
    entitlement_notification: threshold(env, "HYPE_STUCK_ENTITLEMENT_NOTIFICATION", DEFAULT_THRESHOLDS.entitlement_notification),
    job_confirmation: threshold(env, "HYPE_STUCK_JOB_CONFIRMATION", DEFAULT_THRESHOLDS.job_confirmation),
    coupon_manual_review: threshold(env, "HYPE_STUCK_COUPON_MANUAL_REVIEW", DEFAULT_THRESHOLDS.coupon_manual_review),
    telegram_bind: threshold(env, "HYPE_STUCK_TELEGRAM_BIND", DEFAULT_THRESHOLDS.telegram_bind),
  };
}

function threshold(env, prefix, fallback) {
  const watch = boundedInt(env[`${prefix}_WATCH_MINUTES`], fallback.watch, 1, 60 * 24 * 30);
  const overdue = boundedInt(env[`${prefix}_OVERDUE_MINUTES`], fallback.overdue, watch, 60 * 24 * 90);
  return { watch, overdue, ...(fallback.maxAge ? { maxAge: fallback.maxAge } : {}) };
}

function normalizeThresholds(value = {}) {
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_THRESHOLDS)) {
    const candidate = value?.[key] || {};
    const watch = boundedInt(candidate.watch, fallback.watch, 1, 60 * 24 * 30);
    const overdue = boundedInt(candidate.overdue, fallback.overdue, watch, 60 * 24 * 90);
    const maxAge = boundedInt(candidate.maxAge, fallback.maxAge || 0, 0, 60 * 24 * 365);
    out[key] = { watch, overdue, ...(maxAge > 0 ? { maxAge } : {}) };
  }
  return out;
}

async function loadPaymentProofQueue(env) {
  const response = await handlePaymentReviewRequest(
    new Request("https://admin-worker.internal/v1/admin/payments/review-queue?limit=100"),
    env,
    { id: "hype_stuck_sla_watch", role: "admin" },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
    throw new Error(`payment_review_queue_${response.status}_${safeCode(payload?.error || "invalid")}`);
  }
  return payload.items;
}

async function airtableList(env, table, {
  maxRecords = 250,
  returnFieldsByFieldId = false,
  fields = [],
  sort = [],
} = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !apiKey || !table) throw new Error("airtable_not_ready");
  const output = [];
  let offset = "";
  const boundedMax = Math.min(Math.max(Number(maxRecords) || 1, 1), 500);
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", String(Math.min(100, boundedMax - output.length)));
    if (returnFieldsByFieldId) url.searchParams.set("returnFieldsByFieldId", "true");
    if (offset) url.searchParams.set("offset", offset);
    array(sort).slice(0, 3).forEach((entry, index) => {
      const field = clean(entry?.field, 120);
      if (!field) return;
      url.searchParams.set(`sort[${index}][field]`, field);
      url.searchParams.set(`sort[${index}][direction]`, normalize(entry?.direction) === "asc" ? "asc" : "desc");
    });
    for (const field of array(fields).map((value) => clean(value, 120)).filter(Boolean)) url.searchParams.append("fields[]", field);
    const request = new Request(url, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
    const response = env.AIRTABLE_HTTP?.fetch
      ? await env.AIRTABLE_HTTP.fetch(request)
      : await fetch(request);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`airtable_${safeCode(table)}_${response.status}`);
    output.push(...array(payload.records));
    offset = clean(payload.offset, 500);
  } while (offset && output.length < boundedMax);
  return {
    records: output.slice(0, boundedMax),
    complete: !offset,
  };
}

function normalizedSourceStatus(value = {}, sources = {}) {
  const keys = [
    "payment_proofs",
    "entitlement_notifications",
    "job_confirmations",
    "recovery_queue",
    "coupon_manual_review",
    "telegram_binds",
  ];
  const out = {};
  for (const key of keys) {
    const source = value?.[key];
    if (source && typeof source === "object") {
      out[key] = {
        available: source.available === true,
        complete: source.available === true && source.complete !== false,
        record_count: nonNegative(source.record_count),
        reason: source.available === true ? null : safeCode(source.reason || `${key}_unavailable`),
      };
      if (source.available === true && source.complete === false) {
        out[key].reason = safeCode(source.reason || "candidate_window_truncated");
      }
    } else {
      const present = Object.prototype.hasOwnProperty.call(sources || {}, key) && sources[key] !== null;
      out[key] = {
        available: present,
        complete: present,
        record_count: key === "recovery_queue"
          ? nonNegative(sources?.recovery_queue?.queue?.open_count)
          : array(sources?.[key]).length,
        reason: present ? null : `${key}_unavailable`,
      };
    }
  }
  return out;
}

export const HYPE_CROSS_SYSTEM_STUCK_SLA_INTERNALS = Object.freeze({ airtableList });

function historicalJob(jobDateValue, observedAtValue, nowMs, maxAgeMinutes) {
  const jobDate = validDate(jobDateValue);
  if (jobDate && jobDate.getTime() < nowMs - 2 * 24 * 60 * 60 * 1000) return true;
  const observed = validDate(observedAtValue);
  return Boolean(observed && Number.isFinite(maxAgeMinutes) && nowMs - observed.getTime() > maxAgeMinutes * 60000);
}

function dedupeItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${item.kind}|${item.reference || item.label}`;
    const prior = map.get(key);
    if (!prior || compareItems(item, prior) < 0) map.set(key, item);
  }
  return [...map.values()];
}

function compareItems(a, b) {
  const rank = { overdue: 0, watch: 1 };
  const status = (rank[a?.sla_status] ?? 9) - (rank[b?.sla_status] ?? 9);
  if (status) return status;
  return (Number(b?.age_minutes) || 0) - (Number(a?.age_minutes) || 0);
}

function countBy(items, key) {
  const out = {};
  for (const item of items) {
    const value = clean(item?.[key], 80) || "unknown";
    out[value] = nonNegative(out[value]) + 1;
  }
  return out;
}

function summaryText(status, counts, unavailableCount) {
  if (status === "overdue") return `Cross-system SLA overdue ${counts.overdue} · watch ${counts.watch}`;
  if (status === "watch") return `Cross-system SLA watch ${counts.watch}`;
  if (status === "partial") return `Cross-system SLA source unavailable ${unavailableCount}`;
  return "No current cross-system stuck item in the configured SLA windows";
}

function entitlementTable(env) {
  return clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || TABLES.entitlements, 180);
}

function sessionsTable(env) {
  return clean(env.AIRTABLE_TABLE_SESSIONS || TABLES.sessions, 180);
}

function couponClaimsTable(env) {
  return clean(env.AIRTABLE_TABLE_CARE_BACK_CLAIMS || TABLES.couponClaims, 180);
}

function telegramBindsTable(env) {
  return clean(env.AIRTABLE_TABLE_TELEGRAM_IDENTITY_BINDS || TABLES.telegramBinds, 180);
}

function firstField(fields, keys) {
  for (const key of keys) {
    const value = fields?.[key];
    if (value === undefined || value === null || value === "") continue;
    const scalar = Array.isArray(value) ? value[0] : value;
    if (scalar && typeof scalar === "object" && typeof scalar.name === "string") return scalar.name;
    return scalar;
  }
  return "";
}

function firstText(...values) {
  for (const value of values) {
    const text = clean(value, 300);
    if (text) return text;
  }
  return "";
}

function compact(values) {
  return array(values).map((value) => clean(value, 120)).filter(Boolean).join(" · ").slice(0, 240);
}

function validDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const stamp = Date.parse(clean(value, 120));
  return Number.isFinite(stamp) ? new Date(stamp) : null;
}

function isPast(value, nowMs) {
  const date = validDate(value);
  return Boolean(date && date.getTime() <= nowMs);
}

function safeReference(value) {
  const reference = clean(value, 180);
  if (/^(?:bind_|https?:|U[0-9a-f]{32}$)/i.test(reference)) return "";
  return reference;
}

function safeInternalHref(value) {
  const href = clean(value, 500);
  if (!/^\/(?:internal|sigil)\//.test(href) || href.startsWith("//")) return "";
  return href;
}

function increment(target, key) {
  target[key] = nonNegative(target[key]) + 1;
}

function nullableNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function boundedInt(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function normalize(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function safeCode(value) {
  return normalize(value) || "unavailable";
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
