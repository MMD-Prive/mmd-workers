export const KENJI_LV5_SCHEMA = "mmd.kenji_operational_concierge.v1";

export const KENJI_LV5_AUTHORITIES = Object.freeze({
  identity: "canonical_client_reviewed_match",
  membership_entitlement: "my_mmd_entitlement_resolver_v1",
  money: "payments-worker",
  job_session: "events-worker",
  scheduling: "cal.com_projection",
  telegram: "telegram-worker_notification_and_access_observation",
  final_owner: "Per",
});

const PROTECTED_ACTIONS = new Set([
  "confirm_payment",
  "apply_credit",
  "grant_membership",
  "grant_private_access",
  "assign_model",
  "confirm_job",
  "cancel_job",
  "reschedule_job",
  "create_calendar_hold",
  "revoke_telegram_access",
  "grant_telegram_access",
]);

const BLOCKED_ACCESS = new Set(["blocked", "suspended", "revoked", "banned"]);
const CLOSED_JOB_STATES = new Set(["cancelled", "canceled", "completed", "closed", "expired"]);
const ACTIVE_JOB_STATES = new Set(["pending", "hold", "held", "confirmed", "active", "scheduled", "awaiting_payment", "awaiting_deposit"]);

function text(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function token(value) {
  return text(value).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value) {
  return value === true || value === 1 || ["true", "1", "yes", "on"].includes(text(value).toLowerCase());
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function compact(object = {}) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== "" && value !== null && value !== undefined));
}

function action(name, options = {}) {
  const protectedAction = PROTECTED_ACTIONS.has(name) || options.protected === true;
  return compact({
    action: name,
    label: text(options.label || name, 120),
    reason: text(options.reason, 500),
    domain: text(options.domain, 80),
    mode: protectedAction ? "supervised" : text(options.mode || "prepare_only", 40),
    authority: text(options.authority, 120),
    per_confirmation_required: protectedAction || options.per_confirmation_required === true,
    executable_now: protectedAction ? false : options.executable_now === true,
    href: text(options.href, 500),
  });
}

function normalizeIdentity(input = {}) {
  const canonicalClientId = text(input.canonical_client_id || input.client_id || input.client_record_id, 120);
  const status = token(input.status || input.identity_status || input.identity_state || (canonicalClientId ? "resolved" : "unresolved"));
  return {
    status,
    canonical_client_id: canonicalClientId,
    display_name: text(input.display_name || input.name, 120),
    customer_gender: token(input.customer_gender || "unknown"),
    customer_gender_source: token(input.customer_gender_source || "not_recorded"),
    relationship_context: token(input.relationship_context),
    resolved: Boolean(canonicalClientId && ["resolved", "canonical", "matched", "verified"].includes(status)),
  };
}

function normalizeEntitlement(input = {}) {
  const lifecycle = token(input.lifecycle || input.membership_state || input.membership_status || input.status);
  const access = token(input.access_status || input.status);
  const blocked = input.member_blocked === true || BLOCKED_ACCESS.has(access) || BLOCKED_ACCESS.has(lifecycle);
  return {
    status: blocked ? "blocked" : (access || lifecycle || "unknown"),
    lifecycle: lifecycle || "unknown",
    membership_level: token(input.canonical_membership_level || input.membership_level || input.level),
    private_visibility_envelope: token(input.private_visibility_envelope || "none"),
    public_service_access: input.public_service_access === true || bool(input.public_access),
    new_model_reveals_allowed: input.new_model_reveals_allowed === true,
    blocked,
    expire_at: text(input.expire_at || input.membership_expiry, 80),
  };
}

function normalizeCalendar(input = {}) {
  const status = token(input.status || input.availability_state || input.state || "unknown");
  const conflicts = list(input.conflicts).map((item) => compact({
    id: text(item?.id || item?.uid, 160),
    start_at: text(item?.start_at || item?.start, 80),
    end_at: text(item?.end_at || item?.end, 80),
    type: token(item?.type || item?.kind),
  }));
  const holds = list(input.holds).map((item) => compact({
    id: text(item?.id || item?.uid, 160),
    start_at: text(item?.start_at || item?.start, 80),
    end_at: text(item?.end_at || item?.end, 80),
    status: token(item?.status),
  }));
  const available = input.available === true || ["available", "open", "free", "ready"].includes(status);
  const unavailable = input.available === false || ["unavailable", "busy", "conflict", "blocked"].includes(status) || conflicts.length > 0;
  return {
    status: unavailable ? "unavailable" : available ? "available" : status,
    available: !unavailable && available,
    conflicts,
    holds,
    next_available_start: text(input.next_available_start || input.next_slot?.start_at || input.next_slot?.start, 80),
    source: text(input.source || "cal.com_projection", 120),
  };
}

