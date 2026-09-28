const AIRTABLE_API = "https://api.airtable.com/v0";
const RENEWALS = "tblXjQFwo0A2cHseh";
const ENTITLEMENTS = "tblNImdF9PKAxhXGi";
const RPC_PATH = "/__internal/admin/my-mmd/recovery-diagnostic";
const MARKER = "genuine_liff_acceptance=closed";
const MAX_PER_RUN = 10;
const CANONICAL_SOURCE = "my_mmd_entitlement_resolver_v1";

export async function observeGenuineLiffAcceptance(env = {}, options = {}) {
  if (!ready(env)) {
    return { ok: true, skipped: true, reason: "acceptance_observer_dependencies_not_ready", scanned: 0, closed: 0 };
  }

  const maxRecords = Number.isInteger(options.maxRecords)
    ? Math.max(1, Math.min(25, options.maxRecords))
    : MAX_PER_RUN;

  const rows = await airtableList(env, renewalsTable(env), {
    filterByFormula: `AND({renewal_flow_status}='materialized',NOT(FIND('${MARKER}',{review_note}&'')))`,
    maxRecords,
  });

  const summary = { ok: true, skipped: false, scanned: rows.length, closed: 0, pending: 0, failures: 0 };
  for (const renewal of rows) {
    try {
      const result = await observeOne(env, renewal);
      if (result.status === "closed") summary.closed += 1;
      else summary.pending += 1;
    } catch (error) {
      summary.failures += 1;
      console.warn({
        event: "membership_genuine_liff_acceptance_observer_failure",
        reason: token(error?.message || error || "unknown"),
        renewal_record_id: renewal?.id || null,
      });
    }
  }
  return summary;
}

export async function observeOne(env = {}, renewal = {}) {
  if (!renewal?.id) return pending("renewal_record_missing");
  const rf = renewal.fields || {};
  if (token(rf.renewal_flow_status) !== "materialized") return pending("renewal_not_materialized");
  if (String(rf.review_note || "").includes(MARKER)) return { status: "closed", duplicate: true };

  const lineUserId = lineId(rf.line_user_id);
  const materializedAt = timestamp(rf.materialized_at);
  const packageCode = canonicalPackage(rf.requested_package || rf.package_code);
  if (!lineUserId || !materializedAt || !packageCode) return pending("renewal_acceptance_context_incomplete");

  const entitlementIds = linkedIds(rf["Member Entitlement"] || rf["Member Entitlements"]);
  if (entitlementIds.length !== 1) {
    return pending(entitlementIds.length ? "renewal_entitlement_ambiguous" : "renewal_entitlement_missing");
  }
  const entitlement = await airtableGet(env, entitlementsTable(env), entitlementIds[0]);
  const ef = entitlement.fields || {};
  if (canonicalPackage(ef.package_code) !== packageCode) return pending("entitlement_package_mismatch");
  if (token(ef.access_status) !== "active") return pending("entitlement_not_active");
  if (token(ef.renewal_status) !== "renewed") return pending("entitlement_not_renewed");
  const entitlementExpireAt = firstDate(ef.expire_at);
  if (!entitlementExpireAt) return pending("entitlement_expiry_missing");

  const diagnostic = await readOwnerDiagnostic(env, lineUserId);
  if (!diagnostic || diagnostic.ok !== true) return pending("owner_diagnostic_unavailable");

  const membership = diagnostic.membership || {};
  const acceptance = diagnostic.acceptance || {};
  if (token(membership.source) !== CANONICAL_SOURCE) return pending("resolver_source_mismatch");
  if (!["active", "expiring_soon"].includes(token(membership.lifecycle))) return pending("resolver_membership_not_active");
  if (!packageSatisfiedByLevel(packageCode, membership.level)) return pending("resolver_level_does_not_cover_package");

  if (token(acceptance.status) !== "recorded") return pending("genuine_liff_acceptance_missing");
  const evidenceId = safeEvidenceId(acceptance.evidence_id);
  if (!evidenceId) return pending("genuine_liff_evidence_id_invalid");
  if (token(acceptance.result) !== "protected_member_resolved") return pending("genuine_liff_result_invalid");
  if (token(acceptance.tier_source) !== CANONICAL_SOURCE) return pending("genuine_liff_authority_mismatch");

  const acceptanceAt = timestamp(acceptance.recorded_at);
  if (!acceptanceAt || acceptanceAt < materializedAt) return pending("genuine_liff_acceptance_predates_materialization");

  const activeThrough = firstDate(membership.active_through);
  if (!activeThrough || activeThrough < entitlementExpireAt) return pending("genuine_liff_active_through_stale");

  const marker = [
    MARKER,
    `evidence_id=${evidenceId}`,
    `recorded_at=${acceptance.recorded_at}`,
    `resolver_level=${token(membership.level) || "unknown"}`,
    `active_through=${activeThrough}`,
    `entitlement_id=${text(ef.entitlement_id, 180) || entitlement.id}`,
  ].join("; ");

  await airtableUpdate(env, renewalsTable(env), renewal.id, {
    review_note: appendReviewNote(rf.review_note, marker),
  });

  return {
    status: "closed",
    renewal_record_id: renewal.id,
    evidence_id: evidenceId,
    recorded_at: new Date(acceptanceAt).toISOString(),
    active_through: activeThrough,
    package_code: packageCode,
    entitlement_record_id: entitlement.id,
  };
}

