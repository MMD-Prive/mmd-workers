import { transitionRecoveryCase } from "./hype-handoff-runtime.js";
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
      domain: normalizeQueueDomainFilter(url.searchParams.get("domain")).value,
      state: normalizeQueueStateFilter(url.searchParams.get("state")).value,
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
        guardrails: recoveryControlGuardrails(),
      });
    }

    const domainFilter = normalizeQueueDomainFilter(url.searchParams.get("domain"));
    const stateFilter = normalizeQueueStateFilter(url.searchParams.get("state"));
    if (!domainFilter.ok || !stateFilter.ok) {
      return json({
        ok: false,
        error: "recovery_queue_filter_invalid",
        allowed_domains: ["all", ...RECOVERY_QUEUE_DOMAINS],
        allowed_states: ["open", "all", ...RECOVERY_QUEUE_STATES],
      }, 400);
    }

    const result = await readRecoveryQueueIntelligence(env, {
      limit: boundedInt(url.searchParams.get("limit"), 1, 25, 12),
      domain: domainFilter.value,
      state: stateFilter.value,
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

  const transition = buildRecoveryControlTransition(
    current.case,
    token(body.action),
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
    action: token(body.action),
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
  if (!domainFilter.ok || !stateFilter.ok) {
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
    ));
    const ordered = [...filtered].sort(compareRecoveryQueuePriority);
    const attention = [...active]
      .filter((item) => item.sla.attention_required === true || item.state === "resolved")
      .sort(compareRecoveryQueuePriority)
      .slice(0, 5)
      .map(projectAttentionItem);

    return {
      ok: true,
      cases: ordered.slice(0, limit),
      filters: {
        domain: domainFilter.value,
        state: stateFilter.value,
      },
      queue: {
        policy_version: RECOVERY_QUEUE_SLA_VERSION,
        total_fetched: projected.length,
        open_count: active.length,
        filtered_count: filtered.length,
        attention_count: active.filter((item) => item.sla.attention_required === true || item.state === "resolved").length,
        overdue_count: active.filter((item) => item.sla.status === "overdue").length,
        watch_count: active.filter((item) => item.sla.status === "watch").length,
        by_domain: countBy(active, (item) => item.domain),
        by_state: countBy(active, (item) => item.state),
        attention,
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
    return { ok: true, case: projected };
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
  const match = /^HYPE-(?:PER|KENJI)-(d{14})-[a-f0-9]{8}$/i.exec(clean(caseRef, 180));
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
  if (a.state === "resolved" && b.state !== "resolved") return -1;
  if (b.state === "resolved" && a.state !== "resolved") return 1;
  return (b?.age?.minutes ?? -1) - (a?.age?.minutes ?? -1);
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