function normalizeJobs(input = {}) {
  const rows = list(input.jobs || input.items || input.upcoming_jobs).map((job) => ({
    job_id: text(job?.job_id || job?.id || job?.session_id, 160),
    status: token(job?.status || job?.state),
    model_id: text(job?.model_id, 160),
    model_name: text(job?.model_name || job?.model, 120),
    start_at: text(job?.start_at || job?.date_time || job?.starts_at, 80),
    end_at: text(job?.end_at || job?.ends_at, 80),
    payment_state: token(job?.payment_state || job?.deposit_state),
  }));
  const active = rows.filter((job) => ACTIVE_JOB_STATES.has(job.status));
  const open = rows.filter((job) => !CLOSED_JOB_STATES.has(job.status));
  return {
    status: token(input.status || (active.length ? "active_or_pending" : open.length ? "open" : "clear")),
    active_jobs: active,
    open_jobs: open,
    latest_job_id: text(input.latest_job_id || active[0]?.job_id || open[0]?.job_id, 160),
  };
}

function normalizePayment(input = {}) {
  const state = token(input.status || input.payment_state || input.deposit_state || "unknown");
  const proofState = token(input.proof_state || input.payment_proof_state || input.proof_status);
  const paid = input.paid === true || ["paid", "verified", "settled", "complete", "completed"].includes(state);
  const reviewRequired = input.review_required === true || ["pending_review", "uncertain", "unmatched", "mismatch", "review_required"].includes(state) || ["pending", "review", "uncertain", "unmatched"].includes(proofState);
  return {
    status: paid ? "paid" : state,
    proof_state: proofState || "unknown",
    paid,
    review_required: reviewRequired,
    deposit_required_thb: number(input.deposit_required_thb || input.deposit_amount_thb, 0),
    deposit_paid_thb: number(input.deposit_paid_thb, 0),
    outstanding_amount_thb: number(input.outstanding_amount_thb || input.balance_due_thb, 0),
    credit_balance_thb: number(input.credit_balance_thb || input.credit_amount_thb, 0),
    credit_expires_at: text(input.credit_expires_at, 80),
    payment_ref: text(input.payment_ref || input.proof_id, 160),
  };
}

function normalizeHype(input = {}) {
  return {
    status: token(input.status || (input.configured === true ? "configured" : "unknown")),
    configured: input.configured === true,
    notification_only: input.notification_only !== false,
    access_observation: token(input.access_observation || input.access_state || "unknown"),
    thread_id: text(input.thread_id, 32),
  };
}

function normalizeIntent(input = {}) {
  const type = token(input.type || input.intent || "general");
  const trigger = token(input.trigger);
  const time = text(input.time || input.time_label, 80);
  const startAt = text(input.start_at, 80);
  const endAt = text(input.end_at || input.end_time, 80);
  const suppliedDuration = number(input.duration_hours, 0);
  const bookingLike = ["booking", "model_availability", "availability", "create_session", "book", "reserve"].includes(type) || trigger === "deposit";
  const durationHours = bookingLike && (time || startAt) && !endAt
    ? Math.max(1.5, suppliedDuration || 0)
    : suppliedDuration;
  return {
    type,
    trigger,
    model_id: text(input.model_id, 160),
    model_name: text(input.model_name, 120),
    customer_name: text(input.customer_name, 120),
    service: text(input.service || input.service_lane, 120),
    date: text(input.date || input.date_label, 80),
    time,
    start_at: startAt,
    end_at: endAt,
    duration_hours: durationHours,
    duration_source: bookingLike && (time || startAt) && !endAt && (!suppliedDuration || suppliedDuration < 1.5)
      ? (suppliedDuration ? "mmd_standard_minimum_90m_floor" : "mmd_standard_minimum_90m_default")
      : text(input.duration_source, 80),
    location: text(input.location || input.location_area || input.zone, 160),
    amount_thb: number(input.amount_thb, 0),
    deposit_amount_thb: number(input.deposit_amount_thb, 0),
    raw: text(input.raw, 1000),
  };
}

