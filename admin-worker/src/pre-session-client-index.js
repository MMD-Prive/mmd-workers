const AIRTABLE_API = "https://api.airtable.com/v0";

export const DEFAULT_PRE_SESSION_CLIENT_INDEX_TABLE = "tblwn6I9VWie5d7Ui";
export const PRE_SESSION_CLIENT_INDEX_VERSION = "candidate-v1";

const PRE_SESSION_FIELDS = [
  "identity_key",
  "source_type",
  "source_record_id",
  "identity_email",
  "preferred_name",
  "line_user_id",
  "line_display_name",
  "legacy_signals",
  "linked_client",
  "resolution_status",
  "session_lookup_status",
  "confidence",
  "candidate_only",
  "current_rights_source",
];

const SEARCHABLE_FIELDS = [
  "preferred_name",
  "line_display_name",
  "identity_email",
  "line_user_id",
  "identity_key",
  "source_record_id",
];

/**
 * Replace the free-form manual fallback with a known Airtable identity candidate
 * when Create Session cannot find a canonical Client.
 *
 * Safety lock:
 * - canonical Client / verified LINE Rename always wins upstream;
 * - candidate rows remain public-only and pending reconciliation;
 * - no membership, payment, points, package, tier, entitlement, booking or access
 *   truth is inferred from this table;
 * - current rights continue to require my_mmd_entitlement_resolver_v1.
 */
