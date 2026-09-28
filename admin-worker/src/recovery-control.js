import { refreshRecoveryPickerForOwner, transitionRecoveryCase } from "./hype-handoff-runtime.js";
import {
  RECOVERY_OUTCOME_TAXONOMY_VERSION,
  isTerminalRecoveryOutcome,
  normalizeRecoveryDomain,
  recoveryOutcomeCodesForDomain,
  recoveryOutcomeLabel,
} from "../../shared/recovery-outcome-taxonomy-v1.mjs";
import { renderRecoveryControlPage, renderRecoveryControlForbidden } from "./recovery-control-page.js";

export const RECOVERY_CONTROL_PAGE_PATH = "/internal/admin/recovery";
export const RECOVERY_CONTROL_API_PATH = "/v1/admin/recovery/cases";
export const RECOVERY_QUEUE_SLA_VERSION = "mmd-recovery-queue-sla-v1-20260919";
export const RECOVERY_QUEUE_ASSIGNMENT_VERSION = "mmd-recovery-assignment-v1-20260919";
export const RECOVERY_PICKER_INTELLIGENCE_VERSION = "mmd-recovery-picker-intelligence-v1-20260920";

const RECOVERY_QUEUE_ASSIGNMENT_FILTERS = Object.freeze(["all", "assigned", "unassigned"]);
const RECOVERY_QUEUE_PICKER_FILTERS = Object.freeze(["all", "waiting_reselection", "authority_unavailable", "no_candidates", "selected"]);
const RECOVERY_QUEUE_STATES = Object.freeze(["prepared", "sent", "acknowledged", "reviewing", "resolved", "customer_notified"]);
const RECOVERY_QUEUE_DOMAINS = Object.freeze(["mmd_shop", "booking", "mms", "unclassified"]);
const RECOVERY_ATTENTION_TARGET_MINUTES = Object.freeze({
  prepared: 60,
  sent: 60,
  acknowledged: 120,
  reviewing: 360,
  resolved: 120,
  customer_notified: null,
});

const AIRTABLE_API = "https://api.airtable.com/v0";
const MATRIX_TABLE_FALLBACK = "tblS6iRgPjYLBqZJh";
const PROD_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);

const F = Object.freeze({
  CLIENT: "Client",
  PENDING_REF: "pending_reference",
  UPDATED_AT: "state_updated_at",
  PAYLOAD: "payload_json",
});

export function isRecoveryControlRequest(path, method) {
  const m = clean(method, 12).toUpperCase();
  return (
    (path === RECOVERY_CONTROL_PAGE_PATH && (m === "GET" || m === "HEAD"))
    || (path === RECOVERY_CONTROL_API_PATH && (m === "GET" || m === "POST"))
  );
}

export function isRecoveryOperatorActor(actor) {
  const role = token(actor && actor.role);
  const auth = token(actor && actor.auth_method);
  return auth === "credential" && (role === "owner" || role === "admin");
}

