import { normalizeJobCreateBody } from "./job-create-contract.js";
import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";
import { resolveModelSalesOffer } from "../../shared/model-sales-control-v1.mjs";
export const SIGIL_JOB_CREATE_PATH = "/v1/admin/job/create";
export const MEMBERSHIP_ACTION_VERSION = "membership_action_v1";
export const MEMBERSHIP_ACTION_NOTE_MARKER = "[MMD_MEMBERSHIP_ACTION_V1]";
export const PREMIUM_RENEWAL_OCTOBER_2026_BONUS = Object.freeze({
  code: "premium_existing_member_october_2026_bonus",
  timezone: "Asia/Bangkok",
  eligibility_window_start: "2026-10-01T00:00:00+07:00",
  eligibility_window_end: "2026-10-31T23:59:59.999+07:00",
  bonus_duration_days: 365,
  requires_existing_member: true,
  existing_member_source: "canonical_member_history",
  effective_date_source: "official_verified_payment_at",
  authority: "official_payment_verification_and_entitlement_resolver",
  label_th: "สมาชิกเก่าต่อ Premium ภายใน 31 ต.ค. 2026 รับฟรีเพิ่ม 1 ปี",
});

const MAX_RENEWAL_AMOUNT_THB = 1_000_000;
const MAX_PERSISTED_NOTE_LENGTH = 4000;
const ALLOWED_TIER_HINTS = new Set(["", "standard", "premium", "vip", "svip", "black_card"]);
const TRUE_TOKENS = new Set(["1", "true", "yes", "on"]);
const FALSE_TOKENS = new Set(["0", "false", "no", "off"]);

export function isSigilJobMembershipActionRequest(path, method) {
  return String(method || "").toUpperCase() === "POST" && normalizePath(path) === SIGIL_JOB_CREATE_PATH;
}

export function canonicalizeSigilJobBody(input = {}) {
  const body = input && typeof input === "object" && !Array.isArray(input)
    ? normalizeJobCreateBody(input)
    : {};
  const legacy = parseLegacyAssistedRenewalNote(readNote(body));
  const raw = rawMembershipAction(body, legacy);
  const type = actionType(raw.type || raw.action || legacy.type || body.membership_action_type);

  const serviceAmountThb = positiveNumber(
    body.service_amount_thb ?? body.payment?.service_amount_thb ?? body.amount_thb ?? body.payment?.amount_thb,
    "service_amount_thb",
  );

  let action;
  if (type === "renew") {
    const renewalAmountThb = positiveNumber(
      raw.renewal_amount_thb ?? raw.amount_thb ?? legacy.renewal_amount_thb ?? body.membership_renewal_amount_thb,
      "membership_action.renewal_amount_thb",
      MAX_RENEWAL_AMOUNT_THB,
    );
    const includeInPayment = booleanValue(
      raw.include_in_payment ?? legacy.include_in_payment ?? body.membership_include_in_payment,
      true,
    );
    const tierHint = tierHintValue(raw.tier_hint ?? raw.tier ?? legacy.tier ?? body.membership_tier);
    const statusHint = text(raw.current_status_hint ?? raw.status_hint ?? legacy.status ?? body.membership_status, 80);

    action = Object.freeze({
      version: MEMBERSHIP_ACTION_VERSION,
      type: "renew",
      source: "sigil_jobs",
      include_in_payment: includeInPayment,
      renewal_amount_thb: renewalAmountThb,
      tier_hint: tierHint || null,
      current_status_hint: statusHint || null,
      state: "pending_official_verify",
      materialization_policy: "official_verify_required",
      payment_component_status: includeInPayment ? "combined_payment" : "separate_payment_required",
      entitlement_mutation_allowed: false,
      points_eligible: false,
      service_spend_eligible: false,
      referral_reward_eligible: false,
      promotion: promotionForRenewal(tierHint),
    });
  } else {
    action = Object.freeze({
      version: MEMBERSHIP_ACTION_VERSION,
      type: "none",
      source: "sigil_jobs",
      include_in_payment: false,
      renewal_amount_thb: 0,
      tier_hint: null,
      current_status_hint: null,
      state: "not_requested",
      materialization_policy: "official_verify_required",
      payment_component_status: "none",
      entitlement_mutation_allowed: false,
      points_eligible: false,
      service_spend_eligible: false,
      referral_reward_eligible: false,
      promotion: null,
    });
  }

  const customerTotalThb = serviceAmountThb + (action.type === "renew" && action.include_in_payment
    ? action.renewal_amount_thb
    : 0);

  body.membership_action = action;
  body.service_amount_thb = serviceAmountThb;
  body.amount_thb = customerTotalThb;
  body.payment = {
    ...(body.payment && typeof body.payment === "object" && !Array.isArray(body.payment) ? body.payment : {}),
    amount_thb: customerTotalThb,
    service_amount_thb: serviceAmountThb,
    membership_action: action,
  };

  body.note = canonicalizeNote(readNote(body), action, {
    service_amount_thb: serviceAmountThb,
    customer_total_thb: customerTotalThb,
  });

  return {
    body,
    membership_action: action,
    promotion: action.promotion || null,
    pricing_breakdown: Object.freeze({
      service_amount_thb: serviceAmountThb,
      membership_renewal_amount_thb: action.type === "renew" ? action.renewal_amount_thb : 0,
      customer_total_thb: customerTotalThb,
      membership_fee_counts_as_service_spend: false,
      membership_fee_points_eligible: false,
      membership_fee_referral_reward_eligible: false,
    }),
  };
}