export async function enrichLineageWithPreSessionIndex(request, response, env = {}) {
  if (!isLookupPost(request) || response.status !== 200) return response;

  const body = await response.clone().json().catch(() => null);
  if (!body?.ok || body.manual_fallback !== true) return response;

  const payload = await request.json().catch(() => ({}));
  const query = clean(payload?.query).slice(0, 160);
  if (!query) return response;

  try {
    const records = await searchPreSessionCandidates(env, query);
    const candidates = records
      .map((record) => toCandidateRecord(record, query))
      .filter(Boolean)
      .sort((a, b) => b.__score - a.__score)
      .slice(0, 12)
      .map(stripScore);

    if (!candidates.length) return response;

    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store, private, max-age=0");
    headers.set("X-MMD-Pre-Session-Index", PRE_SESSION_CLIENT_INDEX_VERSION);

    return new Response(JSON.stringify({
      ...body,
      records: candidates,
      count: candidates.length,
      manual_fallback: false,
      pre_session_candidates: true,
      pre_session_policy: "identity_candidate_only_current_rights_resolver_recheck",
      lineage_warnings: unique([
        ...(Array.isArray(body.lineage_warnings) ? body.lineage_warnings.filter((value) => value !== "manual_public_only_pending_reconcile") : []),
        "pre_session_candidate_identity_pending_reconcile",
      ]),
    }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    // Pre-session discovery is optional enrichment. If it is unavailable, preserve
    // the existing manual public-only fallback and report the degraded source.
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store, private, max-age=0");
    headers.set("X-MMD-Pre-Session-Index", "source-unavailable");

    return new Response(JSON.stringify({
      ...body,
      lineage_warnings: unique([
        ...(Array.isArray(body.lineage_warnings) ? body.lineage_warnings : []),
        `pre_session_index:${safeError(error)}`,
      ]),
    }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export async function searchPreSessionCandidates(env, query) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new Error("pre_session_storage_not_ready");
  }

  const table = clean(
    env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID ||
    env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX,
  ) || DEFAULT_PRE_SESSION_CLIENT_INDEX_TABLE;
  const needle = formulaString(normalize(query));
  if (!needle) return [];

  const checks = SEARCHABLE_FIELDS.map(
    (field) => `IFERROR(SEARCH(\"${needle}\",LOWER({${field}}&\"\")),0)>0`,
  );
  const params = new URLSearchParams();
  params.set("pageSize", "40");
  params.set("maxRecords", "40");
  params.set("filterByFormula", `OR(${checks.join(",")})`);
  for (const field of PRE_SESSION_FIELDS) params.append("fields[]", field);

  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${params.toString()}`;
  const result = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      Accept: "application/json",
    },
  });
  if (!result.ok) throw new Error(`airtable_${table}_${result.status}`);

  const data = await result.json().catch(() => ({}));
  return Array.isArray(data.records) ? data.records : [];
}

export function toCandidateRecord(record, query) {
  const fields = record?.fields || {};
  const resolution = normalize(fields.resolution_status);
  const lookupStatus = normalize(fields.session_lookup_status);
  const linkedClients = linkIds(fields.linked_client);

  // This adapter intentionally handles candidate-only rows. Linked/canonical rows
  // must be served by the canonical Clients lineage path, not reconstructed here.
  if (!truthy(fields.candidate_only)) return null;
  if (linkedClients.length) return null;
  if (resolution === "blocked" || resolution === "review_required") return null;
  if (lookupStatus !== "searchable_candidate") return null;

  const match = bestCandidateMatch(query, fields);
  if (!match.score) return null;

  const preferredName = firstText(fields.preferred_name);
  const lineDisplayName = firstText(fields.line_display_name);
  const email = firstText(fields.identity_email);
  const lineUserId = firstText(fields.line_user_id);
  const clientName = firstText(preferredName, lineDisplayName, email, query);
  const sourceType = firstText(fields.source_type, "identity_seed");
  const identityKey = firstText(fields.identity_key, record?.id);
  const currentRightsSource = firstText(
    fields.current_rights_source,
    "my_mmd_entitlement_resolver_v1",
  );

  return {
    __score: match.score,
    client_id: "",
    member_id: "",
    member_email: email,
    remembered_name: preferredName,
    canonical_name: "",
    client_name: clientName,
    aliases: unique([preferredName, lineDisplayName, email, lineUserId].filter(Boolean)),
    matched_on: match.source,
    matched_value: match.value,
    lookup_chain: ["pre_session_client_index", "identity_pending_reconcile"],
    username: "",
    phone: "",
    package_code: "",
    tier: "",
    membership_status: "guest_public_only",
    purchased_history: "Known identity candidate · membership/access not inferred",
    line_record_id: "",
    line_user_id: lineUserId,
    line_display_name: lineDisplayName,
    legacy_tags: [],
    customer_telegram_username: "",
    customer_telegram_status: "missing",
    confidence: confidenceScore(fields.confidence, match.score),
    lineage_source: "pre_session_client_index",
    entitlement_snapshot_source: "none",
    identity_status: "pending_reconcile",
    manual_public_only: true,
    pre_session_candidate: true,
    candidate_only: true,
    pre_session_identity_key: identityKey,
    pre_session_source_type: sourceType,
    pre_session_source_record_id: firstText(fields.source_record_id),
    resolution_status: firstText(fields.resolution_status, "candidate"),
    session_lookup_status: firstText(fields.session_lookup_status, "searchable_candidate"),
    current_rights_source: currentRightsSource,
  };
}

function bestCandidateMatch(query, fields) {
  const needle = normalize(query);
  if (!needle) return { score: 0, source: "", value: "" };

  const entries = [
    ["pre_session_preferred_name", fields.preferred_name, 96],
    ["pre_session_line_display_name", fields.line_display_name, 92],
    ["pre_session_email", fields.identity_email, 90],
    ["pre_session_line_user_id", fields.line_user_id, 88],
    ["pre_session_identity_key", fields.identity_key, 72],
    ["pre_session_source_record_id", fields.source_record_id, 68],
  ];

  let best = { score: 0, source: "", value: "" };
  for (const [source, raw, base] of entries) {
    const value = clean(raw);
    const normalized = normalize(value);
    if (!normalized) continue;

    let quality = 0;
    if (normalized === needle) quality = 100;
    else if (normalized.startsWith(needle)) quality = 94;
    else if (normalized.includes(needle)) quality = 88;
    else if (needle.length >= 4 && needle.includes(normalized)) quality = 82;
    if (!quality) continue;

    const score = base * 1000 + quality;
    if (score > best.score) best = { score, source, value };
  }
  return best;
}

function confidenceScore(value, matchScore) {
  const token = normalize(value);
  const base = {
    verified: 92,
    high: 82,
    medium: 66,
    low: 42,
  }[token] || 35;
  const matchQuality = Number(matchScore) % 1000;
  return Math.max(1, Math.min(95, Math.round((base + matchQuality) / 2)));
}

function stripScore(record) {
  const { __score, ...output } = record;
  return output;
}

function isLookupPost(request) {
  try {
    return request.method.toUpperCase() === "POST" && normalizePath(new URL(request.url).pathname) === "/v1/admin/clients/lineage-lookup";
  } catch {
    return false;
  }
}

function formulaString(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/\"/g, '\\"');
}

function linkIds(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const single = clean(value);
  return single ? [single] : [];
}

function truthy(value) {
  return value === true || value === 1 || normalize(value) === "true";
}

function firstText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const found = value.find((item) => clean(item));
      if (found !== undefined) return clean(found);
    } else if (clean(value)) {
      return clean(value);
    }
  }
  return "";
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = clean(value);
    const key = normalize(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function clean(value) {
  return String(value ?? "").trim();
}

function safeError(error) {
  return clean(error?.message || error || "unknown_error").slice(0, 180);
}
