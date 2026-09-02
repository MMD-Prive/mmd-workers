const ACCESS_LOG_TABLE = "System — Access Log";
const MAX_JSON_LENGTH = 12000;

export async function writeReconciliationAudit(env = {}, input = {}) {
  requireAirtable(env);
  const createdAt = iso(input.created_at || Date.now());
  const eventId = safeEventId(input.event_id) || makeEventId(createdAt);
  const memberEmail = normalizeEmail(input.member_email);
  const plan = input.plan && typeof input.plan === "object" ? input.plan : {};
  const observations = input.observations && typeof input.observations === "object" ? input.observations : {};
  const applied = input.applied && typeof input.applied === "object" ? input.applied : {};
  const result = input.ok === true ? "success" : "fail";
  const errorCode = safeCode(input.error_code || firstAppliedError(applied));
  const reason = safeCode(input.reason || plan.reason || (result === "success" ? "resolver_authoritative" : errorCode || "reconcile_failed"));
  const target = targetSummary(plan, applied, observations);

  const fields = compact({
    "Member Email": memberEmail,
    Action: "member_access_reconcile",
    Target: target,
    Result: result,
    "Event ID": eventId,
    "Created At (ISO)": createdAt,
    "Source Ref": safeText(input.source_ref || `access:${eventId}`, 240),
    Reason: reason,
    "Before JSON": boundedJson(observedState(observations)),
    "After JSON": boundedJson(afterState(plan, applied)),
    "Snapshot JSON": boundedJson(snapshotSubset(input.snapshot)),
    "Error Code": errorCode,
    Actor: safeActor(input.actor),
  });

  const table = String(env.AIRTABLE_TABLE_ACCESS_LOG || ACCESS_LOG_TABLE).trim() || ACCESS_LOG_TABLE;
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(String(env.AIRTABLE_BASE_ID).trim())}/${encodeURIComponent(table)}`);
  const request = new Request(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(env.AIRTABLE_API_KEY).trim()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.records?.[0]?.id) throw new Error(`reconciliation_audit_airtable_${response.status || "malformed"}`);
  return { ok: true, event_id: eventId, record_id: data.records[0].id, result, reason };
}

export function buildReconciliationAuditPreview(input = {}) {
  const plan = input.plan && typeof input.plan === "object" ? input.plan : {};
  const observations = input.observations && typeof input.observations === "object" ? input.observations : {};
  const applied = input.applied && typeof input.applied === "object" ? input.applied : {};
  return {
    before: observedState(observations),
    after: afterState(plan, applied),
    snapshot: snapshotSubset(input.snapshot),
    target: targetSummary(plan, applied, observations),
  };
}

function observedState(observations = {}) {
  return {
    drive_layers: unique(observations?.drive?.payload?.drive_layers),
    telegram_rooms: unique(observations?.telegram?.payload?.telegram_rooms),
  };
}

function afterState(plan = {}, applied = {}) {
  return {
    desired: {
      drive_layers: unique(plan?.desired?.drive_layers),
      telegram_rooms: unique(plan?.desired?.telegram_rooms),
    },
    actions: {
      drive: actionSet(plan?.drive),
      telegram: actionSet(plan?.telegram),
    },
    applied: Object.fromEntries(Object.entries(applied).map(([key, value]) => [key, {
      ok: value?.ok === true,
      http_status: finiteStatus(value?.http_status),
      error: safeCode(value?.error || value?.payload?.error),
    }])),
  };
}

function snapshotSubset(snapshot = {}) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    schema_version: safeText(source.schema_version, 100),
    source_status: safeCode(source.source_status),
    evaluated_at: safeText(source.evaluated_at, 64),
    member_blocked: source.member_blocked === true,
    capability_state: {
      active: unique(source?.capability_state?.active),
      expiring_soon: unique(source?.capability_state?.expiring_soon),
      grace: unique(source?.capability_state?.grace),
      inactive: unique(source?.capability_state?.inactive),
    },
    access: sanitizeAccess(source.access),
  };
}

function sanitizeAccess(access = {}) {
  if (!access || typeof access !== "object") return {};
  const allowed = [
    "public_models_allowed",
    "red_card_request_lane_allowed",
    "private_visibility_envelope",
    "new_protected_grants_allowed",
    "new_drive_grants_allowed",
    "new_telegram_grants_allowed",
  ];
  return Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(access, key)).map((key) => [key, access[key]]));
}

function actionSet(value = {}) {
  return {
    grant: unique(value?.grant),
    retain: unique(value?.retain),
    revoke: unique(value?.revoke),
  };
}

function targetSummary(plan = {}, applied = {}, observations = {}) {
  const targets = new Set();
  for (const key of ["drive", "telegram"]) {
    if (applied[key] || observations[key] || plan[key]) targets.add(key);
  }
  return [...targets].sort().join(",") || "none";
}

function firstAppliedError(applied = {}) {
  for (const value of Object.values(applied)) {
    if (value?.ok !== true) return value?.error || value?.payload?.error || "downstream_apply_failed";
  }
  return "";
}

function boundedJson(value) {
  const json = JSON.stringify(value ?? {});
  return json.length <= MAX_JSON_LENGTH ? json : JSON.stringify({ truncated: true, original_length: json.length });
}

function makeEventId(createdAt) {
  const stamp = createdAt.replace(/[^0-9]/g, "").slice(0, 14) || String(Date.now());
  const random = Math.random().toString(36).slice(2, 10);
  return `mmdar_${stamp}_${random}`;
}

function requireAirtable(env) {
  if (!String(env.AIRTABLE_API_KEY || "").trim() || !String(env.AIRTABLE_BASE_ID || "").trim()) throw new Error("reconciliation_audit_airtable_not_configured");
}
function iso(value) { const parsed = typeof value === "number" ? value : Date.parse(String(value)); return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString(); }
function finiteStatus(value) { const number = Number(value); return Number.isInteger(number) && number >= 100 && number <= 599 ? number : undefined; }
function unique(values) { return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))]; }
function normalizeEmail(value) { const email = String(value || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function safeEventId(value) { return String(value || "").trim().replace(/[^a-zA-Z0-9_:\-.]/g, "_").slice(0, 180); }
function safeActor(value) { return safeCode(value || "trusted_internal_request") || "trusted_internal_request"; }
function safeCode(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_:\-.]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 160); }
function safeText(value, max = 500) { return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max); }
function compact(object) { return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")); }