export async function handleRecoveryControl(request, env = {}, actor = null) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (!isRecoveryOperatorActor(actor)) {
    return path === RECOVERY_CONTROL_PAGE_PATH
      ? html(renderRecoveryControlForbidden(), 403)
      : json({ ok: false, error: "recovery_operator_required" }, 403);
  }

  if (path === RECOVERY_CONTROL_PAGE_PATH) {
    if (method === "HEAD") return html("", 200);
    return html(renderRecoveryControlPage({
      case_ref: normalizeCaseRef(url.searchParams.get("case_ref")),
      taxonomy_version: RECOVERY_OUTCOME_TAXONOMY_VERSION,
      sla_version: RECOVERY_QUEUE_SLA_VERSION,
      assignment_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
      picker_intelligence_version: RECOVERY_PICKER_INTELLIGENCE_VERSION,
      domain: normalizeQueueDomainFilter(url.searchParams.get("domain")).value,
      state: normalizeQueueStateFilter(url.searchParams.get("state")).value,
      assignment: normalizeQueueAssignmentFilter(url.searchParams.get("assignment")).value,
      picker: normalizeQueuePickerFilter(url.searchParams.get("picker")).value,
      owner_mode: recoveryAssignmentActor(actor).owner === true,
    }), 200);
  }

  if (method === "GET") {
    const suppliedRef = clean(url.searchParams.get("case_ref"), 180);
    const caseRef = normalizeCaseRef(suppliedRef);
    if (suppliedRef && !caseRef) return json({ ok: false, error: "case_ref_invalid" }, 400);

    if (caseRef) {
      const result = await readRecoveryCase(env, caseRef);
      if (!result.ok) return json(result, statusForReadError(result.error));
      return json({
        ok: true,
        authority: "mmd.recovery_control.v1",
        case: result.case,
        taxonomy_version: RECOVERY_OUTCOME_TAXONOMY_VERSION,
        sla_version: RECOVERY_QUEUE_SLA_VERSION,
        assignment_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
        picker_intelligence_version: RECOVERY_PICKER_INTELLIGENCE_VERSION,
        guardrails: recoveryControlGuardrails(),
      });
    }

    const domainFilter = normalizeQueueDomainFilter(url.searchParams.get("domain"));
    const stateFilter = normalizeQueueStateFilter(url.searchParams.get("state"));
    const assignmentFilter = normalizeQueueAssignmentFilter(url.searchParams.get("assignment"));
    const pickerFilter = normalizeQueuePickerFilter(url.searchParams.get("picker"));
    if (!domainFilter.ok || !stateFilter.ok || !assignmentFilter.ok || !pickerFilter.ok) {
      return json({
        ok: false,
        error: "recovery_queue_filter_invalid",
        allowed_domains: ["all", ...RECOVERY_QUEUE_DOMAINS],
        allowed_states: ["open", "all", ...RECOVERY_QUEUE_STATES],
        allowed_assignments: RECOVERY_QUEUE_ASSIGNMENT_FILTERS,
        allowed_picker_states: RECOVERY_QUEUE_PICKER_FILTERS,
      }, 400);
    }

    const result = await readRecoveryQueueIntelligence(env, {
      limit: boundedInt(url.searchParams.get("limit"), 1, 25, 12),
      domain: domainFilter.value,
      state: stateFilter.value,
      assignment: assignmentFilter.value,
      picker: pickerFilter.value,
    });
    if (!result.ok) return json(result, 503);
    return json({
      ok: true,
      authority: "mmd.recovery_control.v1",
      cases: result.cases,
      queue: result.queue,
      filters: result.filters,
      taxonomy_version: RECOVERY_OUTCOME_TAXONOMY_VERSION,
      sla_version: RECOVERY_QUEUE_SLA_VERSION,
      assignment_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
      picker_intelligence_version: RECOVERY_PICKER_INTELLIGENCE_VERSION,
      guardrails: recoveryControlGuardrails(),
    });
  }

  const origin = clean(request.headers.get("Origin"), 200);
  if (!PROD_ORIGINS.has(url.origin) || origin !== url.origin) {
    return json({ ok: false, error: "forbidden_origin" }, 403);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const caseRef = normalizeCaseRef(body.case_ref);
  if (!caseRef) return json({ ok: false, error: "case_ref_invalid" }, 400);

  const current = await readRecoveryCase(env, caseRef);
  if (!current.ok) return json(current, statusForReadError(current.error));

  const requestedAction = token(body.action);
  if (requestedAction === "refresh_picker") {
    if (recoveryAssignmentActor(actor).owner !== true) {
      return json({ ok: false, error: "recovery_picker_refresh_owner_required" }, 403);
    }
    const expectedPickerRevision = Number(body.picker_revision);
    if (!Number.isInteger(expectedPickerRevision) || expectedPickerRevision < 1 || expectedPickerRevision > 999999) {
      return json({ ok: false, error: "expected_picker_revision_required" }, 400);
    }
    const refresh = await refreshRecoveryPickerForOwner(env, {
      handoff_id: caseRef,
      expected_picker_revision: expectedPickerRevision,
      actor_role: "owner",
    });
    if (!refresh.ok) return json(refresh, refresh.status || 409);
    const refreshedPicker = await readRecoveryCase(env, caseRef);
    return json({
      ok: true,
      authority: "mmd.recovery_control.v1",
      action: requestedAction,
      replayed: refresh.replayed === true,
      picker_state: refresh.state,
      case: refreshedPicker.ok ? refreshedPicker.case : current.case,
      picker_intelligence_version: RECOVERY_PICKER_INTELLIGENCE_VERSION,
      guardrails: recoveryControlGuardrails(),
    });
  }

  if (["claim", "release", "takeover"].includes(requestedAction)) {
    const assignmentWrite = await mutateRecoveryAssignment(env, current, actor, requestedAction);
    if (!assignmentWrite.ok) {
      return json(assignmentWrite, assignmentWrite.status || 409);
    }
    const refreshedAssignment = await readRecoveryCase(env, caseRef);
    return json({
      ok: true,
      authority: "mmd.recovery_control.v1",
      action: requestedAction,
      replayed: assignmentWrite.replayed === true,
      case: refreshedAssignment.ok ? refreshedAssignment.case : current.case,
      assignment_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
      guardrails: recoveryControlGuardrails(),
    });
  }

  const transition = buildRecoveryControlTransition(
    current.case,
    requestedAction,
    token(body.outcome_code),
  );
  if (!transition.ok) return json(transition, transition.status || 409);

  const actorRole = token(actor.role) === "owner" ? "owner" : "operator";
  const response = await transitionRecoveryCase(env, {
    handoff_id: caseRef,
    state: transition.next_state,
    actor_role: actorRole,
    recovery_domain: current.case.domain,
    ...(transition.outcome_code ? { recovery_outcome_code: transition.outcome_code } : {}),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload || payload.ok !== true) {
    return json({
      ok: false,
      state: payload && payload.state || "transition_rejected",
      error: payload && payload.error || "recovery_transition_failed",
      current_state: payload && payload.current_state || current.case.state,
      requested_state: transition.next_state,
      allowed_outcomes: payload && Array.isArray(payload.allowed_outcomes) ? payload.allowed_outcomes : undefined,
    }, response.status || 409);
  }

  const refreshed = await readRecoveryCase(env, caseRef);
  return json({
    ok: true,
    authority: "mmd.recovery_control.v1",
    action: requestedAction,
    replayed: payload.replayed === true,
    case: refreshed.ok ? refreshed.case : {
      ...current.case,
      state: payload.state || transition.next_state,
      outcome_code: payload.recovery_case && payload.recovery_case.outcome_code || current.case.outcome_code,
      outcome_label: payload.recovery_case && payload.recovery_case.outcome_label || current.case.outcome_label,
    },
    guardrails: recoveryControlGuardrails(),
  });
}

export function buildRecoveryControlTransition(currentCase = {}, action = "", outcomeCode = "") {
  const state = token(currentCase.state);
  const domain = normalizeRecoveryDomain(currentCase.domain);
  const outcome = token(outcomeCode);

  if (action === "acknowledge") {
    if (!["prepared", "sent", "acknowledged"].includes(state)) return reject("acknowledge_not_allowed_from_current_state", state);
    return { ok: true, next_state: "acknowledged" };
  }

  if (action === "review") {
    if (!["acknowledged", "reviewing"].includes(state)) return reject("review_not_allowed_from_current_state", state);
    return { ok: true, next_state: "reviewing" };
  }

  if (action === "set_outcome") {
    if (state === "resolved" || state === "customer_notified") return reject("nonterminal_outcome_locked_after_resolution", state);
    const allowed = recoveryOutcomeCodesForDomain(domain, { terminal: false });
    if (!outcome || !allowed.includes(outcome)) {
      return { ok: false, status: 409, error: "nonterminal_outcome_invalid", current_state: state, allowed_outcomes: allowed };
    }
    return { ok: true, next_state: state, outcome_code: outcome };
  }

  if (action === "resolve") {
    if (state !== "reviewing") return reject("resolve_requires_reviewing", state);
    const allowed = recoveryOutcomeCodesForDomain(domain, { terminal: true });
    if (!outcome || !allowed.includes(outcome) || !isTerminalRecoveryOutcome(domain, outcome)) {
      return { ok: false, status: 409, error: "terminal_outcome_required", current_state: state, allowed_outcomes: allowed };
    }
    return { ok: true, next_state: "resolved", outcome_code: outcome };
  }

  if (action === "customer_notified") {
    if (state === "customer_notified") return { ok: true, next_state: "customer_notified" };
    if (state !== "resolved") return reject("customer_notification_requires_resolved", state);
    return { ok: true, next_state: "customer_notified" };
  }

  return { ok: false, status: 400, error: "recovery_action_invalid" };
}

export async function readRecoveryQueueIntelligence(env, options = {}, now = new Date()) {
  const config = airtableConfig(env);
  if (!config.ok) return config;

  const limit = boundedInt(options.limit, 1, 25, 12);
  const domainFilter = normalizeQueueDomainFilter(options.domain);
  const stateFilter = normalizeQueueStateFilter(options.state);
  const assignmentFilter = normalizeQueueAssignmentFilter(options.assignment);
  const pickerFilter = normalizeQueuePickerFilter(options.picker);
  if (!domainFilter.ok || !stateFilter.ok || !assignmentFilter.ok || !pickerFilter.ok) {
    return { ok: false, error: "recovery_queue_filter_invalid" };
  }

  const url = new URL(AIRTABLE_API + "/" + encodeURIComponent(config.baseId) + "/" + encodeURIComponent(config.table));
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("maxRecords", "100");
  url.searchParams.set("sort[0][field]", F.UPDATED_AT);
  url.searchParams.set("sort[0][direction]", "desc");

  try {
    const response = await fetch(url.toString(), {
      headers: { authorization: "Bearer " + config.token, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: "airtable_read_" + response.status };

    const records = Array.isArray(payload.records) ? payload.records : [];
    const projected = records
      .map((record) => projectRecoveryRecord(record, now))
      .filter(Boolean);
    const active = projected.filter((item) => item.state !== "customer_notified");
    const filtered = projected.filter((item) => (
      (domainFilter.value === "all" || item.domain === domainFilter.value)
      && (stateFilter.value === "all"
        || (stateFilter.value === "open" ? item.state !== "customer_notified" : item.state === stateFilter.value))
      && (assignmentFilter.value === "all" || item.assignment.status === assignmentFilter.value)
      && (pickerFilter.value === "all" || item.picker.queue_state === pickerFilter.value)
    ));
    const ordered = [...filtered].sort(compareRecoveryQueuePriority);
    const attention = [...active]
      .filter((item) => item.sla.attention_required === true || item.state === "resolved")
      .sort(compareRecoveryQueuePriority)
      .slice(0, 5)
      .map(projectAttentionItem);
    const pickerAttention = [...active]
      .filter((item) => ["waiting_reselection", "authority_unavailable", "no_candidates"].includes(item.picker.queue_state))
      .sort(compareRecoveryPickerPriority)
      .slice(0, 5)
      .map(projectPickerAttentionItem);

    return {
      ok: true,
      complete: !payload.offset,
      cases: ordered.slice(0, limit),
      filters: {
        domain: domainFilter.value,
        state: stateFilter.value,
        assignment: assignmentFilter.value,
        picker: pickerFilter.value,
      },
      queue: {
        policy_version: RECOVERY_QUEUE_SLA_VERSION,
        total_fetched: projected.length,
        open_count: active.length,
        filtered_count: filtered.length,
        attention_count: active.filter((item) => item.sla.attention_required === true || item.state === "resolved").length,
        overdue_count: active.filter((item) => item.sla.status === "overdue").length,
        watch_count: active.filter((item) => item.sla.status === "watch").length,
        assigned_count: active.filter((item) => item.assignment.status === "assigned").length,
        unassigned_count: active.filter((item) => item.assignment.status === "unassigned").length,
        attention_unassigned_count: active.filter((item) => (
          item.assignment.status === "unassigned"
          && (item.sla.attention_required === true || item.state === "resolved")
        )).length,
        picker_waiting_reselection_count: active.filter((item) => item.picker.queue_state === "waiting_reselection").length,
        picker_authority_unavailable_count: active.filter((item) => item.picker.queue_state === "authority_unavailable").length,
        picker_no_candidates_count: active.filter((item) => item.picker.queue_state === "no_candidates").length,
        picker_selected_count: active.filter((item) => item.picker.queue_state === "selected").length,
        picker_watch_count: active.filter((item) => ["waiting_reselection", "authority_unavailable", "no_candidates"].includes(item.picker.queue_state)).length,
        by_domain: countBy(active, (item) => item.domain),
        by_state: countBy(active, (item) => item.state),
        by_picker_state: countBy(active, (item) => item.picker.queue_state),
        attention,
        picker_attention: pickerAttention,
        operational_only: true,
        business_truth_inferred: false,
      },
    };
  } catch {
    return { ok: false, error: "airtable_read_failed" };
  }
}

async function readRecoveryCase(env, caseRef) {
  const config = airtableConfig(env);
  if (!config.ok) return config;

  const url = new URL(AIRTABLE_API + "/" + encodeURIComponent(config.baseId) + "/" + encodeURIComponent(config.table));
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", "{" + F.PENDING_REF + "}=\"" + escapeFormula(caseRef) + "\"");

  try {
    const response = await fetch(url.toString(), {
      headers: { authorization: "Bearer " + config.token, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: "airtable_read_" + response.status };
    const record = Array.isArray(payload.records) ? payload.records[0] : null;
    const projected = record ? projectRecoveryRecord(record) : null;
    if (!projected || projected.case_ref !== caseRef) return { ok: false, error: "recovery_case_not_found" };
    return { ok: true, case: projected, record };
  } catch {
    return { ok: false, error: "airtable_read_failed" };
  }
}

export function projectRecoveryRecord(record = {}, now = new Date()) {
  const fields = record.fields || {};
  const payload = parseObject(fields[F.PAYLOAD]);
  const recovery = parseObject(payload.recovery_case);
  const tracking = parseObject(payload.handoff_tracking);
  const caseRef = normalizeCaseRef(recovery.case_ref);
  if (!caseRef) return null;
  if (normalizeCaseRef(tracking.id || fields[F.PENDING_REF]) !== caseRef) return null;

  const domain = normalizeRecoveryDomain(recovery.domain);
  const state = token(tracking.state || recovery.state) || "prepared";
  const rawOutcome = token(recovery.outcome_code) || "intake_received";
  const outcomeCode = recoveryOutcomeLabel(domain, rawOutcome) ? rawOutcome : "intake_received";

  const updatedAt = clean(tracking.updated_at || recovery.updated_at || fields[F.UPDATED_AT], 80) || null;
  const age = recoveryCaseAge(caseRef, now);
  const sla = recoverySlaIndicator(state, updatedAt, now);
  const assignment = projectRecoveryAssignment(payload.recovery_assignment);
  const picker = projectRecoveryPicker(payload.recovery_correlation, domain);

  return {
    case_ref: caseRef,
    customer: {
      display_name: clean(payload.display_name, 120) || "Canonical Client",
      canonical_client_id: firstRecordId(fields[F.CLIENT]) || null,
    },
    target: token(tracking.target || payload.handoff_target) || null,
    state,
    domain,
    outcome_code: outcomeCode,
    outcome_label: recoveryOutcomeLabel(domain, outcomeCode),
    outcome_terminal: isTerminalRecoveryOutcome(domain, outcomeCode),
    updated_at: updatedAt,
    age,
    sla,
    next_attention: recoveryNextAttention(state),
    assignment,
    picker,
    actor_role: token(tracking.actor_role || recovery.actor_role) || null,
    correlation: projectCorrelation(payload.recovery_correlation, domain),
    controls: {
      nonterminal_outcomes: outcomeOptions(domain, false),
      terminal_outcomes: outcomeOptions(domain, true),
      can_acknowledge: ["prepared", "sent", "acknowledged"].includes(state),
      can_review: ["acknowledged", "reviewing"].includes(state),
      can_set_outcome: state !== "resolved" && state !== "customer_notified",
      can_resolve: state === "reviewing",
      can_mark_customer_notified: state === "resolved" || state === "customer_notified",
      can_claim: state !== "customer_notified" && assignment.status === "unassigned",
      can_release: assignment.status === "assigned",
      can_takeover: state !== "customer_notified" && assignment.status === "assigned",
      can_refresh_picker: !["resolved", "customer_notified"].includes(state) && picker.manual_refresh_eligible === true,
    },
  };
}

function projectCorrelation(value, domain) {
  const c = parseObject(value);
  if (normalizeRecoveryDomain(c.domain) !== domain || c.correlated !== true) {
    return { correlated: false, state: token(c.state) || "unbound", live_refresh_required: true };
  }
  if (domain === "mmd_shop") {
    return {
      correlated: true,
      state: token(c.state) || "correlated",
      order_id: clean(c.order_id, 180) || null,
      order_status: token(c.order_status) || null,
      payment_status: token(c.payment_status) || null,
      fulfillment_state: token(c.fulfillment_state) || null,
      live_refresh_required: true,
    };
  }
  if (domain === "booking") {
    return {
      correlated: true,
      state: token(c.state) || "correlated",
      booking_ref: clean(c.booking_ref, 180) || null,
      session_id: clean(c.session_id, 220) || null,
      job_id: clean(c.job_id, 180) || null,
      session_state: token(c.session_state) || null,
      job_state: token(c.job_state) || null,
      exact_correlation: c.exact_correlation === true,
      live_refresh_required: true,
    };
  }
  if (domain === "mms") {
    return {
      correlated: true,
      state: token(c.state) || "correlated",
      prebooking_id: clean(c.prebooking_id, 180) || null,
      prebooking_status: token(c.prebooking_status) || null,
      service_date: clean(c.service_date, 20) || null,
      service_time: clean(c.service_time, 8) || null,
      zone: clean(c.zone, 100) || null,
      exact_correlation: c.exact_correlation === true,
      live_refresh_required: true,
    };
  }
  return { correlated: false, state: "unbound", live_refresh_required: true };
}

function outcomeOptions(domain, terminal) {
  return recoveryOutcomeCodesForDomain(domain, { terminal }).map((code) => ({
    code,
    label: recoveryOutcomeLabel(domain, code),
  }));
}

function recoveryControlGuardrails() {
  return {
    recovery_workflow_metadata_only: true,
    live_business_truth_refresh_required: true,
    payment_mutated: false,
    job_mutated: false,
    fulfillment_mutated: false,
    therapist_assignment_mutated: false,
    mms_booking_mutated: false,
    entitlement_mutated: false,
    browser_service_binding_exposed: false,
    same_origin_write_required: true,
    assignment_coordination_metadata_only: true,
    assignment_grants_authority: false,
    assignment_resets_sla: false,
    picker_interaction_metadata_only: true,
    picker_manual_refresh_owner_only: true,
    picker_manual_refresh_grants_authority: false,
    picker_manual_refresh_selects_candidate: false,
    picker_manual_refresh_resets_sla: false,
    assignment_history_bounded: true,
    picker_refresh_history_bounded: true,
    sla_operational_metadata_only: true,
    sla_business_truth_inferred: false,
  };
}

export function recoverySlaIndicator(stateValue, updatedAtValue, now = new Date()) {
  const state = token(stateValue);
  if (state === "customer_notified") {
    return {
      policy_version: RECOVERY_QUEUE_SLA_VERSION,
      status: "closed",
      target_minutes: null,
      since_update_minutes: minutesSince(updatedAtValue, now),
      minutes_remaining: null,
      breached_by_minutes: 0,
      attention_required: false,
      source: "workflow_updated_at_only",
      operational_only: true,
      business_truth_inferred: false,
    };
  }

  const target = Number(RECOVERY_ATTENTION_TARGET_MINUTES[state]);
  const elapsed = minutesSince(updatedAtValue, now);
  if (!Number.isFinite(target) || target <= 0 || elapsed === null) {
    return {
      policy_version: RECOVERY_QUEUE_SLA_VERSION,
      status: "unknown",
      target_minutes: Number.isFinite(target) && target > 0 ? target : null,
      since_update_minutes: elapsed,
      minutes_remaining: null,
      breached_by_minutes: 0,
      attention_required: false,
      source: "workflow_updated_at_only",
      operational_only: true,
      business_truth_inferred: false,
    };
  }

  const ratio = elapsed / target;
  const status = elapsed >= target ? "overdue" : ratio >= 0.75 ? "watch" : "fresh";
  return {
    policy_version: RECOVERY_QUEUE_SLA_VERSION,
    status,
    target_minutes: target,
    since_update_minutes: elapsed,
    minutes_remaining: Math.max(0, target - elapsed),
    breached_by_minutes: Math.max(0, elapsed - target),
    attention_required: status === "overdue" || status === "watch",
    source: "workflow_updated_at_only",
    operational_only: true,
    business_truth_inferred: false,
  };
}

function recoveryCaseAge(caseRef, now) {
  const openedAt = caseRefOpenedAt(caseRef);
  const elapsed = openedAt ? Math.max(0, Math.floor((now.getTime() - openedAt.getTime()) / 60000)) : null;
  return {
    opened_at: openedAt ? openedAt.toISOString() : null,
    minutes: elapsed,
    bucket: ageBucket(elapsed),
    source: "case_ref_timestamp",
  };
}

function caseRefOpenedAt(caseRef) {
  const match = /^HYPE-(?:PER|KENJI)-(\d{14})-[a-f0-9]{8}$/i.exec(clean(caseRef, 180));
  if (!match) return null;
  const s = match[1];
  const iso = s.slice(0,4) + "-" + s.slice(4,6) + "-" + s.slice(6,8)
    + "T" + s.slice(8,10) + ":" + s.slice(10,12) + ":" + s.slice(12,14) + ".000Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ageBucket(minutes) {
  if (minutes === null) return "unknown";
  if (minutes < 60) return "under_1h";
  if (minutes < 240) return "1_4h";
  if (minutes < 720) return "4_12h";
  if (minutes < 1440) return "12_24h";
  return "24h_plus";
}

function minutesSince(value, now) {
  const parsed = Date.parse(clean(value, 80));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / 60000));
}

function recoveryNextAttention(stateValue) {
  const state = token(stateValue);
  if (state === "prepared" || state === "sent") return "acknowledge_case";
  if (state === "acknowledged") return "start_review";
  if (state === "reviewing") return "review_and_update_outcome";
  if (state === "resolved") return "notify_customer";
  if (state === "customer_notified") return "closed";
  return "inspect_case";
}

function compareRecoveryQueuePriority(a, b) {
  const score = { overdue: 0, watch: 1, fresh: 2, unknown: 3, closed: 4 };
  const left = score[a?.sla?.status] ?? 5;
  const right = score[b?.sla?.status] ?? 5;
  if (left !== right) return left - right;
  if (a.assignment?.status === "unassigned" && b.assignment?.status !== "unassigned") return -1;
  if (b.assignment?.status === "unassigned" && a.assignment?.status !== "unassigned") return 1;
  if (a.state === "resolved" && b.state !== "resolved") return -1;
  if (b.state === "resolved" && a.state !== "resolved") return 1;
  return (b?.age?.minutes ?? -1) - (a?.age?.minutes ?? -1);
}

function compareRecoveryPickerPriority(a, b) {
  const score = {
    authority_unavailable: 0,
    no_candidates: 1,
    waiting_reselection: 2,
    selected: 3,
    other: 4,
  };
  const left = score[a?.picker?.queue_state] ?? 5;
  const right = score[b?.picker?.queue_state] ?? 5;
  if (left !== right) return left - right;
  return compareRecoveryQueuePriority(a, b);
}

function projectPickerAttentionItem(item) {
  return {
    case_ref: item.case_ref,
    client_name: item.customer?.display_name || "Canonical Client",
    domain: item.domain,
    state: item.state,
    outcome_code: item.outcome_code,
    sla_status: item.sla.status,
    since_update_minutes: item.sla.since_update_minutes,
    case_age_minutes: item.age.minutes,
    next_attention: item.next_attention,
    picker_state: item.picker.queue_state,
    picker_status: item.picker.status,
    picker_revision: item.picker.revision,
    picker_candidate_count: item.picker.candidate_count,
    picker_reissue_count: item.picker.reissue_count,
    picker_last_stale_reason: item.picker.last_stale_reason,
    picker_refresh_history: item.picker.refresh_history,
    picker_next_attention: pickerNextAttention(item.picker.queue_state),
    assignment_status: item.assignment.status,
    assigned_to: item.assignment.assignee_label,
    assigned_lane: item.assignment.assignee_lane,
    picker_state: item.picker.queue_state,
    picker_status: item.picker.status,
    picker_revision: item.picker.revision,
    picker_candidate_count: item.picker.candidate_count,
    picker_next_attention: pickerNextAttention(item.picker.queue_state),
    href: RECOVERY_CONTROL_PAGE_PATH + "?case_ref=" + encodeURIComponent(item.case_ref),
  };
}

function pickerNextAttention(queueState) {
  if (queueState === "authority_unavailable") return "owner_refresh_picker";
  if (queueState === "no_candidates") return "inspect_no_current_candidates";
  if (queueState === "waiting_reselection") return "wait_customer_reselection";
  return "";
}

function projectAttentionItem(item) {
  return {
    case_ref: item.case_ref,
    client_name: item.customer?.display_name || "Canonical Client",
    domain: item.domain,
    state: item.state,
    outcome_code: item.outcome_code,
    sla_status: item.sla.status,
    since_update_minutes: item.sla.since_update_minutes,
    case_age_minutes: item.age.minutes,
    next_attention: item.next_attention,
    assignment_status: item.assignment.status,
    assigned_to: item.assignment.assignee_label,
    assigned_lane: item.assignment.assignee_lane,
    href: RECOVERY_CONTROL_PAGE_PATH + "?case_ref=" + encodeURIComponent(item.case_ref),
  };
}

function countBy(items, keyer) {
  const out = {};
  for (const item of items) {
    const key = clean(keyer(item), 80) || "unknown";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function normalizeQueueDomainFilter(value) {
  const raw = token(value || "all");
  if (!raw || raw === "all") return { ok: true, value: "all" };
  const domain = normalizeRecoveryDomain(raw);
  return RECOVERY_QUEUE_DOMAINS.includes(domain) && (domain !== "unclassified" || raw === "unclassified")
    ? { ok: true, value: domain }
    : { ok: false, value: "all" };
}

function normalizeQueueStateFilter(value) {
  const raw = token(value || "open");
  if (!raw || raw === "open") return { ok: true, value: "open" };
  if (raw === "all" || RECOVERY_QUEUE_STATES.includes(raw)) return { ok: true, value: raw };
  return { ok: false, value: "open" };
}

function normalizeQueueAssignmentFilter(value) {
  const raw = token(value || "all");
  return RECOVERY_QUEUE_ASSIGNMENT_FILTERS.includes(raw)
    ? { ok: true, value: raw }
    : { ok: false, value: "all" };
}

function normalizeQueuePickerFilter(value) {
  const raw = token(value || "all");
  return RECOVERY_QUEUE_PICKER_FILTERS.includes(raw)
    ? { ok: true, value: raw }
    : { ok: false, value: "all" };
}

function projectRecoveryPicker(value, domain) {
  const raw = parseObject(value);
  const sameDomain = normalizeRecoveryDomain(raw.domain) === domain;
  if (!sameDomain) {
    return {
      policy_version: RECOVERY_PICKER_INTELLIGENCE_VERSION,
      status: "none",
      queue_state: "other",
      revision: null,
      candidate_count: 0,
      reissue_count: 0,
      manual_refresh_eligible: false,
      interaction_only: true,
      business_truth_inferred: false,
    };
  }

  const status = token(raw.picker_status) || (raw.correlated === true ? "selected" : "none");
  const revisionRaw = Number(raw.picker_revision);
  const revision = Number.isInteger(revisionRaw) && revisionRaw >= 1 && revisionRaw <= 999999 ? revisionRaw : null;
  const candidateRaw = Number(raw.candidate_count);
  const candidateCount = Number.isInteger(candidateRaw) ? Math.max(0, Math.min(50, candidateRaw)) : 0;
  const reissueRaw = Number(raw.picker_reissue_count);
  const reissueCount = Number.isInteger(reissueRaw) ? Math.max(0, Math.min(9999, reissueRaw)) : 0;
  const liveRefresh = token(raw.live_refresh_status);
  const queueState = raw.correlated === true || status === "selected"
    ? "selected"
    : status === "reissued"
      ? "waiting_reselection"
      : status === "stale" && liveRefresh === "unavailable"
        ? "authority_unavailable"
        : status === "no_current_candidates"
          ? "no_candidates"
          : "other";

  return {
    policy_version: RECOVERY_PICKER_INTELLIGENCE_VERSION,
    status,
    queue_state: queueState,
    revision,
    candidate_count: candidateCount,
    reissue_count: reissueCount,
    delivery_status: ["pending_customer_delivery", "delivered"].includes(token(raw.picker_delivery_status))
      ? token(raw.picker_delivery_status)
      : null,
    delivery_revision: (() => {
      const value = Number(raw.picker_delivery_revision);
      return Number.isInteger(value) && value >= 1 && value <= 999999 ? value : null;
    })(),
    delivered_at: clean(raw.picker_delivered_at, 80) || null,
    issued_at: clean(raw.picker_issued_at, 80) || null,
    reissued_at: clean(raw.picker_reissued_at, 80) || null,
    live_refresh_status: liveRefresh || null,
    last_stale_reason: token(raw.last_stale_reason) || null,
    refresh_history: projectRecoveryPickerRefreshHistory(raw.picker_refresh_history),
    manual_refresh_eligible: raw.correlated !== true
      && revision !== null
      && ["active", "reissued", "stale", "no_current_candidates"].includes(status),
    interaction_only: true,
    business_truth_inferred: false,
  };
}

function projectRecoveryPickerRefreshHistory(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const trigger = token(row.trigger);
    const result = token(row.result);
    if (!["customer_stale", "owner_manual"].includes(trigger)) return null;
    if (!["reissued", "no_candidates", "authority_unavailable"].includes(result)) return null;
    return {
      trigger,
      result,
      source_revision: nullablePickerRevision(row.source_revision),
      revision: nullablePickerRevision(row.revision),
      candidate_count: nullableBoundedCount(row.candidate_count, 50),
      reason: token(row.reason) || null,
      at: clean(row.at, 80) || null,
    };
  }).filter(Boolean).slice(-12);
}

function nullablePickerRevision(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 999999 ? n : null;
}

function nullableBoundedCount(value, max) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? Math.min(max, n) : null;
}

function projectRecoveryAssignmentHistory(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const action = token(row.action);
    if (!["claim", "release", "takeover"].includes(action)) return null;
    return {
      action,
      at: clean(row.at, 80) || null,
      revision: Math.max(0, Number(row.revision) || 0),
      actor_label: clean(row.actor_label, 120) || "Operator",
      actor_role: token(row.actor_role) || null,
      actor_lane: token(row.actor_lane) || null,
      from_status: token(row.from_status) || "unassigned",
      from_assignee_label: clean(row.from_assignee_label, 120) || null,
      to_status: token(row.to_status) || "unassigned",
      to_assignee_label: clean(row.to_assignee_label, 120) || null,
    };
  }).filter(Boolean).slice(-12);
}

