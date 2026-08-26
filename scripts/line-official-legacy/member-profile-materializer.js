const crypto = require("node:crypto");

const MATERIALIZATION_TRIGGERS = new Set([
  "dashboard_access",
  "sigil_booking",
  "verified_renewal",
  "admin_commit",
]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function selectName(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? text(value.name || value.value)
    : text(value);
}

function strictDate(value) {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === raw ? raw : "";
}

function safeJson(value, fallback) {
  try {
    if (typeof value === "object" && value !== null) return value;
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function stableKey(importId, suffix) {
  const digest = crypto.createHash("sha256").update(`${text(importId)}:${suffix}`).digest("hex");
  return `line_ofc_history:${digest}`;
}

function materializationDate(fields) {
  const dates = safeJson(fields.note_detected_dates, []).map(strictDate).filter(Boolean);
  return dates.length === 1 ? dates[0] : "";
}

function validateMaterialization({ fields, member, trigger }) {
  if (!MATERIALIZATION_TRIGGERS.has(trigger)) return "trigger_required";
  if (selectName(fields.decision) !== "approve_materialization") return "review_approval_required";
  if (!text(fields.reviewed_by) || !text(fields.reviewed_at)) return "review_evidence_required";
  if (!text(fields.import_id) || !text(fields.member_id_candidate)) return "identity_link_required";
  if (text(fields.member_id_candidate) !== text(member.member_id)) return "identity_mismatch";
  if (!text(member.email)) return "verified_member_email_required";
  if (String(fields.points_review_required).toLowerCase() !== "false") return "points_review_required";
  if (selectName(fields.historical_service_status) === "cancelled") return "cancelled_zero";
  if (selectName(fields.historical_service_status) !== "completed") return "service_not_approved";
  const amount = Number(fields.reconciled_service_amount);
  const points = Number(fields.proposed_points);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(points) || points !== Math.floor(amount / 100)) return "points_policy_mismatch";
  if (!materializationDate(fields)) return "service_date_required";
  return "";
}

function buildMaterializationPlan({ stagingRecord, member, trigger }) {
  const fields = stagingRecord?.fields || {};
  const reason = validateMaterialization({ fields, member, trigger });
  const importId = text(fields.import_id);
  const base = {
    ok: !reason || reason === "cancelled_zero",
    reason,
    import_id: importId,
    trigger,
    idempotency: {
      session: stableKey(importId, "session"),
      points: stableKey(importId, "points"),
      audit: stableKey(importId, "audit"),
    },
  };
  if (reason === "cancelled_zero") return { ...base, writes: { session: null, points: null, audit: { event_type: "legacy_history_cancelled_materialized", reason_code: "cancelled_zero" } } };
  if (reason) return { ...base, writes: null };

  const amount = Number(fields.reconciled_service_amount);
  const points = Number(fields.proposed_points);
  const date = materializationDate(fields);
  return {
    ...base,
    writes: {
      session: {
        session_id: stableKey(importId, "session"),
        email: text(member.email).toLowerCase(),
        line_user_id: text(member.line_user_id),
        job_type: "Historical MMD service",
        job_date: date,
        status: "completed",
        amount_thb: amount,
        import_review_status: "approved",
        imported_source_ref: importId,
        imported_confidence_score: Number(fields.points_confidence || 0),
      },
      points: {
        member_email: text(member.email).toLowerCase(),
        amount_thb: amount,
        points,
        rate_policy: "100THB=1PT_FLOOR",
        source: "line_ofc_history",
        idempotency_key: stableKey(importId, "points"),
        posted_at: `${date}T00:00:00.000+07:00`,
        transaction_status: "posted",
      },
      audit: {
        event_type: "legacy_member_profile_materialized",
        reason_code: trigger,
        idempotency_key: stableKey(importId, "audit"),
      },
    },
  };
}

async function materializeMemberProfile({ store, importId, memberId, trigger }) {
  if (!store) throw new Error("materialization_store_required");
  const stagingRecord = await store.getStagingByImportId(importId);
  const member = await store.getMemberById(memberId);
  const plan = buildMaterializationPlan({ stagingRecord, member: member || {}, trigger });
  if (!plan.ok) return { ok: false, reason: plan.reason, wrote: [] };

  const wrote = [];
  if (plan.writes.session && !await store.hasSession(plan.idempotency.session)) {
    await store.createSession(plan.writes.session);
    wrote.push("session");
  }
  if (plan.writes.points && !await store.hasPoints(plan.idempotency.points)) {
    await store.createPoints(plan.writes.points);
    wrote.push("points");
  }
  if (!await store.hasAudit(plan.idempotency.audit)) {
    await store.createAudit(plan.writes.audit);
    wrote.push("audit");
  }
  await store.markStagingMaterialized(stagingRecord.id, { committed_at: new Date().toISOString(), committed_by: `trigger:${trigger}` });
  return { ok: true, reason: plan.reason || "materialized", wrote };
}

module.exports = {
  MATERIALIZATION_TRIGGERS,
  buildMaterializationPlan,
  materializeMemberProfile,
  stableKey,
};