export async function prepareSigilJobCreateRequest(request, env = {}) {
  let parsed;
  try {
    parsed = await request.clone().json();
  } catch (_) {
    return {
      response: json({ ok: false, error: "invalid_job_create_request" }, 400),
    };
  }

  try {
    const canonical = canonicalizeSigilJobBody(parsed);
    const salesControl = await resolveCreateJobSalesControl(env, canonical.body);
    if (salesControl.enforced && salesControl.offer?.sellable !== true) {
      return {
        response: json({
          ok: false,
          error: "model_sales_control_blocked",
          reason_code: salesControl.offer?.reason_code || "sales_control_unavailable",
          matched_rule_key: salesControl.offer?.matched_rule_key || null,
        }, salesControl.unavailable ? 503 : 409),
      };
    }
    if (salesControl.enforced) {
      canonical.body.model_sales_control = {
        policy_version: salesControl.offer.policy_version,
        matched_rule_key: salesControl.offer.matched_rule_key || null,
        rule_version: salesControl.offer.rule_version ?? null,
        sellable: true,
        customer_rate_thb: Number.isFinite(salesControl.offer.customer_rate_thb)
          ? salesControl.offer.customer_rate_thb
          : null,
        price_visible: salesControl.offer.price_visible === true,
        requires_per_approval: salesControl.offer.requires_per_approval === true,
        term_summary: text(salesControl.offer.term_summary, 240) || null,
        resolved_at: new Date().toISOString(),
      };
    }
    const headers = new Headers(request.headers);
    headers.set("Content-Type", "application/json");
    headers.delete("Content-Length");
    headers.delete("content-length");
    const delegated = new Request(request, {
      headers,
      body: JSON.stringify(canonical.body),
    });
    return {
      request: delegated,
      membership_action: canonical.membership_action,
      promotion: canonical.promotion,
      pricing_breakdown: canonical.pricing_breakdown,
    };
  } catch (error) {
    return {
      response: json({
        ok: false,
        error: String(error?.message || error || "invalid_membership_action"),
      }, 400),
    };
  }
}