function appendRecoveryAssignmentHistory(raw, entry) {
  return [...projectRecoveryAssignmentHistory(raw?.history), entry].slice(-12);
}

function projectRecoveryAssignment(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const status = token(raw.status) === "assigned" && clean(raw.assignee_label, 120) ? "assigned" : "unassigned";
  return {
    policy_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
    status,
    assignee_label: status === "assigned" ? clean(raw.assignee_label, 120) : null,
    assignee_role: status === "assigned" ? token(raw.assignee_role) || null : null,
    assignee_lane: status === "assigned" ? token(raw.assignee_lane) || null : null,
    claimed_at: status === "assigned" ? clean(raw.claimed_at, 80) || null : null,
    updated_at: clean(raw.updated_at, 80) || null,
    revision: Math.max(0, Number(raw.revision) || 0),
    history: projectRecoveryAssignmentHistory(raw.history),
    coordination_only: true,
    grants_authority: false,
  };
}

async function mutateRecoveryAssignment(env, current, actor, action) {
  const record = current?.record;
  const currentCase = current?.case;
  if (!record?.id || !currentCase?.case_ref) return { ok: false, status: 404, error: "recovery_case_not_found" };

  const actorIdentity = recoveryAssignmentActor(actor);
  if (!actorIdentity.ok) return { ok: false, status: 403, error: "recovery_assignment_actor_invalid" };

  const fields = record.fields || {};
  const payload = parseRawObject(fields[F.PAYLOAD]);
  if (!payload.ok) return { ok: false, status: 409, error: payload.error };
  const currentRaw = payload.value.recovery_assignment && typeof payload.value.recovery_assignment === "object"
    ? payload.value.recovery_assignment
    : {};
  const currentAssignment = projectRecoveryAssignment(currentRaw);
  const currentKey = clean(currentRaw.assignee_key, 180);
  const stamp = new Date().toISOString();
  const revision = currentAssignment.revision + 1;

  if (action === "claim") {
    if (currentCase.state === "customer_notified") {
      return { ok: false, status: 409, error: "closed_case_assignment_forbidden" };
    }
    if (currentAssignment.status === "assigned" && currentKey !== actorIdentity.key) {
      return {
        ok: false,
        status: 409,
        error: "recovery_assignment_conflict",
        assigned_to: currentAssignment.assignee_label,
      };
    }
    if (currentAssignment.status === "assigned" && currentKey === actorIdentity.key) {
      return { ok: true, replayed: true, assignment: currentAssignment };
    }
    return persistRecoveryAssignment(env, record, payload.value, {
      policy_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
      status: "assigned",
      assignee_key: actorIdentity.key,
      assignee_label: actorIdentity.label,
      assignee_role: actorIdentity.role,
      assignee_lane: actorIdentity.lane,
      claimed_at: stamp,
      updated_at: stamp,
      revision,
      history: appendRecoveryAssignmentHistory(currentRaw, {
        action: "claim",
        at: stamp,
        revision,
        actor_label: actorIdentity.label,
        actor_role: actorIdentity.role,
        actor_lane: actorIdentity.lane,
        from_status: currentAssignment.status,
        from_assignee_label: currentAssignment.assignee_label,
        to_status: "assigned",
        to_assignee_label: actorIdentity.label,
      }),
      coordination_only: true,
      grants_authority: false,
    });
  }

  if (action === "takeover") {
    if (!actorIdentity.owner) return { ok: false, status: 403, error: "recovery_assignment_takeover_owner_required" };
    if (currentCase.state === "customer_notified") {
      return { ok: false, status: 409, error: "closed_case_assignment_forbidden" };
    }
    if (currentAssignment.status === "assigned" && currentKey === actorIdentity.key) {
      return { ok: true, replayed: true, assignment: currentAssignment };
    }
    return persistRecoveryAssignment(env, record, payload.value, {
      policy_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
      status: "assigned",
      assignee_key: actorIdentity.key,
      assignee_label: actorIdentity.label,
      assignee_role: actorIdentity.role,
      assignee_lane: actorIdentity.lane,
      claimed_at: stamp,
      updated_at: stamp,
      revision,
      history: appendRecoveryAssignmentHistory(currentRaw, {
        action: "takeover",
        at: stamp,
        revision,
        actor_label: actorIdentity.label,
        actor_role: actorIdentity.role,
        actor_lane: actorIdentity.lane,
        from_status: currentAssignment.status,
        from_assignee_label: currentAssignment.assignee_label,
        to_status: "assigned",
        to_assignee_label: actorIdentity.label,
      }),
      coordination_only: true,
      grants_authority: false,
    });
  }

  if (action === "release") {
    if (currentAssignment.status !== "assigned") {
      return { ok: true, replayed: true, assignment: currentAssignment };
    }
    if (currentKey !== actorIdentity.key && !actorIdentity.owner) {
      return { ok: false, status: 403, error: "recovery_assignment_release_forbidden" };
    }
    return persistRecoveryAssignment(env, record, payload.value, {
      policy_version: RECOVERY_QUEUE_ASSIGNMENT_VERSION,
      status: "unassigned",
      released_at: stamp,
      released_by_role: actorIdentity.role,
      updated_at: stamp,
      revision,
      history: appendRecoveryAssignmentHistory(currentRaw, {
        action: "release",
        at: stamp,
        revision,
        actor_label: actorIdentity.label,
        actor_role: actorIdentity.role,
        actor_lane: actorIdentity.lane,
        from_status: currentAssignment.status,
        from_assignee_label: currentAssignment.assignee_label,
        to_status: "unassigned",
        to_assignee_label: null,
      }),
      coordination_only: true,
      grants_authority: false,
    });
  }

  return { ok: false, status: 400, error: "recovery_assignment_action_invalid" };
}