async function readOwnerDiagnostic(env, lineUserId) {
  const binding = env.MEMBER_PAGES_MEMBER_WALLET;
  if (!binding?.fetch) return null;
  const response = await binding.fetch(new Request(`https://member-pages-worker.internal${RPC_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "admin-worker",
    },
    body: JSON.stringify({ line_user_id: lineUserId }),
  }));
  const payload = await response.json().catch(() => null);
  return response.ok && payload?.ok === true ? payload : null;
}

async function airtableList(env, tableName, params = {}) {
  const url = airtableUrl(env, tableName);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch(env, new Request(url.toString(), {
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` },
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw new Error(`airtable_${response.status || "malformed"}`);
  return payload.records;
}

async function airtableGet(env, tableName, recordId) {
  const response = await airtableFetch(env, new Request(`${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId)}`, {
    headers: { Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` },
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error(`airtable_${response.status || "malformed"}`);
  return payload;
}

async function airtableUpdate(env, tableName, recordId, fields) {
  const response = await airtableFetch(env, new Request(`${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields, typecast: false }),
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error(`airtable_${response.status || "malformed"}`);
  return payload;
}

function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

function airtableUrl(env, tableName) {
  return new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
}

function ready(env) {
  return Boolean(
    clean(env.AIRTABLE_API_KEY)
    && clean(env.AIRTABLE_BASE_ID)
    && typeof env.MEMBER_PAGES_MEMBER_WALLET?.fetch === "function"
  );
}

function renewalsTable(env) {
  return clean(env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || RENEWALS);
}
function entitlementsTable(env) {
  return clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENTS);
}

function packageSatisfiedByLevel(packageCode, value) {
  const level = token(value);
  if (packageCode === "premium") return new Set(["private_premium", "premium", "vip", "svip", "black_card", "blackcard"]).has(level);
  if (packageCode === "standard") return new Set(["private_standard", "standard", "private_premium", "premium", "vip", "svip", "black_card", "blackcard"]).has(level);
  return false;
}

function linkedIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => typeof item === "string" ? item : item?.id)
      .filter((item) => /^rec[A-Za-z0-9]{14}$/.test(String(item || ""))))]
    : [];
}

function canonicalPackage(value) {
  const v = token(value);
  if (v.includes("premium")) return "premium";
  if (v.includes("standard") || v.includes("lite")) return "standard";
  return "";
}

function appendReviewNote(current, addition) {
  const base = text(current, 3000);
  const next = text(addition, 1200);
  return [base, next].filter(Boolean).join("\n").slice(0, 4200);
}

function safeEvidenceId(value) {
  const id = clean(value);
  return /^mmdacc_[a-f0-9]{24}$/i.test(id) ? id : "";
}

function timestamp(value) {
  const ms = Date.parse(clean(value));
  return Number.isFinite(ms) ? ms : 0;
}

function firstDate(value) {
  const raw = clean(value);
  if (!raw) return "";
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "";
}

function pending(reason) { return { status: "pending", reason }; }
function lineId(value) { const v = text(value, 100); return /^U[0-9a-f]{32}$/i.test(v) ? v : ""; }
function token(value) { return clean(value).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 140); }
function text(value, max = 500) { return clean(value).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max); }
function clean(value) { return String(value ?? "").trim(); }

export const GENUINE_LIFF_ACCEPTANCE_MARKER = MARKER;
