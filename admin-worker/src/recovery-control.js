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

    const result = await listRecoveryCases(env, boundedInt(url.searchParams.get("limit"), 1, 25, 12));
    if (!result.ok) return json(result, 503);
    return json({
      ok: true,
      authority: "mmd.recovery_control.v1",
      cases: result.cases,
      taxonomy_version: RECOVERY_OUTCOME_TAXONOMY_VERSION,
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

async function listRecoveryCases(env, limit) {
  const config = airtableConfig(env);
  if (!config.ok) return config;

  const url = new URL(AIRTABLE_API + "/" + encodeURIComponent(config.baseId) + "/" + encodeURIComponent(config.table));
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("maxRecords", "50");
  url.searchParams.set("sort[0][field]", F.UPDATED_AT);
  url.searchParams.set("sort[0][direction]", "desc");

  try {
    const response = await fetch(url.toString(), {
      headers: { authorization: "Bearer " + config.token, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: "airtable_read_" + response.status };
    const records = Array.isArray(payload.records) ? payload.records : [];
    return { ok: true, cases: records.map(projectRecoveryRecord).filter(Boolean).slice(0, limit) };
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

export function projectRecoveryRecord(record = {}) {
  const fields = record.fields || {};
  const payload = parseObject(fields[F.PAYLOAD]);
  const recovery = parseObject(payload.recovery_case);
  const tracking = parseObject(payload.handoff_tracking);
  const caseRef = normalizeCaseRef(recovery.case_ref || tracking.id || fields[F.PENDING_REF]);
  if (!caseRef) return null;

  const domain = normalizeRecoveryDomain(recovery.domain);
  const state = token(tracking.state || recovery.state) || "prepared";
  const rawOutcome = token(recovery.outcome_code) || "intake_received";
  const outcomeCode = recoveryOutcomeLabel(domain, rawOutcome) ? rawOutcome : "intake_received";

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
    updated_at: clean(tracking.updated_at || recovery.updated_at || fields[F.UPDATED_AT], 80) || null,
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
  };
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