function recoveryAssignmentActor(actor) {
  const id = token(actor?.id);
  const role = token(actor?.role);
  if (!id || !["owner", "admin"].includes(role) || token(actor?.auth_method) !== "credential") {
    return { ok: false };
  }
  const owner = role === "owner" || id === "per";
  return {
    ok: true,
    key: "credential:" + id,
    role,
    owner,
    lane: owner ? "owner" : "operator",
    label: id === "per" ? "Per" : owner ? "Owner" : "Operator",
  };
}

async function persistRecoveryAssignment(env, record, payload, assignment) {
  const config = airtableConfig(env);
  if (!config.ok) return { ok: false, status: 503, error: config.error };
  const url = AIRTABLE_API + "/" + encodeURIComponent(config.baseId) + "/" + encodeURIComponent(config.table);

  try {
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        authorization: "Bearer " + config.token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        records: [{
          id: record.id,
          fields: {
            [F.PAYLOAD]: JSON.stringify({ ...payload, recovery_assignment: assignment }),
          },
        }],
        typecast: true,
      }),
    });
    if (!response.ok) return { ok: false, status: 503, error: "airtable_write_" + response.status };
    return {
      ok: true,
      replayed: false,
      assignment: projectRecoveryAssignment(assignment),
      workflow_timestamp_mutated: false,
      business_truth_mutated: false,
    };
  } catch {
    return { ok: false, status: 503, error: "airtable_write_failed" };
  }
}

function parseRawObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ok: true, value };
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return { ok: true, value: {} };
  if (raw.length > 100000) return { ok: false, error: "recovery_payload_too_large" };
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ok: true, value: parsed }
      : { ok: false, error: "recovery_payload_invalid" };
  } catch {
    return { ok: false, error: "recovery_payload_invalid" };
  }
}

function airtableConfig(env) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 80);
  const tokenValue = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000);
  const table = clean(env.AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID, 120) || MATRIX_TABLE_FALLBACK;
  if (!baseId || !tokenValue || !table) return { ok: false, error: "airtable_config_missing" };
  return { ok: true, baseId, token: tokenValue, table };
}

function normalizeCaseRef(value) {
  const ref = clean(value, 180);
  return /^HYPE-(?:PER|KENJI)-\d{14}-[a-f0-9]{8}$/i.test(ref) ? ref : "";
}

function firstRecordId(value) {
  const list = Array.isArray(value) ? value : [];
  for (const item of list) {
    const id = clean(item, 80);
    if (/^rec[A-Za-z0-9]+$/.test(id)) return id;
  }
  return "";
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const raw = clean(value, 16000);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function escapeFormula(value) {
  return clean(value, 500).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function boundedInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function statusForReadError(error) {
  return error === "recovery_case_not_found" ? 404 : 503;
}

function reject(error, state) {
  return { ok: false, status: 409, error, current_state: state };
}

function token(value) {
  return clean(value, 160).toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, max);
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-mmd-owner-surface": "recovery-control-v1",
    },
  });
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-owner-surface": "recovery-control-v1",
    },
  });
}