export async function augmentSigilJobCreateResponse(response, context = {}) {
  if (!response || response.status < 200 || response.status >= 300) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return response;

  let payload;
  try {
    payload = await response.clone().json();
  } catch (_) {
    return response;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("x-mmd-membership-action", MEMBERSHIP_ACTION_VERSION);
  return new Response(JSON.stringify({
    ...payload,
    membership_action: context.membership_action || null,
    promotion: context.promotion || context.membership_action?.promotion || null,
    pricing_breakdown: context.pricing_breakdown || null,
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}


async function resolveCreateJobSalesControl(env, body) {
  const apiKey = text(env?.AIRTABLE_API_KEY, 1200);
  const baseId = text(env?.AIRTABLE_BASE_ID, 200);
  if (!apiKey || !baseId) return { enforced: false, state: "sales_control_env_unavailable" };

  const model = body?.model && typeof body.model === "object" ? body.model : {};
  const modelId = text(
    body?.model_record_id || body?.model_id || model?.model_record_id || model?.record_id || model?.id,
    100,
  );
  const modelKey = text(
    model?.model_lookup_key || model?.lookup_key || model?.unique_key || body?.model_lookup_key || body?.model_name,
    180,
  ).toLowerCase();
  if (!modelId && !modelKey) return { enforced: false, state: "model_identity_unavailable" };

  const rulesTable = text(env.AIRTABLE_TABLE_MODEL_OFFER_RULES_ID || env.AIRTABLE_TABLE_MODEL_OFFER_RULES, 200) || "MMD — Model Offer Rules";
  let rules;
  try {
    rules = await salesAirtableList(env, rulesTable, "");
  } catch (_) {
    return { enforced: true, unavailable: true, offer: { sellable: false, reason_code: "model_offer_rules_unavailable" } };
  }

  const relevantRules = rules.filter((record) => {
    const fields = record?.fields || {};
    const linked = Array.isArray(fields.Model) ? fields.Model.map((value) => text(value?.id || value, 100)) : [];
    const key = text(fields.model_key, 180).toLowerCase();
    return Boolean((modelId && linked.includes(modelId)) || (modelKey && key && key === modelKey));
  });
  if (!relevantRules.length) return { enforced: false, state: "legacy_unconfigured" };

  const clientId = text(body?.client_record_id || body?.client_id || body?.client_lineage?.client_id, 100);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(clientId)) {
    return { enforced: true, offer: { sellable: false, reason_code: "canonical_client_required" } };
  }

  const entitlementTable = text(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS, 200) || "MMD — Member Entitlements";
  let entitlementRows;
  try {
    entitlementRows = await salesAirtableList(
      env,
      entitlementTable,
      `FIND("${salesFormulaValue(clientId)}",ARRAYJOIN({client}))`,
    );
  } catch (_) {
    return { enforced: true, unavailable: true, offer: { sellable: false, reason_code: "entitlement_source_unavailable" } };
  }
  const snapshot = resolveMemberEntitlements(entitlementRows);
  if (snapshot?.schema_version !== "my_mmd_entitlement_resolver_v1" || snapshot?.fail_closed !== true) {
    return { enforced: true, unavailable: true, offer: { sellable: false, reason_code: "entitlement_snapshot_invalid" } };
  }

  const offer = resolveModelSalesOffer({
    model_id: modelId,
    model_key: modelKey,
    client_id: clientId,
    requested_at: createJobRequestedAt(body),
    work_lane: body?.job_type || body?.work?.job_lane || body?.work?.work_type || "",
    entitlement_snapshot: snapshot,
    rules: relevantRules,
  });
  return { enforced: true, state: "resolved", offer };
}

async function salesAirtableList(env, table, filterByFormula) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(text(env.AIRTABLE_BASE_ID, 200))}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", "100");
  if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
  const records = [];
  let offset = "";
  do {
    if (offset) url.searchParams.set("offset", offset);
    else url.searchParams.delete("offset");
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${text(env.AIRTABLE_API_KEY, 1200)}`,
        accept: "application/json",
      },
    });
    if (!response.ok) throw new Error("sales_airtable_unavailable");
    const payload = await response.json().catch(() => ({}));
    records.push(...(Array.isArray(payload?.records) ? payload.records : []));
    offset = text(payload?.offset, 200);
  } while (offset && records.length < 500);
  return records.slice(0, 500);
}

function salesFormulaValue(value) {
  return text(value, 200).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function createJobRequestedAt(body) {
  const raw = text(body?.start_time || body?.job_details?.start_time || body?.schedule?.start, 100);
  if (raw && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString();
  const date = text(body?.job_date || body?.job_details?.job_date || body?.schedule?.date, 20);
  const time = raw.match(/^([01]\d|2[0-3]):[0-5]\d$/) ? raw : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && time) return `${date}T${time}:00+07:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T12:00:00+07:00`;
  return new Date().toISOString();
}

function promotionForRenewal(tierHint) {
  if (tierHint !== "premium") return null;
  return Object.freeze({
    ...PREMIUM_RENEWAL_OCTOBER_2026_BONUS,
    eligibility_status: "candidate_pending_official_verify",
    applies_during_job_create: false,
    entitlement_mutation_allowed: false,
  });
}

function rawMembershipAction(body, legacy) {
  if (body.membership_action && typeof body.membership_action === "object" && !Array.isArray(body.membership_action)) {
    return body.membership_action;
  }
  return {
    type: body.membership_action_type || legacy.type,
    include_in_payment: body.membership_include_in_payment ?? legacy.include_in_payment,
    renewal_amount_thb: body.membership_renewal_amount_thb ?? legacy.renewal_amount_thb,
    tier: body.membership_tier ?? legacy.tier,
    status_hint: body.membership_status ?? legacy.status,
  };
}

function canonicalizeNote(note, action, pricing) {
  const cleaned = String(note || "")
    .replace(/\n?\[ASSISTED_RENEWAL_V1\][^\n]*/gi, "")
    .replace(/\n?\[MMD_MEMBERSHIP_ACTION_V1\][^\n]*/gi, "")
    .trim();
  if (action.type !== "renew") return cleaned.slice(0, MAX_PERSISTED_NOTE_LENGTH);

  const durable = {
    ...action,
    service_amount_thb: pricing.service_amount_thb,
    customer_total_thb: pricing.customer_total_thb,
  };
  const marker = `${MEMBERSHIP_ACTION_NOTE_MARKER} ${JSON.stringify(durable)}`;
  if (marker.length > MAX_PERSISTED_NOTE_LENGTH) throw new Error("membership_action_marker_too_large");

  // The downstream canonical confirm-link stores at most 4,000 characters.
  // Put the machine-readable marker first and reserve its full space so it can
  // never be truncated by a long operator note.
  const separator = cleaned ? "\n" : "";
  const humanBudget = Math.max(0, MAX_PERSISTED_NOTE_LENGTH - marker.length - separator.length);
  const human = cleaned.slice(0, humanBudget);
  return human ? `${marker}\n${human}` : marker;
}

function parseLegacyAssistedRenewalNote(note) {
  const match = String(note || "").match(/\[ASSISTED_RENEWAL_V1\]\s*([^\n]*)/i);
  if (!match) return {};
  const out = {};
  for (const part of match[1].split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function readNote(body) {
  if (typeof body.note === "string" && body.note.trim()) return body.note;
  if (typeof body.notes === "string" && body.notes.trim()) return body.notes;
  if (body.notes && typeof body.notes === "object") {
    return text(body.notes.operation_note || body.notes.handling_note || "", MAX_PERSISTED_NOTE_LENGTH);
  }
  return "";
}

function actionType(value) {
  const token = String(value || "none").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (!token || token === "none" || token === "no_action") return "none";
  if (token === "renew" || token === "renew_membership" || token === "membership_renewal") return "renew";
  throw new Error("membership_action_type_invalid");
}

function tierHintValue(value) {
  const token = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (!ALLOWED_TIER_HINTS.has(token)) throw new Error("membership_action_tier_hint_invalid");
  return token;
}

function booleanValue(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const token = String(value).trim().toLowerCase();
  if (TRUE_TOKENS.has(token)) return true;
  if (FALSE_TOKENS.has(token)) return false;
  throw new Error("membership_action_include_in_payment_invalid");
}

function positiveNumber(value, field, max = Number.MAX_SAFE_INTEGER) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${field}_invalid`);
  if (parsed > max) throw new Error(`${field}_too_large`);
  const rounded = Math.round((parsed + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0) throw new Error(`${field}_invalid`);
  return rounded;
}

function text(value, max = MAX_PERSISTED_NOTE_LENGTH) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizePath(value = "") {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
    },
  });
}