function missingBookingInputs(intent) {
  const missing = [];
  if (!intent.model_id && !intent.model_name && !intent.service) missing.push("model_or_service");
  if (!intent.start_at && !intent.date) missing.push("date");
  if (!intent.start_at && !intent.time) missing.push("time");
  if (!intent.location) missing.push("location");
  if (intent.trigger === "deposit" && !intent.amount_thb) missing.push("rate");
  return missing;
}

function shouldUseBookingFlow(intent) {
  return ["booking", "model_availability", "availability", "create_session", "book", "reserve"].includes(intent.type);
}

function shouldUsePaymentFlow(intent) {
  return ["payment", "payment_slip", "payment_proof", "deposit", "credit", "renewal_payment"].includes(intent.type);
}

export function buildKenjiLv5OperationalContext(input = {}) {
  const identity = normalizeIdentity(input.client || input.identity || {});
  const entitlement = normalizeEntitlement(input.entitlement || input.membership || {});
  const calendar = normalizeCalendar(input.calendar || {});
  const jobs = normalizeJobs(input.job || input.jobs || {});
  const payment = normalizePayment(input.payment || {});
  const hype = normalizeHype(input.hype || {});
  const intent = normalizeIntent(input.intent || {});

  const missing = [];
  const blockers = [];
  const notices = [];
  const actions = [];

  if (!identity.resolved) {
    blockers.push("canonical_client_unresolved");
    actions.push(action("resolve_identity", {
      label: "ยืนยันตัวตนใน MY MMD",
      reason: "Kenji ต้องผูกกับ Canonical Client ก่อนอ่านประวัติหรือทำ operational action",
      domain: "client_360",
      authority: KENJI_LV5_AUTHORITIES.identity,
      mode: "customer_action",
      executable_now: true,
      href: "/my-mmd",
    }));
  }

  if (entitlement.blocked) {
    blockers.push("membership_or_access_blocked");
    actions.push(action("handoff_per", {
      label: "ส่งให้ Per ตรวจสิทธิ์",
      reason: "blocked/suspended/revoked ต้อง fail closed",
      domain: "membership_entitlement",
      authority: KENJI_LV5_AUTHORITIES.final_owner,
      mode: "handoff",
      executable_now: true,
    }));
  }

  if (payment.review_required) {
    blockers.push("payment_review_required");
    actions.push(action("review_payment", {
      label: "ตรวจหลักฐานการชำระเงิน",
      reason: "Payment proof ยังไม่เป็น paid-state จนกว่า payments-worker จะ verify",
      domain: "payment",
      authority: KENJI_LV5_AUTHORITIES.money,
      mode: "handoff",
      executable_now: true,
      href: "/internal/admin/payments",
    }));
  }

  if (jobs.active_jobs.length) {
    notices.push("active_or_pending_job_exists");
  }

  if (shouldUseBookingFlow(intent)) {
    const bookingMissing = missingBookingInputs(intent);
    missing.push(...bookingMissing);

    if (bookingMissing.length) {
      actions.push(action("request_missing_input", {
        label: "ขอข้อมูลจองที่ยังขาด",
        reason: `missing:${bookingMissing.join(",")}`,
        domain: "conversation",
        mode: "continue_in_chat",
        executable_now: true,
      }));
    } else if (!identity.resolved || entitlement.blocked || payment.review_required) {
      // Existing blockers already explain the next safe step.
    } else if (calendar.status === "unavailable") {
      blockers.push("calendar_unavailable");
      actions.push(action("offer_alternate_slot", {
        label: "เสนอเวลาที่ว่างถัดไป",
        reason: calendar.next_available_start ? `next:${calendar.next_available_start}` : "requested_slot_has_conflict",
        domain: "calendar",
        authority: KENJI_LV5_AUTHORITIES.scheduling,
        mode: "continue_in_chat",
        executable_now: true,
      }));
    } else if (calendar.status !== "available") {
      actions.push(action("check_availability", {
        label: "เช็กคิวจริง",
        reason: "ต้องอ่าน Cal projection ก่อนสร้าง hold",
        domain: "calendar",
        authority: KENJI_LV5_AUTHORITIES.scheduling,
        mode: "read_only",
        executable_now: true,
      }));
    } else {
      actions.push(action("prepare_booking_intent", {
        label: "เตรียม Booking Intent",
        reason: "identity + entitlement + requested slot พร้อมสำหรับการเตรียมงาน",
        domain: "job_session",
        authority: KENJI_LV5_AUTHORITIES.job_session,
        mode: "prepare_only",
        executable_now: true,
      }));
      actions.push(action("create_calendar_hold", {
        label: "เตรียม Internal Hold",
        reason: "hold เป็น protected scheduling mutation และต้องเกิดหลัง canonical confirmation ตาม policy",
        domain: "calendar",
        authority: KENJI_LV5_AUTHORITIES.scheduling,
        protected: true,
      }));
      if (!payment.paid && payment.deposit_required_thb > payment.deposit_paid_thb) {
        actions.push(action("prepare_payment", {
          label: "เตรียมยอดมัดจำ",
          reason: "คำนวณและแสดงยอดได้ แต่ payments-worker เท่านั้นที่ยืนยัน paid-state",
          domain: "payment",
          authority: KENJI_LV5_AUTHORITIES.money,
          mode: "prepare_only",
          executable_now: true,
        }));
      }
    }
  }

  if (shouldUsePaymentFlow(intent) && !payment.review_required) {
    if (payment.credit_balance_thb > 0 && intent.type === "credit") {
      actions.push(action("review_credit", {
        label: "ตรวจเครดิตคงเหลือ",
        reason: payment.credit_expires_at ? `expires:${payment.credit_expires_at}` : "verified_credit_required_before_use",
        domain: "payment",
        authority: KENJI_LV5_AUTHORITIES.money,
        mode: "read_only",
        executable_now: true,
      }));
    } else if (!payment.paid) {
      actions.push(action("prepare_payment", {
        label: "เตรียมขั้นตอนชำระเงิน",
        reason: "Kenji จัดขั้นตอนให้ได้ แต่ไม่ mark paid เอง",
        domain: "payment",
        authority: KENJI_LV5_AUTHORITIES.money,
        mode: "prepare_only",
        executable_now: true,
      }));
    }
  }

  const critical = blockers.some((item) => ["membership_or_access_blocked", "payment_review_required"].includes(item));
  if (critical && hype.configured) {
    actions.push(action("notify_hype", {
      label: "แจ้ง HYPE",
      reason: "ส่ง operational alert ให้ Per โดย HYPE ไม่เปลี่ยน business truth",
      domain: "telegram",
      authority: KENJI_LV5_AUTHORITIES.telegram,
      mode: "notification_only",
      executable_now: true,
    }));
  }

  const readiness = blockers.length
    ? (blockers.every((item) => item === "calendar_unavailable") ? "needs_input" : "blocked")
    : missing.length
      ? "needs_input"
      : actions.some((item) => item.per_confirmation_required)
        ? "prepared_for_per"
        : "ready";

  return {
    ok: true,
    schema: KENJI_LV5_SCHEMA,
    mode: "operational_orchestrator",
    readiness,
    intent,
    client_360: identity,
    entitlement,
    calendar,
    job: jobs,
    payment,
    hype,
    missing: unique(missing),
    blockers: unique(blockers),
    notices: unique(notices),
    next_actions: actions.slice(0, 6),
    authority: KENJI_LV5_AUTHORITIES,
    guardrails: {
      kenji_is_source_of_truth: false,
      hype_is_source_of_truth: false,
      protected_actions_require_canonical_backend: true,
      protected_actions_require_per_confirmation: true,
      no_payment_inference_from_slip: true,
      no_membership_inference_from_alias: true,
      fail_closed_on_identity_or_entitlement_ambiguity: true,
    },
    generated_at: new Date().toISOString(),
  };
}

export function buildKenjiLv5CustomerReplyStrategy(context = {}) {
  const readiness = token(context.readiness);
  const primary = list(context.next_actions)[0] || null;
  return {
    schema: "mmd.kenji_operational_reply_strategy.v1",
    readiness,
    primary_action: primary?.action || "none",
    continue_in_chat: ["request_missing_input", "offer_alternate_slot"].includes(primary?.action),
    show_customer_cta: ["resolve_identity", "prepare_payment"].includes(primary?.action),
    silent_on_internal_details: true,
    mention_per_handoff: primary?.action === "handoff_per",
    customer_safe_domains: ["membership_status", "booking_progress", "payment_progress", "credit_progress", "availability_result"],
    forbidden_customer_fields: ["airtable_record_id", "admin_note", "internal_risk_flag", "telegram_room_id", "service_secret"],
  };
}
